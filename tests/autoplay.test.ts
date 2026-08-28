/* Бот заповнює вільне місце в партії.

   Головна вимога до нього не «добре грає», а ДЕТЕРМІНОВАНИЙ: його команди
   — чиста функція від стану симуляції, тож кожен клієнт рахує їх сам і
   мережею вони не йдуть. Якщо це зламається, дошки розійдуться мовчки. */
import { describe, it, expect } from 'vitest';
import { Sim } from '../src/sim/sim';
import { MODE_FIXED, TPS } from '../src/sim/constants';
import { MAPS } from '../src/content/maps';
import { botCommands } from '../src/sim/autoplay';
import { toolsOf } from '../src/content/loadouts';

const RING = MAPS.findIndex(m => m.name === 'Кільце');

/** Партія, де всі гравці — боти. */
function run(n: number, mapIdx: number, ticks: number, seed = 'BOT-1') {
  const ars = Array.from({ length: n }, (_, i) =>
    toolsOf(i % 2 ? 'fire' : 'steel', i % 4 < 2 ? 'ice' : 'toxic'));
  const s: any = new Sim(seed, 100, n, mapIdx, MODE_FIXED, ars);
  for (let t = 0; t < ticks && !s.over; t++) {
    const cmds: any[] = [];
    for (let p = 0; p < n; p++) cmds.push(...botCommands(s, p));
    s.step(cmds.length ? cmds : null);
  }
  return s;
}

describe('бот', () => {
  it('будує, качає й доживає до пізніх хвиль', () => {
    const s = run(1, 0, 400 * TPS);
    expect(s.towers.length, 'нічого не збудував').toBeGreaterThan(12);
    expect(s.towers.some((t: any) => t.lvl > 1), 'нічого не прокачав').toBe(true);
    expect(s.wave, `дійшов лише до хвилі ${s.wave}`).toBeGreaterThan(6);
  });

  it('однаковий стан дає однакові команди — інакше дошки розійдуться', () => {
    const a = run(2, RING, 40 * TPS, 'DET-1');
    const b = run(2, RING, 40 * TPS, 'DET-1');
    expect(a.hash()).toBe(b.hash());
    // і поточні рішення теж збігаються
    expect(JSON.stringify(botCommands(a, 0))).toBe(JSON.stringify(botCommands(b, 0)));
  });

  it('не лізе в чужу половину', () => {
    const s = run(2, RING, 200 * TPS, 'ZONE-1');
    for (const t of s.towers) expect(s.inZone(t.owner, t.x, t.y), `вежа ${t.owner} поза своїм`).toBe(true);
    expect(s.towers.filter((t: any) => t.owner === 0).length).toBeGreaterThan(3);
    expect(s.towers.filter((t: any) => t.owner === 1).length).toBeGreaterThan(3);
  });

  it('голосує за хвилю — інакше прискорення з ботами не працює', () => {
    const s: any = new Sim('VOTE-1', 100, 2, 0, MODE_FIXED);
    let voted = false;
    for (let t = 0; t < 60 * TPS && !voted; t++) {
      const c = botCommands(s, 1);
      if (c.some((x: any) => x.t === 'wave')) voted = true;
      s.step(c.length ? c : null);
    }
    expect(voted, 'бот жодного разу не погодився на хвилю').toBe(true);
  });

  it('четверо ботів на Кільці грають, і кожен має свої вежі', () => {
    const s = run(4, RING, 240 * TPS, 'FOUR-1');
    for (let p = 0; p < 4; p++)
      expect(s.towers.filter((t: any) => t.owner === p).length, `гравець ${p} без веж`).toBeGreaterThan(4);
    expect(s.wave).toBeGreaterThan(2);
  });

  it('рішення коштують недорого — вони рахуються щокадру в браузері', () => {
    const s = run(4, RING, 30 * TPS, 'PERF-1');
    const t0 = Date.now();
    for (let i = 0; i < 400; i++) for (let p = 0; p < 4; p++) botCommands(s, p);
    const ms = Date.now() - t0;
    expect(ms, `${ms} мс на 1600 викликів`).toBeLessThan(2500);
  });
});
