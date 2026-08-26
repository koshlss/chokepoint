/* Підбір mazeCov для нових мап. Стала каже, скільки шкоди гравець устигає
   накрити в лабіринті на цій мапі; від неї прямо залежить здоров'я крипів.
   Взяти її можна лише прогоном — що й робиться тут. */
import { it } from 'vitest';
import { runOne, mixFor } from '../tests/bot';
import { MAPS } from '../src/content/maps';
import { MODE_MAZE } from '../src/sim/constants';
import { LOADOUTS } from '../src/content/loadouts';

const RUNS = 4;
it('яке mazeCov ставить нову мапу поруч зі старими', () => {
  const rows: string[] = [];
  const mixes = LOADOUTS.filter(l => l.role === 'primary').map(l => mixFor(l.tools));
  const trial = (i: number, cov: number | undefined) => {
    const old = MAPS[i].mazeCov;
    if (cov === undefined) delete (MAPS[i] as any).mazeCov; else MAPS[i].mazeCov = cov;
    let sum = 0, n = 0;
    for (const mix of mixes)
      for (let k = 0; k < RUNS; k++) { sum += runOne(i, MODE_MAZE, 'COV-' + k, { maxWave: 22, mix }).wave; n++; }
    if (old === undefined) delete (MAPS[i] as any).mazeCov; else MAPS[i].mazeCov = old;
    return sum / n;
  };
  for (let i = 0; i < MAPS.length; i++) {
    const m = MAPS[i];
    if (['Обруч', 'Ребро'].indexOf(m.name) < 0) {
      rows.push(`${m.name.padEnd(9)} як є (${m.mazeCov ?? 330})  хвиля ${trial(i, m.mazeCov).toFixed(1)}`);
      continue;
    }
    const line = [m.name.padEnd(9)];
    for (const cov of [330, 260, 210, 170, 140]) line.push(`${cov}:${trial(i, cov).toFixed(1)}`);
    rows.push(line.join('  '));
  }
  console.log('\n' + rows.join('\n') + '\n');
}, 900000);
