import { describe, it, expect } from 'vitest';
import { Sim } from '../src/sim/sim';
import { MODE_FIXED } from '../src/sim/constants';
import { LOADOUTS, LOADOUT_BY_KEY, FULL_ARSENAL, mergeLoadouts, toolsOf } from '../src/content/loadouts';
import { TIER_WAVE } from '../src/content/types';
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

describe('фракції', () => {
  it('кожна посилається лише на існуючі башти', () => {
    for (const lo of LOADOUTS)
      for (const k of lo.tools)
        expect(TOOL_BY_KEY[k], `${lo.key} → ${k}`).toBeTruthy();
  });

  it('арсенали неперетинні — спільний лише бар\'єр', () => {
    for (const a of LOADOUTS) for (const b of LOADOUTS) {
      if (a === b) continue;
      const shared = a.tools.filter(k => b.tools.includes(k) && k !== 'wall');
      expect(shared, `${a.key} і ${b.key} ділять башти`).toEqual([]);
    }
  });

  it('бар\'єр є в кожній — інакше фракція відбирає режим «Лабіринт»', () => {
    for (const lo of LOADOUTS) expect(lo.tools, lo.key).toContain('wall');
  });

  it('у кожній є дешева рання башта', () => {
    // без неї набір гине на 7-й хвилі незалежно від майстерності:
    // стартових 500 не вистачає, щоб щось поставити до перших хвиль
    for (const lo of LOADOUTS) {
      const cheap = lo.tools.filter(k => TOOL_BY_KEY[k].shot && TOOL_BY_KEY[k].cost <= 65);
      expect(cheap.length, `${lo.key} без дешевої вежі`).toBeGreaterThan(0);
    }
  });

  it('кожна башта реєстру належить рівно одній фракції', () => {
    for (const t of TOOLS) {
      if (t.faction === 'any') continue;
      const owners = LOADOUTS.filter(l => l.tools.includes(t.key));
      expect(owners.length, `${t.key} у ${owners.length} наборах`).toBe(1);
      expect(owners[0].key, `${t.key} позначена як ${t.faction}`).toBe(t.faction);
    }
  });

  it('без фракції не обмежує вибір — але рівні відкриваються все одно', () => {
    // свіжа партія на кожну башту: усі поспіль не влізли б у стартове золото
    for (const t of TOOLS) {
      const sim: any = new Sim('L-1', 100, 1, 0, MODE_FIXED);
      expect(sim.arsenals).toBeNull();
      sim.wave = TIER_WAVE[t.tier];
      expect(tryBuild(sim, 0, t.key), t.key).toBe(true);
    }
  });

  it('фракція дозволяє своє й відмовляє чужому', () => {
    const sim: any = new Sim('L-2', 100, 1, 0, MODE_FIXED, [toolsOf('ice')]);
    expect(tryBuild(sim, 0, 'rime'), 'rime у Криги').toBe(true);
    expect(tryBuild(sim, 0, 'ember'), 'ember не в Кризі').toBe(false);
    const why = sim.events.filter((e: any) => e.e === 'deny').map((e: any) => e.why);
    expect(why).toContain('не у твоїй фракції');
  });

  it('у гравців можуть бути різні фракції на одній дошці', () => {
    const sim: any = new Sim('L-3', 100, 2, 0, MODE_FIXED, [toolsOf('fire'), toolsOf('toxic')]);
    expect(tryBuild(sim, 0, 'ember')).toBe(true);
    expect(tryBuild(sim, 1, 'ember')).toBe(false);
    expect(tryBuild(sim, 1, 'spore')).toBe(true);
    expect(tryBuild(sim, 0, 'spore')).toBe(false);
  });

  it('відмова нічого не коштує гравцю', () => {
    const sim: any = new Sim('L-4', 100, 1, 0, MODE_FIXED, [toolsOf('ice')]);
    const gold = sim.players[0].gold;
    tryBuild(sim, 0, 'rail');
    expect(sim.players[0].gold).toBe(gold);
  });

  it('«стартовий + набутий» — об\'єднання, порядок відкриття не впливає', () => {
    const ab = mergeLoadouts(['ice', 'fire']);
    const ba = mergeLoadouts(['fire', 'ice']);
    expect(ab).toEqual(ba);
    expect(ab).toContain('frost');
    expect(ab).toContain('ember');
    expect(ab.length).toBeLessThanOrEqual(FULL_ARSENAL.length);
  });

  it('об\'єднане набуте дозволяє те, чого не давав стартовий', () => {
    const sim: any = new Sim('L-5', 100, 1, 0, MODE_FIXED, [mergeLoadouts(['ice', 'fire'])]);
    expect(tryBuild(sim, 0, 'rime')).toBe(true);
    expect(tryBuild(sim, 0, 'ember')).toBe(true);
  });

  it('невідомий ключ ігнорується, а не валить гру', () => {
    expect(mergeLoadouts(['ice', 'нема-такого'])).toEqual(mergeLoadouts(['ice']));
    expect(toolsOf('нема-такого')).toEqual(toolsOf('steel'));
  });
});

describe('рівні башт', () => {
  it('будова однакова в кожної фракції: дві базові, одна середня, одна топова', () => {
    for (const lo of LOADOUTS) {
      const own = lo.tools.filter(k => k !== 'wall').map(k => TOOL_BY_KEY[k]);
      const byTier = [1, 2, 3].map(t => own.filter(x => x.tier === t).length);
      expect(byTier, lo.key).toEqual([2, 1, 1]);
    }
  });

  it('однакові рівні коштують співмірно в усіх фракціях', () => {
    // інакше фракції розходяться вже на старті через різний вхід, і жоден
    // баланс пізніх хвиль цього не наздожене
    for (const tier of [1, 2, 3] as const) {
      const costs = LOADOUTS.map(lo =>
        lo.tools.filter(k => k !== 'wall' && TOOL_BY_KEY[k].tier === tier)
                .reduce((a, k) => a + TOOL_BY_KEY[k].cost, 0));
      const min = Math.min(...costs), max = Math.max(...costs);
      expect(max - min, `рівень ${tier}: від ${min} до ${max}`).toBeLessThanOrEqual(50);
    }
  });

  it('на старті доступний лише перший рівень', () => {
    const sim: any = new Sim('T-1', 100, 1, 0, MODE_FIXED);
    expect(sim.tier()).toBe(1);
    expect(tryBuild(sim, 0, 'arrow'), 'базова').toBe(true);
    expect(tryBuild(sim, 0, 'mortar'), 'середня зарано').toBe(false);
    expect(tryBuild(sim, 0, 'rail'), 'топова зарано').toBe(false);
  });

  it('рівні відкриваються з відповідних хвиль', () => {
    const sim: any = new Sim('T-2', 100, 1, 0, MODE_FIXED);
    sim.wave = TIER_WAVE[2];
    expect(sim.tier()).toBe(2);
    expect(tryBuild(sim, 0, 'mortar')).toBe(true);
    expect(tryBuild(sim, 0, 'rail'), 'топова ще зарано').toBe(false);
    sim.wave = TIER_WAVE[3];
    expect(sim.tier()).toBe(3);
    expect(tryBuild(sim, 0, 'rail')).toBe(true);
  });

  it('відмова за рівнем пояснює, з якої хвилі чекати', () => {
    const sim: any = new Sim('T-3', 100, 1, 0, MODE_FIXED);
    tryBuild(sim, 0, 'rail');
    const why = sim.events.filter((e: any) => e.e === 'deny').map((e: any) => e.why);
    expect(why.join(' ')).toContain('з хвилі ' + TIER_WAVE[3]);
  });

  it('рівень залежить лише від хвилі — тож однаковий в усіх без синхронізації', () => {
    const a: any = new Sim('T-4', 100, 1, 0, MODE_FIXED);
    const b: any = new Sim('T-4', 100, 1, 0, MODE_FIXED, [toolsOf('fire')]);
    for (const w of [0, 4, 5, 9, 10, 20]) {
      a.wave = w; b.wave = w;
      expect(a.tier(), 'хвиля ' + w).toBe(b.tier());
    }
  });
});

describe('ефекти пострілу', () => {
  const freshCreep = () => ({ dotD: 0, dotT: 0, dotCd: 0, dotMax: 0, slowP: 0, slowT: 0 });

  /* Доти отрута просто перезаписувалась, тож десять токсинових веж по одній
     цілі давали шкоду однієї — фракція, побудована на отруті, була найгіршою
     саме проти босів, хоч броню ігнорує. */
  it('отрута від різних веж накопичується', () => {
    const sim: any = new Sim('E-1', 100, 1, 0, MODE_FIXED);
    const c: any = freshCreep();
    sim.affect(c, { dot: 10, dotT: 60 });
    sim.affect(c, { dot: 6,  dotT: 60 });
    expect(c.dotD).toBe(16);
  });

  it('накопичення обмежене подвоєним найсильнішим джерелом', () => {
    const sim: any = new Sim('E-2', 100, 1, 0, MODE_FIXED);
    const c: any = freshCreep();
    for (let i = 0; i < 10; i++) sim.affect(c, { dot: 10, dotT: 60 });
    expect(c.dotD).toBe(20);
  });

  it('стеля рахується від найсильнішого — дешевими спорами її не набити', () => {
    const sim: any = new Sim('E-3', 100, 1, 0, MODE_FIXED);
    const weak: any = freshCreep();
    for (let i = 0; i < 20; i++) sim.affect(weak, { dot: 3, dotT: 60 });
    const strong: any = freshCreep();
    sim.affect(strong, { dot: 12, dotT: 60 });
    for (let i = 0; i < 20; i++) sim.affect(strong, { dot: 3, dotT: 60 });
    expect(weak.dotD).toBe(6);
    expect(strong.dotD).toBe(24);
  });

  it('слабке влучання не знижує вже накопичену отруту', () => {
    const sim: any = new Sim('E-4', 100, 1, 0, MODE_FIXED);
    const c: any = freshCreep();
    sim.affect(c, { dot: 24, dotT: 100 });
    const before = c.dotD;
    sim.affect(c, { dot: 3, dotT: 20 });
    expect(c.dotD).toBeGreaterThanOrEqual(before);
    expect(c.dotT).toBe(100);
  });

  it('свіже влучання продовжує дію', () => {
    const sim: any = new Sim('E-5', 100, 1, 0, MODE_FIXED);
    const c: any = freshCreep();
    sim.affect(c, { dot: 10, dotT: 60 });
    c.dotT = 5;                                   // майже вигоріла
    sim.affect(c, { dot: 10, dotT: 60 });
    expect(c.dotT).toBe(60);
  });

  it('сильніше сповільнення не збивається слабшим', () => {
    const sim: any = new Sim('E-3', 100, 1, 0, MODE_FIXED);
    const c: any = freshCreep();
    sim.affect(c, { slow: 45, slowT: 45 });
    sim.affect(c, { slow: 22, slowT: 36 });
    expect(c.slowP).toBe(45);
  });

  it('башта з площею таки накладає свій ефект — раніше мовчки ні', () => {
    const sim: any = new Sim('E-4', 100, 1, 0, MODE_FIXED);
    sim.creeps = [
      { id: 1, x: 100, y: 100, hp: 9999, dotD: 0, dotT: 0, dotCd: 0, dotMax: 0, slowP: 0, slowT: 0, hurt: 0, kind: 0 },
      { id: 2, x: 110, y: 100, hp: 9999, dotD: 0, dotT: 0, dotCd: 0, dotMax: 0, slowP: 0, slowT: 0, hurt: 0, kind: 0 },
    ];
    sim.impact({ x: 105, y: 100, k: 'glacier', splash: 200, dmg: 1, owner: 0, slow: 25, slowT: 40 }, sim.creeps[0]);
    for (const c of sim.creeps) expect(c.slowP, 'крип ' + c.id).toBe(25);
  });
});

describe('броня', () => {
  const hit = (dmg: number, kind: number) => {
    const sim: any = new Sim('A-1', 100, 1, 0, MODE_FIXED);
    const c: any = { kind, hp: 100000, hurt: 0 };
    sim.hurt(c, dmg, 0);
    return 100000 - c.hp;
  };

  it('без броні удар проходить повністю', () => {
    expect(hit(13, 0)).toBe(13);
  });

  it('броня віднімається від удару', () => {
    expect(hit(34, 2), 'броньовані, броня 3').toBe(31);
    expect(hit(34, 3), 'титан, броня 10').toBe(24);
  });

  /* Без цієї межі плоске віднімання карало ЧАСТОТУ, а не силу: башта, що
     б'є вдвічі частіше вдвічі слабшими ударами, має ту саму шкоду за
     секунду, але проти броні втрачала вдвічі більше. Вогнемет (9 за удар)
     проти титана зводився до 1 — тобто до нуля. */
  it('броня не зрізає більш як 60% удару', () => {
    expect(hit(9, 3),  'дрібний удар по титану').toBe(3);   // 9-10 було б 1
    expect(hit(13, 3), 'Іскра по титану').toBe(5);          // 13-10 було б 3
    expect(hit(10, 3), 'Картеч по титану').toBe(4);         // 10-10 було б 1
  });

  it('на важких ударах межа не спрацьовує — там віднімання й так м\'яке', () => {
    expect(hit(110, 3)).toBe(100);      // Рейкотрон: 110-10, а не 66
  });

  it('удар ніколи не падає нижче одиниці', () => {
    expect(hit(1, 3)).toBe(1);
  });
});
