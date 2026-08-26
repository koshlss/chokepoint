/* Кільце: мапа, де кожен гравець сидить у своєму куті, крипи виходять
   біля кожного й ідуть спільним колом у центр. */
import { describe, it, expect } from 'vitest';
import { MAPS } from '../src/content/maps';
import { GW, MODE_FIXED } from '../src/sim/constants';
import { buildRoute } from '../src/sim/pathing';
import { Sim } from '../src/sim/sim';

const RING_IDX = MAPS.findIndex(m => m.name === 'Кільце');
const ring = MAPS[RING_IDX];

describe('Кільце', () => {
  it('мапа є, і в неї по трасі на кут', () => {
    expect(RING_IDX).toBeGreaterThanOrEqual(0);
    expect(ring.roads, 'без roads це звичайна мапа').toHaveLength(2);
    expect(ring.zones).toHaveLength(2);
    expect(ring.fixedOnly).toBe(true);
  });

  it('обидва кути мають маршрут однакової довжини', () => {
    // інакше один гравець мав би довшу дорогу, і порівнювати нема з чим
    const len = ring.roads!.map(r => buildRoute({ road: r } as any).length);
    expect(len[0], `${len[0]} проти ${len[1]}`).toBe(len[1]);
    expect(len[0]).toBeGreaterThan(100);
  });

  it('кути протилежні по діагоналі', () => {
    const [a, b] = ring.roads!.map(r => r[0]);
    expect(a[0] < GW / 2).toBe(true);
    expect(b[0] > GW / 2).toBe(true);
    expect(a[1] < 9).toBe(true);
    expect(b[1] > 9).toBe(true);
  });

  it('крипи виходять по черзі з обох кутів', () => {
    const s: any = new Sim('RING-1', 100, 2, RING_IDX, MODE_FIXED);
    s.apply({ t:'wave', p:0, seq:1 });
    s.apply({ t:'wave', p:1, seq:2 });
    for (let i = 0; i < 400 && s.creeps.length < 6; i++) s.step();
    const used = new Set(s.creeps.map((c: any) => c.rt));
    expect(used.size, 'обидва кути мусять давати крипів').toBe(2);
  });

  it('крипи з обох кутів доходять до центру й забирають спільні життя', () => {
    const s: any = new Sim('RING-2', 100, 2, RING_IDX, MODE_FIXED);
    const lives = s.lives;
    s.apply({ t:'wave', p:0, seq:1 });
    s.apply({ t:'wave', p:1, seq:2 });
    for (let i = 0; i < 40000 && s.lives === lives; i++) s.step();
    expect(s.lives, 'жоден крип не дійшов').toBeLessThan(lives);
  });

  it('гравець не може будувати в чужому куті', () => {
    const s: any = new Sim('RING-3', 100, 2, RING_IDX, MODE_FIXED);
    s.players.forEach((p: any) => (p.gold = 99999));
    const z1 = ring.zones![1];
    // клітина глибоко в куті другого гравця
    let spot: any = null;
    for (let y = z1[1]; y < z1[1] + z1[3] && !spot; y++)
      for (let x = z1[0]; x < z1[0] + z1[2]; x++)
        if (s.buildable(x, y)) { spot = { x, y }; break; }
    expect(spot, 'у другому куті мусить бути де будувати').toBeTruthy();
    s.apply({ t:'build', p:0, seq:1, x:spot.x, y:spot.y, k:'arrow' });
    expect(s.towerAt(spot.x, spot.y), 'чужий кут має бути закритий').toBeNull();
    expect(s.events.some((e: any) => e.e === 'deny' && e.why === 'не твій кут')).toBe(true);
    s.apply({ t:'build', p:1, seq:2, x:spot.x, y:spot.y, k:'arrow' });
    expect(s.towerAt(spot.x, spot.y), 'у своєму куті — можна').toBeTruthy();
  });

  it('у кожному куті вистачає місця під вежі', () => {
    const s: any = new Sim('RING-4', 100, 2, RING_IDX, MODE_FIXED);
    for (let p = 0; p < 2; p++) {
      const z = ring.zones![p];
      let n = 0;
      for (let y = z[1]; y < z[1] + z[3]; y++)
        for (let x = z[0]; x < z[0] + z[2]; x++)
          if (s.buildable(x, y) && s.inZone(p, x, y)) n++;
      expect(n, `кут ${p}: лише ${n} клітин`).toBeGreaterThan(60);
    }
  });

  it('звичайні мапи від зон не постраждали', () => {
    const s: any = new Sim('RING-5', 100, 2, 0, MODE_FIXED);
    expect(s.routes).toHaveLength(1);
    expect(s.inZone(0, 5, 5)).toBe(true);
    expect(s.inZone(1, 5, 5)).toBe(true);
  });
});
