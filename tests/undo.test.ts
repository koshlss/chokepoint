/* Скасування останніх дій.

   Відмотати саму симуляцію не можна: вона детермінована й іде вперед.
   Тому скасування — це ЗВОРОТНА ДІЯ, що приводить дошку до того самого
   вигляду. Перевіряємо саме це: після скасування стан має збігтися з
   тим, що було до дії, включно із золотом. */
import { describe, it, expect } from 'vitest';
import { Sim } from '../src/sim/sim';
import { MODE_FIXED, GW } from '../src/sim/constants';

function fresh() {
  const s: any = new Sim('UNDO-1', 100, 1, 1, MODE_FIXED);
  s.players[0].gold = 5000;
  s.wave = 12;                       // відкриваємо рівні, щоб було що качати
  return s;
}
function freeCell(s: any, skip = 0) {
  let n = 0;
  for (let y = 0; y < 18; y++) for (let x = 0; x < GW; x++)
    if (s.buildable(x, y) && n++ === skip) return { x, y };
  throw new Error('немає вільної клітини');
}

describe('скасування', () => {
  it('будівництво відкочується разом із золотом', () => {
    const s = fresh();
    const c = freeCell(s), gold = s.players[0].gold;
    s.apply({ t:'build', p:0, seq:1, x:c.x, y:c.y, k:'arrow' });
    expect(s.towers.length).toBe(1);
    expect(s.players[0].gold).toBeLessThan(gold);
    s.apply({ t:'undo', p:0, seq:2 });
    expect(s.towers.length, 'вежа лишилась').toBe(0);
    expect(s.players[0].gold, 'золото не повернулось повністю').toBe(gold);
    expect(s.buildable(c.x, c.y), 'клітина лишилась зайнятою').toBe(true);
  });

  it('прокачка відкочується разом із гілкою', () => {
    const s = fresh();
    const c = freeCell(s);
    s.apply({ t:'build', p:0, seq:1, x:c.x, y:c.y, k:'lance' });
    const t = s.towerAt(c.x, c.y);
    const gold = s.players[0].gold, dmg = t.st.dmg;
    s.apply({ t:'up', p:0, seq:2, x:c.x, y:c.y, k:'barrel' });
    expect(t.lvl).toBe(2); expect(t.up).toEqual(['barrel']);
    s.apply({ t:'undo', p:0, seq:3 });
    expect(t.lvl, 'рівень не відкотився').toBe(1);
    expect(t.up, 'гілка лишилась').toEqual([]);
    expect(t.st.dmg, 'характеристики не перерахувались').toBe(dmg);
    expect(s.players[0].gold).toBe(gold);
  });

  it('знос відкочується: вежа повертається такою ж', () => {
    const s = fresh();
    const c = freeCell(s);
    s.apply({ t:'build', p:0, seq:1, x:c.x, y:c.y, k:'lance' });
    s.apply({ t:'up', p:0, seq:2, x:c.x, y:c.y, k:'shell' });
    s.apply({ t:'aim', p:0, seq:3, x:c.x, y:c.y });
    const was = { ...s.towerAt(c.x, c.y) };
    const gold = s.players[0].gold;
    s.apply({ t:'raze', p:0, seq:4, x:c.x, y:c.y });
    expect(s.towers.length).toBe(0);
    s.apply({ t:'undo', p:0, seq:5 });
    const now = s.towerAt(c.x, c.y);
    expect(now, 'вежа не повернулась').toBeTruthy();
    expect(now.lvl).toBe(was.lvl);
    expect(now.up).toEqual(was.up);
    expect(now.aim).toBe(was.aim);
    expect(now.k).toBe(was.k);
    expect(s.players[0].gold, 'золото за знос не забрали назад').toBe(gold);
  });

  it('глибина рівно три', () => {
    const s = fresh();
    for (let i = 0; i < 5; i++) {
      const c = freeCell(s, 0);
      s.apply({ t:'build', p:0, seq:i, x:c.x, y:c.y, k:'arrow' });
    }
    expect(s.towers.length).toBe(5);
    expect(s.undoLeft(0), 'стек має триматись на трьох').toBe(3);
    for (let i = 0; i < 3; i++) s.apply({ t:'undo', p:0, seq:10 + i });
    expect(s.towers.length, 'скасувалось не рівно три').toBe(2);
    expect(s.undoLeft(0)).toBe(0);
  });

  it('порожній стек не ламає нічого', () => {
    const s = fresh();
    const gold = s.players[0].gold;
    s.apply({ t:'undo', p:0, seq:1 });
    expect(s.players[0].gold).toBe(gold);
    expect(s.events.some((e: any) => e.e === 'deny')).toBe(true);
  });

  it('хвиля закриває минуле: після старту скасувати нема чого', () => {
    // інакше можна було б побачити хвилю й відкотити рішення заднім числом
    const s = fresh();
    const c = freeCell(s);
    s.apply({ t:'build', p:0, seq:1, x:c.x, y:c.y, k:'arrow' });
    expect(s.undoLeft(0)).toBe(1);
    s.startWave();
    expect(s.undoLeft(0), 'стек пережив початок хвилі').toBe(0);
  });

  it('скасування входить у хеш — інакше дошки розійшлися б мовчки', () => {
    const a = fresh(), b = fresh();
    const c = freeCell(a);
    for (const s of [a, b]) s.apply({ t:'build', p:0, seq:1, x:c.x, y:c.y, k:'arrow' });
    expect(a.hash()).toBe(b.hash());
    a.apply({ t:'undo', p:0, seq:2 });
    expect(a.hash()).not.toBe(b.hash());
  });
});
