import { describe, it, expect } from 'vitest';
import { Sim } from '../src/sim/sim';
import { MODE_FIXED } from '../src/sim/constants';
import { LOADOUTS, LOADOUT_BY_KEY, FULL_ARSENAL, mergeLoadouts } from '../src/content/loadouts';
import { TOOL_BY_KEY, TOOLS } from '../src/content/towers';

/* Координати не можна брати навмання: на «Вузлі» (1,1) — скеля, а частина
   поля зайнята трасою. Тому клітину щоразу шукаємо у самої симуляції. */
function freeCell(sim: any): { x: number; y: number } {
  for (let y = 0; y < 18; y++) for (let x = 0; x < 26; x++)
    if (sim.buildable(x, y)) return { x, y };
  throw new Error('на мапі не лишилось вільних клітин');
}

/** Ставить башту у вільну клітину й каже, чи вона з'явилась. */
function tryBuild(sim: any, p: number, k: string) {
  const { x, y } = freeCell(sim);
  const before = sim.towers.length;
  sim.apply({ t: 'build', p, seq: 0, x, y, k });
  return sim.towers.length > before;
}

describe('набори арсеналу', () => {
  it('кожен набір посилається лише на існуючі башти', () => {
    for (const lo of LOADOUTS)
      for (const k of lo.tools)
        expect(TOOL_BY_KEY[k], `набір «${lo.key}» → «${k}»`).toBeTruthy();
  });

  it('бар\'єр є в кожному наборі — інакше набір відбирає режим «Лабіринт»', () => {
    for (const lo of LOADOUTS) expect(lo.tools, lo.key).toContain('wall');
  });

  it('набори справді різні, а не переіменована класика', () => {
    const sets = LOADOUTS.map(l => [...l.tools].sort().join(','));
    expect(new Set(sets).size).toBe(LOADOUTS.length);
  });

  it('без наборів дозволено все — як до їх появи', () => {
    // свіжа партія на кожну башту: шість поспіль не влізли б у стартове золото
    for (const t of TOOLS) {
      const sim: any = new Sim('L-1', 100, 1, 0, MODE_FIXED);
      expect(sim.arsenals).toBeNull();
      expect(tryBuild(sim, 0, t.key), t.key).toBe(true);
    }
  });

  it('набір дозволяє своє й відмовляє чужому', () => {
    const control = LOADOUT_BY_KEY['control'];
    const sim: any = new Sim('L-2', 100, 1, 0, MODE_FIXED, [control.tools]);

    expect(tryBuild(sim, 0, 'frost'), 'frost у «Контролі»').toBe(true);
    expect(tryBuild(sim, 0, 'rail'),  'rail не в «Контролі»').toBe(false);

    const why = sim.events.filter((e: any) => e.e === 'deny').map((e: any) => e.why);
    expect(why).toContain('не в наборі');
  });

  it('у гравців можуть бути різні набори на одній дошці', () => {
    const a = LOADOUT_BY_KEY['classic'].tools;   // має rail, не має frost
    const b = LOADOUT_BY_KEY['control'].tools;   // має frost, не має rail
    const sim: any = new Sim('L-3', 100, 2, 0, MODE_FIXED, [a, b]);

    expect(tryBuild(sim, 0, 'rail')).toBe(true);
    expect(tryBuild(sim, 1, 'rail')).toBe(false);
    expect(tryBuild(sim, 1, 'frost')).toBe(true);
    expect(tryBuild(sim, 0, 'frost')).toBe(false);
  });

  it('відмова нічого не коштує гравцю', () => {
    const sim: any = new Sim('L-4', 100, 1, 0, MODE_FIXED, [LOADOUT_BY_KEY['control'].tools]);
    const gold = sim.players[0].gold;
    tryBuild(sim, 0, 'rail');
    expect(sim.players[0].gold).toBe(gold);
  });

  it('«стартовий + набутий» — це об\'єднання, і порядок відкриття не впливає', () => {
    const ab = mergeLoadouts(['classic', 'control']);
    const ba = mergeLoadouts(['control', 'classic']);
    expect(ab).toEqual(ba);
    expect(ab).toContain('rail');    // з класики
    expect(ab).toContain('frost');   // з контролю
    expect(ab.length).toBeLessThanOrEqual(FULL_ARSENAL.length);
  });

  it('об\'єднане набуте дозволяє те, чого не давав стартовий', () => {
    const merged = mergeLoadouts(['control', 'classic']);
    const sim: any = new Sim('L-5', 100, 1, 0, MODE_FIXED, [merged]);
    expect(tryBuild(sim, 0, 'rail')).toBe(true);
    expect(tryBuild(sim, 0, 'frost')).toBe(true);
  });

  it('невідомий ключ набору просто ігнорується, а не валить гру', () => {
    expect(mergeLoadouts(['classic', 'нема-такого'])).toEqual(mergeLoadouts(['classic']));
  });
});
