/* Чи не зник характер фракцій за однаковими підсумками.

   Однакова хвиля загибелі ще не означає однакову гру. Питання, на яке
   відповідає цей стенд: партії різних комбінацій РІЗНІ чи це одне й те
   саме під різними назвами. Дивимось не на підсумок, а на те, ЯК він
   набирається: скільки веж, за скільки золота, з чого складається дошка,
   і на яких хвилях сиплються життя. */
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { MODE_FIXED } from '../src/sim/constants';
import { COMBOS, toolsOf } from '../src/content/loadouts';
import { MAPS } from '../src/content/maps';
import { runSmart } from '../tests/smart';

const RUNS = Number(process.env.BENCH_RUNS || 5);

it('чи різні партії різних комбінацій', () => {
  const out: string[] = ['Характер комбінацій — не підсумок, а як він набирається', '',
    `${RUNS} забігів на мапу, добра гра, фіксований шлях.`, ''];

  for (const c of COMBOS) {
    const tools = toolsOf(c.primary.key, c.support.key);
    let towers = 0, spent = 0, wave = 0, n = 0;
    const comp: Record<string, number> = {};
    const leaks: Record<number, number> = {};
    const perMap: number[] = [];
    for (let map = 0; map < MAPS.length; map++) {
      let w = 0;
      for (let i = 0; i < RUNS; i++) {
        const r: any = runSmart(map, MODE_FIXED, 'BENCH-' + i, { maxWave: 40, tools });
        towers += r.towers; spent += r.spent; wave += r.wave; w += r.wave; n++;
        for (const [k, v] of Object.entries(r.composition) as [string, number][]) {
          const name = k.replace(/ lvl\d$/, '');
          comp[name] = (comp[name] || 0) + v;
        }
        for (const [k, v] of Object.entries(r.leaks) as [string, number][])
          leaks[+k] = (leaks[+k] || 0) + v;
      }
      perMap.push(+(w / RUNS).toFixed(1));
    }
    const top = Object.entries(comp).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const totalT = Object.values(comp).reduce((a, b) => a + b, 0);
    const hot = Object.entries(leaks).sort((a, b) => b[1] - a[1]).slice(0, 4)
      .map(([w, v]) => `хв${w}(${v})`).join(' ');
    out.push(`══ ${c.name}`);
    out.push(`   хвиля ${(wave / n).toFixed(1)} · по мапах ${perMap.join(' / ')} · розкид ${(Math.max(...perMap) - Math.min(...perMap)).toFixed(1)}`);
    out.push(`   веж за партію ${(towers / n).toFixed(0)} · золота ${(spent / n).toFixed(0)} · на вежу ${(spent / towers).toFixed(0)}`);
    out.push(`   кістяк: ${top.map(([k, v]) => `${k} ${Math.round(v * 100 / totalT)}%`).join(', ')}`);
    out.push(`   сиплеться на: ${hot}`);
    out.push('');
  }
  const text = out.join('\n') + '\n';
  console.log('\n' + text);
  writeFileSync(new URL('./character.txt', import.meta.url), text, 'utf8');
}, 1800000);
