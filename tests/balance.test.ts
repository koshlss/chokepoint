/* Сторожова перевірка балансу — швидка, щоб жити в кожному `npm test`.
   Не міряє «цікаво чи ні»: ловить лише зсуви, від яких гра ламається —
   коли посередній бот раптом помирає на перших хвилях (щось перекрутили
   вгору) або доходить до стелі не втративши жодного життя (вниз).

   Повний прогін — `npm run bench`. */
import { describe, it, expect } from 'vitest';
import { runOne } from './bot';
import { MAPS } from '../src/content/maps';
import { MODE_MAZE, MODE_FIXED } from '../src/sim/constants';

const SEEDS = ['BENCH-0', 'BENCH-1', 'BENCH-2'];

describe('баланс тримається на посередній грі', () => {
  for (let map = 0; map < MAPS.length; map++) {
    for (const mode of [MODE_FIXED, MODE_MAZE]) {
      const label = `${MAPS[map].name} · ${mode === MODE_FIXED ? 'фіксований' : 'лабіринт'}`;

      it(`${label}: бот не вмирає на старті`, () => {
        for (const seed of SEEDS) {
          const r = runOne(map, mode, seed, { maxWave: 22 });
          expect(r.wave, `${label} / ${seed} — помер надто рано`).toBeGreaterThanOrEqual(5);
        }
      });

      it(`${label}: гра не роздає перемогу задарма`, () => {
        // Хоча б в одному з трьох забігів має бути хоч один пропущений крип.
        // Інакше складність не існує як явище.
        const anyLeak = SEEDS.some(seed => {
          const r = runOne(map, mode, seed, { maxWave: 22 });
          return r.lives < 20;
        });
        expect(anyLeak, `${label} — жодного пропущеного крипа за три забіги`).toBe(true);
      });
    }
  }
});
