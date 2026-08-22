/* ────────────────────────────────────────────────────────────────────
   Стенд для прогону балансу. Сим-ядро сюди вклеюється з index.html
   механічно, тому тестується справжній код гри, а не його переказ.

   Гравець-бот навмисно посередній: він жадібно ставить башти там, де
   під радіус потрапляє найбільше клітин шляху, і не хитрує. Якщо
   баланс тримається на віртуозній грі — бот це покаже провалом.
   ──────────────────────────────────────────────────────────────────── */

function pathTiles(sim) {
  if (sim.mode === MODE_FIXED) {
    const seen = new Set(), out = [];
    for (const i of sim.route) if (!seen.has(i)) { seen.add(i); out.push(i); }
    return out;
  }
  const out = [];
  let x = sim.sx, y = sim.sy, guard = 0;
  out.push(idx(x, y));
  while (!(x === sim.gx && y === sim.gy) && guard++ < GW * GH) {
    const n = sim.stepTile(x, y, sim.flow);
    if (n < 0) break;
    x = n % GW; y = (n / GW) | 0;
    out.push(idx(x, y));
  }
  return out;
}

function cover(sim, x, y, tool, path) {
  const r2 = tool.range * tool.range;
  const cx = x * SUB + (SUB >> 1), cy = y * SUB + (SUB >> 1);
  let s = 0;
  for (let k = 0; k < path.length; k++) {
    const p = path[k];
    const dx = (p % GW) * SUB + (SUB >> 1) - cx;
    const dy = ((p / GW) | 0) * SUB + (SUB >> 1) - cy;
    if (dx * dx + dy * dy <= r2) s++;
  }
  return s;
}

/* Фіксований режим: просто максимум покриття.
   Лабіринт: ще й подовження шляху — інакше бот не мазить і це не перевірка
   режиму, а перевірка невміння. Довжину рахуємо пробним перекриттям
   клітини й перерахунком поля в чернетку. */
function bestSpot(sim, tool, path, scratch) {
  let best = -1, bestScore = 0;

  if (sim.mode === MODE_FIXED) {
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
      if (!sim.buildable(x, y)) continue;
      const s = cover(sim, x, y, tool, path);
      if (s > bestScore) { bestScore = s; best = idx(x, y); }
    }
    return best;
  }

  const near = new Set();
  for (const p of path) {
    const px = p % GW, py = (p / GW) | 0;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const x = px + dx, y = py + dy;
      if (x >= 0 && y >= 0 && x < GW && y < GH) near.add(idx(x, y));
    }
  }
  const base = sim.pathLength();
  for (const i of near) {
    const x = i % GW, y = (i / GW) | 0;
    if (!sim.buildable(x, y)) continue;
    sim.blocked[i] = 1;
    const f = sim.recomputeFlow(scratch);
    const len = f[idx(sim.sx, sim.sy)];
    sim.blocked[i] = 0;
    if (len < 0) continue;                       // повністю перекрив
    const s = (len - base) * 5 + cover(sim, x, y, tool, path);
    if (s > bestScore) { bestScore = s; best = i; }
  }
  return best;
}

// Склад армії: переважно дешеві стрільці, з домішкою решти.
const MIX = ['arrow','arrow','arrow','mortar','arrow','frost','arrow','mortar','rail','venom'];
function pickTool(n) { return TOOL_BY_KEY[MIX[n % MIX.length]]; }

function runOne(mapIdx, mode, seed, maxWave) {
  const sim = new Sim(seed, 100, 1, mapIdx, mode);
  const scratch = new Int32Array(GW * GH);
  let placed = 0, spentTotal = 0;
  const leaksByWave = {};
  let lastLives = sim.lives;

  for (let t = 0; t < 90000 && !sim.over && sim.wave <= maxWave; t++) {
    // будуємо тільки в паузі, як живий гравець
    if (sim.phase === 0 && (t % 12 === 0)) {
      const path = pathTiles(sim);

      /* Кожна третя дія — прокачка найкраще розташованої вежі. Так стенд
         перевіряє обидва шляхи росту, вгору і вшир. */
      let didUp = false;
      if (placed > 0 && placed % 3 === 0) {
        let bt = null, bs = -1;
        for (const t of sim.towers) {
          if (t.lvl >= MAX_LVL || !t.st.cd) continue;
          const c = sim.upgradeCost(t);
          if (c < 0 || sim.players[0].gold < c) continue;
          const s = cover(sim, t.x, t.y, TOOL_BY_KEY[t.k], path);
          if (s > bs) { bs = s; bt = t; }
        }
        if (bt) {
          const c = sim.upgradeCost(bt);
          sim.apply({ t:'up', p:0, seq:0, x:bt.x, y:bt.y });
          spentTotal += c; placed++; didUp = true;
        }
      }

      if (!didUp) {
        const tool = pickTool(placed);
        if (sim.players[0].gold >= tool.cost) {
          const spot = bestSpot(sim, tool, path, scratch);
          if (spot >= 0) {
            const before = sim.towers.length;
            sim.apply({ t:'build', p:0, seq:0, x:spot % GW, y:(spot / GW) | 0, k:tool.key });
            if (sim.towers.length > before) { spentTotal += tool.cost; placed++; }
          }
        }
      }
    }
    sim.step(null);
    if (sim.lives < lastLives) {
      leaksByWave[sim.wave] = (leaksByWave[sim.wave] || 0) + (lastLives - sim.lives);
      lastLives = sim.lives;
    }
  }
  return {
    map: mapIdx, mode, seed,
    wave: sim.over ? sim.wave : Math.min(sim.wave, maxWave),
    died: sim.over,
    lives: sim.lives,
    towers: sim.towers.length,
    path: sim.pathLength(),
    gold: sim.players[0].gold,
    spent: spentTotal,
    leaks: leaksByWave,
    ticks: sim.tick,
  };
}

(function main() {
  const q = new URLSearchParams(location.search);
  const mapIdx  = parseInt(q.get('map') || '0', 10);
  const mode    = parseInt(q.get('mode') || '1', 10);
  const runs    = parseInt(q.get('runs') || '10', 10);
  const maxWave = parseInt(q.get('max') || '22', 10);
  // ручки балансу можна крутити з командного рядка, не чіпаючи гру
  // ?maze= задає загальне значення й знімає перекриття мап; ?m0= — лише мапі 0
  if (q.get('maze')) {
    BALANCE.mazeCoverage = parseInt(q.get('maze'), 10);
    for (const m of MAPS) delete m.mazeCov;
  }
  if (q.get('m0')) MAPS[0].mazeCov = parseInt(q.get('m0'), 10);
  if (q.get('covtop')) BALANCE.covTop = parseInt(q.get('covtop'), 10);
  if (q.get('refcov')) BALANCE.refCoverage = parseInt(q.get('refcov'), 10);
  if (q.get('boss')) {                       // відсоток від здоров'я босів
    const p = parseInt(q.get('boss'), 10);
    for (const w of WAVES) if (w.kind === 3) w.hp = ((w.hp * p) / 100) | 0;
  }
  const out = [];
  for (let i = 0; i < runs; i++) out.push(runOne(mapIdx, mode, 'BENCH-' + i, maxWave));
  const pre = document.createElement('pre');
  pre.id = 'out';
  pre.textContent = JSON.stringify(out);
  document.body.appendChild(pre);
})();
