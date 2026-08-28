import { GW, GH, SUB, idx, TPS } from './constants';
import { TOOL_BY_KEY, MAX_LVL } from '../content/towers';

/* ══════════════════════════════════════════════════════════════════════
   БОТ

   Заповнює вільне місце в партії. Найважливіше тут не те, як він грає, а
   те, що його команди — ЧИСТА ФУНКЦІЯ від стану симуляції й номера тіку.

   Через це його не треба ані синхронізувати, ані передавати мережею:
   у всіх клієнтів однаковий стан, отже кожен порахує ті самі команди в
   той самий тік. Бот коштує рівно нуль трафіку й не може розвести дошки —
   на відміну від будь-якого рішення, де хтось один рахує за всіх і шле
   результат.

   Звідси й обмеження, яких він мусить триматись: жодного Math.random,
   жодного часу, жодного стану поза симуляцією. Усе, що він пам'ятає, —
   уже й так лежить у sim.

   Грає він навмисно рівно, без блиску: ставить те, що по кишені, туди,
   де воно накриває найбільше траси, і кожну третю дію качає найкраще
   розташовану вежу. Мета — бути живим суперником і партнером, а не
   показувати стелю можливого.
   ══════════════════════════════════════════════════════════════════════ */

/** Раз на скільки тіків бот приймає рішення. */
const EVERY = 14;
/** Коли лишається менше цієї частки підготовки — бот згоден на хвилю. */
const READY_AT = 0.45;

type Cache = { cells: number[]; route: number[] };
const cache = new WeakMap<object, Cache>();

/* Клітини, з яких взагалі є сенс стріляти, і кроки траси — рахуються раз
   на партію: траса в фіксованому режимі не змінюється. */
function board(sim: any): Cache {
  let c = cache.get(sim);
  if (c) return c;
  const route: number[] = [];
  const seen = new Set<number>();
  for (const rt of (sim.routes || [sim.route]))
    for (const i of rt) { route.push(i); if (!seen.has(i)) seen.add(i); }
  const cells: number[] = [];
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
    if (sim.terrain[idx(x, y)] !== 0) continue;
    // лише те, що поруч із трасою: решта поля марна, а перебір дорогий
    let near = false;
    for (const i of seen) {
      const dx = (i % GW) - x, dy = ((i / GW) | 0) - y;
      if (dx * dx + dy * dy <= 25) { near = true; break; }
    }
    if (near) cells.push(idx(x, y));
  }
  c = { cells, route };
  cache.set(sim, c);
  return c;
}

/** Скільки КРОКІВ траси накриває радіус із цієї клітини. */
function cover(route: number[], x: number, y: number, range: number): number {
  const r2 = range * range;
  const cx = x * SUB + (SUB >> 1), cy = y * SUB + (SUB >> 1);
  let s = 0;
  for (let k = 0; k < route.length; k++) {
    const p = route[k];
    const dx = (p % GW) * SUB + (SUB >> 1) - cx;
    const dy = ((p / GW) | 0) * SUB + (SUB >> 1) - cy;
    if (dx * dx + dy * dy <= r2) s++;
  }
  return s;
}

/**
 * Команди бота-гравця p на поточний тік. Порожньо — цього тіку він нічого
 * не робить, і це нормально: рішення приймаються раз на EVERY тіків.
 */
export function botCommands(sim: any, p: number): any[] {
  if (!sim || sim.over || sim.frozen) return [];
  const pl = sim.players[p];
  if (!pl) return [];

  /* Боти ходять урозбіг, кожен у свій тік: інакше вони всі думають в
     один кадр, і в браузері це видно як ривок. */
  if (((sim.tick + p * 5) % EVERY) !== 0) return [];

  // під час хвилі бот не будує — як і живий гравець, він готується в паузі
  if (sim.phase !== 0) return [];

  const out: any[] = [];

  /* Згода на хвилю. Без неї прискорення в партії з ботами не працювало б
     узагалі: голос потрібен від усіх, а бот його ніколи не подавав. */
  const prepLeft = sim.prep / (TPS * 30);
  if (!sim.waveVotes.has(p) && prepLeft < READY_AT) out.push({ t: 'wave', p });

  const { cells, route } = board(sim);
  const mine = sim.towers.filter((t: any) => t.owner === p);

  /* Скільки дій бот уже зробив: кожна вежа — це одне будівництво плюс по
     одному на рівень понад перший. Рахувати треба саме ДІЇ, а не вежі.

     Спершу тут стояло `веж % 3`, і це виявилось пасткою: прокачка не
     змінює кількості веж, тож умова лишалась істинною й на наступному
     рішенні, і на наступному. Бот качав, поки не витрачав усе до копійки,
     і майже не будував — 17 прокачок на 11 веж, а потім 368 рішень
     поспіль із десятьма золотими в кишені. */
  const acts = mine.length + mine.reduce((a: number, t: any) => a + (t.lvl - 1), 0);

  /* Кожна третя дія — прокачка найкраще розташованої своєї вежі. Так бот
     росте не лише вшир, як і належить: клітини скінченні. */
  if (mine.length > 0 && acts % 3 === 2) {
    let best: any = null, bs = -1;
    for (const tw of mine) {
      if (tw.lvl >= MAX_LVL || !tw.st.cd) continue;
      const c = sim.upgradeCost(tw);
      if (c < 0 || c > pl.gold) continue;
      const s = cover(route, tw.x, tw.y, tw.st.range);
      if (s > bs) { bs = s; best = tw; }
    }
    if (best) {
      const opts = sim.upChoices(best);
      out.push({ t: 'up', p, x: best.x, y: best.y,
                 k: opts.length ? opts[(best.x + best.y) % opts.length].key : '' });
      return out;
    }
  }

  /* Що ставити: беремо найдорожче з доступного, що по кишені. Дешевше
     нікуди не дінеться, а віддача росте з ціною — тож чекати вигідно. */
  const affordable = (sim.arsenals ? [...sim.arsenals[p % sim.arsenals.length]] : Object.keys(TOOL_BY_KEY))
    .map((k: string) => TOOL_BY_KEY[k])
    .filter((t: any) => t && t.shot && t.cost <= pl.gold && sim.allows(p, t.key))
    .sort((a: any, b: any) => (b.cost - a.cost) || (a.key < b.key ? -1 : 1));
  if (!affordable.length) return out;

  /* Раз на кілька веж бот бере допоміжну, якщо вона є в його наборі:
     інакше він ставить самі гармати й не отримує з набору й половини. */
  const support = affordable.filter((t: any) => t.mark);
  const tool = (support.length && acts % 4 === 3) ? support[0] : affordable[0];

  let bestCell = -1, bestScore = 0;
  for (const i of cells) {
    const x = i % GW, y = (i / GW) | 0;
    if (!sim.buildable(x, y) || !sim.inZone(p, x, y)) continue;
    const s = cover(route, x, y, tool.range);
    if (s > bestScore) { bestScore = s; bestCell = i; }
  }
  if (bestCell >= 0)
    out.push({ t: 'build', p, x: bestCell % GW, y: (bestCell / GW) | 0, k: tool.key });
  return out;
}
