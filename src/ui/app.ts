import Peer from 'peerjs';
import { TPS, SUB, GW, GH, idx, MODE_MAZE, MODE_FIXED } from '../sim/constants';
import { Sim } from '../sim/sim';
import { MAPS } from '../content/maps';
import { TOOLS, TOOL_BY_KEY, UPG, MAX_LVL, AIMS } from '../content/towers';
import type { Cursor, CursorMode, Tool } from '../content/types';
import { TIER_WAVE, TIER_NAME, tierAt } from '../content/types';
import { LOADOUTS, LOADOUT_BY_KEY, PRIMARIES, SUPPORTS, DEFAULT_PRIMARY, DEFAULT_SUPPORT, toolsOf } from '../content/loadouts';
import { buildTicks } from '../content/power';
import { KIND_NAME } from '../content/waves';
import { unpackCode } from '../net/codec';
import { RTC } from '../net/ice';
import { Net } from '../net/net';
import { PeerNet } from '../net/peernet';
import { Lockstep, DELAY } from '../net/lockstep';
import { BUILD } from '../version';

declare global {
  interface Window {
    /* Вікно назовні для тестових стендів (clicktest, bench). У грі не вживається. */
    CHOKEPOINT: Record<string, unknown>;
  }
}

/* ══════════════════════════════════════════════════════════════════════
   ЧАСТИНА 3 · ЗВ'ЯЗКА, ВВІД, МАЛЮВАННЯ
   Усе нижче може бути яким завгодно — на стан симуляції воно не впливає.
   ══════════════════════════════════════════════════════════════════════ */
/* Розмітка й код мають зійтися: якщо елемент зник з index.html, падаємо
   тут і одразу зрозуміло чому — а не через сто рядків на «null.value». */
function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const n = document.getElementById(id);
  if (!n) throw new Error(`немає елемента #${id}`);
  return n as T;
}

const cv  = byId<HTMLCanvasElement>('cv');
const ctx = cv.getContext('2d')!;
const cvMate  = byId<HTMLCanvasElement>('cvMate');
const ctxMate = cvMate.getContext('2d')!;
const css = getComputedStyle(document.documentElement);
/* Палітра за час партії не міняється, а getPropertyValue на живому
   getComputedStyle — це примусовий перерахунок стилів. Викликається воно
   з кожного кадру малювання, тож без запам'ятовування виходили десятки
   перерахунків на кадр. */
const cCache = new Map<string, string>();
const C = (n: string): string => {
  let v = cCache.get(n);
  if (v === undefined) { v = css.getPropertyValue(n).trim(); cCache.set(n, v); }
  return v;
};

/* Запис у DOM щокадру — навіть тим самим значенням — щоразу викидає
   старий текстовий вузол і псує розкладку. Далі йде читання (C(),
   getBoundingClientRect), і браузер мусить усе перерахувати: класичне
   «запис → читання → запис». У коопі це помітно лагало, у соло ні —
   бо соло не перемальовує ні панель гравців, ні стан з'єднання. */
function setText(node: HTMLElement, v: string | number): void {
  const s = String(v);
  if (node.textContent !== s) node.textContent = s;
}
function setHTML(node: HTMLElement, v: string): void {
  if ((node as any).__html !== v) { (node as any).__html = v; node.innerHTML = v; }
}

const el = {
  wave:  byId('rWave'),  lives: byId('rLives'),
  gold:  byId('rGold'),
  log:   byId('log'),    rail:  byId('rail'),
  veil:  byId('veil'),   veilT: byId('veilTitle'),
  veilX: byId('veilText'), veilB: byId<HTMLButtonElement>('veilBtn'),
  veilB2: byId<HTMLButtonElement>('veilBtn2'), veilReady: byId('veilReady'),
  wave_: byId<HTMLButtonElement>('btnWave'), pause: byId<HTMLButtonElement>('btnPause'),
  speed: byId<HTMLButtonElement>('btnSpeed'), verify: byId<HTMLButtonElement>('btnVerify'),
  seed:  byId<HTMLInputElement>('seed'),   diff:  byId<HTMLSelectElement>('diff'),
  showPath: byId<HTMLInputElement>('showPath'), showRange: byId<HTMLInputElement>('showRange'),
  host: byId<HTMLButtonElement>('btnHost'), use: byId<HTMLButtonElement>('btnUse'),
  copy: byId<HTMLButtonElement>('btnCopy'), code: byId<HTMLTextAreaElement>('codeBox'),
  netState: byId('netState'), coopHint: byId('coopHint'),
  coopDiag: byId('coopDiag'),
  mapSel: byId<HTMLSelectElement>('mapSel'), modeSel: byId<HTMLSelectElement>('modeSel'),
  mapNote: byId('mapNote'), next: byId('rNext'),
  restart: byId<HTMLButtonElement>('restart'),
  lobbyHost: byId<HTMLButtonElement>('btnLobbyHost'),
  roomLink: byId('roomLink'), roomLinkText: byId('roomLinkText'),
  lobbyCopy: byId<HTMLButtonElement>('btnLobbyCopy'),
  webhookUrl: byId<HTMLInputElement>('webhookUrl'), webhookTest: byId<HTMLButtonElement>('btnWebhookTest'),
  webhookHint: byId('webhookHint'), downloadLog: byId<HTMLButtonElement>('btnDownloadLog'),
  duelField: byId('duelField'), duel: byId<HTMLInputElement>('duelToggle'),
  mateBoard: byId('mateBoard'),
  mbWave: byId('mbWave'), mbLives: byId('mbLives'), mbGold: byId('mbGold'),
  myName: byId<HTMLInputElement>('myName'), mySwatches: byId('mySwatches'),
  rosterBody: byId('rosterBody'),
  readout: byId('readout'), playersTop: byId('playersTop'),
  kills: byId('rKills'), towers: byId('rTowers'), dmg: byId('rDmg'),
  primarySel: byId<HTMLSelectElement>('primarySel'), supportSel: byId<HTMLSelectElement>('supportSel'),
  loadoutField: byId('loadoutField'),
  veilFactions: byId('veilFactions'), towerTip: byId('towerTip'),
};

MAPS.forEach((m, i) => {
  const o = document.createElement('option');
  o.value = String(i); o.textContent = m.name;
  el.mapSel.appendChild(o);
});

let sim: Sim, ls: Lockstep, simMate: Sim | null = null, mateOverSaid = false, lobbyPreview: any = null, tool: Cursor = TOOLS[1], paused = false, speed = 1;
let hoverX = -1, hoverY = -1, acc = 0, last = 0;
let fx = [], looping = false, stalled = false, desync = null;

/* Перший запуск не мусить одразу кидати в бій — дай обрати мапу/режим,
   чи створити лобі. Далі (рестарт, нова партія, поразка) вже без цього
   екрана: користувач один раз свідомо натиснув «Почати». Прапорець
   gameStarted для цього вже був заведений нижче (declared, ще не
   використовувався) — саме його й задіюємо. */
function hasRoomParam() { return !!(new URLSearchParams(location.search).get('room')); }
function showStartVeil() {
  el.veil.hidden = false;
  el.veil.className = 'veil start';
  el.veilReady.hidden = true; el.veilB2.hidden = true; el.veilB.hidden = false;
  /* Кнопку треба саме ВВІМКНУТИ, а не лише перепідписати: лобі вимикає її,
     поки гість не готовий, і після повернення в соло вона лишалась мертвою
     — гравець застрягав під вуаллю без жодного способу почати. */
  el.veilB.disabled = false;
  el.veilT.textContent = 'Chokepoint';
  el.veilX.textContent = 'Обери фракцію — вона визначає весь твій арсенал на партію. ' +
    'Мапа, режим і складність — угорі; лобі для гри вдвох — унизу.';
  el.veilFactions.hidden = false;
  renderFactionCards();
  el.veilB.textContent = 'Почати гру';
  el.veilB.onclick = () => {
    gameStarted = true;
    enqueue({ t:'freeze', v:0 });
    el.veil.hidden = true;
  };
}

let net: Net | PeerNet = new Net();

/* Два транспорти мають спільну поверхню (send/diag/state/on*), але різні
   способи знайомства: Net — ручний обмін кодами, PeerNet — лобі за
   посиланням. Нижче — єдині місця, де ця різниця має значення. */
function manualNet(): Net {
  if (!(net instanceof Net)) throw new Error('ручний код працює лише без лобі');
  return net;
}
/* Статистика ICE-адрес збирається лише при ручному обміні; у лобі її веде
   сам PeerJS і назовні не віддає. */
const candOf   = () => (net instanceof Net ? net.cand : null);
const iceErrOf = () => (net instanceof Net ? net.iceErr : 0);
const myHash = new Map(), theirHash = new Map(), myMateHash = new Map();

/* Номер покоління партії. Після перезапуску він росте, і команди зі
   старої партії, що ще летять каналом, не потраплять у нову. */
let gen = 0;
const stash = [];

/* У коопі гра більше не стартує сама щойно канал відкрився: спочатку
   лобі, де хост крутить налаштування, а гість тисне «Готовий». Прапорець
   каже, чи партія вже фактично почалась (є Sim із бойовим станом), щоб
   відрізнити лобі від гри-в-процесі та від екрана завершення. */
let gameStarted = false;
let lobbyCfgSeq = 0;      // росте щоразу, як хост міняє налаштування в лобі
let guestReadySeq = -1;   // на яку версію налаштувань гість уже підтвердив готовність

/* «Кожен сам за себе»: у мене й напарника окремі Sim (кожна — сольна
   дошка), а не спільна на двох. Тому індекс гравця має два різні сенси,
   які легко переплутати:
     netP() — МЕРЕЖЕВИЙ тег (0/1), куди маршрутизувати команду ДО
              застосування — не залежить від розміру жодної дошки.
     meId() — індекс «себе» ВСЕРЕДИНІ моєї дошки: net.me у класичному
              коопі (спільна дошка на двох), завжди 0 у дуелі (моя дошка
              сольна) чи в соло. Саме meId() читає sim.players[...] і
              звіряється з подіями Sim. */
/* ── гравці: нік і колір — суто косметика, поза Sim, не деталермінована.
   Кожен обирає СВОЄ незалежно, розсилає легким повідомленням; конфлікт
   кольорів (обидва обрали те саме) нікому не заважає — це не гра. */
const PALETTE = [
  { key:'brass',  css:'--brass'  }, { key:'steel',  css:'--steel'  },
  { key:'moss',   css:'--moss'   }, { key:'coral',  css:'--coral'  },
  { key:'violet', css:'--violet' },
];
function paletteCss(key) { const p = PALETTE.find(x => x.key === key); return p ? p.css : '--brass'; }
let myIdent   = { name: localStorage.getItem('cp_name') || '', color: localStorage.getItem('cp_color') || 'brass' };
let mateIdent = { name: '', color: 'steel' };
function identFor(p) { return (net.solo || p === netP()) ? myIdent : mateIdent; }
function identName(p) {
  const id = identFor(p);
  if (id.name) return id.name;
  return net.solo ? 'Ти' : (p === netP() ? 'Ти' : 'Напарник');
}
function sendIdent() {
  if (net.live) net.send({ t:'ident', name: myIdent.name, color: myIdent.color,
                           lo: myPrimary, sup: mySupport });
}

/* ── фракція ─────────────────────────────────────────────────────────
   Вибір кожного гравця свій, тож він НЕ їде в налаштуваннях хоста.
   Але на симуляцію він впливає (що кому дозволено будувати), тож обидві
   сторони мусять знати обидва вибори ДО старту — інакше дошки розійдуться
   на першій же башті. Тому вибір розсилається разом з ident'ом, а хост
   кладе остаточну пару в повідомлення старту 'r'. */
const validRole = (key: string, role: string, fallback: string) =>
  LOADOUT_BY_KEY[key]?.role === role ? key : fallback;

/* Радіус — навчальний костур: на легкому він показує, як працює покриття,
   далі гравець має відчувати його сам. Тому поза легким рівнем немає ні
   кола на полі, ні цифри в описі, ні самого тумблера. */
const EASY = 70;
function rangeShown(): boolean {
  const d = sim ? sim.diff : parseInt(el.diff.value, 10);
  return d <= EASY;
}
function refreshRangeOption() {
  const on = rangeShown();
  el.showRange.closest('label')!.hidden = !on;
  if (!on) el.showRange.checked = false;
}

let myPrimary = validRole(localStorage.getItem('cp_primary') || '', 'primary', DEFAULT_PRIMARY);
let mySupport = validRole(localStorage.getItem('cp_support') || '', 'support', DEFAULT_SUPPORT);
let matePrimary = DEFAULT_PRIMARY;
let mateSupport = DEFAULT_SUPPORT;

/** Пари [основна, допоміжна] по індексу МЕРЕЖЕВОГО гравця — так їх бачать
 *  обидві сторони однаково, і дошки збираються з того самого. */
function arsenalPair(): string[][] {
  const mine = [myPrimary, mySupport], mate = [matePrimary, mateSupport];
  return net.solo || netP() === 0 ? [mine, mate] : [mate, mine];
}
function loadoutOf(p: number): string[] {
  if (net.solo) return [myPrimary, mySupport];
  return p === netP() ? [myPrimary, mySupport] : [matePrimary, mateSupport];
}
/** Башти, доступні мені за фракціями — незалежно від того, чи відкрито рівень.
 *  Мазингові (бар'єр) відпадають на фіксованій трасі: там вони не роблять
 *  нічого, і показувати їх означало б заманювати в порожню покупку. */
function myTools(): Tool[] {
  const fixed = sim ? sim.mode === MODE_FIXED : parseInt(el.modeSel.value, 10) === MODE_FIXED;
  const allowed = toolsOf(myPrimary, mySupport);
  return TOOLS.filter(t => allowed.includes(t.key) && !(t.mazeOnly && fixed));
}

function setLoadout(key: string, broadcast = true) {
  const lo = LOADOUT_BY_KEY[key];
  if (!lo) return;
  if (lo.role === 'primary') {
    if (key === myPrimary) return;
    myPrimary = key; localStorage.setItem('cp_primary', key);
    el.primarySel.value = key;
  } else {
    if (key === mySupport) return;
    mySupport = key; localStorage.setItem('cp_support', key);
    el.supportSel.value = key;
  }
  renderFactionCards();
  if (broadcast) sendIdent();
  if (net.solo && sim) boot();          // у соло фракція міняється одразу, це новий забіг
  else { renderLobby(); if (sim) drawRail(); }
}

/* Випадайки — для швидкої зміни; картки на стартовому екрані — для
   першого вибору, коли ще треба прочитати, чим фракції різняться. */
for (const [sel, list] of [[el.primarySel, PRIMARIES], [el.supportSel, SUPPORTS]] as const) {
  for (const lo of list) {
    const o = document.createElement('option');
    o.value = lo.key; o.textContent = lo.name;
    sel.appendChild(o);
  }
  sel.onchange = () => setLoadout(sel.value);
}
el.primarySel.value = myPrimary;
el.supportSel.value = mySupport;

function renderFactionCards() {
  const group = (title: string, list: typeof LOADOUTS, chosen: string) =>
    '<div class="fgroup"><h3>' + title + '</h3><div class="frow">' +
    list.map(lo => cardHtml(lo, chosen)).join('') + '</div></div>';

  el.veilFactions.innerHTML =
    group('Основна — хребет шкоди', PRIMARIES, myPrimary) +
    group('Допоміжна — контроль',   SUPPORTS,  mySupport);

  el.veilFactions.querySelectorAll<HTMLElement>('.fcard').forEach(b => {
    b.onclick = () => setLoadout(b.dataset.lo!);
  });
}

/* Картка показує, ЩО і КОЛИ фракція дає, але не як воно працює —
   деталі гравець дізнається, поставивши башту. */
function cardHtml(lo: (typeof LOADOUTS)[number], chosen: string) {
  const towers = lo.tools.map(k => TOOL_BY_KEY[k]).filter(t => !t.mazeOnly);
  const rows = ([1, 2, 3] as const).map(tier => {
    const own = towers.filter(t => t.tier === tier);
    if (!own.length) return '';
    const when = TIER_WAVE[tier] ? ' <i>з хвилі ' + TIER_WAVE[tier] + '</i>' : '';
    return '<div class="tierRow"><span class="tierTag">' + TIER_NAME[tier] + when + '</span>' +
      own.map(t => '<span class="pip" style="--sw:' + C(t.swatch) + '">' + escapeHtml(t.name) +
        '<u>' + t.cost + '</u></span>').join('') +
      '</div>';
  }).join('');
  return '<button class="fcard" data-lo="' + lo.key + '" style="--fc:' + C('--f-' + lo.key) + '"' +
    ' aria-pressed="' + (lo.key === chosen) + '">' +
    '<b>' + escapeHtml(lo.name) + '</b><i>' + escapeHtml(lo.blurb) + '</i>' + rows + '</button>';
}

el.myName.value = myIdent.name;
el.myName.oninput = () => {
  myIdent.name = el.myName.value.trim().slice(0, 18);
  localStorage.setItem('cp_name', myIdent.name);
  sendIdent(); renderRoster();
};
PALETTE.forEach(sw => {
  const b = document.createElement('button');
  b.style.setProperty('--sw', C(sw.css));
  b.title = sw.key;
  b.setAttribute('aria-pressed', String(sw.key === myIdent.color));
  b.onclick = () => {
    myIdent.color = sw.key;
    localStorage.setItem('cp_color', sw.key);
    el.mySwatches.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    sendIdent(); renderRoster();
  };
  el.mySwatches.appendChild(b);
});

let duelBoards = false;
/* У дуелі скіп хвилі теж рішення двох, не одного — кожна дошка сама по
   собі сольна (nPlayers=1), тож без цього набору голос одного миттєво
   зрушував ОБИДВІ дошки (глобальна маршрутизація 'wave' з попереднього
   фіксу). Набір рахується з merged — він однаковий в обох клієнтів
   лок-степом, тож рахунок голосів лишається детермінованим без
   окремого мережевого повідомлення. */
let duelWaveVotes = new Set();
const netP = () => (net.solo ? 0 : net.me);
const meId = () => {
  if (duelBoards) return 0;
  const i = netP();
  /* Між натисканням «Застосувати» і першим спільним стартом гість уже має
     номер 1, а симуляція в нього ще однокористувацька — гравця з таким
     номером там немає. Раніше це валило цикл назавжди. */
  return (sim && sim.players && i < sim.players.length) ? i : 0;
};

function boot(g?: number) {
  if (g !== undefined) gen = g;
  const n = net.solo ? 1 : 2;
  const seed = el.seed.value || 'MAZE-01', diff = parseInt(el.diff.value, 10);
  const mapIdx = parseInt(el.mapSel.value, 10), mode = parseInt(el.modeSel.value, 10);
  duelBoards = n > 1 && mode === MODE_FIXED && el.duel.checked;

  /* У дуелі кожен грає на сольній дошці (своя лінія, своє HP) — не на
     спільній двомісній. Обидві дошки на однаковому сіді, тож хвилі
     й баунті-роли ідентичні на обох — чесне порівняння «хто краще». */
  /* Фракції по індексу гравця. У дуелі кожна дошка сольна, тож своїй
     дошці дістається мій набір, а дошці напарника — його: обидва клієнти
     рахують це зі свого боку й приходять до того самого. */
  const ars = arsenalPair().map(pair => toolsOf(pair[0], pair[1]));
  sim = new Sim(seed, diff, duelBoards ? 1 : n, mapIdx, mode,
                duelBoards ? [toolsOf(myPrimary, mySupport)] : ars);
  simMate = duelBoards ? new Sim(seed, diff, 1, mapIdx, mode, [toolsOf(matePrimary, mateSupport)]) : null;
  mateOverSaid = false;
  duelWaveVotes.clear();

  ls  = new Lockstep(n, gen, stash);
  myHash.clear(); theirHash.clear(); myMateHash.clear();
  fx = []; paused = false; acc = 0; last = 0; stalled = false; desync = null;
  inLobby = false;
  resetStats();
  el.pause.textContent = 'Пауза';
  el.veil.hidden = true;
  el.log.innerHTML = '';
  say((n > 1 ? 'Кооп, гравець ' + (net.me + 1) + ' · ' : 'Забіг · ') + sim.map.name + ' · ' +
      (sim.mode === MODE_FIXED ? 'фіксований шлях' : 'лабіринт') + ' · сід ' + sim.seedStr +
      (duelBoards ? ' · кожен на своїй лінії' : ''), 'note');
  el.mapNote.textContent = sim.mode === MODE_FIXED
    ? sim.map.note + ' · ' + sim.pathLength() + ' клітин'
    : 'лабіринт: трасу будуєш сам, скелі не забудовуються';
  el.mateBoard.hidden = !duelBoards;
  el.mateBoard.classList.remove('over');
  refreshHostLocks();
  drawRail();
  if (!looping) { looping = true; schedule(frame); }
  resize();

  if (!net.solo || hasRoomParam()) gameStarted = true;
  if (!gameStarted) { enqueue({ t:'freeze', v:1 }); showStartVeil(); }
}

/* ── арсенал ─────────────────────────────────────────────────────────── */
function drawRail() {
  el.rail.querySelectorAll<HTMLElement>('.tool, .tierHead').forEach(n => n.remove());
  el.rail.querySelector('h2')!.textContent = 'Арсенал · ' + LOADOUT_BY_KEY[myPrimary].name + ' + ' + LOADOUT_BY_KEY[mySupport].name;

  /* Показуємо ВСІ башти фракції, зокрема ще закриті — щоб було видно, до
     чого готуватись, а не відкривати гру наосліп. Закриті просто не
     клікаються й підписані хвилею відкриття. */
  const mine = myTools();
  let n = 0;
  for (const tier of [1, 2, 3] as const) {
    const own = mine.filter(t => t.tier === tier);
    if (!own.length) continue;
    const head = document.createElement('div');
    head.className = 'tierHead';
    head.dataset.tier = String(tier);
    head.innerHTML = '<span>' + TIER_NAME[tier] + '</span><i></i>';
    el.rail.appendChild(head);

    for (const t of own) {
      n++;
      const b = document.createElement('button');
      b.className = 'tool';
      b.dataset.key = t.key;
      b.dataset.tier = String(tier);
      b.style.setProperty('--swatch', C(t.swatch));
      b.innerHTML =
        '<span class="key">' + n + '</span>' +
        '<span class="nm"><b></b><i></i><u></u></span>' +
        '<span class="cost">' + t.cost + '</span>';
      b.querySelector('b').textContent = t.name;
      b.querySelector('i').textContent = t.blurb;
      b.querySelector('u').textContent = t.cd
        ? Math.round(t.dmg * TPS / t.cd) + ' шк/с' +
          (rangeShown() ? ' · радіус ' + (t.range / SUB).toFixed(1) : '')
        : 'перекриває клітину';
      b.onclick = () => { if (!b.classList.contains('locked')) { tool = t; refreshRail(); } };
      el.rail.appendChild(b);
    }
  }
  /* Керування вежами — не частина арсеналу: воно не про «що поставити»,
     а про «що зробити з поставленим». Тому окремим заголовком, як рівні. */
  const sep = document.createElement('div');
  sep.className = 'tierHead ctlHead';
  sep.innerHTML = '<span>дії з вежами</span><i></i>';
  el.rail.appendChild(sep);

  const extras: { id: CursorMode; key: string; cls: string; name: string; hint: string; sub: string; mark: string }[] = [
    { id:'up',   key:'U', cls:'', name:'Прокачати', hint:'Сильніша башта на тому самому місці.', sub:'ціна росте з рівнем', mark:'▲' },
    { id:'aim',  key:'T', cls:'', name:'Ціль',      hint:'Перший / останній / міцний / слабкий.', sub:'клац по башті — наступний режим', mark:'◎' },
    { id:'raze', key:'0', cls:'raze', name:'Знести', hint:'Вкладене до межі хвилі — усе назад.', sub:'старіше вже 70%', mark:'↩' },
  ];
  for (const x of extras) {
    const b = document.createElement('button');
    b.className = 'tool ' + x.cls;
    b.dataset.mode = x.id;
    b.innerHTML = '<span class="key">' + x.key + '</span><span class="nm"><b></b><i></i><u></u></span>' +
                  '<span class="cost">' + x.mark + '</span>';
    b.querySelector('b').textContent = x.name;
    b.querySelector('i').textContent = x.hint;
    b.querySelector('u').textContent = x.sub;
    b.onclick = () => { tool = x.id; refreshRail(); };
    el.rail.appendChild(b);
  }
  refreshRail();
}
function refreshRail() {
  const gold = sim.players[meId()].gold;
  const open = sim.tier();
  el.rail.querySelectorAll<HTMLElement>('.tierHead').forEach(h => {
    const tier = +h.dataset.tier!;
    const locked = tier > open;
    h.classList.toggle('locked', locked);
    h.querySelector('i')!.textContent = locked ? 'з хвилі ' + TIER_WAVE[tier] : '';
  });
  el.rail.querySelectorAll<HTMLElement>('.tool').forEach(b => {
    if (b.dataset.mode) {
      b.setAttribute('aria-pressed', String(tool === b.dataset.mode));
    } else {
      const t = TOOL_BY_KEY[b.dataset.key!];
      if (!t) return;
      const locked = t.tier > open;
      b.classList.toggle('locked', locked);
      b.setAttribute('aria-pressed', String(tool === t));
      b.classList.toggle('poor', !locked && gold < t.cost);
    }
  });
  /* Якщо в руці лишилась башта, яку щойно закрили (новий забіг, зміна
     фракції) — мовчки повертаємось до першої доступної, щоб клік по полю
     не давав незрозумілу відмову. Без рекурсії: запасну шукаємо серед
     свідомо доступних і лише перемальовуємо позначки. */
  if (typeof tool !== 'string' && (tool.tier > open || !toolsOf(myPrimary, mySupport).includes(tool.key))) {
    const open_ = myTools().filter(t => t.tier <= open);
    const fallback = open_.find(t => t.shot) || open_[0];
    if (fallback && fallback !== tool) {
      tool = fallback;
      el.rail.querySelectorAll<HTMLElement>('.tool').forEach(b => {
        if (!b.dataset.mode) b.setAttribute('aria-pressed', String(b.dataset.key === fallback.key));
      });
    }
  }
}

/* ── журнал ──────────────────────────────────────────────────────────── */
function say(text, cls) {
  const d = document.createElement('div');
  if (cls) d.className = cls;
  const s = (sim ? sim.tick : 0) / TPS;
  const mm = String((s / 60) | 0).padStart(2, '0'), ss = String((s | 0) % 60).padStart(2, '0');
  d.innerHTML = '<span class="t">' + mm + ':' + ss + '</span> ' + text;
  el.log.appendChild(d);
  while (el.log.children.length > 40) el.log.removeChild(el.log.firstChild);
}

/* ── ввід ────────────────────────────────────────────────────────────── */
function enqueue(cmd) {
  if (!sim || sim.over || desync || (!net.solo && inLobby)) return;
  cmd.p = netP();     // мережевий тег — розсортовується по дошках ДО sim.step()
  ls.queue(cmd);
}
/* Межі дошки читаються раз на кадр, а не з кожного руху миші.
   getBoundingClientRect змушує браузер перерахувати розкладку, і робити
   це по сто разів на секунду — та ще й упереміш із записами в DOM —
   коштує дорожче за все інше в обробнику. Оновлює його кадр, тож
   значення завжди свіже. */
let cvRect: DOMRect | null = null;
const boardRect = (): DOMRect => (cvRect ||= cv.getBoundingClientRect());
function tileAt(ev) {
  const r = boardRect();
  const x = ((ev.clientX - r.left) / r.width * GW) | 0;
  const y = ((ev.clientY - r.top) / r.height * GH) | 0;
  return [Math.max(0, Math.min(GW - 1, x)), Math.max(0, Math.min(GH - 1, y))];
}
/* Сам рух миші лише запам'ятовує позицію: підказку збирає кадр. Інакше
   на кожен рух ішли запис innerHTML і одразу читання offsetWidth —
   розкладка перераховувалась по двічі на рух. */
let tipAt: { x: number; y: number } | null = null;
cv.addEventListener('mousemove', e => {
  const [x, y] = tileAt(e); hoverX = x; hoverY = y;
  tipAt = { x: e.clientX, y: e.clientY };
});
cv.addEventListener('mouseleave', () => {
  hoverX = hoverY = -1; tipAt = null; tipKey = ''; el.towerTip.hidden = true;
});

/* Підказка по вежі під курсором. Самих кольорів мало, щоб розрізняти
   двадцять веж, а клікати заради перевірки — зайвий крок посеред хвилі.
   Радіус показуємо лише там, де його взагалі показують (легкий рівень). */
let tipKey = '', tipW = 0, tipH = 0;
function showTowerTip(cx: number, cy: number) {
  const t = sim && sim.towerAt(hoverX, hoverY);
  if (!t) { el.towerTip.hidden = true; tipKey = ''; return; }
  const b = TOOL_BY_KEY[t.k];
  /* Розмір підказки читаємо, лише коли справді змінився її вміст:
     інакше кожен рух миші вздовж однієї вежі коштував перерахунку. */
  const key = [t.x, t.y, t.k, t.lvl, t.aim, t.build > 0, sim.upgradeCost(t), sim.refund(t)].join('|');
  if (key !== tipKey) {
    tipKey = key;
    const rows = [
      `<b style="color:${C(b.swatch)}">${escapeHtml(b.name)}</b><i>рівень ${t.lvl}</i>`,
      `${Math.round(t.st.dmg * TPS / Math.max(1, t.st.cd))} шк/с` +
        (rangeShown() ? ` · радіус ${(t.st.range / SUB).toFixed(1)}` : ''),
      `ціль: ${AIMS[t.aim]}`,
    ];
    if (t.build > 0) rows.push('<u>будується…</u>');
    else if (t.lvl < MAX_LVL) rows.push(`<u>прокачка ${sim.upgradeCost(t)}</u>`);
    rows.push(`<u>знести → ${sim.refund(t)}</u>`);
    el.towerTip.innerHTML = rows.join('<br>');
    el.towerTip.hidden = false;
    tipW = el.towerTip.offsetWidth; tipH = el.towerTip.offsetHeight;
  }
  el.towerTip.hidden = false;

  // тримаємо підказку в межах дошки, щоб вона не вилазила за край
  const box = boardRect();
  let x = cx - box.left + 14, y = cy - box.top + 14;
  if (x + tipW > box.width)  x = cx - box.left - tipW - 14;
  if (y + tipH > box.height) y = cy - box.top - tipH - 14;
  el.towerTip.style.left = Math.max(0, x) + 'px';
  el.towerTip.style.top  = Math.max(0, y) + 'px';
}
cv.addEventListener('contextmenu', e => { e.preventDefault(); const [x, y] = tileAt(e); enqueue({ t:'raze', x, y }); });
cv.addEventListener('mousedown', e => {
  if (e.button !== 0) return;
  const [x, y] = tileAt(e);
  if (tool === 'raze') enqueue({ t:'raze', x, y });
  else if (tool === 'up') enqueue({ t:'up', x, y });
  else if (tool === 'aim') enqueue({ t:'aim', x, y });
  else enqueue({ t:'build', x, y, k:tool.key });
});
addEventListener('keydown', e => {
  if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'SELECT') return;
  const k = e.key.toLowerCase();
  // цифри йдуть по МОЄМУ арсеналу в порядку панелі, а не по глобальному
  // реєстру — інакше «2» означало б різні башти в різних фракціях
  if (k >= '1' && k <= '9') { const t = myTools()[+k - 1]; if (t) { tool = t; refreshRail(); } }
  else if (k === '0') { tool = 'raze'; refreshRail(); }
  else if (k === 'u') { tool = 'up'; refreshRail(); }
  else if (k === 't') { tool = 'aim'; refreshRail(); }
  else if (k === 'escape') { const t = myTools().find(x => x.shot); if (t) { tool = t; refreshRail(); } }
  else if (k === ' ') { e.preventDefault(); togglePause(); }
  else if (k === 'f') cycleSpeed();
  else if (k === 'n') enqueue({ t:'wave' });
});
/* У коопі паузу веде хост: гостьова кнопка заблокована через
   refreshHostLocks(), але лишаємо перевірку і тут — про всяк випадок
   (клавіша «Пробіл» кнопкою не керується). Сама пауза — деталермінована
   команда 'freeze', тож ефект розходиться на обидва боки лок-степом,
   без окремого мережевого повідомлення. */
function togglePause() {
  if (!net.solo && net.me !== 0) { say('Паузу керує господар', 'bad'); return; }
  if (!net.solo && (inLobby || !sim || sim.over)) return;
  paused = !paused;
  el.pause.textContent = paused ? 'Далі' : 'Пауза';
  enqueue({ t:'freeze', v: paused ? 1 : 0 });
}
/* Швидкість — не ігрова логіка (крипи рухаються по тіках, а не по
   секундах), тож не потребує лок-степу. Але щоб партія НЕ впиралась у
   ЧЕКАЮ, обидва клієнти мають прискорюватись однаково — тому в коопі це
   рішення хоста, розіслане легким мережевим повідомленням, а не
   деталермінована команда. */
const SPEED_STEPS = [0.5, 1, 1.5, 2, 3, 5, 10];
function speedLabel(v) { return (v % 1 === 0 ? v : v.toFixed(1)) + '×'; }
function setSpeed(v, broadcast) {
  speed = v;
  el.speed.textContent = speedLabel(v);
  if (broadcast && net.live) net.send({ t:'speed', v: Math.round(v * 10) });
}
function cycleSpeed() {
  if (!net.solo && net.me !== 0) { say('Швидкість керує господар', 'bad'); return; }
  const i = SPEED_STEPS.indexOf(speed);
  const next = SPEED_STEPS[(i < 0 ? 1 : i + 1) % SPEED_STEPS.length];
  setSpeed(next, true);
}
const readSetup = () => ({
  seed: el.seed.value || 'MAZE-01', diff: parseInt(el.diff.value, 10),
  map: parseInt(el.mapSel.value, 10), mode: parseInt(el.modeSel.value, 10),
  duel: duelAllowed() && el.duel.checked,
  /* Фракції — по індексу МЕРЕЖЕВОГО гравця, а не «моя/його». Так пара
     читається однаково в обох, і дошки збираються з того самого. */
  ars: arsenalPair(),
});
function writeSetup(s) {
  if (!s) return;
  el.seed.value = s.seed; el.diff.value = String(s.diff);
  el.mapSel.value = String(s.map | 0); el.modeSel.value = String(s.mode | 0);
  el.duel.checked = !!s.duel;
  if (s.ars && s.ars.length === 2) {
    /* Пара від хоста — остаточна. Свій вибір гість уже надіслав ident'ом
       і «Готовим», тож зазвичай це те саме; але якщо не встигло дійти,
       краще однакові дошки з чужим вибором, ніж розсинхрон із власним. */
    const mine = s.ars[netP()] || [], mate = s.ars[1 - netP()] || [];
    myPrimary = validRole(mine[0], 'primary', myPrimary);
    mySupport = validRole(mine[1], 'support', mySupport);
    matePrimary = validRole(mate[0], 'primary', matePrimary);
    mateSupport = validRole(mate[1], 'support', mateSupport);
    el.primarySel.value = myPrimary;
    el.supportSel.value = mySupport;
    renderFactionCards();
  }
  updateDuelAvailability();
}
function randomSeed() { return 'S' + Math.random().toString(36).slice(2, 8).toUpperCase(); }

/* «Кожен сам за себе» має сенс лише в коопі на фіксованому шляху — своя
   лінія в лабіринті означала б подвоєння всього поля, окрема історія. */
function duelAllowed() {
  return !net.solo && parseInt(el.modeSel.value, 10) === MODE_FIXED;
}
function updateDuelAvailability() {
  const ok = duelAllowed();
  el.duelField.classList.toggle('na', !ok);
  if (!ok) el.duel.checked = false;
}

/* Гість ніколи не крутить налаштування. Хост — тільки поки в лобі: під
   час бою чи екрана результатів поля заблоковані, щоб випадкова зміна
   не змішалась зі стартом нової партії. */
function refreshHostLocks() {
  refreshRangeOption();
  const guestSide = !net.solo && net.me !== 0;
  const midGame = !net.solo && !inLobby;
  const locked = guestSide || midGame;
  for (const c of [el.seed, el.diff, el.mapSel, el.modeSel]) c.disabled = locked;
  /* Фракція — виняток: це вибір КОЖНОГО гравця, тож гостю вона доступна
     нарівні з хостом. Замикає її лише початок бою, як і решту. */
  el.primarySel.disabled = midGame;
  el.supportSel.disabled = midGame;
  el.loadoutField.classList.toggle('na', midGame);
  el.duel.disabled = locked || !duelAllowed();
  el.restart.disabled = guestSide;
  el.pause.disabled = guestSide;
  el.speed.disabled = guestSide;
  updateDuelAvailability();
}

/* ── лобі: хост крутить налаштування, гість тисне «Готовий» ─────────────
   Будь-яка зміна хоста піднімає lobbyCfgSeq і скидає готовність гостя —
   застаріле «готовий» на старі налаштування ніколи не пройде звірку. */
let inLobby = false;
let guestReadyLocal = false;
let myCfgSeq = 0;

function lobbyText() {
  const m = MAPS[parseInt(el.mapSel.value, 10)] || MAPS[0];
  const modeName = parseInt(el.modeSel.value, 10) === MODE_FIXED ? 'фіксований шлях' : 'лабіринт';
  const diffName = el.diff.options[el.diff.selectedIndex].text;
  return m.name + ' · ' + modeName + ' · складність ' + diffName + ' · сід ' + (el.seed.value || 'MAZE-01') +
    (duelAllowed() && el.duel.checked ? ' · кожен на своїй лінії' : '');
}
/* Фон лобі — не просто напис із назвою мапи, а сама мапа: терен, траса,
   вхід/вихід під напівпрозорою шторкою. Дешева одноразова Sim без хвиль,
   перебудовується лише коли справді змінились мапа чи режим. */
function renderLobbyBackdrop() {
  const mapIdx = parseInt(el.mapSel.value, 10), mode = parseInt(el.modeSel.value, 10);
  if (!lobbyPreview || lobbyPreview.mapIdx !== mapIdx || lobbyPreview.mode !== mode) {
    lobbyPreview = new Sim('LOBBY', 100, 1, mapIdx, mode);
  }
  const real = sim;
  sim = lobbyPreview;      // тимчасова підміна: render() малює те, що дали
  render(1);
  sim = real;
}
function renderLobby() {
  if (net.solo || !inLobby) return;
  el.veil.hidden = false;
  el.veil.className = 'veil lobby';
  el.veilT.textContent = 'Лобі';
  el.veilB.hidden = false; el.veilB2.hidden = true;
  /* Фракцію обирає кожен свою — навіть гість, якому решта налаштувань
     заблокована. Це єдине рішення в лобі, що належить особисто йому. */
  el.veilFactions.hidden = false;
  renderFactionCards();
  if (net.me === 0) {
    el.veilX.textContent = lobbyText();
    el.veilReady.hidden = false;
    const ready = guestReadySeq === lobbyCfgSeq;
    el.veilReady.className = 'readyDot' + (ready ? ' on' : '');
    el.veilReady.querySelector('span').textContent = ready ? 'Гість готовий' : 'Гість обирає…';
    el.veilB.disabled = !ready;
    el.veilB.textContent = 'Розпочати гру';
    el.veilB.onclick = hostStartFromLobby;
  } else {
    el.veilX.textContent = lobbyText() + ' — обирає господар';
    el.veilReady.hidden = true;
    el.veilB.disabled = guestReadyLocal;
    el.veilB.textContent = guestReadyLocal ? 'Готовий ✓ (чекаю господаря)' : 'Готовий';
    el.veilB.onclick = guestSendReady;
  }
}
function hostSendCfg() {
  lobbyCfgSeq++; guestReadySeq = -1;
  net.send({ t:'cfg', s: readSetup(), seq: lobbyCfgSeq });
  renderLobby();
}
function hostStartFromLobby() {
  if (guestReadySeq !== lobbyCfgSeq) return;
  inLobby = false;
  net.send({ t:'r', g: gen + 1, s: readSetup() });
  boot(gen + 1);
}
function hostRematch() {
  el.seed.value = randomSeed();
  inLobby = false;
  net.send({ t:'r', g: gen + 1, s: readSetup() });
  boot(gen + 1);
}
function hostNewGame() {
  if (net.solo) { boot(); return; }
  if (net.me !== 0) return;               // гостьові поля й так заблоковані — подвійний захист
  inLobby = true;
  lobbyCfgSeq++; guestReadySeq = -1;
  net.send({ t:'cfg', s: readSetup(), seq: lobbyCfgSeq });
  refreshHostLocks();
  renderLobby();
}
function guestSendReady() {
  guestReadyLocal = true;
  net.send({ t:'ready', seq: myCfgSeq, lo: myPrimary, sup: mySupport });
  renderLobby();
}
function onHeaderChange() {
  updateDuelAvailability();     // зміна режиму могла зробити «сам за себе» недоступним
  if (net.solo) { boot(); return; }
  if (net.me !== 0) return;
  if (inLobby) hostSendCfg();
}

el.pause.onclick = togglePause;
el.speed.onclick = cycleSpeed;
el.wave_.onclick = () => enqueue({ t:'wave' });
el.restart.onclick = hostNewGame;
el.seed.onchange = onHeaderChange;
el.diff.onchange = onHeaderChange;
el.mapSel.onchange = onHeaderChange;
el.modeSel.onchange = onHeaderChange;
el.duel.onchange = onHeaderChange;

/* ── перевірка детермінізму ──────────────────────────────────────────── */
el.verify.onclick = () => {
  const target = sim.tick, want = sim.hash();
  const shadow = new Sim(sim.seedStr, sim.diff, sim.nPlayers, sim.mapIdx, sim.mode);
  const plan = new Map();
  for (const r of ls.hist) {
    if (!plan.has(r.tick)) plan.set(r.tick, []);
    plan.get(r.tick).push(r.cmd);
  }
  for (let t = 0; t < target; t++) {
    const c = plan.get(t);
    if (c) c.sort((x, y) => (x.p - y.p) || (x.seq - y.seq));
    shadow.step(c || null);
  }
  const got = shadow.hash();
  const ok = got === want;
  el.veil.hidden = false; el.veilFactions.hidden = true;
  el.veil.className = 'veil verify';
  el.veilReady.hidden = true; el.veilB2.hidden = true; el.veilB.hidden = false;
  el.veilT.textContent = ok ? 'Збіг' : 'Розбіжність';
  el.veilX.textContent = ok
    ? target + ' тіків, ' + ls.hist.length + ' команд переграно з нуля → ' + got
    : 'очікували ' + want + ', отримали ' + got;
  el.veilB.textContent = 'Продовжити';
  el.veilB.onclick = () => { el.veil.hidden = true; };
  say(ok ? 'Детермінізм підтверджено: ' + got : 'РОЗБІЖНІСТЬ: ' + want + ' ≠ ' + got, ok ? 'good' : 'bad');
};

/* ── кооператив: обмін даними ────────────────────────────────────────── */
net.onCmds = (g, tick, cmds) => ls.accept(g, tick, cmds, stash);
net.onHash = (g, tick, h) => { if (g === gen) { theirHash.set(tick, h); compareHash(tick); } };
net.onCfg = (s, seq) => {
  writeSetup(s);
  myCfgSeq = seq;
  guestReadyLocal = false;
  inLobby = true;                 // хост міг повернути в лобі й посеред бою
  refreshHostLocks();
  renderLobby();
};
net.onReady = m => {
  // фракція їде і тут теж: «Готовий» — останнє слово гостя перед стартом,
  // тож саме на цей момент хост має знати остаточний вибір
  matePrimary = validRole(m.lo, 'primary', matePrimary);
  mateSupport = validRole(m.sup, 'support', mateSupport);
  renderLobby(); renderFactionCards();
  if (m.seq === lobbyCfgSeq) { guestReadySeq = m.seq; renderLobby(); }
};
net.onSpeed = v => setSpeed(v / 10, false);   // прийняв від хоста — не відсилаю назад
net.onIdent = m => {
  mateIdent = { name: (m.name || '').slice(0, 18), color: m.color || 'steel' };
  matePrimary = validRole(m.lo, 'primary', matePrimary);
  mateSupport = validRole(m.sup, 'support', mateSupport);
  renderRoster(); renderLobby(); renderFactionCards();
};
net.onRestart = (g, s) => {
  writeSetup(s);
  inLobby = false;
  boot(g);
};
function lsDiag() {
  return 'тік ' + sim.tick + ' · покоління ' + gen +
         ' · черга напарника ' + (ls ? ls.remote.size : 0) +
         ' · відправлено ' + net.txCmd + ' · отримано команд ' + net.rxCmd +
         ' · усього повідомлень ' + net.rxAny +
         ' · мережа ' + (net.live ? 'так' : 'ні') +
         (sim.over ? ' · ЗАБІГ ЗАВЕРШЕНО' : '') +
         (desync ? ' · РОЗСИНХРОН' : '') +
         (stalled ? ' · ЧЕКАЮ' : '');
}
net.onDiag = () => {
  el.coopDiag.textContent = net.diag() + String.fromCharCode(10) + lsDiag() +
    (net.evt && net.evt.length ? String.fromCharCode(10) + net.evt.join(String.fromCharCode(10)) : '');
  // Якщо зовнішніх адрес не знайшлося взагалі — попереджаємо одразу
  if (net.state === 'waiting' && candOf() && candOf().srflx === 0 && candOf().relay === 0 && iceErrOf() > 0)
    el.coopHint.textContent = 'STUN/TURN не відповідають — назовні вас не видно. ' +
      'Спрацює лише в межах однієї мережі.';
};
net.onState   = s => {
  syncPanels();               // панель гравців з'являється в мить з'єднання
  const cls = s === 'live' ? 'live' : s === 'waiting' ? 'waiting' : (s === 'dead' || s === 'stale') ? 'dead' : '';
  el.netState.className = 'netState ' + cls;
  el.netState.innerHTML = '<span class="dot"></span>' +
    (s === 'live' ? ('Гравець ' + (net.me + 1)) : s === 'waiting' ? 'Чекаю' : s === 'dead' ? 'Розрив' : s === 'stale' ? 'Немає відповіді' : 'Соло');
  if (s === 'live') {
    paused = false; setSpeed(1, false); el.pause.textContent = 'Пауза';
    el.code.value = ''; el.roomLink.hidden = true;
    say('З’єднання встановлено', 'good');
    inLobby = true; guestReadySeq = -1; guestReadyLocal = false;
    mateIdent = { name:'', color: net.me === 0 ? 'steel' : 'brass' };  // тимчасово, поки напарник не назветься
    sendIdent();
    refreshHostLocks();
    /* Партія в мережі — це покоління 1. Команди господаря, що прилетять
       до перезапуску гостя, матимуть g=1 > його поточного 0, тож
       відкладуться в чергу й застосуються після старту, а не згинуть. */
    if (net.me === 0) {
      lobbyCfgSeq = 1;
      net.send({ t:'cfg', s: readSetup(), seq: lobbyCfgSeq });
      el.coopHint.textContent = 'Лобі. Обери мапу й режим — «Розпочати» стане активним, коли гість натисне «Готовий».';
    } else {
      el.coopHint.textContent = 'З’єднано. Чекаю налаштування господаря…';
    }
    renderLobby();
  } else if (s === 'stale') {
    el.coopHint.textContent = 'Канал відкрито, але напарник мовчить — код застарів. ' +
      'Обидва перезавантажте сторінку й обміняйтесь кодами наново, без пауз.';
    say('Напарник не відповів на привітання', 'bad');
  } else if (s === 'dead') {
    el.coopHint.textContent = candOf() && candOf().relay === 0
      ? 'Не вдалось з’єднатись. Прямого маршруту немає, ретранслятор теж не дав адрес.'
      : 'Канал розірвано.';
    el.coopDiag.textContent = net.diag() + String.fromCharCode(10) + lsDiag() +
    (net.evt && net.evt.length ? String.fromCharCode(10) + net.evt.join(String.fromCharCode(10)) : '');
    say('Кооп: з’єднання не встановлено', 'bad');
  }
};

/* Перемикання транспорту: обробники ті самі, змінюється лише те, чим
   вони їздять. Дає запасний шлях — якщо лобі через PeerJS не з'єднається,
   ручний обмін кодами (клас Net) лишається робочим варіантом. */
function attachNet(n) {
  n.onCmds = net.onCmds; n.onHash = net.onHash; n.onRestart = net.onRestart;
  n.onState = net.onState; n.onDiag = net.onDiag; n.onCfg = net.onCfg; n.onReady = net.onReady;
  n.onSpeed = net.onSpeed; n.onIdent = net.onIdent;
  net.reset();
  net = n;
}

/* Якщо WebRTC недоступний — кажемо про це одразу й пояснюємо, а не
   даємо натиснути кнопку й отримати незрозумілу помилку. */
function coopBlocked() {
  if (RTC) return false;
  el.host.disabled = true; el.use.disabled = true; el.lobbyHost.disabled = true;
  el.netState.className = 'netState dead';
  el.netState.innerHTML = '<span class="dot"></span>Недоступно';
  el.coopHint.textContent = 'У цьому браузері WebRTC недоступний — кооп не працюватиме.';
  return true;
}

/* ── лобі через посилання (основний спосіб) ──────────────────────────── */
el.lobbyHost.onclick = async () => {
  if (coopBlocked()) return;
  if (!net.solo) { el.coopHint.textContent = 'Вже під’єднано або очікую з’єднання.'; return; }
  if (typeof Peer !== 'function') {
    el.coopHint.textContent = 'Бібліотека лобі не завантажилась — скористайся «Ручним способом» нижче.';
    return;
  }
  const lobby = new PeerNet();
  attachNet(lobby);
  el.coopHint.textContent = 'Створюю кімнату…';
  try {
    const code = await lobby.createRoom();
    const link = location.origin + location.pathname + '?room=' + code;
    history.replaceState(null, '', '?room=' + code);
    el.roomLink.hidden = false;
    el.roomLinkText.textContent = link;
    el.coopHint.textContent = 'Надішли це посилання другу — приєднається сам, щойно відкриє.';
  } catch (e) {
    el.coopHint.textContent = 'Не вийшло: ' + (e && e.message ? e.message : e);
  }
};
el.lobbyCopy.onclick = () => {
  if (!el.roomLinkText.textContent) return;
  navigator.clipboard.writeText(el.roomLinkText.textContent)
    .then(() => { el.coopHint.textContent = 'Скопійовано.'; })
    .catch(() => {});
};

/* ── ручний спосіб (запасний, якщо лобі не з'єднується) ──────────────── */
el.host.onclick = async () => {
  if (coopBlocked()) return;
  if (!(net instanceof Net)) attachNet(new Net());
  if (net.state === 'waiting' || net.state === 'live') {
    el.coopHint.textContent = net.state === 'live'
      ? 'Ви вже з’єднані.'
      : 'Запрошення вже створено — надішли його й чекай відповідь. Щоб почати з нуля, перезавантаж сторінку.';
    el.code.select(); return;
  }
  net.reset();
  el.coopHint.textContent = 'Готую код…';
  try {
    el.code.value = await manualNet().host(readSetup());
    el.code.select();
    el.coopHint.textContent = 'Надішли цей код другу, тоді встав його відповідь сюди.';
  } catch (e) { el.coopHint.textContent = 'Не вийшло: ' + e.message; }
};

el.use.onclick = async () => {
  if (coopBlocked()) return;
  const code = el.code.value.trim();
  if (!code) { el.coopHint.textContent = 'Спершу встав код.'; return; }
  let m = null;
  try { m = await unpackCode(code); } catch (e) { m = null; }
  if (!m || (m.r !== 'o' && m.r !== 'a')) {
    el.coopHint.textContent = 'Код не читається — скопійовано не повністю?';
    return;
  }
  try {
    /* Дію обирає САМ КОД, а не внутрішній стан. Раніше після невдалої
       спроби гість не міг приєднатись заново без перезавантаження. */
    if (m.r === 'o') {
      if (!(net instanceof Net)) attachNet(new Net());
      /* Друге натискання створює НОВЕ з'єднання, а господар лишається з
         першим — і обидва застрягають. Тому просто не даємо. */
      if (net.state === 'waiting' || net.state === 'live') {
        el.coopHint.textContent = net.state === 'live'
          ? 'Ви вже з’єднані.'
          : 'Ти вже приєднався. Чекай, поки господар вставить твою відповідь — не тисни вдруге. Щоб почати з нуля, перезавантаж сторінку.';
        return;
      }
      const r = await manualNet().join(code);
      writeSetup(r.s);
      if (r.b && r.b !== BUILD) say('УВАГА: різні версії файлу (' + BUILD + ' проти ' + r.b + ')', 'bad');
      el.code.value = r.code; el.code.select();
      el.coopHint.textContent = 'Готово. Надішли цю відповідь господарю й БІЛЬШЕ НІЧОГО НЕ ТИСНИ — чекай.';
    } else {
      await manualNet().confirm(code);
      if (net.peerBuild && net.peerBuild !== BUILD) say('УВАГА: різні версії файлу (' + BUILD + ' проти ' + net.peerBuild + ')', 'bad');
      el.coopHint.textContent = 'Відповідь прийнято, з’єднуємось…';
    }
  } catch (e) { el.coopHint.textContent = 'Не вийшло: ' + e.message; }
};

el.copy.onclick = () => {
  if (!el.code.value) return;
  el.code.select();
  navigator.clipboard.writeText(el.code.value)
    .then(() => { el.coopHint.textContent = 'Скопійовано.'; })
    .catch(() => { el.coopHint.textContent = 'Скопіюй вручну: Ctrl+C.'; });
};

/* ── приєднання за посиланням ────────────────────────────────────────── */
/* Викликається пізніше, ПІСЛЯ початкового boot(): якщо запустити її тут-таки,
   net встигає стати 'waiting' ще до того, як низовий boot() вирішить,
   скільки гравців у сесії — вийшла б соло-партія з коопівською сіткою. */
function autoJoinFromLink() {
  const room = new URLSearchParams(location.search).get('room');
  if (!room) return;
  el.lobbyHost.hidden = true;
  el.coopHint.textContent = 'Запрошення до кімнати ' + room + '. Приєднуюсь…';
  if (coopBlocked()) return;
  if (typeof Peer !== 'function') {
    el.coopHint.textContent = 'Бібліотека лобі не завантажилась. Попроси господаря надіслати код вручну.';
    el.lobbyHost.hidden = false;
    return;
  }
  const lobby = new PeerNet();
  attachNet(lobby);
  lobby.joinRoom(room.toUpperCase())
    .then(() => { el.coopHint.textContent = 'З’єднуюсь із кімнатою ' + room + '…'; })
    .catch(e => {
      el.coopHint.textContent = 'Не вдалось приєднатись: ' + (e && e.message ? e.message : e);
      el.lobbyHost.hidden = false;
    });
}

/* ── цикл ────────────────────────────────────────────────────────────── */
/* Виклик наступного кадру стоїть в кінці, тож будь-який виняток усередині
   обривав цикл НАЗАВЖДИ: сторінка жива, мережа приймає дані, а гра стоїть.
   Саме так у гостя тік застигав на нулі. Тепер помилка не вбиває цикл і
   потрапляє в журнал. */
/* Браузер зупиняє requestAnimationFrame у фоновій вкладці. Для одинака це
   просто пауза, а в коопі — біда: лок-степ чекає команд обох сторін, тож
   згорнута вкладка одного підвішує партію ОБОМ. Тому поки вкладку не
   видно, кадри жене таймер: малювати нікому, але симуляція й мережа
   мусять іти далі. На детермінізм це не впливає — симуляція живе на
   тіках, а не на часі. */
const HIDDEN_MS = 16;
let frameErrTold = false;
function schedule(fn: (now: number) => void): void {
  if (typeof document !== 'undefined' && document.hidden)
    setTimeout(() => fn(performance.now()), HIDDEN_MS);
  else requestAnimationFrame(fn);
}
function frame(now: number) {
  try { frameBody(now); }
  catch (e: any) {
    if (!frameErrTold) {
      frameErrTold = true;
      const msg = (e && e.message) ? e.message : String(e);
      if (net.note) net.note('ПОМИЛКА В ЦИКЛІ: ' + msg);
      say('Помилка в циклі гри: ' + msg, 'bad');
    }
  }
  schedule(frame);
}

function frameBody(now) {
  cvRect = null;                 // межі дошки — один вимір на кадр, до записів у DOM
  if (!last) last = now;
  let dt = now - last; last = now;
  if (dt > 250) dt = 250;
  const stepMs = 1000 / TPS;
  const wired = net.live;
  const sender = wired ? ((t, b) => net.send({ t:'c', g:gen, k:t, m:b })) : null;

  /* Гра йде завжди, крім кінця забігу, розсинхрону й часу в лобі. Поки
     чекаємо напарника, крутимо як соло — при з'єднанні все одно почнеться
     наново з тіку 0. Раніше тут стояла умова, від якої гра завмирала
     одразу після натискання «Створити гру». */
  /* У дуелі моя дошка може завершитись раніше за дошку напарника — тікати
     маємо, поки жива БУДЬ-ЯКА з двох, інакше мій клієнт перестає слати
     навіть порожні пакети, і напарник зависає, чекаючи мене назавжди. */
  const anyoneAlive = !sim.over || (duelBoards && simMate && !simMate.over);
  if (sim && anyoneAlive && !desync && (net.solo || !inLobby)) {
    acc += dt * (sim.frozen ? 1 : speed);
    let guard = 0;
    stalled = false;
    while (acc >= stepMs && guard++ < 12) {
      // спершу віддаємо свій ввід на DELAY тіків уперед — саме цей запас
      // і ховає затримку каналу
      ls.publishTo(sim.tick + DELAY, sender);
      if (!ls.ready(sim.tick, wired)) { stalled = true; break; }
      acc -= stepMs;
      const merged = ls.merged(sim.tick);
      if (duelBoards) {
        // Пауза — спільний контроль над матчем: від будь-кого мусить
        // зупинити ОБИДВІ дошки, інакше один сидить у меню, поки в
        // іншого йде бій. Виклик хвилі — окремо: сирі команди 'wave'
        // НІКОЛИ не йдуть напряму (кожна дошка сама по собі nPlayers=1,
        // тож миттєво зрушила б лише себе) — голоси збираються тут, і
        // лише коли проголосували обидва, обом дошкам підкидається один
        // синтетичний 'wave' одночасно.
        const my = netP();
        const isFreeze = c => c.t === 'freeze';
        // 'wave' завжди виключений із звичайної маршрутизації — інакше
        // власний голос проходив би на СВОЮ дошку одразу через гілку
        // c.p===my, оминаючи чекання на другий голос.
        const mine  = (merged || []).filter(c => c.t !== 'wave' && (c.p === my || isFreeze(c))).map(c => Object.assign({}, c, { p:0 }));
        const mates = (merged || []).filter(c => c.t !== 'wave' && (c.p !== my || isFreeze(c))).map(c => Object.assign({}, c, { p:0 }));
        for (const c of (merged || [])) if (c.t === 'wave') duelWaveVotes.add(c.p);
        if (duelWaveVotes.size >= 2) {
          duelWaveVotes.clear();
          mine.push({ t:'wave', p:0 });
          mates.push({ t:'wave', p:0 });
        }
        /* Хвиля має починатись в обох одночасно. Дошки окремі, тож без
           цього той, хто добив свою хвилю раніше, раніше й отримував
           наступну — і з кожною хвилею відривався все далі, аж поки
           порівнювати ставало нема з чим. Тепер відлік підготовки
           стоїть, поки друга дошка ще в бою. Обидва клієнти рахують
           обидві дошки, тож умова однакова з обох боків. */
        sim.holdPrep     = !simMate.over && simMate.phase === 1;
        simMate.holdPrep = !sim.over && sim.phase === 1;
        sim.step(mine);
        simMate.step(mates);
        digestMate();
      } else {
        sim.step(merged);
      }
      digest();
      if (wired && sim.tick % 60 === 0) {
        const h = sim.hash();
        myHash.set(sim.tick, h);
        net.send({ t:'h', g:gen, k:sim.tick, h });
        if (duelBoards) myMateHash.set(sim.tick, simMate.hash());
        compareHash(sim.tick);
      }
    }
    if (stalled && acc > stepMs * 3) acc = stepMs * 3;   // не копимо борг, поки чекаємо
  }
  if (!net.solo && inLobby) renderLobbyBackdrop();
  else render(sim.frozen || sim.over ? 1 : Math.min(1, acc / stepMs));
  if (duelBoards) renderMate();
  hud();
  if (tipAt) showTowerTip(tipAt.x, tipAt.y);
}

/* Класика: обидва боки бачать ОДНУ дошку, і a/b — просто мій/чужий хеш
   ТІЄЇ дошки. У дуелі peer шле хеш СВОЄЇ дошки (theirHash) — звіряємо
   його з МОЇМ локальним підрахунком дошки напарника (myMateHash), а не
   з моєю власною. Кожен клієнт так перевіряє «не свою» половину; разом
   обидві дошки лишаються під контролем. */
function compareHash(t) {
  const a = duelBoards ? myMateHash.get(t) : myHash.get(t);
  const b = theirHash.get(t);
  // Обидва боки шлють хеш асинхронно — цю функцію викликають і одразу
  // після підрахунку свого (поки чужий ще в дорозі), і по приходу чужого.
  // Без цієї відсічки перший виклик завжди бачив би b===undefined і
  // трактував це як розсинхрон.
  if (a === undefined || b === undefined || a === b) return;
  desync = t;
  say('ДЕСИНК на тіку ' + t + ': ' + a + ' ≠ ' + b, 'bad');
  el.veil.hidden = false; el.veilFactions.hidden = true;
  el.veil.className = 'veil lost';
  el.veilReady.hidden = true; el.veilB2.hidden = true;
  el.veilT.textContent = 'Розсинхрон';
  const guestSide = !net.solo && net.me !== 0;
  el.veilX.textContent = 'Тік ' + t + ' · у тебе ' + a + ' · у напарника ' + b + (guestSide ? ' · очікую дій господаря' : '');
  el.veilB.hidden = guestSide;
  el.veilB.disabled = false;      // лобі могло лишити її вимкненою
  el.veilB.textContent = 'Новий забіг';
  el.veilB.onclick = () => { if (net.solo) boot(); else hostNewGame(); };
}

/* Підсумок партії для локального журналу й вебхука — рахуємо лише
   власні дії (build/up/raze), бій (kill/leak) спільний для обох. */
function resetStats() {
  stats = { built:0, upgraded:0, razed:0, kills:0, leaks:0, bounty:0, denied:0 };
}
let stats; resetStats();

/* Події симуляції → журнал і спалахи. Читаємо, не пишемо. */
function digest() {
  for (const e of sim.events) {
    if (e.e === 'wave')       say('Хвиля ' + e.n + ' — ' + KIND_NAME[e.kind] + (e.esc ? ' із супроводом' : ''), 'note');
    else if (e.e === 'up')    { if (e.p === meId()) { stats.upgraded++; say('Прокачано до рівня ' + e.lvl, 'good'); } }
    else if (e.e === 'aim')   { if (e.p === meId()) say('Ціль: ' + AIMS[e.m], 'note'); }
    else if (e.e === 'clear') say('Хвилю ' + e.n + ' відбито. +' + e.gold + ' зол.', 'good');
    else if (e.e === 'leak')  { stats.leaks++; say('Прорив! −' + e.dmg + ' життя', 'bad'); fx.push({ t:'ring', x:e.x, y:e.y, life:20, max:20, c:C('--coral') }); }
    else if (e.e === 'raze')  { if (e.p === meId()) { stats.razed++; say(e.full ? ('Знесено, повернено все: +' + e.gold) : ('Знесено зі штрафом: +' + e.gold), e.full ? 'good' : null); } }
    else if (e.e === 'deny')  { if (e.p === meId()) { stats.denied++; say('Не можна: ' + e.why, 'bad'); } }
    else if (e.e === 'early') say('Достроково. +' + e.gold + ' зол. усім', 'good');
    else if (e.e === 'vote')  { if (e.of > 1 && e.n < e.of) say('Голос за прискорення: ' + e.n + '/' + e.of, 'note'); }
    else if (e.e === 'lost')  showLost();
    /* Вибух малюється кольором ТІЄЇ вежі, що стріляла, і живе довше:
       доти це був тонкий контур кольору мортири на чверть секунди, тож
       вибух Криги чи Отрути виглядав однаково й майже непомітно — площа
       здавалась несправною, хоч рахувалась правильно. */
    else if (e.e === 'boom')  fx.push({ t:'ring', x:e.x, y:e.y, life:18, max:18,
                                        c:C(TOOL_BY_KEY[e.k]?.swatch || '--t-mortar'), r:e.r });
    else if (e.e === 'bounty'){ stats.bounty++; fx.push({ t:'spark', x:e.x, y:e.y, life:22, max:22, c:C('--brass') }); }
    else if (e.e === 'kill')  { stats.kills++; fx.push({ t:'spark', x:e.x, y:e.y, life:10, max:10, c:C('--text-faint') }); }
    else if (e.e === 'build') { if (e.p === meId()) stats.built++; }
  }
  for (const f of fx) f.life--;
  fx = fx.filter(f => f.life > 0);
}

/* Мінідошка напарника: жодних спалахів чи детального журналу, лише
   повідомити раз, коли його лінія впала. Малюнок читає simMate напряму
   щокадру — окремий дайджест подій для мініатюри зайвий. */
function digestMate() {
  if (simMate.over && !mateOverSaid) {
    mateOverSaid = true;
    say('Лінія напарника впала на хвилі ' + (simMate.wave - 1), 'bad');
    el.mateBoard.classList.add('over');
  }
}
function showLost() {
  el.veil.hidden = false; el.veilFactions.hidden = true;
  el.veil.className = 'veil lost';
  el.veilReady.hidden = true;
  el.veilT.textContent = 'Оборону зламано';
  const mateNote = duelBoards && simMate
    ? (simMate.over ? ' · напарник теж упав, хвиля ' + (simMate.wave - 1) : ' · напарник ще тримається, хвиля ' + simMate.wave)
    : '';
  const base = 'Витримано хвиль: ' + (sim.wave - 1) + ' · сід ' + sim.seedStr + mateNote;
  if (net.solo) {
    el.veilX.textContent = base;
    el.veilB.hidden = false; el.veilB.disabled = false;
    el.veilB.textContent = 'Новий забіг'; el.veilB.onclick = () => boot();
    el.veilB2.hidden = true;
  } else if (net.me === 0) {
    el.veilX.textContent = base;
    el.veilB.hidden = false; el.veilB.disabled = false;
    el.veilB.textContent = 'Реванш'; el.veilB.onclick = hostRematch;
    el.veilB2.hidden = false; el.veilB2.textContent = 'Нова гра'; el.veilB2.onclick = hostNewGame;
  } else {
    el.veilX.textContent = base + ' · очікую дій господаря';
    el.veilB.hidden = true; el.veilB2.hidden = true;
  }
  reportGame();
}

/* ── журнал партій ───────────────────────────────────────────────────────
   Локально — завжди, у пам'яті вкладки. Вебхук — лише якщо сам глядач
   його налаштував: URL живе в localStorage ЦЬОГО браузера й ніколи не
   потрапляє в код, тож кожен, хто грає, лишається сам собі аналітиком. */
let gameLog = [];

function reportGame() {
  const entry = {
    ts: new Date().toISOString(),
    map: sim.map.name, mode: sim.mode === MODE_FIXED ? 'fixed' : 'maze',
    diff: sim.diff, seed: sim.seedStr, players: sim.nPlayers,
    role: net.solo ? 'solo' : (net.me === 0 ? 'host' : 'guest'),
    wave: sim.wave - 1, durationSec: Math.round(sim.tick / TPS),
    stats: Object.assign({}, stats),
    finalGold: sim.players.map(p => p.gold),
    duel: duelBoards,
    mateWave: (duelBoards && simMate) ? simMate.wave - 1 : null,
  };
  gameLog.push(entry);
  const url = (localStorage.getItem('cp_webhook') || '').trim();
  if (url) sendWebhook(url, discordPayload(entry)).catch(() => {});
}
async function sendWebhook(url, payload) {
  return fetch(url, { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(payload) });
}
function discordPayload(e) {
  const roleName = e.role === 'host' ? 'господар' : e.role === 'guest' ? 'гість' : 'соло';
  const dur = Math.floor(e.durationSec / 60) + 'х' + String(e.durationSec % 60).padStart(2, '0');
  return { embeds: [{
    title: 'Chokepoint · партія завершена',
    color: 0xE0574A,
    fields: [
      { name:'Мапа',           value: e.map + ' · ' + (e.mode === 'fixed' ? 'фіксований шлях' : 'лабіринт'), inline:true },
      { name:'Роль',           value: roleName + (e.duel ? ' (дуель)' : e.players > 1 ? ' (кооп)' : ' (соло)') +
        (e.duel && e.mateWave !== null ? ', напарник до хвилі ' + e.mateWave : ''), inline:true },
      { name:'Хвиля',          value: String(e.wave), inline:true },
      { name:'Тривалість',     value: dur, inline:true },
      { name:'Складність',     value: e.diff + '%', inline:true },
      { name:'Сід',            value: e.seed, inline:true },
      { name:'Побудовано / прокачано / знесено', value: e.stats.built + ' / ' + e.stats.upgraded + ' / ' + e.stats.razed, inline:true },
      { name:'Вбито / прорвалось',               value: e.stats.kills + ' / ' + e.stats.leaks, inline:true },
    ],
    timestamp: e.ts,
  }] };
}

function escapeHtml(s) { return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

/* Рядки панелі гравців: у класичному коопі HP спільне (та сама дошка на
   двох), у дуелі й соло — своє. Сортування за вбивствами — вже готовий
   порядок рядків, без окремого UI для сортування. */
function rosterRows() {
  if (net.solo) {
    const p = sim.players[0];
    return [{ p:0, kills:p.kills, dmg:p.dmg, gold:p.gold, hp:sim.lives, towers:sim.towers.length }];
  }
  if (duelBoards) {
    const meP = sim.players[0];
    const rows = [{ p:netP(), kills:meP.kills, dmg:meP.dmg, gold:meP.gold, hp:sim.lives, towers:sim.towers.length }];
    if (simMate) {
      const mp = simMate.players[0];
      rows.push({ p:1 - netP(), kills:mp.kills, dmg:mp.dmg, gold:mp.gold, hp:simMate.lives, towers:simMate.towers.length });
    }
    return rows.sort((a, b) => b.kills - a.kills);
  }
  return sim.players.map((pl, i) => ({
    p:i, kills:pl.kills, dmg:pl.dmg, gold:pl.gold, hp:sim.lives,
    towers:sim.towers.filter(t => t.owner === i).length,
  })).sort((a, b) => b.kills - a.kills);
}
/* Панель гравців оновлюється з кожного кадру, і раніше щоразу
   перебудовувала весь innerHTML. Одна зі шкод росте безперервно, тож
   розмітка теж перебудовувалась безперервно: вузли викидались і
   створювались заново шістдесят разів на секунду, а поруч читались
   обчислені стилі — гра відчутно лагала в коопі й тільки в коопі.
   Тепер розмітку будуємо, лише коли міняється склад панелі (гравці,
   ніки, кольори, фракції, порядок), а щокадру правимо самі числа. */
let rosterShape = '';
function renderRoster() {
  if (!sim) return;
  const rows = rosterRows();
  const shape = rows.map((r, i) => [r.p, identName(r.p), identFor(r.p).color,
    loadoutOf(r.p).join('+'), i === 0 && rows.length > 1 && r.kills > 0 ? 'веде' : ''].join('')).join('');

  if (shape !== rosterShape) {
    rosterShape = shape;
    /* Рядок на гравця, а не таблиця: панель тепер клітина шапки, і сім
       стовпчиків із заголовками робили її вдвічі вищою за решту. */
    el.rosterBody.innerHTML = rows.map((r, i) => {
      const id = identFor(r.p);
      const [pk, sk] = loadoutOf(r.p);
      const facs = [LOADOUT_BY_KEY[pk], LOADOUT_BY_KEY[sk]].filter(Boolean)
        .map(lo => escapeHtml(lo.name)).join(' + ');
      const num = (cls = '') => '<u class="' + cls + '"></u>';
      return '<div class="pRow' + (r.p === netP() ? ' me' : '') + '">' +
        '<span class="dot" style="background:' + C(paletteCss(id.color)) + '"></span>' +
        '<b>' + escapeHtml(identName(r.p)) +
          (i === 0 && rows.length > 1 && r.kills > 0 ? '<i>веде</i>' : '') + '</b>' +
        '<span class="fx">' + facs + '</span>' +
        '<span class="nums">' + num() + num() + num() + num('gold') + num('hp') + '</span>' +
        '</div>';
    }).join('');
  }

  const body = el.rosterBody.children;
  for (let i = 0; i < rows.length && i < body.length; i++) {
    const r = rows[i], u = body[i].querySelectorAll<HTMLElement>('.nums u');
    const v = [r.kills, r.dmg, r.towers, r.gold, r.hp];
    for (let j = 0; j < u.length && j < v.length; j++) setText(u[j], v[j]);
  }
}

/* У соло панель гравців не показуємо взагалі: рядок на одного дублював
   би HP і золото з шапки. Замість неї — три клітини особистої стати
   прямо в шапці; у коопі вони ховаються, бо там порівняння важливіше
   за власні числа.

   Викликається і зі зміни стану мережі, і з hud(): панель має з'явитись
   у мить з'єднання, а не на наступному кадрі анімації. */
function syncPanels() {
  const solo = net.solo;
  el.playersTop.hidden = solo;
  el.readout.classList.toggle('coop', !solo);
  if (!solo && sim) renderRoster();
}

/* Лічильник кадрів, а не тіків: у лобі симуляція стоїть, а діагностика
   потрібна саме там — інакше вона б завмерла до першої хвилі. */
let diagIn = 0;
function hud() {
  const solo = net.solo;
  syncPanels();
  if (solo) {
    const p = sim.players[0];
    setText(el.kills,  p.kills);
    setText(el.towers, sim.towers.length);
    setText(el.dmg,    p.dmg);
  }
  setText(el.wave,  sim.wave);
  setText(el.lives, sim.lives);
  el.lives.className   = 'v' + (sim.lives <= 5 ? ' warn' : '');
  setText(el.gold, sim.players[meId()].gold);
  if (duelBoards && simMate) {
    setText(el.mbWave,  simMate.over ? (simMate.wave - 1) + ' (кінець)' : simMate.wave);
    setText(el.mbLives, simMate.lives);
    setText(el.mbGold,  simMate.players[0].gold);
  }
  const nx = sim.nextInfo();
  /* Відлік стоїть тут, а не на кнопці: на кнопці він мінявся щосекунди,
     разом із ним мінялась ширина, і сусідні кнопки стрибали — керувати
     ходом партії ставало незручно. Кнопка тепер називає дію, а час до
     хвилі живе там, де й решта показників. */
  setText(el.next, KIND_NAME[nx.kind] + ' ×' + nx.n + (nx.boss ? ' + супровід' : '') +
    (sim.phase !== 0 ? '' : sim.holdPrep ? ' · чекаємо напарника' : ' · ' + Math.ceil(sim.prep / TPS) + ' с'));
  el.next.className    = 'v' + (nx.kind === 3 ? ' warn' : nx.kind === 2 ? ' calm' : '');
  // У дуелі голоси рахує duelWaveVotes (два реальні гравці), а не
  // sim.waveVotes — та дошка сама по собі сольна (nPlayers=1) і бачить
  // 'wave' лише вже узгодженим, тож ніколи не показала б «чекаю».
  const votes = duelBoards ? duelWaveVotes : sim.waveVotes;
  const voteOf = duelBoards ? netP() : meId();
  const voteTotal = duelBoards ? 2 : sim.nPlayers;
  setText(el.wave_, stalled ? 'Чекаю напарника…'
    : sim.phase !== 0 ? 'Хвиля ' + sim.wave + ' іде'
    : votes.size > 0
      ? (votes.has(voteOf) ? 'Чекаю голосів' : 'Прискорити') + ' (' + votes.size + '/' + voteTotal + ')'
      : 'Викликати хвилю');
  el.wave_.disabled = sim.phase !== 0 || stalled || votes.has(voteOf);
  /* Діагностика збирає рядки й пише їх у панель. Щокадру це не потрібно
     нікому — вона й так оновлюється з подій мережі, а тут лише страхує
     випадок «ще не з'єдналися». Двічі на секунду цілком досить. */
  if (!net.solo && net.onDiag && --diagIn <= 0) { diagIn = 30; net.onDiag(); }
  if (net.live) {
    setHTML(el.netState, '<span class="dot"></span>Гравець ' + (net.me + 1) +
      (net.rtt ? ' · ' + net.rtt + ' мс' : ''));
  }
  refreshRail();
}

/* ── малювання ───────────────────────────────────────────────────────── */
let TS = 32, TSm = 12;
function resize() {
  const w = cv.parentElement.clientWidth;
  TS = Math.max(14, (w / GW) | 0);
  const dpr = Math.min(devicePixelRatio || 1, 2);
  cv.style.width = '100%';
  cv.width  = Math.round(GW * TS * dpr);
  cv.height = Math.round(GH * TS * dpr);
  cv.style.aspectRatio = GW + ' / ' + GH;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  if (!el.mateBoard.hidden) {
    const wm = cvMate.parentElement.clientWidth;
    TSm = Math.max(6, (wm / GW) | 0);
    cvMate.style.width = '100%';
    cvMate.width  = Math.round(GW * TSm * dpr);
    cvMate.height = Math.round(GH * TSm * dpr);
    cvMate.style.aspectRatio = GW + ' / ' + GH;
    ctxMate.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
}
addEventListener('resize', resize);

/* Спрощена мінідошка напарника: без ефектів, без ховера, без наведення
   прицілу — лише терен, траса, башти й крипи. Дає відчуття гонки, не
   дублює всю графіку основної дошки. */
function renderMate() {
  if (!simMate) return;
  const ts = TSm, W = GW * ts, H = GH * ts;
  ctxMate.fillStyle = C('--ink-2'); ctxMate.fillRect(0, 0, W, H);

  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
    const t = simMate.terrain[idx(x, y)];
    if (t === 2 && simMate.mode === MODE_FIXED) {
      ctxMate.fillStyle = 'rgba(87,160,190,.13)'; ctxMate.fillRect(x * ts, y * ts, ts, ts);
    } else if (t === 1) {
      ctxMate.fillStyle = '#0A0F13'; ctxMate.fillRect(x * ts, y * ts, ts, ts);
    }
  }

  if (simMate.mode === MODE_FIXED) {
    const pts = simMate.route.map(i => [i % GW, (i / GW) | 0]);
    ctxMate.strokeStyle = 'rgba(87,160,190,.3)'; ctxMate.lineWidth = Math.max(1.5, ts * .14);
    ctxMate.lineJoin = ctxMate.lineCap = 'round';
    ctxMate.beginPath();
    pts.forEach(([px, py], i) => { const cx = px * ts + ts / 2, cy = py * ts + ts / 2; i ? ctxMate.lineTo(cx, cy) : ctxMate.moveTo(cx, cy); });
    ctxMate.stroke();
  }

  ctxMate.globalAlpha = .5;
  ctxMate.fillStyle = C('--coral'); ctxMate.fillRect(simMate.sx * ts, simMate.sy * ts, ts, ts);
  ctxMate.fillStyle = C('--moss');  ctxMate.fillRect(simMate.gx * ts, simMate.gy * ts, ts, ts);
  ctxMate.globalAlpha = 1;

  for (const t of simMate.towers) {
    ctxMate.fillStyle = C(TOOL_BY_KEY[t.k].swatch);
    ctxMate.fillRect(t.x * ts + ts * .15, t.y * ts + ts * .15, ts * .7, ts * .7);
  }
  for (const c of simMate.creeps) {
    const x = c.x / SUB * ts, y = c.y / SUB * ts;
    ctxMate.fillStyle = c.kind === 3 ? C('--coral') : c.kind === 2 ? C('--brass') : C('--violet');
    ctxMate.beginPath(); ctxMate.arc(x, y, Math.max(1.4, ts * .16), 0, 6.2832); ctxMate.fill();
  }
}

function render(alpha) {
  const W = GW * TS, H = GH * TS;
  ctx.fillStyle = C('--ink-2'); ctx.fillRect(0, 0, W, H);

  // сітка
  ctx.strokeStyle = C('--line-soft'); ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 1; x < GW; x++) { ctx.moveTo(x * TS + .5, 0); ctx.lineTo(x * TS + .5, H); }
  for (let y = 1; y < GH; y++) { ctx.moveTo(0, y * TS + .5); ctx.lineTo(W, y * TS + .5); }
  ctx.stroke();

  // рельєф: дорога (лише у фіксованому режимі) і скелі
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
    const t = sim.terrain[idx(x, y)];
    if (t === 2 && sim.mode === MODE_FIXED) {
      ctx.fillStyle = 'rgba(87,160,190,.13)';
      ctx.fillRect(x * TS, y * TS, TS, TS);
    } else if (t === 1) {
      ctx.fillStyle = '#0A0F13';
      ctx.fillRect(x * TS, y * TS, TS, TS);
      ctx.strokeStyle = 'rgba(126,146,157,.22)'; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x * TS + TS * .22, y * TS + TS * .74);
      ctx.lineTo(x * TS + TS * .5,  y * TS + TS * .28);
      ctx.lineTo(x * TS + TS * .78, y * TS + TS * .74);
      ctx.closePath(); ctx.stroke();
    }
  }

  // маршрут
  if (el.showPath.checked) drawPath();

  // мітки
  badge(sim.sx, sim.sy, C('--coral'), 'ВХІД');
  badge(sim.gx, sim.gy, C('--moss'), 'ВИХІД');

  // башти
  for (const t of sim.towers) drawTower(t);

  // підсвітка під курсором
  if (hoverX >= 0) drawHover();

  // крипи
  for (const c of sim.creeps) drawCreep(c, alpha);

  // набої
  ctx.lineCap = 'round';
  for (const s of sim.shots) {
    const x = lerp(s.px, s.x, alpha) / SUB * TS, y = lerp(s.py, s.y, alpha) / SUB * TS;
    ctx.fillStyle = C(TOOL_BY_KEY[s.k].swatch);
    ctx.beginPath(); ctx.arc(x, y, Math.max(1.6, TS * .075), 0, 6.2832); ctx.fill();
  }

  // позначка паузи
  if (sim.frozen) {
    ctx.fillStyle = 'rgba(11,17,22,.55)'; ctx.fillRect(0, 0, W, 30);
    ctx.fillStyle = C('--brass');
    ctx.font = '600 ' + Math.round(TS * .5) + 'px ' + C('--display');
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('ПАУЗА · БУДУВАТИ МОЖНА', W / 2, 15);
  }

  // спалахи
  for (const f of fx) {
    const a = f.life / f.max, x = f.x / SUB * TS, y = f.y / SUB * TS;
    ctx.globalAlpha = a;
    if (f.t === 'ring') {
      const rr = f.r ? (f.r / SUB * TS) * (1 - a * .35) : TS * (1.5 - a);
      // залита пляма показує саму ЗОНУ, контур — її межу; лише контуру
      // було замало, щоб побачити, кого вибух насправді зачепив
      ctx.save();
      ctx.globalAlpha = a * .22;
      ctx.fillStyle = f.c;
      ctx.beginPath(); ctx.arc(x, y, rr, 0, 6.2832); ctx.fill();
      ctx.restore();
      ctx.strokeStyle = f.c; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, rr, 0, 6.2832); ctx.stroke();
    } else {
      ctx.fillStyle = f.c;
      ctx.beginPath(); ctx.arc(x, y, TS * .16 * a + 1, 0, 6.2832); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}
const lerp = (a, b, t) => a + (b - a) * t;

function drawPath() {
  let pts;
  if (sim.mode === MODE_FIXED) {
    // авторський маршрут як є — разом із самоперетинами
    pts = sim.route.map(i => [i % GW, (i / GW) | 0]);
  } else {
    let x = sim.sx, y = sim.sy, guard = 0;
    pts = [[x, y]];
    while (!(x === sim.gx && y === sim.gy) && guard++ < GW * GH) {
      const n = sim.stepTile(x, y, sim.flow);
      if (n < 0) break;
      x = n % GW; y = (n / GW) | 0;
      pts.push([x, y]);
    }
  }
  if (pts.length < 2) return;
  ctx.strokeStyle = 'rgba(87,160,190,.34)';
  ctx.lineWidth = Math.max(2, TS * .17);
  ctx.lineJoin = ctx.lineCap = 'round';
  ctx.beginPath();
  pts.forEach(([px, py], i) => {
    const cx = px * TS + TS / 2, cy = py * TS + TS / 2;
    i ? ctx.lineTo(cx, cy) : ctx.moveTo(cx, cy);
  });
  ctx.stroke();
}

function badge(tx, ty, color, label) {
  const x = tx * TS, y = ty * TS;
  ctx.fillStyle = color; ctx.globalAlpha = .18; ctx.fillRect(x, y, TS, TS); ctx.globalAlpha = 1;
  ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.strokeRect(x + .75, y + .75, TS - 1.5, TS - 1.5);
  if (TS >= 26) {
    ctx.fillStyle = color;
    ctx.font = '600 ' + Math.round(TS * .26) + 'px ' + C('--display');
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, x + TS / 2, y + TS / 2);
  }
}

function drawTower(t) {
  const tool = TOOL_BY_KEY[t.k], col = C(tool.swatch);
  const x = t.x * TS, y = t.y * TS, p = TS * .1;
  ctx.fillStyle = C('--panel-hi');
  ctx.fillRect(x + p, y + p, TS - p * 2, TS - p * 2);
  ctx.strokeStyle = col; ctx.lineWidth = 1.5;
  ctx.strokeRect(x + p + .75, y + p + .75, TS - p * 2 - 1.5, TS - p * 2 - 1.5);

  /* Вежа, що будується, не стріляє — і це має бути видно, інакше гравець
     вирішить, що вона зламана. Малюємо приглушено й показуємо, скільки
     лишилось: смужка знизу спадає до нуля. */
  if (t.build > 0) {
    const full = buildTicks(TOOL_BY_KEY[t.k].cost);
    const left = Math.max(0, Math.min(1, t.build / Math.max(1, full)));
    ctx.save();
    ctx.fillStyle = C('--ink'); ctx.globalAlpha = .55;
    ctx.fillRect(x + p, y + p, TS - p * 2, TS - p * 2);
    ctx.globalAlpha = 1;
    ctx.fillStyle = col;
    ctx.fillRect(x + p, y + TS - p - 2, (TS - p * 2) * (1 - left), 2);
    ctx.restore();
    return;                                     // ствол і позначки — уже готовій
  }
  if (t.freshSpent > 0) {                       // ще можна знести без втрат
    ctx.save();
    ctx.setLineDash([3, 3]); ctx.strokeStyle = C('--moss'); ctx.lineWidth = 1.5;
    ctx.strokeRect(x + 2.25, y + 2.25, TS - 4.5, TS - 4.5);
    ctx.restore();
  }
  if (sim.players.length > 1) {                 // чия це башта
    ctx.fillStyle = C(paletteCss(identFor(t.owner).color));
    ctx.beginPath();
    ctx.moveTo(x + p, y + p); ctx.lineTo(x + p + TS * .2, y + p); ctx.lineTo(x + p, y + p + TS * .2);
    ctx.closePath(); ctx.fill();
  }
  if (tool.cd === 0) {                          // бар'єр — штрихування
    ctx.globalAlpha = .5; ctx.beginPath();
    ctx.moveTo(x + p, y + TS - p); ctx.lineTo(x + TS - p, y + p); ctx.stroke();
    ctx.globalAlpha = 1;
    return;
  }
  if (t.lvl > 1) {                              // рівень — крапки під баштою
    ctx.fillStyle = col;
    for (let i = 0; i < t.lvl; i++)
      ctx.fillRect(x + TS * .5 + (i - t.lvl / 2) * TS * .17, y + TS - p - TS * .1, TS * .11, TS * .07);
  }
  ctx.fillStyle = col;
  const cx = x + TS / 2, cy = y + TS / 2;
  ctx.beginPath(); ctx.arc(cx, cy, TS * .17, 0, 6.2832); ctx.fill();
  const a = Math.atan2(t.ay || 0, t.ax || 1);   // ствол
  ctx.strokeStyle = col; ctx.lineWidth = Math.max(1.6, TS * .09);
  ctx.beginPath(); ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(a) * TS * .34, cy + Math.sin(a) * TS * .34); ctx.stroke();
}

function chip(x, y, txt, tone) {
  if (TS < 16) return;
  ctx.font = '600 ' + Math.round(TS * .32) + 'px ' + C('--mono');
  ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  const w = ctx.measureText(txt).width + 8, ty = y - 3;
  ctx.fillStyle = 'rgba(11,17,22,.92)';
  ctx.fillRect(x + TS / 2 - w / 2, ty - TS * .38, w, TS * .4);
  ctx.fillStyle = C(tone);
  ctx.fillText(txt, x + TS / 2, ty);
}
function ring(x, y, r) {
  ctx.strokeStyle = 'rgba(200,214,222,.22)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(x + TS / 2, y + TS / 2, r / SUB * TS, 0, 6.2832); ctx.stroke();
}

function drawHover() {
  const x = hoverX * TS, y = hoverY * TS;
  if (typeof tool === 'string') {
    const t = sim.towerAt(hoverX, hoverY);
    const tint = tool === 'raze' ? '--coral' : tool === 'up' ? '--moss' : '--steel';
    ctx.strokeStyle = t ? C(tint) : C('--text-faint');
    ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, TS - 2, TS - 2);
    if (t) {
      if (tool === 'up' && t.st.cd) {
        const c = sim.upgradeCost(t);
        chip(x, y, c < 0 ? 'максимум' : '−' + c + ' → рів.' + (t.lvl + 1), c < 0 ? '--text-faint' : '--moss');
        if (el.showRange.checked && rangeShown()) ring(x, y, ((TOOL_BY_KEY[t.k].range * UPG[Math.min(MAX_LVL, t.lvl + 1)].range) / 100) | 0);
      } else if (tool === 'aim' && t.st.cd) {
        chip(x, y, 'ціль: ' + AIMS[t.aim], '--steel');
        if (el.showRange.checked && rangeShown()) ring(x, y, t.st.range);
      } else if (tool === 'raze') {
        const full = t.freshSpent >= t.spent;
        chip(x, y, '+' + sim.refund(t) + (full ? ' (усе)' : ''), full ? '--moss' : '--brass');
      }
    }
    return;
  }
  const ok = sim.buildable(hoverX, hoverY) && sim.players[meId()].gold >= tool.cost;
  ctx.fillStyle = ok ? 'rgba(233,169,60,.16)' : 'rgba(224,87,74,.16)';
  ctx.fillRect(x, y, TS, TS);
  ctx.strokeStyle = ok ? C('--brass') : C('--coral');
  ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, TS - 2, TS - 2);
  if (el.showRange.checked && rangeShown() && tool.range > 0) {
    ctx.strokeStyle = 'rgba(200,214,222,.22)'; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x + TS / 2, y + TS / 2, tool.range / SUB * TS, 0, 6.2832); ctx.stroke();
  }
}

const KIND_COLOR = ['--coral', '--brass', '--violet', '--coral'];
function drawCreep(c, alpha) {
  const x = lerp(c.px, c.x, alpha) / SUB * TS;
  const y = lerp(c.py, c.y, alpha) / SUB * TS;
  const big = c.kind === 3;
  const r = TS * (big ? .34 : .2);
  ctx.fillStyle = c.hurt > 0 ? '#FFFFFF' : (c.slowT > 0 ? C('--steel') : C(KIND_COLOR[c.kind]));
  ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill();
  if (c.kind === 2) { ctx.strokeStyle = C('--text'); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(x, y, r + 1.5, 0, 6.2832); ctx.stroke(); }
  // смужка здоров'я
  const w = TS * (big ? .8 : .56), h = Math.max(2, TS * .07);
  const f = Math.max(0, Math.min(1, c.hp / c.maxHp));
  ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(x - w / 2, y - r - h - 3, w, h);
  ctx.fillStyle = f > .5 ? C('--moss') : f > .22 ? C('--brass') : C('--coral');
  ctx.fillRect(x - w / 2, y - r - h - 3, w * f, h);
}

/* ── журнал партій: налаштування вебхука й вивантаження ──────────────── */
el.webhookUrl.value = localStorage.getItem('cp_webhook') || '';
el.webhookUrl.oninput = () => localStorage.setItem('cp_webhook', el.webhookUrl.value.trim());
el.webhookTest.onclick = async () => {
  const url = el.webhookUrl.value.trim();
  if (!url) { el.webhookHint.textContent = 'Встав URL спочатку.'; return; }
  el.webhookHint.textContent = 'Надсилаю…';
  try {
    const r = await sendWebhook(url, { content: '✅ Тестове повідомлення з Chokepoint — вебхук працює.' });
    if (r.ok) { localStorage.setItem('cp_webhook', url); el.webhookHint.textContent = 'Дійшло! Збережено.'; }
    else el.webhookHint.textContent = 'Discord відповів помилкою ' + r.status + '.';
  } catch (e) { el.webhookHint.textContent = 'Не вийшло: ' + (e && e.message ? e.message : e); }
};
el.downloadLog.onclick = () => {
  if (!gameLog.length) { say('Ще немає завершених партій у цій сесії', 'bad'); return; }
  const blob = new Blob([JSON.stringify(gameLog, null, 2)], { type:'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'chokepoint-log-' + Date.now() + '.json';
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(a.href);
};

/* ── старт ───────────────────────────────────────────────────────────── */
resize();
boot();
coopBlocked();     // одразу показати стан кооперативу, не чекаючи кліку
el.coopDiag.textContent = 'вікно №' + net.myId + ' · версія ' + BUILD + ' — у обох має бути однакова';
autoJoinFromLink();   // ?room=... у посиланні — після boot(), щоб не змішати solo зі стартом коопу
window.CHOKEPOINT = {
  get sim() { return sim; }, get ls() { return ls; }, get net() { return net; },
  get simMate() { return simMate; }, get duelBoards() { return duelBoards; },
  get inLobby() { return inLobby; },
  Sim, Lockstep, Net, PeerNet, BUILD,
};
