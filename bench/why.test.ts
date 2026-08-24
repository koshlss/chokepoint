/* Розбір конкретних забігів: що саме будує добра гра там, де вона
   впирається в стелю. Число без механізму не лікується. */
import { it } from 'vitest';
import { MODE_FIXED } from '../src/sim/constants';
import { toolsOf } from '../src/content/loadouts';
import { runSmart } from '../tests/smart';

it('що будує добра гра', () => {
  const cases: [string, string, number, string][] = [
    ['fire',  'ice',   2, 'Вогонь+Крига · Гребінь  ← тікає в стелю'],
    ['steel', 'toxic', 2, 'Сталь+Отрута · Гребінь  ← норма'],
    ['fire',  'ice',   0, 'Вогонь+Крига · Вузол'],
    ['steel', 'ice',   2, 'Сталь+Крига · Гребінь'],
  ];
  for (const [pk, sk, map, name] of cases) {
    const tools = toolsOf(pk, sk);
    const r: any = runSmart(map, MODE_FIXED, 'BENCH-0', { maxWave: 40, tools });
    console.log(`\n══ ${name}`);
    console.log(`   хвиля ${r.wave} · веж ${r.towers} · витрачено ${r.spent} · життів ${r.lives}`);
    const comp = Object.entries(r.composition).sort((a: any, b: any) => b[1] - a[1]);
    console.log('   склад: ' + comp.map(([k, n]) => `${k}×${n}`).join(', '));
    const leaks = Object.entries(r.leaks);
    console.log('   протікання: ' + (leaks.length ? leaks.map(([w, n]) => `хв${w}:${n}`).join(' ') : 'жодного'));
  }
}, 600000);
