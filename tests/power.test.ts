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
  BAND, TIER_STEP_MIN,
} from '../src/content/power';

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
