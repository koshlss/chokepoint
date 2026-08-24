/* Поточний стан за мірою сили (src/content/power.ts). Друкує те, що
   перевіряє tests/power.test.ts, але з числами — щоб було видно, куди
   саме тягнути, коли смуга не сходиться. */
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { TOOLS, UPG } from '../src/content/towers';
import { LOADOUTS } from '../src/content/loadouts';
import { power, efficiency, efficiencyAt, control, BAND } from '../src/content/power';

it('міра сили', () => {
  const out: string[] = ['Міра сили: power = скільки вежа варта за секунду', '',
    `Прокачка коштує ${UPG[2]!.pct}% і ${UPG[3]!.pct}% від базової ціни.`,
    `Смуга віддачі: основні ${BAND.primary.min}–${BAND.primary.max}, допоміжні ${BAND.support.min}–${BAND.support.max}`, ''];
  const head = ['башта', 'фракція', 'рів', 'ціна', 'сила', 'контроль', 'віддача', 'lvl2', 'lvl3'];
  const w = [11, 8, 4, 6, 7, 9, 8, 7, 7];
  const line = (c: string[]) => c.map((s, i) => s.padEnd(w[i])).join(' ');
  out.push(line(head), line(w.map(n => '─'.repeat(n))));

  for (const lo of LOADOUTS) {
    const band = lo.role === 'primary' ? BAND.primary : BAND.support;
    for (const key of lo.tools) {
      const t: any = TOOLS.find(x => x.key === key);
      if (!t || !t.shot) continue;
      const e = efficiency(t);
      const flag = e < band.min ? ' ↓' : e > band.max ? ' ↑' : '';
      out.push(line([t.name, lo.name, String(t.tier), String(t.cost),
        power(t).toFixed(0), control(t).toFixed(0), e.toFixed(2) + flag,
        efficiencyAt(t, 2).toFixed(2), efficiencyAt(t, 3).toFixed(2)]));
    }
    // сила по рівнях — правило 2
    const byTier = [1, 2, 3].map(tier => {
      const own = lo.tools.map(k => TOOLS.find(x => x.key === k)!).filter(t => t && t.shot && t.tier === tier);
      return own.length ? Math.max(...own.map(t => power(t))) : 0;
    });
    out.push(`   сила по рівнях: ${byTier.map(v => v.toFixed(0)).join(' → ')}` +
      `   (крок ${(byTier[1] / byTier[0]).toFixed(2)}× , ${(byTier[2] / byTier[1]).toFixed(2)}×)`);
    out.push('');
  }
  out.push('Прокачка проти нової вежі (правило 3: має бути ≤ 1.00):');
  for (const lvl of [2, 3]) {
    const gain = UPG[lvl]!.dmg - UPG[lvl - 1]!.dmg;
    out.push(`  до ${lvl}-го: +${gain}% шкоди за ${UPG[lvl]!.pct}% ціни → ${(gain / UPG[lvl]!.pct).toFixed(2)}×`);
  }
  const text = out.join('\n') + '\n';
  console.log('\n' + text);
  writeFileSync(new URL('./efficiency.txt', import.meta.url), text, 'utf8');
});
