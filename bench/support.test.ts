/* Чи купує добра гра допоміжні вежі взагалі. Якщо ні — вибір допоміжної
   фракції нічого не означає, і «основна + допоміжна» насправді
   «основна + декорація». */
import { it } from 'vitest';
import { MODE_FIXED } from '../src/sim/constants';
import { COMBOS, toolsOf, LOADOUT_BY_KEY } from '../src/content/loadouts';
import { TOOL_BY_KEY } from '../src/content/towers';
import { MAPS } from '../src/content/maps';
import { runSmart } from '../tests/smart';

it('чи потрібні допоміжні вежі', () => {
  const rows: string[] = ['Частка ЗОЛОТА, вкладеного в допоміжні вежі (добра гра)', ''];
  for (const c of COMBOS) {
    const tools = toolsOf(c.primary.key, c.support.key);
    const supKeys = new Set(LOADOUT_BY_KEY[c.support.key].tools);
    for (let map = 0; map < MAPS.length; map++) {
      let sup = 0, all = 0, supTowers = 0, allTowers = 0;
      for (let i = 0; i < 5; i++) {
        const r: any = runSmart(map, MODE_FIXED, 'BENCH-' + i, { maxWave: 40, tools });
        for (const [label, n] of Object.entries(r.composition) as [string, number][]) {
          const name = label.replace(/ lvl\d$/, '');
          const t = Object.values(TOOL_BY_KEY).find(x => x.name === name)!;
          const lvl = +label.slice(-1);
          const spent = t.cost * (lvl === 1 ? 1 : lvl === 2 ? 1.9 : 3.6) * n;
          all += spent; allTowers += n;
          if (supKeys.has(t.key)) { sup += spent; supTowers += n; }
        }
      }
      rows.push(`  ${c.name.padEnd(17)} ${MAPS[map].name.padEnd(9)} ` +
        `${Math.round(sup * 100 / all).toString().padStart(3)}% золота, ` +
        `${supTowers}/${allTowers} веж`);
    }
    rows.push('');
  }
  console.log('\n' + rows.join('\n'));
}, 900000);
