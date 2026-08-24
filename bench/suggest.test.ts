/* Яку шкоду має мати кожна вежа, щоб влучити в смугу віддачі.
   Рахує модель, а не я на око — саме заради цього вона й будувалась. */
import { it } from 'vitest';
import { TOOLS } from '../src/content/towers';
import { LOADOUTS } from '../src/content/loadouts';
import { power, efficiency, controlPerGold, BAND } from '../src/content/power';

it('пропоновані числа', () => {
  const out: string[] = ['Яку шкоду ставити, щоб влучити в смугу', ''];
  const TARGET_DAMAGE  = 0.57;   // середина смуги основних
  const TARGET_SUPPORT = 0.26;   // помітно нижче за основні

  for (const lo of LOADOUTS) {
    const target = lo.role === 'primary' ? TARGET_DAMAGE : TARGET_SUPPORT;
    out.push(`══ ${lo.name} (${lo.role === 'primary' ? 'основна' : 'допоміжна'}), ціль ${target}`);
    for (const key of lo.tools) {
      const t: any = TOOLS.find(x => x.key === key);
      if (!t || !t.shot) continue;
      const e = efficiency(t);
      // сила лінійна за шкодою, тож потрібна шкода масштабується так само
      const want = Math.max(1, Math.round(t.dmg * target / e));
      out.push(`   ${t.name.padEnd(11)} ціна ${String(t.cost).padStart(4)}  ` +
        `шкода ${String(t.dmg).padStart(4)} → ${String(want).padStart(4)}   ` +
        `віддача ${e.toFixed(2)} → ${target}` +
        (lo.role === 'support' ? `   контроль/золото ${controlPerGold(t).toFixed(2)}` : ''));
    }
    out.push('');
  }
  out.push(`Смуги: основні ${BAND.damage.min}–${BAND.damage.max}, ` +
           `власна шкода допоміжних ≤ ${BAND.supportDamageMax}, ` +
           `контроль ${BAND.control.min}–${BAND.control.max}`);
  console.log('\n' + out.join('\n'));
});
