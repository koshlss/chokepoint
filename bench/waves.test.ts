/* Де саме кожна фракція втрачає життя. Підсумкова «хвиля загибелі»
   ховає найцікавіше: чи фракція рівно просідає, чи спотикається на
   конкретному типі крипів. Босові хвилі — кожна п'ята. */
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { runOne, mixFor } from '../tests/bot';
import { MAPS } from '../src/content/maps';
import { MODE_MAZE, MODE_FIXED } from '../src/sim/constants';
import { COMBOS, toolsOf, LOADOUTS } from '../src/content/loadouts';
import { waveSpec, KIND_NAME } from '../src/content/waves';

const RUNS = Number(process.env.BENCH_RUNS || 10);
const MAX  = 22;

it('втрати життів по хвилях', () => {
  const out: string[] = ['Скільки життів фракція втрачає на кожній хвилі', '',
    'Сума по всіх мапах і режимах, ' + RUNS + ' забігів на комбінацію.',
    'Зірочка — босова хвиля (титан, броня 10).', ''];

  const waves = Array.from({ length: MAX }, (_, i) => i + 1);
  const head = ['фракція', ...waves.map(w => String(w))];
  const wd = [9, ...waves.map(() => 4)];
  const line = (c: string[]) => c.map((s, i) => s.padStart(i === 0 ? 0 : wd[i]).padEnd(i === 0 ? wd[0] : 0)).join('');
  out.push(line(head));
  out.push(line(['', ...waves.map(w => (waveSpec(w).esc ? '  *' : '   '))]));
  out.push('─'.repeat(9 + waves.length * 4));

  const perFaction: Record<string, number[]> = {};
  for (const lo of LOADOUTS) {
    const mix = mixFor(lo.tools);
    const tally = new Array(MAX + 1).fill(0);
    for (let map = 0; map < MAPS.length; map++)
      for (const mode of [MODE_FIXED, MODE_MAZE])
        for (let i = 0; i < RUNS; i++) {
          const r = runOne(map, mode, 'BENCH-' + i, { maxWave: MAX, mix });
          for (const [w, n] of Object.entries(r.leaks)) tally[+w] = (tally[+w] || 0) + n;
        }
    perFaction[lo.name] = tally;
    out.push(line([lo.name, ...waves.map(w => String(tally[w] || 0))]));
  }

  out.push('');
  out.push('Що йде кожною хвилею:');
  for (const w of waves) {
    const s = waveSpec(w);
    out.push(`  ${String(w).padStart(2)}  ${KIND_NAME[s.kind].padEnd(11)} ×${String(s.n).padStart(2)}  hp ${String(s.hp).padStart(6)}  швидкість ${s.sp}` +
      (s.esc ? `  + супровід ${KIND_NAME[s.esc.kind]} ×${s.esc.n}` : ''));
  }

  const text = out.join('\n') + '\n';
  console.log('\n' + text);
  writeFileSync(new URL('./waves.txt', import.meta.url), text, 'utf8');
}, 900000);
