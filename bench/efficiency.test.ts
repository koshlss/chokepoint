/* Віддача кожної башти на золото — і те саме після прокачки.

   Якщо всередині рівня віддача нерівна, вибір схлопується: беруть одну,
   решта мертві. Якщо прокачка вигідніша за нову вежу, схлопується вже
   стратегія: усі комбінації грають «найдешевша + вкачати». Ця таблиця
   показує обидва схлопування числом. */
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { TOOLS, UPG, MAX_LVL } from '../src/content/towers';
import { LOADOUTS } from '../src/content/loadouts';
import { SUB } from '../src/sim/constants';

/** Скільки башта варта за секунду з поправкою на площу, отруту й мороз. */
function eff(dmg: number, t: any) {
  const direct = t.cd ? dmg * 30 / t.cd : 0;
  const burn = t.dot ? t.dot * 2 : 0;
  const area = t.splash ? 1.6 : 1;
  const hold = t.slow ? 1 + t.slow / 200 : 1;
  return (direct * area + burn) * hold;
}
/** Сукупна ціна вежі, вкачаної до рівня lvl. */
function total(t: any, lvl: number) {
  let c = t.cost;
  for (let l = 2; l <= lvl; l++) c += (t.cost * UPG[l].pct) / 100;
  return c;
}

it('віддача на золото', () => {
  const out: string[] = ['Віддача на золото: скільки «шкоди за секунду» дає одиниця ціни', '',
    `Прокачка коштує ${UPG[2]!.pct}% і ${UPG[3]!.pct}% від базової ціни.`, ''];
  const head = ['башта', 'фракція', 'рів', 'ціна', 'lvl1', 'lvl2', 'lvl3'];
  const w = [11, 8, 4, 6, 7, 7, 7];
  const line = (c: string[]) => c.map((s, i) => s.padEnd(w[i])).join(' ');
  out.push(line(head), line(w.map(n => '─'.repeat(n))));

  for (const lo of LOADOUTS) {
    for (const key of lo.tools) {
      const t: any = TOOLS.find(x => x.key === key);
      if (!t || !t.shot) continue;
      const cells = [1, 2, 3].map(lvl => {
        const d = ((t.dmg * UPG[lvl]!.dmg) / 100) | 0;
        return (eff(d, t) / total(t, lvl)).toFixed(2);
      });
      out.push(line([t.name, lo.name, String(t.tier), String(t.cost), ...cells]));
    }
    out.push('');
  }

  out.push('Прокачка проти нової вежі — у скільки разів вигідніша ДОДАТКОВА шкода:');
  for (const lvl of [2, 3]) {
    const gain = UPG[lvl]!.dmg - UPG[lvl - 1]!.dmg;      // приріст шкоди, %
    const price = UPG[lvl]!.pct;                          // ціна, % від базової
    out.push(`  до ${lvl}-го рівня: +${gain}% шкоди за ${price}% ціни → ${(gain / price).toFixed(2)}× (нова вежа = 1.00)`);
  }
  const text = out.join('\n') + '\n';
  console.log('\n' + text);
  writeFileSync(new URL('./efficiency.txt', import.meta.url), text, 'utf8');
});
