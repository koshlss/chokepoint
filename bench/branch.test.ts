import { describe, it, expect } from 'vitest';
import { Sim } from '../src/sim/sim';
import { MODE_FIXED, GW } from '../src/sim/constants';

/* Гілки в живій симуляції: чи справді дві однакові вежі стають різними
   і чи не проходить підсунута чужа гілка. */
function fresh() {
  const s: any = new Sim('BR-1', 100, 1, 0, MODE_FIXED);
  s.players[0].gold = 1000000;
  s.wave = 12;            // відкриваємо всі рівні: тут міряються гілки, а не доступність
  return s;
}
function place(s: any, k: string, seq = 0) {
  for (let y = 0; y < 20; y++) for (let x = 0; x < GW; x++)
    if (s.buildable(x, y) && !s.towerAt(x, y)) { s.apply({ t:'build', p:0, seq, x, y, k }); return s.towerAt(x, y); }
  throw new Error('нема куди ставити');
}

describe('гілки прокачки в симуляції', () => {
  it('дві однакові вежі різними гілками стають різними', () => {
    const s = fresh();
    const a = place(s, 'lance', 1), b = place(s, 'lance', 2);
    s.apply({ t:'up', p:0, seq:3, x:a.x, y:a.y, k:'barrel' });
    s.apply({ t:'up', p:0, seq:4, x:b.x, y:b.y, k:'shell' });
    expect(a.lvl).toBe(2); expect(b.lvl).toBe(2);
    expect(a.up).toEqual(['barrel']); expect(b.up).toEqual(['shell']);
    expect(a.st.range, 'ствол дістає далі').toBeGreaterThan(b.st.range);
    expect(b.st.dmg, 'набій б’є важче').toBeGreaterThan(a.st.dmg);
  });

  it('другий вибір залежить від першого', () => {
    const s = fresh();
    const t = place(s, 'lance', 1);
    s.apply({ t:'up', p:0, seq:2, x:t.x, y:t.y, k:'barrel' });
    expect(s.upChoices(t).map((p: any) => p.key)).toEqual(['scope', 'rapid']);
    const s2 = fresh();
    const t2 = place(s2, 'lance', 1);
    s2.apply({ t:'up', p:0, seq:2, x:t2.x, y:t2.y, k:'shell' });
    expect(s2.upChoices(t2).map((p: any) => p.key)).toEqual(['sledge', 'spray']);
  });

  it('чужа гілка не проходить — золото на місці, рівень не змінився', () => {
    const s = fresh();
    const t = place(s, 'lance', 1);
    const gold = s.players[0].gold;
    s.apply({ t:'up', p:0, seq:2, x:t.x, y:t.y, k:'sledge' });   // ще недоступна
    expect(t.lvl).toBe(1);
    expect(s.players[0].gold).toBe(gold);
    expect(s.events.some((e: any) => e.e === 'deny' && e.why === 'невідома гілка')).toBe(true);
  });

  it('проста вежа качається на 2 без вибору, а на 3 питає', () => {
    const s = fresh();
    const t = place(s, 'arrow', 1);
    expect(s.upChoices(t), 'на другому вибору немає').toHaveLength(0);
    s.apply({ t:'up', p:0, seq:2, x:t.x, y:t.y, k:'' });
    expect(t.lvl).toBe(2); expect(t.up).toEqual(['']);
    expect(s.upChoices(t).map((p: any) => p.key), 'на третьому — головна пара').toEqual(['barrel', 'shell']);
  });

  it('гілки входять у хеш — інакше дошки розійшлися б мовчки', () => {
    const mk = (perk: string) => {
      const s = fresh();
      const t = place(s, 'lance', 1);
      s.apply({ t:'up', p:0, seq:2, x:t.x, y:t.y, k:perk });
      return s.hash();
    };
    expect(mk('barrel')).not.toBe(mk('shell'));
  });

  it('розсів справді дає площу вежі, яка її не мала', () => {
    const s = fresh();
    const t = place(s, 'lance', 1);
    expect(t.st.splash | 0).toBe(0);
    s.apply({ t:'up', p:0, seq:2, x:t.x, y:t.y, k:'shell' });
    s.apply({ t:'up', p:0, seq:3, x:t.x, y:t.y, k:'spray' });
    expect(t.up).toEqual(['shell', 'spray']);
    expect(t.st.splash, 'після Розсіву вежа б’є площею').toBeGreaterThan(0);
  });
});
