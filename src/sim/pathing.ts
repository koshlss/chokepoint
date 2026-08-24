import { GW, GH, idx } from './constants';

/* Впорядкована послідовність клітин від входу до виходу. Клітина
   перехрестя з'являється в ній двічі — саме так і має бути. */
function buildRoute(map) {
  const r = [];
  for (let i = 0; i < map.road.length - 1; i++) {
    let x = map.road[i][0], y = map.road[i][1];
    const x1 = map.road[i + 1][0], y1 = map.road[i + 1][1];
    const dx = Math.sign(x1 - x), dy = Math.sign(y1 - y);
    if (i === 0) r.push(idx(x, y));
    while (x !== x1 || y !== y1) { x += dx; y += dy; r.push(idx(x, y)); }
  }
  return r;
}

// 0 — вільно, 1 — скеля, 2 — траса
function buildTerrain(map, route) {
  const t = new Uint8Array(GW * GH);
  for (const r of map.rocks)
    for (let y = r[1]; y < r[1] + r[3]; y++)
      for (let x = r[0]; x < r[0] + r[2]; x++)
        if (x >= 0 && y >= 0 && x < GW && y < GH) t[idx(x, y)] = 1;
  for (const i of route) t[i] = 2;      // траса перекриває скелі
  return t;
}


export { buildRoute, buildTerrain };
