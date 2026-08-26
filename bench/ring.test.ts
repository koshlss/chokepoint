/* Кільце на двох ботах. Кожен грає своєю комбінацією у своїй половині —
   мапа задумана саме так, і на одному боті міряти її безглуздо: половина
   дошки просто стоїть порожня. */
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { runDuo, mixFor } from '../tests/bot';
import { MAPS } from '../src/content/maps';
import { MODE_FIXED } from '../src/sim/constants';
import { COMBOS, toolsOf } from '../src/content/loadouts';

const RUNS = Number(process.env.BENCH_RUNS || 4);
const RING = MAPS.findIndex(m => m.name === 'Кільце');

it('Кільце: двоє ботів різними наборами', () => {
  const out: string[] = ['Кільце · двоє на одній дошці, у кожного своя половина', '',
    `${RUNS} забігів на пару, стеля хвиля 22.`, ''];
  const head = 'пара'.padEnd(34) + 'хвиля  загиб  життів  веж      вбито';
  out.push(head); out.push('─'.repeat(head.length));

  const rows: { name: string; wave: number; died: number; lives: number }[] = [];
  for (let a = 0; a < COMBOS.length; a++)
    for (let b = a; b < COMBOS.length; b++) {
      const A = COMBOS[a], B = COMBOS[b];
      const mixes = [mixFor(toolsOf(A.primary.key, A.support.key)),
                     mixFor(toolsOf(B.primary.key, B.support.key))];
      const arsenals = [toolsOf(A.primary.key, A.support.key),
                        toolsOf(B.primary.key, B.support.key)];
      let wave = 0, died = 0, lives = 0, tw = [0, 0], kills = [0, 0];
      for (let i = 0; i < RUNS; i++) {
        const r = runDuo(RING, MODE_FIXED, 'RING-' + i, { mixes, arsenals, maxWave: 22 });
        wave += r.wave; died += r.died ? 1 : 0; lives += r.lives;
        tw = [tw[0] + r.towers[0], tw[1] + r.towers[1]];
        kills = [kills[0] + r.kills[0], kills[1] + r.kills[1]];
      }
      const name = `${A.name} / ${B.name}`;
      out.push(name.padEnd(34) +
        (wave / RUNS).toFixed(1).padStart(5) +
        String(died).padStart(7) +
        (lives / RUNS).toFixed(1).padStart(8) +
        `  ${(tw[0] / RUNS).toFixed(0)}+${(tw[1] / RUNS).toFixed(0)}`.padEnd(9) +
        `  ${(kills[0] / RUNS).toFixed(0)}/${(kills[1] / RUNS).toFixed(0)}`);
      rows.push({ name, wave: wave / RUNS, died, lives: lives / RUNS });
    }

  const ws = rows.map(r => r.wave);
  out.push('');
  out.push(`розкид по хвилі: ${Math.min(...ws).toFixed(1)} – ${Math.max(...ws).toFixed(1)}`);
  const text = out.join('\n') + '\n';
  console.log('\n' + text);
  writeFileSync(new URL('./ring.txt', import.meta.url), text, 'utf8');
}, 1800000);
