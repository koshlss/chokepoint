/* Чи справді шкода по площі зачіпає сусідів — від пострілу до здоров'я. */
import { it, expect } from 'vitest';
import { Sim } from '../src/sim/sim';
import { MODE_FIXED, SUB } from '../src/sim/constants';
import { TOOL_BY_KEY } from '../src/content/towers';

function creep(id: number, x: number, y: number, hp = 100000) {
  return { id, x, y, tx:x, ty:y, ntx:0, nty:0, ri:0, hp, sp:20, kind:0,
           slowT:0, slowP:0, slowImm:0, vulnT:0, vulnP:0,
           dotT:0, dotD:0, dotCd:0, dotMax:0, hurt:0 };
}

it('вибух б\'є всіх у радіусі, а не лише ціль', () => {
  const sim: any = new Sim('S-1', 100, 1, 0, MODE_FIXED);
  const t = TOOL_BY_KEY['mortar'];
  const r = t.splash!;                       // радіус вибуху в під-одиницях
  // ціль у центрі, сусід усередині радіуса, третій — за ним
  sim.creeps = [creep(1, 1000, 1000), creep(2, 1000 + (r >> 1), 1000), creep(3, 1000 + r * 3, 1000)];
  const before = sim.creeps.map((c: any) => c.hp);
  sim.impact({ x:1000, y:1000, k:'mortar', splash:r, dmg:100, owner:0 }, sim.creeps[0]);
  const after = sim.creeps.map((c: any) => c.hp);
  console.log(`   радіус ${r} під-одиниць (${(r / SUB).toFixed(2)} клітини)`);
  console.log(`   ціль ${before[0]}→${after[0]}, сусід ${before[1]}→${after[1]}, далекий ${before[2]}→${after[2]}`);
  expect(after[0], 'ціль').toBeLessThan(before[0]);
  expect(after[1], 'сусід у радіусі').toBeLessThan(before[1]);
  expect(after[2], 'той, хто за радіусом').toBe(before[2]);
});

it('наскрізно: башта з площею справді знімає здоров\'я кільком', () => {
  const sim: any = new Sim('S-2', 100, 1, 0, MODE_FIXED);
  sim.players[0].gold = 99999;
  sim.wave = 1;
  // ставимо мортиру біля траси
  let spot = null;
  for (let y = 0; y < 18 && !spot; y++) for (let x = 0; x < 26; x++)
    if (sim.buildable(x, y)) { spot = { x, y }; break; }
  sim.apply({ t:'build', p:0, seq:0, x:spot.x, y:spot.y, k:'mortar' });
  const tw = sim.towers[0];
  tw.build = 0;                               // не чекаємо будівництва
  // ставимо трьох крипів упритул у радіусі башти
  const cx = tw.x * SUB + (SUB >> 1), cy = tw.y * SUB + (SUB >> 1);
  sim.creeps = [creep(1, cx + SUB, cy), creep(2, cx + SUB + 30, cy), creep(3, cx + SUB + 60, cy)];
  for (let i = 0; i < 120; i++) sim.step(null);
  const hurt = sim.creeps.filter((c: any) => c.hp < 100000).length;
  console.log(`   поранено ${hurt} із ${sim.creeps.length}; hp: ${sim.creeps.map((c: any) => c.hp).join(', ')}`);
  expect(hurt, 'вибух має зачепити не одного').toBeGreaterThan(1);
});
