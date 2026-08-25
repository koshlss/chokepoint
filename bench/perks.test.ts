/* Чи справді гілки ПЕРЕРОЗПОДІЛЯЮТЬ силу, а не додають її.

   Друкує відношення до тієї самої вежі без гілки. Одиниця — рівно.
   Помітний відхил означає, що одна гілка з пари просто краща за іншу,
   і вибору насправді немає.

   Основні міряються силою (power), допоміжні — впливом (supportValue):
   Кріостат навмисно віддає шкоду за холод, і рахувати йому шкоду означало
   б назвати ваду там, де задум. */
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { TOOLS, UPG } from '../src/content/towers';
import { power, supportValue } from '../src/content/power';
import { treeOf, isSimple, statsFor, allPaths } from '../src/content/upgrades';
import type { Tool } from '../src/content/types';

const asTool = (b: Tool, s: any): Tool => ({ ...b, ...s });
const isSupport = (b: Tool) => b.faction === 'ice' || b.faction === 'toxic';
/** Чим міряти саме цю вежу. */
const worth = (b: Tool, s: any) =>
  isSupport(b) ? supportValue(asTool(b, s)) : power(asTool(b, s));

it('гілки не додають сили, а перерозподіляють', () => {
  const out: string[] = ['Відношення до тієї самої вежі без гілки.',
    'Основні міряються силою, допоміжні — впливом (контроль × ширина плями).', ''];
  const bad: string[] = [];
  const note = (name: string, r: number) => {
    if (r < 0.9 || r > 1.1) bad.push(`${name}: ×${r.toFixed(3)}`);
  };

  for (const b of TOOLS) {
    const tree = treeOf(b);
    if (!tree) continue;
    const mark = isSupport(b) ? 'вплив' : 'сила';
    out.push(`${b.name} (${b.faction}, ${isSimple(b) ? 'проста' : 'звичайна'})`);

    // головна пара — на рівні 2 у звичайних, на рівні 3 у простих
    const lvl = isSimple(b) ? 3 : 2;
    const base = isSimple(b) ? [''] : [];
    const ref = worth(b, statsFor(b, UPG[lvl]!, lvl, base));
    for (const p of tree.main) {
      const r = worth(b, statsFor(b, UPG[lvl]!, lvl, [...base, p.key])) / ref;
      out.push(`   рів.${lvl} ${p.name.padEnd(16)} ${mark} ×${r.toFixed(3)}`);
      note(`${b.name} · ${p.name}`, r);
    }

    if (!isSimple(b)) {
      for (const a of tree.main) {
        const r0 = worth(b, statsFor(b, UPG[3]!, 3, [a.key]));
        for (const p of tree.then[a.key] || []) {
          const r = worth(b, statsFor(b, UPG[3]!, 3, [a.key, p.key])) / r0;
          out.push(`   рів.3 ${a.name} → ${p.name.padEnd(16)} ${mark} ×${r.toFixed(3)}`);
          note(`${b.name} · ${a.name}→${p.name}`, r);
        }
      }
    }
    out.push('');
  }

  /* Найважливіше число: чи не робить НАЙКРАЩИЙ шлях прокачку вигіднішою
     за просту прокачку без вибору. Якщо так — гілки перестають бути
     вибором характеру й стають обов'язковою надбавкою до сили. */
  out.push('── найкращий шлях проти прокачки без гілок ──');
  for (const b of TOOLS) {
    if (!treeOf(b)) continue;
    const plain = worth(b, statsFor(b, UPG[3]!, 3, []));
    const vals = allPaths(b).map(p => worth(b, statsFor(b, UPG[3]!, 3, p)));
    const hi = Math.max(...vals), lo = Math.min(...vals);
    out.push(`${b.name.padEnd(12)} найкращий ×${(hi / plain).toFixed(3)}  ` +
             `найгірший ×${(lo / plain).toFixed(3)}  розкид ${(hi / (lo || 1)).toFixed(3)}×`);
    note(`${b.name} · найкращий шлях`, hi / plain);
  }

  if (bad.length) { out.push(''); out.push('ПОЗА СМУГОЮ ±10%:'); out.push(...bad.map(s => '  ' + s)); }
  else { out.push(''); out.push('Усе в межах ±10%.'); }
  const text = out.join('\n') + '\n';
  console.log('\n' + text);
  writeFileSync(new URL('./perks.txt', import.meta.url), text, 'utf8');
});
