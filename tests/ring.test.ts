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
    expect(ring.roads, 'без roads це звичайна мапа').toHaveLength(4);
    expect(Object.keys(ring.zones!).length, 'розкладка під кожну кількість гравців').toBeGreaterThan(1);
    expect(ring.zones![2]).toHaveLength(2);
    expect(ring.zones![4]).toHaveLength(4);
    expect(ring.fixedOnly).toBe(true);
  });

  it('усі кути мають маршрут однакової довжини', () => {
    // інакше комусь дісталась би довша дорога, і порівнювати нема з чим
    const len = ring.roads!.map(r => buildRoute({ road: r } as any).length);
    expect(new Set(len).size, len.join(' проти ')).toBe(1);
    expect(len[0]).toBeGreaterThan(100);
  });

  it('кути стоять по різних чвертях, а перші двоє — по діагоналі', () => {
    const c = ring.roads!.map(r => r[0]);
    const quad = ([x, y]: number[]) => (x < GW / 2 ? 0 : 1) + (y < 9 ? 0 : 2);
    expect(new Set(c.map(quad)).size, 'кути в одній чверті').toBe(4);
    // удвох задіюються перші два — вони мусять бути навпроти
    expect(quad(c[0]) + quad(c[2]), 'перша пара не по діагоналі').toBe(3);
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
    const z1 = ring.zones![2][1];
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
      const z = ring.zones![2][p];
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

/* ── учотирьох ────────────────────────────────────────────────────────
   Мапа задумана на 2 або 4. Дошка ділиться на чверті, кожен кут шле свою
   хвилю, а життя лишаються спільними — пропустив один, втратили всі. */
describe('Кільце на чотирьох', () => {
  const four = () => new Sim('RING4', 100, 4, RING_IDX, MODE_FIXED) as any;

  it('чверті не перетинаються й покривають усе поле', () => {
    const s = four();
    const seen = new Map<string, number>();
    for (let y = 0; y < 18; y++) for (let x = 0; x < GW; x++) {
      let owners = 0;
      for (let p = 0; p < 4; p++) if (s.inZone(p, x, y)) owners++;
      seen.set(`${x},${y}`, owners);
    }
    const vals = [...seen.values()];
    expect(Math.max(...vals), 'клітина належить двом гравцям').toBe(1);
    expect(Math.min(...vals), 'клітина не належить нікому').toBe(1);
  });

  it('крипи виходять з усіх чотирьох кутів', () => {
    const s = four();
    for (let p = 0; p < 4; p++) s.apply({ t:'wave', p, seq: p + 1 });
    for (let i = 0; i < 600 && s.creeps.length < 10; i++) s.step();
    expect(new Set(s.creeps.map((c: any) => c.rt)).size, 'працюють не всі кути').toBe(4);
  });

  it('хвиля вчетверо більша, ніж на одного', () => {
    // кожен кут шле свою: інакше вчотирьох ставили б учетверо більше веж
    // проти тієї самої купки крипів
    const one: any = new Sim('RING4', 100, 1, RING_IDX, MODE_FIXED);
    const s = four();
    one.startWave(); s.startWave();
    expect(s.queue.length).toBe(one.queue.length * 4);
  });

  it('у кожного є де будувати', () => {
    const s = four();
    for (let p = 0; p < 4; p++) {
      let n = 0;
      for (let y = 0; y < 18; y++) for (let x = 0; x < GW; x++)
        if (s.buildable(x, y) && s.inZone(p, x, y)) n++;
      expect(n, `гравець ${p}: лише ${n} клітин`).toBeGreaterThan(30);
    }
  });

  it('життя спільні: пропущений крип забирає в усіх одразу', () => {
    const s = four();
    const before = s.lives;
    for (let p = 0; p < 4; p++) s.apply({ t:'wave', p, seq: p + 1 });
    for (let i = 0; i < 40000 && s.lives === before; i++) s.step();
    expect(s.lives).toBeLessThan(before);
    expect(s.players.every((p: any) => p.gold >= 0)).toBe(true);
  });
});
