import { describe, it, expect } from 'vitest';
import { Sim } from '../src/sim/sim';
import { MODE_FIXED, MODE_MAZE } from '../src/sim/constants';
import { LOADOUTS, LOADOUT_BY_KEY, PRIMARIES, SUPPORTS, COMBOS, PRIMARY_SHAPE, SUPPORT_SHAPE, FULL_ARSENAL, toolsOf } from '../src/content/loadouts';
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

  it('у кожній фракції є дешева стартова башта', () => {
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
    // свіжа партія на кожну башту; золото видаємо, бо топові навмисно
    // дорожчі за стартові 500. Режим беремо той, де башта має сенс:
    // бар'єр існує лише в лабіринті.
    for (const t of TOOLS) {
      const mode = t.mazeOnly ? MODE_MAZE : MODE_FIXED;
      const sim: any = new Sim('L-1', 100, 1, 0, mode);
      expect(sim.arsenals).toBeNull();
      sim.wave = TIER_WAVE[t.tier];
      sim.players[0].gold = 99999;
      expect(tryBuild(sim, 0, t.key), t.key).toBe(true);
    }
  });

  /* Перевірено прогоном: 375 поставлених бар'єрів на фіксованій трасі не
     змінили ні її довжину, ні жодного життя. Чистий злив золота на першому
     ж слоті арсеналу — тож там його не пропонують і не дозволяють. */
  it('бар\'єр не ставиться на фіксованій трасі', () => {
    const sim: any = new Sim('L-6', 100, 1, 0, MODE_FIXED);
    expect(tryBuild(sim, 0, 'wall')).toBe(false);
    const why = sim.events.filter((e: any) => e.e === 'deny').map((e: any) => e.why);
    expect(why).toContain('тільки в лабіринті');
  });

  it('бар\'єр не коштує гравцю нічого, коли відмовлено', () => {
    const sim: any = new Sim('L-7', 100, 1, 0, MODE_FIXED);
    const gold = sim.players[0].gold;
    tryBuild(sim, 0, 'wall');
    expect(sim.players[0].gold).toBe(gold);
  });

  it('у лабіринті бар\'єр працює як і працював', () => {
    const sim: any = new Sim('L-8', 100, 1, 0, MODE_MAZE);
    expect(tryBuild(sim, 0, 'wall')).toBe(true);
  });

  it('комбінація дозволяє своє й відмовляє чужому', () => {
    const sim: any = new Sim('L-2', 100, 1, 0, MODE_FIXED, [toolsOf('steel', 'ice')]);
    expect(tryBuild(sim, 0, 'arrow'), 'arrow зі Сталі').toBe(true);
    expect(tryBuild(sim, 0, 'frost'), 'frost із Криги').toBe(true);
    expect(tryBuild(sim, 0, 'ember'), 'ember із чужої основної').toBe(false);
    expect(tryBuild(sim, 0, 'venom'), 'venom із чужої допоміжної').toBe(false);
    const why = sim.events.filter((e: any) => e.e === 'deny').map((e: any) => e.why);
    expect(why).toContain('не у твоїй фракції');
  });

  it('у гравців можуть бути різні комбінації на одній дошці', () => {
    const sim: any = new Sim('L-3', 100, 2, 0, MODE_FIXED,
                             [toolsOf('fire', 'toxic'), toolsOf('steel', 'ice')]);
    expect(tryBuild(sim, 0, 'ember')).toBe(true);
    expect(tryBuild(sim, 1, 'ember')).toBe(false);
    expect(tryBuild(sim, 1, 'arrow')).toBe(true);
    expect(tryBuild(sim, 0, 'arrow')).toBe(false);
  });

  it('відмова нічого не коштує гравцю', () => {
    const sim: any = new Sim('L-4', 100, 1, 0, MODE_FIXED, [toolsOf('steel', 'ice')]);
    const gold = sim.players[0].gold;
    tryBuild(sim, 0, 'venom');
    expect(sim.players[0].gold).toBe(gold);
  });

  it('порядок вибору не впливає на арсенал', () => {
    expect(toolsOf('steel', 'ice')).toEqual(toolsOf('steel', 'ice'));
    expect(toolsOf('fire', 'toxic').length).toBe(toolsOf('steel', 'ice').length);
  });

  it('усі комбінації дають однакову кількість башт', () => {
    const sizes = COMBOS.map(c => toolsOf(c.primary.key, c.support.key).length);
    expect(new Set(sizes).size, 'розміри: ' + sizes.join(',')).toBe(1);
  });

  it('невідомий чи переплутаний ключ падає на типовий, а не валить гру', () => {
    expect(toolsOf('нема-такого', 'ice')).toEqual(toolsOf('steel', 'ice'));
    // допоміжну не можна підсунути замість основної
    expect(toolsOf('ice', 'ice')).toEqual(toolsOf('steel', 'ice'));
    expect(toolsOf('steel', 'steel')).toEqual(toolsOf('steel', 'ice'));
  });
});

describe('будова «основна + допоміжна»', () => {
  it('рівно дві основні й дві допоміжні', () => {
    expect(PRIMARIES.length).toBe(2);
    expect(SUPPORTS.length).toBe(2);
    expect(COMBOS.length).toBe(4);
  });

  const shapeOf = (lo: any) => {
    const own = lo.tools.map((k: string) => TOOL_BY_KEY[k]).filter((t: any) => t.shot);
    return [1, 2, 3].map(t => own.filter((x: any) => x.tier === t).length);
  };

  it('усі основні мають однакову будову', () => {
    for (const p of PRIMARIES) expect(shapeOf(p), p.key).toEqual(PRIMARY_SHAPE);
  });

  it('усі допоміжні мають однакову будову', () => {
    for (const s of SUPPORTS) expect(shapeOf(s), s.key).toEqual(SUPPORT_SHAPE);
  });

  it('бар\'єр дає основна — допоміжна його не приносить', () => {
    for (const p of PRIMARIES) expect(p.tools, p.key).toContain('wall');
    for (const s of SUPPORTS) expect(s.tools, s.key).not.toContain('wall');
  });

  it('обидві допоміжні сповільнюють, але по-різному', () => {
    const ice = SUPPORTS.find(s => s.key === 'ice')!.tools.map(k => TOOL_BY_KEY[k]);
    const tox = SUPPORTS.find(s => s.key === 'toxic')!.tools.map(k => TOOL_BY_KEY[k]);
    // Крига: коротко й жорстко — є повна заморозка, коротка тривалість
    expect(Math.max(...ice.map(t => t.slow || 0)), 'Крига має повну заморозку').toBe(100);
    // Отрута: довго й м'яко — слабший мороз, зате втричі довший
    const toxSlow = tox.filter(t => t.slow);
    expect(toxSlow.length, 'Отрута теж сповільнює').toBeGreaterThan(0);
    expect(Math.max(...toxSlow.map(t => t.slow!)), 'але не заморожує').toBeLessThan(100);
    expect(Math.max(...toxSlow.map(t => t.slowT!)), 'зате надовго')
      .toBeGreaterThan(Math.max(...ice.map(t => t.slowT || 0)));
  });

  it('лише Отрута б\'є крізь броню', () => {
    const tox = SUPPORTS.find(s => s.key === 'toxic')!.tools.map(k => TOOL_BY_KEY[k]);
    const ice = SUPPORTS.find(s => s.key === 'ice')!.tools.map(k => TOOL_BY_KEY[k]);
    expect(tox.every(t => t.dot), 'кожна вежа Отрути труїть').toBe(true);
    expect(ice.some(t => t.dot), 'Крига не труїть').toBe(false);
  });

  it('арсенал росте однаково в усіх комбінаціях', () => {
    const want = [0, 1, 2].map(i => PRIMARY_SHAPE[i] + SUPPORT_SHAPE[i]);
    for (const c of COMBOS) {
      const own = toolsOf(c.primary.key, c.support.key)
        .map(k => TOOL_BY_KEY[k]).filter(t => t.shot);
      const upTo = (tier: number) => own.filter(t => t.tier <= tier).length;
      expect(upTo(1), c.name + ' на старті').toBe(want[0]);
      expect(upTo(2), c.name + ' після хвилі 5').toBe(want[0] + want[1]);
      expect(upTo(3), c.name + ' після хвилі 12').toBe(want[0] + want[1] + want[2]);
    }
  });

  /* Найдорожча базова навмисно поза межами стартового золота — перші
     хвилі на неї заробляють, і вона працює як ціль, а не як покупка
     з першого кліку. */
  it('найдорожча базова не по кишені на старті', () => {
    for (const c of COMBOS) {
      const base = toolsOf(c.primary.key, c.support.key)
        .map(k => TOOL_BY_KEY[k]).filter(t => t.shot && t.tier === 1);
      const cheapest = Math.min(...base.map(t => t.cost));
      const dearest  = Math.max(...base.map(t => t.cost));
      expect(cheapest, c.name + ': найдешевша має бути одразу доступна').toBeLessThan(120);
      expect(dearest,  c.name + ': найдорожча базова має бути ціллю').toBeGreaterThan(120);
    }
  });

  const dps = (t: any) => t.dmg * 30 / t.cd;
  const armed = (c: any) => toolsOf(c.primary.key, c.support.key)
    .map(k => TOOL_BY_KEY[k]).filter(t => t.shot);

  /* Абсолютна шкода з ОДНІЄЇ башти росте — інакше, коли хороші клітини
     скінчились, додати шкоди нічим. */
  it('кожен наступний рівень б\'є помітно сильніше з однієї башти', () => {
    for (const c of COMBOS) {
      const best = (tier: number) => Math.max(...armed(c).filter(t => t.tier === tier).map(dps));
      expect(best(2), `${c.name}: середні проти базових`).toBeGreaterThan(best(1) * 1.7);
      expect(best(3), `${c.name}: топові проти середніх`).toBeGreaterThan(best(2) * 1.7);
    }
  });

  /* А от віддача на золото має лишатись приблизно рівною. Якби вона
     росла з рівнем, вибір зникав би: нова вежа була б просто краща, і
     гра сама б диктувала, що ставити. Рівна віддача робить рішення
     ситуативним — багато місця й мало золота тягне до дешевих, мало
     місця й багато золота до дорогих. */
  it('віддача на золото не росте з рівнем', () => {
    for (const c of COMBOS) {
      const eff = (tier: number) => {
        const own = armed(c).filter(t => t.tier === tier);
        return own.reduce((a, t) => a + dps(t) / t.cost, 0) / own.length;
      };
      const [e1, e2, e3] = [eff(1), eff(2), eff(3)];
      const label = `${c.name}: ${e1.toFixed(2)} / ${e2.toFixed(2)} / ${e3.toFixed(2)}`;
      expect(e2, label + ' — середні вигідніші за базові').toBeLessThanOrEqual(e1 * 1.15);
      expect(e3, label + ' — топові вигідніші за середні').toBeLessThanOrEqual(e2 * 1.25);
    }
  });
});

describe('рівні башт', () => {
  it('вхідний поріг у всіх комбінацій співмірний', () => {
    // інакше комбінації розходяться вже на старті через різну ціну входу,
    // і жоден баланс пізніх хвиль цього не наздожене
    for (const tier of [1, 2, 3] as const) {
      const costs = COMBOS.map(c =>
        toolsOf(c.primary.key, c.support.key)
          .map(k => TOOL_BY_KEY[k])
          .filter(t => t.shot && t.tier === tier)
          .reduce((a, t) => a + t.cost, 0));
      const min = Math.min(...costs), max = Math.max(...costs);
      expect(max - min, `рівень ${tier}: від ${min} до ${max}`).toBeLessThanOrEqual(60);
    }
  });

  // золото видаємо всюди: середні й топові навмисно дорожчі за стартові 500,
  // і без цього тест міряв би гаманець, а не відкриття рівнів
  const rich = (seed: string) => {
    const sim: any = new Sim(seed, 100, 1, 0, MODE_FIXED);
    sim.players[0].gold = 99999;
    return sim;
  };

  it('на старті доступний лише перший рівень', () => {
    const sim = rich('T-1');
    expect(sim.tier()).toBe(1);
    expect(tryBuild(sim, 0, 'arrow'),  'базова').toBe(true);
    expect(tryBuild(sim, 0, 'lance'),  'середня зарано').toBe(false);
    expect(tryBuild(sim, 0, 'rail'),   'топова зарано').toBe(false);
  });

  it('рівні відкриваються з відповідних хвиль', () => {
    const sim = rich('T-2');
    sim.wave = TIER_WAVE[2];
    expect(sim.tier()).toBe(2);
    expect(tryBuild(sim, 0, 'lance')).toBe(true);
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
    const b: any = new Sim('T-4', 100, 1, 0, MODE_FIXED, [toolsOf('fire', 'toxic')]);
    for (const w of [0, 4, 5, 9, 10, 20]) {
      a.wave = w; b.wave = w;
      expect(a.tier(), 'хвиля ' + w).toBe(b.tier());
    }
  });
});

describe('ефекти пострілу', () => {
  const freshCreep = () => ({ dotD: 0, dotT: 0, dotCd: 0, dotMax: 0, slowP: 0, slowT: 0, slowImm: 0 });

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

  /* Мороз навмисно НЕ поновлюється, поки діє. Інакше частка часу під ним
     залежала від покриття: на трасі, що перетинає себе, вежі дістають до
     крипа безперервно, мороз ніколи не спадає й множить час під вогнем
     усієї армії. Крига давала 22 хвилі на «Вузлі» й 8.7 на «Гребені». */
  it('мороз не поновлюється, поки діє', () => {
    const sim: any = new Sim('E-6', 100, 1, 0, MODE_FIXED);
    const c: any = freshCreep();
    sim.affect(c, { slow: 45, slowT: 30 });
    expect(c.slowP).toBe(45);
    c.slowT = 5;
    sim.affect(c, { slow: 45, slowT: 30 });
    expect(c.slowT, 'тривалість не продовжилась').toBe(5);
  });

  it('після морозу крип якийсь час несприйнятливий', () => {
    const sim: any = new Sim('E-7', 100, 1, 0, MODE_FIXED);
    const c: any = freshCreep();
    c.slowImm = 10;                       // мороз щойно спав
    sim.affect(c, { slow: 45, slowT: 30 });
    expect(c.slowP, 'поки несприйнятливий — не мерзне').toBe(0);
    c.slowImm = 0;
    sim.affect(c, { slow: 45, slowT: 30 });
    expect(c.slowP).toBe(45);
  });

  it('частка часу під морозом не залежить від кількості веж', () => {
    // саме це й відв'язує цінність морозу від щільності траси
    const sim: any = new Sim('E-8', 100, 1, 0, MODE_FIXED);
    const one: any = freshCreep();
    const many: any = freshCreep();
    for (let t = 0; t < 300; t++) {
      sim.affect(one, { slow: 45, slowT: 28 });
      for (let k = 0; k < 8; k++) sim.affect(many, { slow: 45, slowT: 28 });
      for (const c of [one, many]) {
        if (c.slowT > 0) { c.slowT--; if (c.slowT === 0) { c.slowP = 0; c.slowImm = 20; } }
        else if (c.slowImm > 0) c.slowImm--;
        c.ticks = (c.ticks || 0) + (c.slowT > 0 ? 1 : 0);
      }
    }
    expect(many.ticks, 'вісім веж не морозять довше за одну').toBe(one.ticks);
  });

  it('башта з площею таки накладає свій ефект — раніше мовчки ні', () => {
    const sim: any = new Sim('E-4', 100, 1, 0, MODE_FIXED);
    sim.creeps = [
      { id: 1, x: 100, y: 100, hp: 9999, dotD: 0, dotT: 0, dotCd: 0, dotMax: 0, slowP: 0, slowT: 0, slowImm: 0, hurt: 0, kind: 0 },
      { id: 2, x: 110, y: 100, hp: 9999, dotD: 0, dotT: 0, dotCd: 0, dotMax: 0, slowP: 0, slowT: 0, slowImm: 0, hurt: 0, kind: 0 },
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
