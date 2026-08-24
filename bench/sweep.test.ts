/* Повний прогін балансу: `npm run bench`.
   Нічого не стверджує — друкує таблицю, щоб дивитись очима. Сторожові
   пороги живуть у tests/balance.test.ts і ганяються з кожним `npm test`. */
import { it, afterAll } from 'vitest';
import { writeFileSync } from 'node:fs';
import { runOne, mixFor, type RunResult } from '../tests/bot';
import { MAPS } from '../src/content/maps';
import { MODE_MAZE, MODE_FIXED } from '../src/sim/constants';
import { LOADOUTS } from '../src/content/loadouts';

const RUNS = Number(process.env.BENCH_RUNS || 10);
const MAX  = Number(process.env.BENCH_MAX  || 22);

function stats(rs: RunResult[]) {
  const waves = rs.map(r => r.wave).sort((a, b) => a - b);
  const mid   = waves[waves.length >> 1];
  const avg   = waves.reduce((a, b) => a + b, 0) / waves.length;
  const died  = rs.filter(r => r.died).length;
  const lives = rs.reduce((a, r) => a + r.lives, 0) / rs.length;
  return { min: waves[0], med: mid, avg: +avg.toFixed(1), max: waves[waves.length - 1], died, lives: +lives.toFixed(1) };
}

function table(rows: [string, ReturnType<typeof stats>][]) {
  const head = ['', 'хвиля min', 'сер.', 'макс', 'загиб', 'життів'];
  const w = [Math.max(...rows.map(r => r[0].length), head[0].length), 9, 5, 5, 6, 7];
  const line = (c: string[]) => c.map((s, i) => s.padEnd(w[i])).join('  ');
  const out = [line(head), line(w.map(n => '─'.repeat(n)))];
  for (const [name, s] of rows)
    out.push(line([name, String(s.min), String(s.avg), String(s.max), String(s.died), String(s.lives)]));
  return out.join('\n');
}

const report: string[] = [`Chokepoint · баланс · ${RUNS} забігів, стеля хвиля ${MAX}`];
const emit = (s: string) => { report.push(s); console.log(s); };
afterAll(() => {
  writeFileSync(new URL('./report.txt', import.meta.url), report.join('\n') + '\n', 'utf8');
});

it(`баланс: ${RUNS} забігів до хвилі ${MAX}`, () => {
  for (const mode of [MODE_FIXED, MODE_MAZE]) {
    const rows: [string, ReturnType<typeof stats>][] = [];
    for (let map = 0; map < MAPS.length; map++) {
      const rs = Array.from({ length: RUNS }, (_, i) => runOne(map, mode, 'BENCH-' + i, { maxWave: MAX }));
      rows.push([MAPS[map].name, stats(rs)]);
    }
    emit(`\n══ ${mode === MODE_FIXED ? 'ФІКСОВАНИЙ ШЛЯХ' : 'ЛАБІРИНТ'} ══\n` + table(rows));
  }
}, 600000);

it('баланс наборів арсеналу', () => {
  const rows: [string, ReturnType<typeof stats>][] = [];
  for (const lo of LOADOUTS) {
    const mix = mixFor(lo.tools);
    if (!mix.length) continue;
    const rs: RunResult[] = [];
    for (let map = 0; map < MAPS.length; map++)
      for (let i = 0; i < RUNS; i++)
        rs.push(runOne(map, MODE_FIXED, 'BENCH-' + i, { maxWave: MAX, mix }));
    rows.push([lo.name, stats(rs)]);
  }
  emit('\n══ НАБОРИ (фіксований шлях, усі мапи) ══\n' + table(rows));
}, 600000);
