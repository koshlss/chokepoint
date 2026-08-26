/* Скільки крипів НАСПРАВДІ ловить вибух. Модель зараховує площу завжди
   (area = 1 + радіус), але крипи йдуть розтягнуто, і на ранніх хвилях
   вибух часто б'є в одного. Якщо так — вежі, що живуть із площі,
   слабші, ніж модель думає. */
import { it } from 'vitest';
import { runOne, mixFor } from '../tests/bot';
import { Sim } from '../src/sim/sim';
import { TOOL_BY_KEY } from '../src/content/towers';
import { SUB } from '../src/sim/constants';
import { LOADOUTS } from '../src/content/loadouts';

it('скільки цілей ловить один вибух', () => {
  const tally: Record<string, { shots: number; hits: number }> = {};
  const orig = (Sim.prototype as any).impact;
  (Sim.prototype as any).impact = function (s: any, tgt: any) {
    if (s.splash > 0) {
      const r2 = s.splash * s.splash;
      let n = 0;
      for (const c of this.creeps) {
        const dx = c.x - s.x, dy = c.y - s.y;
        if (dx * dx + dy * dy <= r2) n++;
      }
      const t = (tally[s.k] ||= { shots: 0, hits: 0 });
      t.shots++; t.hits += n;
    }
    return orig.call(this, s, tgt);
  };
  for (const lo of LOADOUTS.filter(l => l.role === 'primary'))
    for (let m = 0; m < 3; m++)
      runOne(m, 1, 'CROWD-' + m, { maxWave: 18, mix: mixFor(lo.tools) });
  (Sim.prototype as any).impact = orig;

  const rows = Object.entries(tally).map(([k, v]) => {
    const b = TOOL_BY_KEY[k];
    const model = 1 + b.splash! / SUB;
    return `${b.name.padEnd(11)} радіус ${(b.splash! / SUB).toFixed(2)}  модель ×${model.toFixed(2)}  ` +
           `насправді ×${(v.hits / v.shots).toFixed(2)}  (${v.shots} пострілів)`;
  });
  console.log('\n' + rows.join('\n') + '\n');
});
