/* Правила балансу як тести.

   Це і є та величина, за якою балансується контент: нова вежа має влучити
   в смугу, і про це скаже цей файл за секунду — замість півдня прогонів.
   Прогін (bench/) лишається для перевірки самої МОДЕЛІ, а не кожної правки.

   Модель і обґрунтування — src/content/power.ts. Кожне правило тут — не
   смак, а висновок із виміряного; що саме ламалось без нього, написано
   в коментарі до правила. */
import { describe, it, expect } from 'vitest';
import { TOOLS, TOOL_BY_KEY, UPG, MAX_LVL } from '../src/content/towers';
import { LOADOUTS, PRIMARIES, SUPPORTS } from '../src/content/loadouts';
import {
  power, efficiency, efficiencyAt, controlPerGold, buildTicks,
  BAND, TIER_STEP_MIN, supportValue,
} from '../src/content/power';
import {
  treeOf, isSimple, choicesAt, statsFor, allPaths, perkCode, PERK_KEYS,
} from '../src/content/upgrades';

const armed = (lo: any) => lo.tools.map((k: string) => TOOL_BY_KEY[k]).filter((t: any) => t.shot);

describe('правило 1 · рівна віддача всередині рівня', () => {
  /* Замір показав розкид 0.28–0.53 серед базових Сталі, і Мортиру (0.28)
     не будували НІКОЛИ — на всіх дошках був самий Стріломет. Коли одна
     вежа рівня вдвічі вигідніша, вибору немає, є арифметика. */
  it('кожна бойова вежа лежить у смузі', () => {
    for (const lo of PRIMARIES)
      for (const t of armed(lo)) {
        const e = efficiency(t);
        expect(e, `${t.name}: ${e.toFixed(2)}`).toBeGreaterThanOrEqual(BAND.damage.min);
        expect(e, `${t.name}: ${e.toFixed(2)}`).toBeLessThanOrEqual(BAND.damage.max);
      }
  });

  it('усередині одного рівня розкид не більш як третина', () => {
    for (const lo of PRIMARIES)
      for (const tier of [1, 2, 3]) {
        const own = armed(lo).filter((t: any) => t.tier === tier);
        if (own.length < 2) continue;
        const es = own.map(efficiency);
        const spread = Math.max(...es) / Math.min(...es);
        expect(spread, `${lo.key} рівень ${tier}: ${es.map(e => e.toFixed(2)).join(' / ')}`)
          .toBeLessThanOrEqual(1.34);
      }
  });
});

describe('правило 2 · сила росте з рівнем', () => {
  /* Клітини вздовж траси скінченні. Коли вони заповнені, додати шкоди
     можна лише сильнішою вежею на тій самій клітині. */
  it('найсильніша вежа кожного рівня помітно сильніша за попередній', () => {
    for (const lo of PRIMARIES) {
      const best = (tier: number) =>
        Math.max(...armed(lo).filter((t: any) => t.tier === tier).map((t: any) => power(t)));
      expect(best(2) / best(1), `${lo.key}: рівень 2 проти 1`).toBeGreaterThanOrEqual(TIER_STEP_MIN);
      expect(best(3) / best(2), `${lo.key}: рівень 3 проти 2`).toBeGreaterThanOrEqual(TIER_STEP_MIN);
    }
  });
});

describe('правило 3 · прокачка не вигідніша за нову вежу', () => {
  /* Саме через це всі чотири комбінації грались однаково: прокачка давала
     +110% шкоди за 90% ціни, тобто була вигідніша за нову вежу І не
     займала клітину. Виграшна стратегія завжди виходила одна — заставити
     хороші клітини найдешевшою й вкачати. */
  it('додаткова шкода коштує не менше, ніж дає', () => {
    for (const lvl of [2, 3]) {
      const gain = UPG[lvl]!.dmg - UPG[lvl - 1]!.dmg;
      expect(gain / UPG[lvl]!.pct, `рівень ${lvl}: +${gain}% за ${UPG[lvl]!.pct}%`)
        .toBeLessThanOrEqual(1.0);
    }
  });

  it('віддача вежі не росте від прокачки', () => {
    for (const t of TOOLS) {
      if (!t.shot) continue;
      for (let lvl = 2; lvl <= MAX_LVL; lvl++)
        expect(efficiencyAt(t, lvl), `${t.name} рівень ${lvl}`)
          .toBeLessThanOrEqual(efficiencyAt(t, lvl - 1) * 1.02);
    }
  });
});

describe('допоміжні продають множник, а не шкоду', () => {
  /* Кріостат колись мав 0.50 проти 0.49 у Стрілометі — допоміжна вежа
     виявилась кращою бойовою, ніж бойові, і добра гра будувала 56 штук. */
  it('власна шкода допоміжних помітно нижча за бойові', () => {
    for (const lo of SUPPORTS)
      for (const t of armed(lo)) {
        const e = efficiency(t);
        expect(e, `${t.name}: ${e.toFixed(2)}`).toBeLessThanOrEqual(BAND.supportDamageMax);
      }
  });

  it('найдешевші допоміжні дають співмірний контроль', () => {
    // порівнюємо саме стартові: далі ціна росте швидше за контроль, і це
    // нормально — трасу достатньо позначити один раз
    const first = SUPPORTS.map(lo => {
      const own = armed(lo).filter((t: any) => t.tier === 1);
      return { key: lo.key, v: Math.max(...own.map(controlPerGold)) };
    });
    const vs = first.map(f => f.v);
    expect(Math.max(...vs) / Math.min(...vs),
      first.map(f => `${f.key} ${f.v.toFixed(2)}`).join(' проти ')).toBeLessThanOrEqual(2.0);
  });
});

describe('час будівництва', () => {
  it('росте з ціною — тобто з вигодою від вежі', () => {
    const sorted = [...TOOLS].filter(t => t.shot).sort((a, b) => a.cost - b.cost);
    for (let i = 1; i < sorted.length; i++)
      expect(buildTicks(sorted[i].cost)).toBeGreaterThanOrEqual(buildTicks(sorted[i - 1].cost));
  });

  it('навіть найдорожча будується швидше за паузу між хвилями', () => {
    // інакше важку вежу не поставити взагалі — це був би не вибір, а заборона
    const worst = Math.max(...TOOLS.filter(t => t.shot).map(t => buildTicks(t.cost)));
    expect(worst, `${worst} тіків`).toBeLessThan(18 * 30);
  });

  it('найдешевша ставиться швидко, але не миттєво', () => {
    const best = Math.min(...TOOLS.filter(t => t.shot).map(t => buildTicks(t.cost)));
    expect(best).toBeGreaterThan(5);
    expect(best).toBeLessThan(45);
  });
});

/* ── ПРАВИЛО 4 · гілка перерозподіляє силу, а не додає ────────────────
   Прокачка тепер не «те саме, але більше», а вибір характеру. Щойно одна
   гілка з пари стає просто сильнішою за іншу, вибору знову немає — і
   повертається рівно та вада, через яку колись переробляли ціни.

   Основні міряються силою, допоміжні — впливом: Кріостат навмисно
   віддає шкоду за холод, і рахувати йому шкоду означало б назвати вадою
   те, що є задумом. */
describe('правило 4 · гілки прокачки', () => {
  const isSupport = (b: any) => b.faction === 'ice' || b.faction === 'toxic';
  const worth = (b: any, s: any) =>
    isSupport(b) ? supportValue({ ...b, ...s }) : power({ ...b, ...s });
  const branched = TOOLS.filter(t => treeOf(t));
  /* Смуга ширша за смугу веж навмисно: вплив допоміжної — це добуток
     кількох множників із різною основою в кожної вежі, тож той самий
     відсоток важить для Кріостата й Розлому по-різному. Головне, чого
     тут не можна, — щоб гілка була просто вигіднішою. */
  const TOL = 0.10;

  it('кожна вежа має дерево, крім бар\'єра', () => {
    expect(branched.length).toBe(TOOLS.filter(t => t.shot).length);
    expect(treeOf(TOOL_BY_KEY.wall)).toBeNull();
  });

  it('прості вежі не питають на другому рівні, зате питають на третьому', () => {
    const simple = TOOLS.filter(t => t.shot && isSimple(t));
    expect(simple.length, simple.map(t => t.name).join(', ')).toBeGreaterThan(0);
    for (const t of simple) {
      expect(choicesAt(t, 2, []), t.name).toHaveLength(0);
      expect(choicesAt(t, 3, ['']), t.name).toHaveLength(2);
    }
  });

  it('звичайні питають на обох рівнях, і другий вибір залежить від першого', () => {
    for (const t of branched.filter(x => !isSimple(x))) {
      const first = choicesAt(t, 2, []);
      expect(first, t.name).toHaveLength(2);
      const a = choicesAt(t, 3, [first[0].key]).map(p => p.key);
      const b = choicesAt(t, 3, [first[1].key]).map(p => p.key);
      expect(a, t.name).toHaveLength(2);
      expect(b, t.name).toHaveLength(2);
      expect(a.join(), `${t.name}: обидві гілки ведуть до того самого`).not.toBe(b.join());
    }
  });

  it('жодна гілка не сильніша за свою пару більш ніж на смугу', () => {
    for (const b of branched) {
      const tree = treeOf(b)!;
      const lvl = isSimple(b) ? 3 : 2;
      const base = isSimple(b) ? [''] : [];
      const ref = worth(b, statsFor(b, UPG[lvl]!, lvl, base));
      for (const p of tree.main) {
        const r = worth(b, statsFor(b, UPG[lvl]!, lvl, [...base, p.key])) / ref;
        expect(r, `${b.name} · ${p.name} ×${r.toFixed(3)}`).toBeGreaterThan(1 - TOL);
        expect(r, `${b.name} · ${p.name} ×${r.toFixed(3)}`).toBeLessThan(1 + TOL);
      }
      if (isSimple(b)) continue;
      for (const a of tree.main) {
        const r0 = worth(b, statsFor(b, UPG[3]!, 3, [a.key]));
        for (const p of tree.then[a.key] || []) {
          const r = worth(b, statsFor(b, UPG[3]!, 3, [a.key, p.key])) / r0;
          expect(r, `${b.name} · ${a.name}→${p.name} ×${r.toFixed(3)}`).toBeGreaterThan(1 - TOL);
          expect(r, `${b.name} · ${a.name}→${p.name} ×${r.toFixed(3)}`).toBeLessThan(1 + TOL);
        }
      }
    }
  });

  it('найкращий шлях не робить прокачку вигіднішою за прокачку без вибору', () => {
    // інакше гілки перестають бути вибором характеру й стають надбавкою
    for (const b of branched) {
      const plain = worth(b, statsFor(b, UPG[3]!, 3, []));
      const hi = Math.max(...allPaths(b).map(p => worth(b, statsFor(b, UPG[3]!, 3, p))));
      expect(hi / plain, `${b.name} ×${(hi / plain).toFixed(3)}`).toBeLessThan(1 + TOL);
    }
  });

  it('кожен ключ гілки має свій номер для хеша', () => {
    const seen = new Set<number>();
    for (const k of PERK_KEYS) {
      const c = perkCode(k);
      expect(c, k).toBeGreaterThan(0);
      expect(seen.has(c), `номер ${c} повторюється на ${k}`).toBe(false);
      seen.add(c);
    }
    expect(perkCode('')).toBe(0);   // «вибору не було» — теж значення
  });
});
