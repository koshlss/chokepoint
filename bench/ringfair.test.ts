/* Де саме ламається симетрія Кільця. Геометрія на вигляд дзеркальна, тож
   міряємо, а не міркуємо: хто кого вбиває, де крипи гинуть, як росте
   золото. */
import { it } from 'vitest';
import { runDuo, mixFor } from '../tests/bot';
import { MAPS } from '../src/content/maps';
import { MODE_FIXED, GW, GH } from '../src/sim/constants';
import { COMBOS, toolsOf } from '../src/content/loadouts';
import { Sim } from '../src/sim/sim';
import { buildRoute } from '../src/sim/pathing';

const RING = MAPS.findIndex(m => m.name === 'Кільце');

it('чи справді траси дзеркальні', () => {
  const [a, b] = MAPS[RING].roads!.map(r => buildRoute({ road: r } as any));
  const rot = (i: number) => (17 - ((i / GW) | 0)) * GW + (25 - (i % GW));
  let same = 0;
  for (let k = 0; k < a.length; k++) if (rot(a[k]) === b[k]) same++;
  console.log(`   довжина ${a.length}/${b.length}, збігів після повороту ${same} з ${a.length}`);
  // скільки кроків кожної траси у верхній половині
  const half = (rt: number[]) => rt.filter(i => ((i / GW) | 0) < 9).length;
  console.log(`   траса 0: вгорі ${half(a)} з ${a.length};  траса 1: вгорі ${half(b)} з ${b.length}`);
});

it('хто кого вбиває', () => {
  const A = COMBOS[0];
  const mix = mixFor(toolsOf(A.primary.key, A.support.key));
  const ars = toolsOf(A.primary.key, A.support.key);
  const r = runDuo(RING, MODE_FIXED, 'FAIR-0', { mixes: [mix, mix], arsenals: [ars, ars], maxWave: 12 });
  console.log(`   хвиля ${r.wave}  веж ${r.towers.join('+')}  вбито ${r.kills.join('/')}  ` +
              `шкода ${r.dmg.join('/')}  золото ${r.gold.join('/')}`);
});

it('де гинуть крипи кожної траси', () => {
  const s: any = new Sim('FAIR-1', 100, 2, RING, MODE_FIXED);
  // однакові вежі дзеркально: по одній у кожній половині, у дзеркальних точках
  s.players.forEach((p: any) => (p.gold = 99999));
  const spots: [number, number][] = [[7,4], [18,13]];
  for (let p = 0; p < 2; p++) {
    const [x, y] = spots[p];
    s.apply({ t:'build', p, seq:p, x, y, k:'arrow' });
  }
  s.towers.forEach((t: any) => (t.build = 0));
  console.log(`   веж поставлено: ${s.towers.length} (${s.towers.map((t: any) => `p${t.owner}@${t.x},${t.y}`).join(' ')})`);
  s.apply({ t:'wave', p:0, seq:9 }); s.apply({ t:'wave', p:1, seq:10 });
  for (let i = 0; i < 40000 && !(s.phase === 0 && s.wave > 0); i++) s.step();
  console.log(`   вбито ${s.players.map((p: any) => p.kills).join('/')}  шкода ${s.players.map((p: any) => p.dmg).join('/')}`);
});
