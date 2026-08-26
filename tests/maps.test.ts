/* Цілість мап. Помилку у вейпойнті легко не помітити оком, а коштує вона
   зіпсованої партії: діагональний відрізок або вихід за поле ламають
   маршрут мовчки. */
import { describe, it, expect } from 'vitest';
import { MAPS } from '../src/content/maps';
import { GW, GH, idx, MODE_FIXED } from '../src/sim/constants';
import { buildRoute, buildTerrain } from '../src/sim/pathing';
import { Sim } from '../src/sim/sim';

describe('мапи', () => {
  it('усі вейпойнти на полі', () => {
    for (const m of MAPS)
      for (const [x, y] of m.road)
        expect(x >= 0 && x < GW && y >= 0 && y < GH, `${m.name}: точка ${x},${y}`).toBe(true);
  });

  it('між сусідніми точками — рівний відрізок по одній осі', () => {
    for (const m of MAPS)
      for (let i = 0; i < m.road.length - 1; i++) {
        const [x, y] = m.road[i], [x1, y1] = m.road[i + 1];
        expect((x === x1) !== (y === y1),
          `${m.name}: ${x},${y} → ${x1},${y1} — не по осі`).toBe(true);
      }
  });

  /* Кільцеві мапи міряються окремо. У них не одна траса, а по одній на
     кут, поле road — лише замкнене коло для сумісності, і грають на них
     удвох: довше коло там не піддавка, а інша задача. */
  const plain = MAPS.filter(m => !m.roads);
  const rings = MAPS.filter(m => m.roads);

  it('вхід і вихід на протилежних кінцях маршруту, і він не порожній', () => {
    const each = (name: string, road: any) => {
      const r = buildRoute({ road } as any);
      expect(r.length, name).toBeGreaterThan(40);
      expect(r[0], name).not.toBe(r[r.length - 1]);
    };
    for (const m of plain) each(m.name, m.road);
    for (const m of rings) for (const road of m.roads!) each(m.name, road);
  });

  it('довжина в тій самій смузі, що й у перших трьох', () => {
    // довжина прямо задає, скільки крип під вогнем: мапа вдвічі довша
    // була б просто легкою, а не іншою
    const len = plain.map(m => buildRoute(m).length - 1);
    const lo = Math.min(...len), hi = Math.max(...len);
    expect(hi / lo, plain.map((m, i) => `${m.name} ${len[i]}`).join(', ')).toBeLessThan(1.35);
  });

  it('на кільцевих мапах усі кути мають маршрут однакової довжини', () => {
    // інакше один гравець мав би довшу дорогу, і порівнювати нема з чим
    for (const m of rings) {
      const len = m.roads!.map(r => buildRoute({ road: r } as any).length);
      expect(new Set(len).size, `${m.name}: ${len.join(' проти ')}`).toBe(1);
    }
  });

  it('скелі не з’їдають траси й лишають де будувати', () => {
    for (let i = 0; i < MAPS.length; i++) {
      const m = MAPS[i];
      const t = buildTerrain(m, buildRoute(m));
      let free = 0, road = 0;
      for (let k = 0; k < GW * GH; k++) { if (t[k] === 0) free++; if (t[k] === 2) road++; }
      expect(road, m.name).toBeGreaterThan(40);
      expect(free, `${m.name}: вільних ${free}`).toBeGreaterThan(GW * GH * 0.4);
    }
  });

  it('на кожній мапі партія стартує й крипи доходять до виходу', () => {
    for (let i = 0; i < MAPS.length; i++) {
      const s: any = new Sim('MAP-1', 100, 1, i, MODE_FIXED);
      expect(s.pathLength(), MAPS[i].name).toBeGreaterThan(40);
      // без жодної вежі перша хвиля мусить прорватись — маршрут прохідний
      for (let k = 0; k < 20000 && s.wave < 2; k++) s.step();
      expect(s.lives, `${MAPS[i].name}: крипи не дійшли до виходу`).toBeLessThan(20);
    }
  });

  it('назви й підписи унікальні', () => {
    expect(new Set(MAPS.map(m => m.name)).size).toBe(MAPS.length);
    expect(new Set(MAPS.map(m => m.note)).size).toBe(MAPS.length);
  });
});
