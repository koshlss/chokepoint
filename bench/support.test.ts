/* Чи потрібні допоміжні вежі.

   «Частка золота» тут міряє не те: позначки не складаються, тож трасу
   достатньо покрити один раз — 4-6 дешевих веж, кілька відсотків
   бюджету. Це не ознака непотрібності.

   Пряме питання: наскільки гірше, якщо допоміжних не брати ЗОВСІМ. */
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { MODE_FIXED } from '../src/sim/constants';
import { COMBOS, toolsOf, LOADOUT_BY_KEY } from '../src/content/loadouts';
import { TOOL_BY_KEY } from '../src/content/towers';
import { MAPS } from '../src/content/maps';
import { runSmart } from '../tests/smart';

const RUNS = Number(process.env.BENCH_RUNS || 5);

it('що дає допоміжна фракція', () => {
  const out: string[] = ['Наскільки далі заходить гра З допоміжною фракцією', '',
    `${RUNS} забігів на клітину, добра гра, фіксований шлях.`, ''];
  const head = ['комбінація', 'мапа', 'без доп.', 'з доп.', 'приріст', 'веж доп.'];
  const w = [18, 9, 9, 8, 8, 9];
  const line = (c: string[]) => c.map((s, i) => s.padEnd(w[i])).join(' ');
  out.push(line(head), line(w.map(n => '─'.repeat(n))));

  for (const c of COMBOS) {
    const full = toolsOf(c.primary.key, c.support.key);
    const supKeys = new Set(LOADOUT_BY_KEY[c.support.key].tools);
    const bare = full.filter(k => !supKeys.has(k));      // сама основна
    for (let map = 0; map < MAPS.length; map++) {
      let a = 0, b = 0, supN = 0;
      for (let i = 0; i < RUNS; i++) {
        a += runSmart(map, MODE_FIXED, 'BENCH-' + i, { maxWave: 40, tools: bare }).wave;
        const r: any = runSmart(map, MODE_FIXED, 'BENCH-' + i, { maxWave: 40, tools: full });
        b += r.wave;
        for (const [label, n] of Object.entries(r.composition) as [string, number][]) {
          const name = label.replace(/ lvl\d$/, '');
          const t = Object.values(TOOL_BY_KEY).find(x => x.name === name)!;
          if (supKeys.has(t.key)) supN += n;
        }
      }
      const A = +(a / RUNS).toFixed(1), B = +(b / RUNS).toFixed(1);
      out.push(line([c.name, MAPS[map].name, String(A), String(B),
                     (B - A >= 0 ? '+' : '') + (B - A).toFixed(1), (supN / RUNS).toFixed(1)]));
    }
    out.push('');
  }
  const text = out.join('\n') + '\n';
  console.log('\n' + text);
  writeFileSync(new URL('./support.txt', import.meta.url), text, 'utf8');
}, 1800000);
