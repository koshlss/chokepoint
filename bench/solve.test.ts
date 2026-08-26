import { it } from 'vitest';
import { TOOLS } from '../src/content/towers';
import { power, targetEff } from '../src/content/power';
/* Яка шкода дає потрібну віддачу на кожному рівні. Рахуємо тією самою
   моделлю, якою гра й балансується, щоб не було двох правд. */

it('нові значення шкоди під сходинку віддачі', () => {
  const rows: string[] = [];
  for (const t of TOOLS) {
    if (!t.shot || t.faction === 'ice' || t.faction === 'toxic') continue;
    const want = targetEff(t.cost) * t.cost;
    let lo = 1, hi = 2000, best = t.dmg;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (power(t, mid) < want) lo = mid; else hi = mid;
      best = mid;
    }
    const d = Math.round(best);
    rows.push(`${t.key.padEnd(8)} ${t.name.padEnd(11)} рів${t.tier}  шкода ${String(t.dmg).padStart(3)} → ${String(d).padStart(3)}  ` +
      `віддача ${(power(t) / t.cost).toFixed(3)} → ${(power(t, d) / t.cost).toFixed(3)}`);
  }
  console.log('\n' + rows.join('\n') + '\n');
});
