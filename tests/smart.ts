/* ────────────────────────────────────────────────────────────────────
   Гравець, який грає ДОБРЕ — на противагу навмисно посередньому в bot.ts.

   Різниця не в акуратності, а в тому, що він рахує. Посередній бот
   купує за фіксованою пропорцією й качає кожну третю дію навмання.
   Цей щоразу порівнює ВСІ доступні вкладення за спільною міркою:

     цінність = скільки шкоди за секунду вежа реально видасть на своєму
                місці  =  шк/с × скільки кроків траси накриває

   і бере те, у чого найкраще відношення цінності до ціни.

   Ключове, чого посередній бот не бачить: прокачка до 2-го рівня коштує
   90% ціни й дає +110% шкоди — це на 22% вигідніше за нову вежу ЗА
   ЗОЛОТО і ще й не займає клітину. До 3-го рівня вигідніше ще на третину.
   Тому добрий гравець качає найкращі місця, а не розповзається.

   Потрібен він для одного питання, на яке посередній бот відповісти не
   може: чи тримається баланс, коли грають добре.
   ──────────────────────────────────────────────────────────────────── */
import { Sim } from '../src/sim/sim';
import { GW, GH, SUB, idx, MODE_FIXED } from '../src/sim/constants';
import { TOOL_BY_KEY, UPG, MAX_LVL } from '../src/content/towers';
import type { Tool } from '../src/content/types';
import type { RunResult } from './bot';

/** Клітини траси, по яких насправді йдуть крипи. */
function pathTiles(sim: any): number[] {
  if (sim.mode === MODE_FIXED) {
    const seen = new Set<number>(), out: number[] = [];
    for (const i of sim.route) if (!seen.has(i)) { seen.add(i); out.push(i); }
    return out;
  }
  const out: number[] = [];
  let x = sim.sx, y = sim.sy, guard = 0;
  out.push(idx(x, y));
  while (!(x === sim.gx && y === sim.gy) && guard++ < GW * GH) {
    const n = sim.stepTile(x, y, sim.flow);
    if (n < 0) break;
    x = n % GW; y = (n / GW) | 0;
    out.push(idx(x, y));
  }
  return out;
}

/** Скільки КРОКІВ траси накриває радіус із цієї клітини. Кроки, а не
 *  клітини: перехрестя крип проходить двічі, тож воно й варте вдвічі. */
function cover(sim: any, x: number, y: number, range: number): number {
  const r2 = range * range;
  const cx = x * SUB + (SUB >> 1), cy = y * SUB + (SUB >> 1);
  let s = 0;
  const steps = sim.mode === MODE_FIXED ? sim.route : pathTiles(sim);
  for (let k = 0; k < steps.length; k++) {
    const p = steps[k];
    const dx = (p % GW) * SUB + (SUB >> 1) - cx;
    const dy = ((p / GW) | 0) * SUB + (SUB >> 1) - cy;
    if (dx * dx + dy * dy <= r2) s++;
  }
  return s;
}

/** Шкода за секунду з урахуванням того, що башта ще й дає. Груба, але
 *  однакова для всіх — саме це й потрібно для ПОРІВНЯННЯ вкладень. */
function worth(t: Tool, dmg: number): number {
  const direct = t.cd ? dmg * 30 / t.cd : 0;
  const burn   = t.dot ? t.dot * 2 : 0;          // тліє раз на 15 тіків
  /* Площу беремо з самої моделі, а не сталою 1.6. Стала недооцінювала
     великі вибухи й переоцінювала дрібні, і через це Гармата не будувалась
     ЖОДНОГО разу, хоч Вогнище з майже тими самими числами ставало опорною
     вежею Вогню. Стенд міряв не баланс, а власне припущення. */
  const area   = 1 + (t.splash ? Math.max(0, t.splash - 0.55 * SUB) / SUB : 0);
  const hold   = t.slow ? 1 + (t.slow / 200) : 1; // сповільнення = більше часу під вогнем
  return (direct * area + burn) * hold;
}

export interface SmartOpts {
  maxWave?: number;
  diff?: number;
  /** Дозволені башти; без нього — увесь реєстр. */
  tools?: string[];
}

export function runSmart(mapIdx: number, mode: number, seed: string, opts: SmartOpts = {}): RunResult {
  const { maxWave = 22, diff = 100, tools } = opts;
  const arsenals = tools ? [tools] : undefined;
  const sim: any = new Sim(seed, diff, 1, mapIdx, mode, arsenals as any);

  const scratch = new Int32Array(GW * GH);
  const leaksByWave: Record<number, number> = {};
  let lastLives = sim.lives;
  let spentTotal = 0;

  const allowed = () => (tools || Object.keys(TOOL_BY_KEY))
    .map(k => TOOL_BY_KEY[k])
    .filter(t => t.shot && sim.allows(0, t.key));

  /* Найкращий крок: або нова вежа на вільній клітині, або прокачка вже
     поставленої. Обидва міряються тією самою міркою — цінність на золото. */
  function bestMove() {
    const gold = sim.players[0].gold;
    let best: { kind: 'build' | 'up'; score: number; x: number; y: number; k?: string; cost: number } | null = null;

    // прокачки
    for (const tw of sim.towers) {
      if (tw.lvl >= MAX_LVL) continue;
      const c = sim.upgradeCost(tw);
      if (c < 0 || c > gold) continue;
      const base = TOOL_BY_KEY[tw.k];
      const now  = worth(base, tw.st.dmg) * cover(sim, tw.x, tw.y, tw.st.range);
      const next = UPG[tw.lvl + 1]!;
      const nd   = ((base.dmg * next.dmg) / 100) | 0;
      const nr   = ((base.range * next.range) / 100) | 0;
      const after = worth(base, nd) * cover(sim, tw.x, tw.y, nr);
      const score = (after - now) / c;
      if (!best || score > best.score) best = { kind: 'up', score, x: tw.x, y: tw.y, cost: c };
    }

    // нові вежі — дивимось лише клітини біля траси, решта марна
    const near = new Set<number>();
    for (const p of pathTiles(sim)) {
      const px = p % GW, py = (p / GW) | 0;
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
        const x = px + dx, y = py + dy;
        if (x >= 0 && y >= 0 && x < GW && y < GH) near.add(idx(x, y));
      }
    }
    /* Цінність вежі-позначки — не її власна шкода, а множник до шкоди
       ВСІЄЇ армії там, де вона дістає. Без цього гравець ніколи не купив
       би допоміжних: поодинці вони програють за шкодою на золото, а
       заради чого вони існують — не видно.

       Але позначки НЕ СКЛАДАЮТЬСЯ: діє найсильніша. Тож друга крижана
       вежа на вже позначеній ділянці не варта нічого. Рахуємо лише НОВЕ
       покриття — інакше гравець скуповує їх сотнями й стенд бреше. */
    const route: number[] = mode === MODE_FIXED ? sim.route : pathTiles(sim);
    const steps = route.length;
    /* Міряємо все в «шкода × накриті кроки» — це пропорційно тому, скільки
       вежа встигне завдати крипу за прохід. Позначку теж треба в цих самих
       одиницях, інакше порівнюємо різні речі: вона додає mark% до тієї
       частини армійської шкоди, що припадає на позначені кроки. */
    let armyValue = 0;
    /* Не «позначено чи ні», а НАСКІЛЬКИ позначено. Доти рахувалось лише
       нове покриття, і сильніша позначка на вже покритій ділянці не
       коштувала нічого — тому жодна допоміжна вежа вище першого рівня не
       будувалась ніколи. У грі ж діє НАЙСИЛЬНІША позначка, тож замінити
       слабку на сильну на тій самій ділянці — реальний приріст. */
    const markAt = new Float64Array(route.length);
    for (const tw of sim.towers) {
      const b = TOOL_BY_KEY[tw.k];
      armyValue += worth(b, tw.st.dmg) * cover(sim, tw.x, tw.y, tw.st.range);
      if (!tw.st.mark) continue;
      const r2 = tw.st.range * tw.st.range;
      const cx = tw.x * SUB + (SUB >> 1), cy = tw.y * SUB + (SUB >> 1);
      for (let k = 0; k < route.length; k++) {
        const p = route[k];
        const dx = (p % GW) * SUB + (SUB >> 1) - cx;
        const dy = ((p / GW) | 0) * SUB + (SUB >> 1) - cy;
        if (dx * dx + dy * dy <= r2 && tw.st.mark > markAt[k]) markAt[k] = tw.st.mark;
      }
    }
    /** Скільки позначки ця клітина ДОДАЛА б понад те, що вже є. */
    const markGain = (x: number, y: number, range: number, mark: number) => {
      const r2 = range * range;
      const cx = x * SUB + (SUB >> 1), cy = y * SUB + (SUB >> 1);
      let g = 0;
      for (let k = 0; k < route.length; k++) {
        const p = route[k];
        const dx = (p % GW) * SUB + (SUB >> 1) - cx;
        const dy = ((p / GW) | 0) * SUB + (SUB >> 1) - cy;
        if (dx * dx + dy * dy <= r2) g += Math.max(0, mark - markAt[k]);
      }
      return g;
    };

    for (const t of allowed()) {
      if (t.cost > gold) continue;
      for (const i of near) {
        const x = i % GW, y = (i / GW) | 0;
        if (!sim.buildable(x, y) || !sim.inZone(0, x, y)) continue;   // чужий кут закритий
        let c = cover(sim, x, y, t.range);
        if (c <= 0) continue;
        if (mode !== MODE_FIXED) {
          // у лабіринті вежа ще й подовжує шлях — це теж цінність
          sim.blocked[i] = 1;
          const f = sim.recomputeFlow(scratch);
          const len = f[idx(sim.sx, sim.sy)];
          sim.blocked[i] = 0;
          if (len < 0) continue;                  // повністю перекрив
          c += Math.max(0, len - sim.pathLength()) * 3;
        }
        let value = worth(t, t.dmg) * c;
        if (t.mark) value += (markGain(x, y, t.range, t.mark) / 100) * armyValue / Math.max(1, steps);
        const score = value / t.cost;
        if (!best || score > best.score) best = { kind: 'build', score, x, y, k: t.key, cost: t.cost };
      }
    }
    return best;
  }

  for (let t = 0; t < 200000 && !sim.over && sim.wave <= maxWave; t++) {
    /* Будуємо лише в паузі — як живий гравець, що готується до хвилі.
       Не щотіка: перерахунок покриття дорогий, а рішення так часто й
       не потрібне. */
    if (sim.phase === 0 && (t % 10 === 0)) {
      for (let acts = 0; acts < 4; acts++) {
        const m = bestMove();
        if (!m) break;
        const before = sim.towers.length;
        if (m.kind === 'up') {
          // гілку беремо детерміновано за клітиною — див. коментар у bot.ts
          const tw = sim.towerAt(m.x, m.y);
          const opts = tw ? sim.upChoices(tw) : [];
          const pick = opts.length ? opts[(m.x + m.y) % opts.length].key : '';
          sim.apply({ t: 'up', p: 0, seq: 0, x: m.x, y: m.y, k: pick });
        }
        else {
          sim.apply({ t: 'build', p: 0, seq: 0, x: m.x, y: m.y, k: m.k });
          if (sim.towers.length === before) break;   // не вийшло — не циклимось
        }
        spentTotal += m.cost;
      }
    }
    sim.step(null);
    if (sim.lives < lastLives) {
      leaksByWave[sim.wave] = (leaksByWave[sim.wave] || 0) + (lastLives - sim.lives);
      lastLives = sim.lives;
    }
  }

  /* Склад дошки віддаємо разом із результатом: коли забіг тікає в стелю,
     цікаве не число, а ЩО саме там побудовано. */
  const composition: Record<string, number> = {};
  for (const tw of sim.towers) {
    const key = TOOL_BY_KEY[tw.k].name + ' lvl' + tw.lvl;
    composition[key] = (composition[key] || 0) + 1;
  }

  return {
    map: mapIdx, mode, seed,
    wave: sim.over ? sim.wave : Math.min(sim.wave, maxWave),
    died: sim.over,
    lives: sim.lives,
    towers: sim.towers.length,
    path: sim.pathLength(),
    gold: sim.players[0].gold,
    spent: spentTotal,
    leaks: leaksByWave,
    ticks: sim.tick,
    composition,
  } as RunResult & { composition: Record<string, number> };
}
