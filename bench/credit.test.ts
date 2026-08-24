import { describe, it, expect } from 'vitest';
import { Sim } from '../src/sim/sim';
import { MODE_FIXED, GW } from '../src/sim/constants';

/* Кому дістаються вбивства й шкода, коли двоє грають на спільній дошці.
   Вежі ставимо впритул до траси — інакше вони просто не стріляють, і
   стенд міряв би не облік, а власну невдалу розстановку. */
function play(toolsA: string[], toolsB: string[]) {
  const sim: any = new Sim('CRED-1', 100, 2, 0, MODE_FIXED);
  sim.players.forEach((p: any) => (p.gold = 1000000));

  const road = new Set<number>(sim.route);
  const near: number[] = [];
  for (let y = 0; y < 20; y++)
    for (let x = 0; x < GW; x++) {
      if (!sim.buildable(x, y)) continue;
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]])
        if (road.has((y + dy) * GW + (x + dx))) { near.push(y * GW + x); break; }
    }

  let seq = 0, built = 0;
  for (const i of near) {
    const p = built % 2;
    const list = p === 0 ? toolsA : toolsB;
    if (!list.length) { built++; continue; }
    sim.apply({ t:'build', p, seq: seq++, x: i % GW, y: (i / GW) | 0, k: list[(built >> 1) % list.length] });
    built++;
  }
  sim.towers.forEach((t: any) => (t.build = 0));   // не чекаємо будівництва
  for (let i = 0; i < 200000 && !sim.over && sim.wave < 12; i++) sim.step();
  return sim;
}

const owned = (sim: any, p: number) => sim.towers.filter((t: any) => t.owner === p).length;

describe('облік вбивств і шкоди між гравцями', () => {
  it('однаковий арсенал у двох — обидва мають і вбивства, і шкоду', () => {
    const sim = play(['arrow', 'mortar'], ['arrow', 'mortar']);
    const [a, b] = sim.players;
    console.log(`   сталь/сталь  веж ${owned(sim,0)}/${owned(sim,1)}  вбито ${a.kills}/${b.kills}  шкода ${a.dmg}/${b.dmg}  хвиля ${sim.wave}`);
    expect(a.kills).toBeGreaterThan(0);
    expect(b.kills).toBeGreaterThan(0);
  });

  it('шкода від отрути рахується її власнику, а не гравцю 0', () => {
    const sim = play(['arrow'], ['venom', 'mire']);
    const [a, b] = sim.players;
    console.log(`   сталь(0)/отрута(1)  веж ${owned(sim,0)}/${owned(sim,1)}  вбито ${a.kills}/${b.kills}  шкода ${a.dmg}/${b.dmg}`);
    expect(b.dmg, 'отрута гравця 1 мусить рахуватись йому').toBeGreaterThan(0);
  });

  it('вбивства від яду не падають гравцю 0 задарма', () => {
    const sim = play([], ['venom', 'mire']);
    const [a, b] = sim.players;
    console.log(`   нічого(0)/отрута(1)  веж ${owned(sim,0)}/${owned(sim,1)}  вбито ${a.kills}/${b.kills}  шкода ${a.dmg}/${b.dmg}`);
    expect(a.kills, 'гравець без веж не має отримувати вбивств').toBe(0);
  });
});

/* Дуель: дошки окремі, але хвилі мають починатись одночасно. */
describe('дуель тримає хвилі в один такт', () => {
  const mk = (tools: string[], cap: number) => {
    const s: any = new Sim('DUEL-1', 100, 1, 0, MODE_FIXED);
    s.players[0].gold = 1000000;
    const road = new Set<number>(s.route);
    let seq = 0, n = 0;
    for (let y = 0; y < 20 && n < cap; y++)
      for (let x = 0; x < GW && n < cap; x++) {
        if (!s.buildable(x, y)) continue;
        let near = false;
        for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]])
          if (road.has((y + dy) * GW + (x + dx))) near = true;
        if (!near) continue;
        s.apply({ t:'build', p:0, seq: seq++, x, y, k: tools[n % tools.length] });
        n++;
      }
    s.towers.forEach((t: any) => (t.build = 0));
    return s;
  };

  /* Обидві дошки виживають, але в однієї втричі більше веж, тож вона
     чистить хвилю помітно швидше — саме той випадок, у якому раніше й
     був відрив. Різниця саме в кількості, а не в рівні: топові вежі на
     перших хвилях ще закриті, і дошка з ними просто не збудувалась би. */
  const run = (hold: boolean) => {
    const fast = mk(['arrow', 'mortar'], 60);
    const slow = mk(['arrow', 'mortar'], 20);
    for (let i = 0; i < 400000 && !fast.over && !slow.over && fast.wave < 10 && slow.wave < 10; i++) {
      if (hold) {
        fast.holdPrep = !slow.over && slow.phase === 1;
        slow.holdPrep = !fast.over && fast.phase === 1;
      }
      fast.step(); slow.step();
    }
    return { fast: fast.wave, slow: slow.wave, lives: [fast.lives, slow.lives] };
  };

  it('без синхронізації швидша дошка справді відривається', () => {
    const r = run(false);
    console.log(`   без синхронізації: хвиля ${r.fast} проти ${r.slow}, життя ${r.lives.join('/')}`);
    expect(r.fast, 'інакше перевірка нижче нічого не доводила б').toBeGreaterThan(r.slow);
  });

  it('із синхронізацією обидві дошки йдуть однією хвилею', () => {
    const r = run(true);
    console.log(`   із синхронізацією: хвиля ${r.fast} проти ${r.slow}, життя ${r.lives.join('/')}`);
    expect(r.fast).toBe(r.slow);
  });
});
