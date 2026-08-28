/* Кільце на ботах: чи тримається баланс, коли гравців двоє й четверо.
   Кожен кут шле свою хвилю, тож учотирьох на дошці вчетверо більше крипів
   і вчетверо більше веж — паритет мусить зберігатись. */
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { Sim } from '../src/sim/sim';
import { MODE_FIXED, TPS } from '../src/sim/constants';
import { MAPS } from '../src/content/maps';
import { botCommands } from '../src/sim/autoplay';
import { COMBOS, toolsOf } from '../src/content/loadouts';

const RING = MAPS.findIndex(m => m.name === 'Кільце');
const RUNS = Number(process.env.BENCH_RUNS || 3);

function play(n: number, map: number, seed: string) {
  const ars = Array.from({ length: n }, (_, i) => {
    const c = COMBOS[i % COMBOS.length];
    return toolsOf(c.primary.key, c.support.key);
  });
  const s: any = new Sim(seed, 100, n, map, MODE_FIXED, ars);
  for (let t = 0; t < 900 * TPS && !s.over && s.wave < 22; t++) {
    const c: any[] = [];
    for (let p = 0; p < n; p++) c.push(...botCommands(s, p));
    s.step(c.length ? c : null);
  }
  return s;
}

it('Кільце: двоє проти чотирьох', () => {
  const out: string[] = ['Кільце на вбудованих ботах', ''];
  for (const [name, map] of [['Двійка', 1], ['Кільце', RING]] as [string, number][]) {
    for (const n of (map === RING ? [1, 2, 4] : [1])) {
      let wave = 0, lives = 0, tw = 0, died = 0;
      for (let i = 0; i < RUNS; i++) {
        const s = play(n, map, 'B4-' + i);
        wave += s.wave; lives += s.lives; tw += s.towers.length; died += s.over ? 1 : 0;
      }
      out.push(`${name} на ${n}: хвиля ${(wave / RUNS).toFixed(1)}, життя ${(lives / RUNS).toFixed(1)}, ` +
               `веж ${(tw / RUNS).toFixed(0)}, загиб ${died}/${RUNS}`);
    }
  }
  const text = out.join('\n') + '\n';
  console.log('\n' + text);
  writeFileSync(new URL('./bot4.txt', import.meta.url), text, 'utf8');
}, 1800000);
