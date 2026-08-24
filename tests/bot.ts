/* ────────────────────────────────────────────────────────────────────
   Гравець-бот для прогону балансу.

   Раніше ядро вклеювалось у bench.html механічним вирізанням з
   index.html — тепер просто імпортується. Код гри той самий, стенду
   більше не треба збиратись окремим кроком.

   Бот навмисно посередній: жадібно ставить башти там, де під радіус
   потрапляє найбільше клітин шляху, і не хитрує. Якщо баланс тримається
   на віртуозній грі — бот це покаже провалом.
   ──────────────────────────────────────────────────────────────────── */
import { Sim } from '../src/sim/sim';
import { GW, GH, SUB, idx, MODE_FIXED } from '../src/sim/constants';
import { TOOL_BY_KEY, MAX_LVL } from '../src/content/towers';
import type { Tool } from '../src/content/types';

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

function cover(sim: any, x: number, y: number, tool: Tool, path: number[]): number {
  const r2 = tool.range * tool.range;
  const cx = x * SUB + (SUB >> 1), cy = y * SUB + (SUB >> 1);
  let s = 0;
  for (let k = 0; k < path.length; k++) {
    const p = path[k];
    const dx = (p % GW) * SUB + (SUB >> 1) - cx;
    const dy = ((p / GW) | 0) * SUB + (SUB >> 1) - cy;
    if (dx * dx + dy * dy <= r2) s++;
  }
  return s;
}

/* Фіксований режим: просто максимум покриття.
   Лабіринт: ще й подовження шляху — інакше бот не мазить і це не перевірка
   режиму, а перевірка невміння. */
function bestSpot(sim: any, tool: Tool, path: number[], scratch: Int32Array): number {
  let best = -1, bestScore = 0;

  if (sim.mode === MODE_FIXED) {
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
      if (!sim.buildable(x, y)) continue;
      const s = cover(sim, x, y, tool, path);
      if (s > bestScore) { bestScore = s; best = idx(x, y); }
    }
    return best;
  }

  const near = new Set<number>();
  for (const p of path) {
    const px = p % GW, py = (p / GW) | 0;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const x = px + dx, y = py + dy;
      if (x >= 0 && y >= 0 && x < GW && y < GH) near.add(idx(x, y));
    }
  }
  const base = sim.pathLength();
  for (const i of near) {
    const x = i % GW, y = (i / GW) | 0;
    if (!sim.buildable(x, y)) continue;
    sim.blocked[i] = 1;
    const f = sim.recomputeFlow(scratch);
    const len = f[idx(sim.sx, sim.sy)];
    sim.blocked[i] = 0;
    if (len < 0) continue;                       // повністю перекрив
    const s = (len - base) * 5 + cover(sim, x, y, tool, path);
    if (s > bestScore) { bestScore = s; best = i; }
  }
  return best;
}

/** Склад армії за замовчуванням: переважно дешеві стрільці, з домішкою решти.
 *  Підібраний вручну ще до наборів — лишається як базова лінія, щоб цифри
 *  по мапах були порівнянні зі старими прогонами. */
export const DEFAULT_MIX = ['arrow','arrow','arrow','mortar','arrow','frost','arrow','mortar','rail','venom'];

/* Для набору фіксований список не годиться: він або викидає башти, яких у
   наборі немає, або лишає набір узагалі без дешевої вежі — і тоді стенд
   міряє не набір, а власне невміння його зіграти. Тому склад виводимо з
   самого набору, зважуючи обернено до ціни: дешеві беруться частіше, як і
   зробив би живий гравець. Бар'єр не рахуємо — він не стріляє. */
export function mixFor(tools: string[]): string[] {
  // скільки разів кожна башта заходить у список покупок
  const buckets: string[][] = [];
  for (const k of tools) {
    const t = TOOL_BY_KEY[k];
    if (!t || !t.shot) continue;                       // бар'єр і все, що не стріляє
    const weight = Math.max(1, Math.round(300 / t.cost));
    buckets.push(new Array(weight).fill(k));
  }
  // круговий обхід: дешеві трапляються частіше, але не п'ять поспіль
  const mix: string[] = [];
  for (let i = 0; ; i++) {
    let any = false;
    for (const b of buckets) if (i < b.length) { mix.push(b[i]); any = true; }
    if (!any) break;
  }
  return mix;
}

export interface RunResult {
  map: number; mode: number; seed: string;
  wave: number; died: boolean; lives: number;
  towers: number; path: number; gold: number; spent: number;
  leaks: Record<number, number>;
  ticks: number;
}

export interface RunOpts {
  maxWave?: number;
  diff?: number;
  /** Які башти бот купує і в якій пропорції. Для перевірки наборів арсеналу. */
  mix?: string[];
}

export function runOne(mapIdx: number, mode: number, seed: string, opts: RunOpts = {}): RunResult {
  const { maxWave = 22, diff = 100, mix = DEFAULT_MIX } = opts;
  const sim: any = new Sim(seed, diff, 1, mapIdx, mode);
  const scratch = new Int32Array(GW * GH);
  const pickTool = (n: number) => TOOL_BY_KEY[mix[n % mix.length]];

  let placed = 0, spentTotal = 0;
  const leaksByWave: Record<number, number> = {};
  let lastLives = sim.lives;

  for (let t = 0; t < 90000 && !sim.over && sim.wave <= maxWave; t++) {
    // будуємо тільки в паузі, як живий гравець
    if (sim.phase === 0 && (t % 12 === 0)) {
      const path = pathTiles(sim);

      /* Кожна третя дія — прокачка найкраще розташованої вежі. Так стенд
         перевіряє обидва шляхи росту, вгору і вшир. */
      let didUp = false;
      if (placed > 0 && placed % 3 === 0) {
        let bt: any = null, bs = -1;
        for (const tw of sim.towers) {
          if (tw.lvl >= MAX_LVL || !tw.st.cd) continue;
          const c = sim.upgradeCost(tw);
          if (c < 0 || sim.players[0].gold < c) continue;
          const s = cover(sim, tw.x, tw.y, TOOL_BY_KEY[tw.k], path);
          if (s > bs) { bs = s; bt = tw; }
        }
        if (bt) {
          const c = sim.upgradeCost(bt);
          sim.apply({ t:'up', p:0, seq:0, x:bt.x, y:bt.y });
          spentTotal += c; placed++; didUp = true;
        }
      }

      if (!didUp) {
        const tool = pickTool(placed);
        if (tool && sim.players[0].gold >= tool.cost) {
          const spot = bestSpot(sim, tool, path, scratch);
          if (spot >= 0) {
            const before = sim.towers.length;
            sim.apply({ t:'build', p:0, seq:0, x:spot % GW, y:(spot / GW) | 0, k:tool.key });
            if (sim.towers.length > before) { spentTotal += tool.cost; placed++; }
          }
        }
      }
    }
    sim.step(null);
    if (sim.lives < lastLives) {
      leaksByWave[sim.wave] = (leaksByWave[sim.wave] || 0) + (lastLives - sim.lives);
      lastLives = sim.lives;
    }
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
  };
}
