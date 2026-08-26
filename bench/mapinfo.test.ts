import { it } from 'vitest';
import { MAPS } from '../src/content/maps';
import { buildRoute, buildTerrain } from '../src/sim/pathing';
import { GW, GH, idx } from '../src/sim/constants';
it('що це за мапи', () => {
  const rows = MAPS.map(m => {
    const r = buildRoute(m), t = buildTerrain(m, r);
    const seen = new Set(r), cross = r.length - seen.size;
    let free = 0, near = 0;
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
      if (t[idx(x, y)] !== 0) continue;
      free++;
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < GW && ny < GH && t[idx(nx, ny)] === 2) { near++; break; }
      }
    }
    return `${m.name.padEnd(9)} довжина ${String(r.length - 1).padStart(3)}  перехресть ${String(cross).padStart(2)}` +
           `  вільних ${String(free).padStart(3)}  біля траси ${String(near).padStart(3)}`;
  });
  console.log('\n' + rows.join('\n') + '\n');
});
