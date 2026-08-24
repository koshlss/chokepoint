/* Чи тримається баланс, коли грають ДОБРЕ.

   Уся інша статистика знята посереднім ботом. Він купує за фіксованою
   пропорцією й качає навмання, тож міряє «чи виживе той, хто не думає».
   Питання, на яке він відповісти не може: чи не розсипається баланс від
   того, що гравець рахує. Тут та сама матриця, зіграна добре. */
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { runOne, mixFor, type RunResult } from '../tests/bot';
import { runSmart } from '../tests/smart';
import { MAPS } from '../src/content/maps';
import { MODE_FIXED } from '../src/sim/constants';
import { COMBOS, toolsOf } from '../src/content/loadouts';

const RUNS = Number(process.env.BENCH_RUNS || 10);
const MAX  = Number(process.env.BENCH_MAX  || 40);   // стеля вища: добра гра йде далі

function avg(rs: RunResult[]) {
  return +(rs.reduce((a, r) => a + r.wave, 0) / rs.length).toFixed(1);
}

it('посередня гра проти доброї', () => {
  const out: string[] = [
    `Чи тримається баланс при добрій грі · ${RUNS} забігів, стеля хвиля ${MAX}`,
    '', 'Фіксований шлях. «сер.» — середня хвиля, на якій обірвався забіг.', ''];

  const head = ['комбінація', 'мапа', 'посер.', 'добре', 'приріст'];
  const w = [18, 9, 7, 7, 8];
  const line = (c: string[]) => c.map((s, i) => s.padEnd(w[i])).join(' ');
  out.push(line(head), line(w.map(n => '─'.repeat(n))));

  const totals: { name: string; dumb: number; smart: number }[] = [];

  for (const c of COMBOS) {
    const tools = toolsOf(c.primary.key, c.support.key);
    const mix = mixFor(tools);
    const dumbAll: RunResult[] = [], smartAll: RunResult[] = [];
    for (let map = 0; map < MAPS.length; map++) {
      const dumb: RunResult[] = [], smart: RunResult[] = [];
      for (let i = 0; i < RUNS; i++) {
        dumb.push(runOne(map, MODE_FIXED, 'BENCH-' + i, { maxWave: MAX, mix }));
        smart.push(runSmart(map, MODE_FIXED, 'BENCH-' + i, { maxWave: MAX, tools }));
      }
      const d = avg(dumb), s = avg(smart);
      out.push(line([c.name, MAPS[map].name, String(d), String(s), '+' + (s - d).toFixed(1)]));
      dumbAll.push(...dumb); smartAll.push(...smart);
    }
    const d = avg(dumbAll), s = avg(smartAll);
    out.push(line([c.name + ' — разом', '', String(d), String(s), '+' + (s - d).toFixed(1)]));
    out.push('');
    totals.push({ name: c.name, dumb: d, smart: s });
  }

  const spread = (xs: number[]) => +(Math.max(...xs) - Math.min(...xs)).toFixed(1);
  out.push('Розкид між комбінаціями:');
  out.push('  посередня гра: ' + spread(totals.map(t => t.dumb)));
  out.push('  добра гра:     ' + spread(totals.map(t => t.smart)));
  out.push('');
  out.push('Якщо розкид при добрій грі помітно більший — баланс тримається');
  out.push('лише на тому, що ніхто не оптимізує, і це вада, а не запас.');

  const text = out.join('\n') + '\n';
  console.log('\n' + text);
  writeFileSync(new URL('./skill.txt', import.meta.url), text, 'utf8');
}, 1800000);
