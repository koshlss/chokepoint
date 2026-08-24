/* Міграція з одного файлу на модулі має бути ПОБІТОВО непомітною для
   симуляції: той самий сід і той самий потік команд зобов'язані дати той
   самий хеш. Еталон тут — ядро, вирізане з монолiта index.html.mono
   (гілка master), тож тест ловить будь-яку зміну поведінки, внесену
   розколом, а не лише падіння.

   Коли монолiт піде з репозиторію, цей файл піде разом із ним — його
   робота одноразова: довести, що переїзд нічого не зсунув. */
import { describe, it, expect } from 'vitest';
import { Sim } from '../src/sim/sim';
import { MAPS } from '../src/content/maps';
import { MODE_MAZE, MODE_FIXED } from '../src/sim/constants';
import { TOOLS } from '../src/content/towers';

// @ts-expect-error — еталон без типів, це навмисно сирий зріз старого коду
import { Sim as LegacySim } from './legacy-core.mjs';

/* Детермінований потік команд: жодного Math.random, лише сід і арифметика.
   Будує башти в розкиданих клітинах, качає їх і міняє приціл — тобто зачіпає
   всі гілки apply(), а не тільки холостий хід. */
function script(seed: number) {
  let s = seed >>> 0;
  const rnd = (n: number) => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s % n; };
  const cmds: { tick: number; cmd: any }[] = [];
  for (let i = 0; i < 60; i++) {
    const tick = 3 + i * 7;
    const x = rnd(26), y = rnd(18);
    const roll = rnd(10);
    if (roll < 6)      cmds.push({ tick, cmd: { t:'build', x, y, k: TOOLS[rnd(TOOLS.length)].key, p:0 } });
    else if (roll < 8) cmds.push({ tick, cmd: { t:'up',   x, y, p:0 } });
    else if (roll < 9) cmds.push({ tick, cmd: { t:'aim',  x, y, p:0 } });
    else               cmds.push({ tick, cmd: { t:'raze', x, y, p:0 } });
  }
  return cmds;
}

function runHashes(SimClass: any, seedStr: string, diff: number, mapIdx: number, mode: number, ticks: number) {
  const sim = new SimClass(seedStr, diff, 1, mapIdx, mode);
  const cmds = script(mapIdx * 31 + mode * 7 + diff);
  const byTick = new Map<number, any[]>();
  for (const c of cmds) {
    if (!byTick.has(c.tick)) byTick.set(c.tick, []);
    byTick.get(c.tick)!.push(c.cmd);
  }
  const marks: string[] = [];
  for (let t = 0; t < ticks; t++) {
    sim.step(byTick.get(t) || []);
    if (t % 120 === 0) marks.push(sim.hash());
  }
  marks.push(sim.hash());
  return marks;
}

describe('розкол моноліта не змінив симуляцію', () => {
  const diffs = [70, 100, 145];
  const modes = [MODE_MAZE, MODE_FIXED];

  for (let mapIdx = 0; mapIdx < MAPS.length; mapIdx++) {
    for (const mode of modes) {
      for (const diff of diffs) {
        const label = `${MAPS[mapIdx].name} · ${mode === MODE_FIXED ? 'фіксований' : 'лабіринт'} · складність ${diff}`;
        it(label, () => {
          const now    = runHashes(Sim,       'MAZE-01', diff, mapIdx, mode, 1800);
          const before = runHashes(LegacySim, 'MAZE-01', diff, mapIdx, mode, 1800);
          expect(now).toEqual(before);
        });
      }
    }
  }

  it('різні сіди дають різні партії (тест не самозбувається)', () => {
    const a = runHashes(Sim, 'MAZE-01', 100, 0, MODE_FIXED, 600);
    const b = runHashes(Sim, 'MAZE-02', 100, 0, MODE_FIXED, 600);
    expect(a).not.toEqual(b);
  });
});
