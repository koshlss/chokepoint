/* Віддача кожної вежі очима моделі. Не «як має бути», а як є зараз —
   саме цим числом і балансується контент. */
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { TOOLS } from '../src/content/towers';
import { power, efficiency, control, controlPerGold, targetEff, BAND } from '../src/content/power';

it('віддача по вежах', () => {
  const out: string[] = [
    'Віддача = сила / ціна. Сходинка йде за ЦІНОЮ: дорожча вежа менш',
    'гнучка й довше будується, тож дає більше сили на золото.',
    `смуга основних ${BAND.damage.min}–${BAND.damage.max}, допоміжні до ${BAND.supportDamageMax}`,
    '',
    'башта       фракція  рів  ціна  сила   віддача  ціль   контроль',
    '─'.repeat(66),
  ];
  let fac = '';
  for (const t of TOOLS) {
    if (!t.shot) continue;
    if (t.faction !== fac) { fac = t.faction; out.push(''); }
    const sup = t.faction === 'ice' || t.faction === 'toxic';
    out.push(`${t.name.padEnd(11)} ${t.faction.padEnd(8)} ${t.tier}    ${String(t.cost).padStart(3)}   ` +
      `${power(t).toFixed(0).padStart(4)}   ${efficiency(t).toFixed(3)}    ` +
      `${sup ? '  —  ' : targetEff(t.cost).toFixed(3)}  ` +
      `${sup ? control(t).toFixed(0).padStart(4) + ' (' + controlPerGold(t).toFixed(2) + ')' : ''}`);
  }
  const text = out.join('\n') + '\n';
  console.log('\n' + text);
  writeFileSync(new URL('./efficiency.txt', import.meta.url), text, 'utf8');
});
