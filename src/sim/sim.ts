import { TPS, SUB, GW, GH, idx, MODE_MAZE, MODE_FIXED } from './constants';
import { BALANCE } from './balance';
import { isqrt, seedFrom } from './math';
import { buildRoute, buildTerrain } from './pathing';
import { MAPS } from '../content/maps';
import { TOOL_BY_KEY, UPG, MAX_LVL, AIMS } from '../content/towers';
import { ARMOR, waveSpec } from '../content/waves';

class Sim {
  arsenals: Set<string>[] | null;
  blocked: any;
  cov: any;
  creeps: any;
  diff: any;
  events: any;
  flow: any;
  frozen: any;
  gx: any;
  gy: any;
  lives: any;
  map: any;
  mapIdx: any;
  mode: any;
  nPlayers: any;
  nextCreepId: any;
  over: any;
  phase: any;
  players: any;
  prep: any;
  queue: any;
  rng: any;
  route: any;
  seedStr: any;
  shots: any;
  spawnCd: any;
  spawnGap: any;
  spec: any;
  sx: any;
  sy: any;
  terrain: any;
  tick: any;
  toSpawn: any;
  towers: any;
  wave: any;
  waveVotes: any;
  won: any;

  /* arsenals — по набору дозволених башт на гравця. Не входить у hash():
     це статична умова партії, а не стан. Якщо сторони розійшлися в
     наборах, перший же збудований непарний ключ розведе дошки, і звірка
     хешів це впіймає сама — окремого поля для цього не треба. */
  constructor(seedStr, diff, nPlayers, mapIdx, mode, arsenals?: string[][]) {
    this.seedStr = seedStr;
    this.diff    = diff | 0;
    this.nPlayers = nPlayers || 1;
    this.arsenals = (arsenals && arsenals.length)
      ? arsenals.map(a => new Set(a))
      : null;                                  // null — повний арсенал, як було
    this.mapIdx  = mapIdx | 0;
    this.mode    = mode | 0;
    this.map     = MAPS[this.mapIdx] || MAPS[0];
    this.route   = buildRoute(this.map);
    this.terrain = buildTerrain(this.map, this.route);
    const s = this.route[0], g = this.route[this.route.length - 1];
    this.sx = s % GW; this.sy = (s / GW) | 0;
    this.gx = g % GW; this.gy = (g / GW) | 0;
    this.rng     = seedFrom(seedStr);
    this.tick    = 0;
    this.lives   = BALANCE.lives;
    this.over    = false;
    this.won     = false;
    this.frozen  = false;   // пауза живе всередині симуляції, тому будувати можна

    this.players = [];
    for (let i = 0; i < this.nPlayers; i++) this.players.push({ id:i, gold:BALANCE.startGold, dmg:0, kills:0 });

    this.blocked = new Uint8Array(GW * GH);
    this.flow    = new Int32Array(GW * GH);
    this.towers  = [];
    this.creeps  = [];
    this.shots   = [];
    this.events  = [];       // споживається рендером, чиститься щотіка

    this.nextCreepId = 1;
    this.wave        = 0;
    this.phase       = 0;    // 0 = підготовка, 1 = хвиля йде
    this.prep        = TPS * BALANCE.prepFirst;
    this.waveVotes   = new Set();  // хто вже готовий прискорити поточну підготовку
    this.queue       = [];
    this.toSpawn     = 0;
    this.spawnGap    = 0;
    this.spawnCd     = 0;
    this.spec        = null;

    this.recomputeFlow();
    this.cov = this.mode === MODE_FIXED
      ? this.coverageIndex()
      : (this.map.mazeCov || BALANCE.mazeCoverage);
  }

  /* Скільки кроків траси накриває кулак з 60 найкращих місць. Крок, а не
     клітина: перехрестя проходять двічі, тож і рахується двічі. */
  coverageIndex() {
    const R = TOOL_BY_KEY.mortar.range, R2 = R * R;
    const scores = [];
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
      if (!this.buildable(x, y)) continue;
      const cx = x * SUB + (SUB >> 1), cy = y * SUB + (SUB >> 1);
      let s = 0;
      for (let k = 0; k < this.route.length; k++) {
        const p = this.route[k];
        const dx = (p % GW) * SUB + (SUB >> 1) - cx;
        const dy = ((p / GW) | 0) * SUB + (SUB >> 1) - cy;
        if (dx * dx + dy * dy <= R2) s++;
      }
      if (s > 0) scores.push(s);
    }
    scores.sort((a, b) => b - a);
    let sum = 0;
    for (let i = 0; i < BALANCE.covTop && i < scores.length; i++) sum += scores[i];
    return sum || 1;
  }

  /* ── PRNG: mulberry32 на цілих ── */
  rand() {
    this.rng = (this.rng + 0x6D2B79F5) | 0;
    let t = this.rng;
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (t ^ (t >>> 14)) >>> 0;
  }
  randMod(m) { return this.rand() % m; }

  /* У режимі фіксованого шляху прохідна лише дорога, і башти на неї не
     впливають узагалі — саме тому маршрут неможливо змінити. */
  passable(i) {
    if (this.mode === MODE_FIXED) return this.terrain[i] === 2;
    return this.terrain[i] !== 1 && !this.blocked[i];
  }

  /* ── потокове поле: BFS від виходу ── */
  recomputeFlow(into?: Int32Array) {
    const f = into || this.flow;
    f.fill(-1);
    const q = new Int32Array(GW * GH);
    let head = 0, tail = 0;
    const g = idx(this.gx, this.gy);
    f[g] = 0; q[tail++] = g;
    while (head < tail) {
      const i = q[head++], d = f[i];
      const x = i % GW, y = (i / GW) | 0;
      if (x + 1 < GW) { const n = i + 1;  if (f[n] === -1 && this.passable(n)) { f[n] = d + 1; q[tail++] = n; } }
      if (x - 1 >= 0) { const n = i - 1;  if (f[n] === -1 && this.passable(n)) { f[n] = d + 1; q[tail++] = n; } }
      if (y + 1 < GH) { const n = i + GW; if (f[n] === -1 && this.passable(n)) { f[n] = d + 1; q[tail++] = n; } }
      if (y - 1 >= 0) { const n = i - GW; if (f[n] === -1 && this.passable(n)) { f[n] = d + 1; q[tail++] = n; } }
    }
    return f;
  }

  /* Наступна клітина зі сталим порядком обходу — це і робить шлях
     однаковим на всіх машинах. */
  stepTile(x, y, f) {
    const here = f[idx(x, y)];
    if (here <= 0) return -1;
    let best = -1, bestD = here;
    if (x + 1 < GW) { const n = idx(x + 1, y); if (f[n] >= 0 && f[n] < bestD) { bestD = f[n]; best = n; } }
    if (y + 1 < GH) { const n = idx(x, y + 1); if (f[n] >= 0 && f[n] < bestD) { bestD = f[n]; best = n; } }
    if (x - 1 >= 0) { const n = idx(x - 1, y); if (f[n] >= 0 && f[n] < bestD) { bestD = f[n]; best = n; } }
    if (y - 1 >= 0) { const n = idx(x, y - 1); if (f[n] >= 0 && f[n] < bestD) { bestD = f[n]; best = n; } }
    return best;
  }

  pathLength() {
    if (this.mode === MODE_FIXED) return this.route.length - 1;
    const s = this.flow[idx(this.sx, this.sy)];
    return s < 0 ? 0 : s;
  }

  /* Що буде наступної хвилі — щоб було чим готуватись, а не дізнаватись
     про броню тоді, коли вона вже пішла. */
  nextInfo() {
    const s = waveSpec(this.wave + 1);
    return { kind:s.kind, n:s.n + (s.esc ? s.esc.n : 0), boss:!!s.esc };
  }

  /* Наскільки крип близько до виходу; менше — ближче. У фіксованому
     режимі це залишок маршруту, бо на перехресті відстань по полю
     збрехала б. */
  progress(c) {
    if (this.mode === MODE_FIXED) return this.route.length - 1 - c.ri;
    const d = this.flow[idx(c.tx, c.ty)];
    return d < 0 ? (1 << 29) : d;
  }

  /* Характеристики рахуємо раз — при будівництві й прокачці. */
  recalcTower(t) {
    const b = TOOL_BY_KEY[t.k], u = UPG[t.lvl];
    t.st = {
      cd:     b.cd,
      dmg:    ((b.dmg * u.dmg) / 100) | 0,
      range:  ((b.range * u.range) / 100) | 0,
      shot:   b.shot,
      splash: b.splash ? ((b.splash * u.range) / 100) | 0 : 0,
      slow:   b.slow ? Math.min(70, b.slow + (t.lvl - 1) * 6) : 0,
      slowT:  b.slowT | 0,
      dot:    b.dot ? ((b.dot * u.dmg) / 100) | 0 : 0,
      dotT:   b.dotT | 0,
    };
  }
  upgradeCost(t) {
    if (t.lvl >= MAX_LVL) return -1;
    return ((TOOL_BY_KEY[t.k].cost * UPG[t.lvl + 1].pct) / 100) | 0;
  }
  /* Усе вкладене до межі хвилі вертається повністю, старіше — на 70%.
     Прокачка рахується так само, як і сама будівля. */
  refund(t) {
    const old = t.spent - t.freshSpent;
    return t.freshSpent + (((old * 70) / 100) | 0);
  }
  towerAt(x, y) { return this.towers.find(t => t.x === x && t.y === y) || null; }

  /* Чи дозволяє набір цього гравця ставити таку башту. Без наборів
     (arsenals === null) дозволено все — рівно як до їх появи. */
  allows(p: number, key: string): boolean {
    if (!this.arsenals) return true;
    const a = this.arsenals[p] || this.arsenals[0];
    return a ? a.has(key) : true;
  }

  buildable(x, y) {
    if (x < 0 || y < 0 || x >= GW || y >= GH) return false;
    const i = idx(x, y);
    if (this.terrain[i] === 1) return false;                             // скеля
    if (this.mode === MODE_FIXED && this.terrain[i] === 2) return false; // дорога
    if (x === this.sx && y === this.sy) return false;
    if (x === this.gx && y === this.gy) return false;
    return this.blocked[i] === 0;
  }

  /* ── команди ─────────────────────────────────────────────────────────
     Єдина точка входу для дій гравця. Для мережевої гри сюди приходять
     чужі команди — більше нічого міняти не треба. */
  apply(cmd) {
    const p = this.players[cmd.p];
    if (!p || this.over) return;

    if (cmd.t === 'build') {
      const tool = TOOL_BY_KEY[cmd.k];
      if (!tool || !this.buildable(cmd.x, cmd.y)) { this.events.push({ e:'deny', p:cmd.p, why:'зайнято' }); return; }
      if (!this.allows(cmd.p, cmd.k)) { this.events.push({ e:'deny', p:cmd.p, why:'не в наборі' }); return; }
      if (p.gold < tool.cost) { this.events.push({ e:'deny', p:cmd.p, why:'мало золота' }); return; }

      const i = idx(cmd.x, cmd.y);
      this.blocked[i] = 1;
      if (this.mode === MODE_MAZE) {          // у фіксованому режимі шлях не рухається
        const test = this.recomputeFlow(new Int32Array(GW * GH));
        let ok = test[idx(this.sx, this.sy)] >= 0;
        if (ok) for (const c of this.creeps) { if (test[idx(c.ntx, c.nty)] < 0) { ok = false; break; } }
        if (!ok) { this.blocked[i] = 0; this.events.push({ e:'deny', p:cmd.p, why:'прохід закрито' }); return; }
        this.flow.set(test);
      }
      p.gold -= tool.cost;
      // freshSpent — вкладене після останньої межі хвилі: вертається повністю
      const nt = { x:cmd.x, y:cmd.y, k:tool.key, cd:0, owner:cmd.p, ax:1, ay:0,
                   lvl:1, spent:tool.cost, freshSpent:tool.cost, aim:0 };
      this.recalcTower(nt);
      this.towers.push(nt);
      this.events.push({ e:'build', p:cmd.p, x:cmd.x, y:cmd.y, k:tool.key, cost:tool.cost });
      this.retargetAll();

    } else if (cmd.t === 'raze') {
      const n = this.towers.findIndex(t => t.x === cmd.x && t.y === cmd.y);
      if (n < 0) return;
      const t = this.towers[n];
      this.towers.splice(n, 1);
      this.blocked[idx(cmd.x, cmd.y)] = 0;
      if (this.mode === MODE_MAZE) this.recomputeFlow();
      const back = this.refund(t);
      this.players[t.owner].gold += back;      // гроші вертаються власнику, не тому, хто зніс
      this.events.push({ e:'raze', p:cmd.p, x:cmd.x, y:cmd.y, gold:back, full:t.freshSpent >= t.spent });
      this.retargetAll();

    } else if (cmd.t === 'up') {
      const t = this.towerAt(cmd.x, cmd.y);
      if (!t) return;
      if (t.lvl >= MAX_LVL) { this.events.push({ e:'deny', p:cmd.p, why:'вже максимум' }); return; }
      const cost = this.upgradeCost(t);
      if (p.gold < cost) { this.events.push({ e:'deny', p:cmd.p, why:'мало золота' }); return; }
      p.gold -= cost;
      t.lvl++; t.spent += cost; t.freshSpent += cost;
      this.recalcTower(t);
      this.events.push({ e:'up', p:cmd.p, x:cmd.x, y:cmd.y, lvl:t.lvl });

    } else if (cmd.t === 'aim') {
      const t = this.towerAt(cmd.x, cmd.y);
      if (!t || !t.st.cd) return;                 // бар'єр не цілиться
      t.aim = (t.aim + 1) % AIMS.length;
      this.events.push({ e:'aim', p:cmd.p, x:cmd.x, y:cmd.y, m:t.aim });

    } else if (cmd.t === 'freeze') {
      this.frozen = !!cmd.v;
      this.events.push({ e:'freeze', p:cmd.p, v:this.frozen });

    } else if (cmd.t === 'wave') {
      /* Прискорення — рішення всієї партії, не одного гравця: спільна
         підготовка, спільний вихід із неї. Голос рахується, коли всі
         nPlayers проголосували; сольно чи в дуелі (nPlayers завжди 1
         на дошку) голос спрацьовує миттєво — нема з ким узгоджувати. */
      if (this.phase === 0 && this.wave < 999) {
        this.waveVotes.add(cmd.p);
        this.events.push({ e:'vote', p:cmd.p, n:this.waveVotes.size, of:this.nPlayers });
        if (this.waveVotes.size >= this.nPlayers) {
          const bonus = ((this.prep / TPS) | 0) * 3;
          for (const pl of this.players) pl.gold += bonus;   // ділиться на всіх, а не лише ініціатору
          this.prep = 0;
          if (bonus > 0) this.events.push({ e:'early', gold:bonus });
        }
      }
    }
  }

  /* Після зміни лабіринту крипи мають переобрати наступну клітину,
     інакше пішли б у щойно поставлену башту. */
  retargetAll() {
    if (this.mode === MODE_FIXED) return;      // маршрут не залежить від забудови
    for (const c of this.creeps) {
      const n = this.stepTile(c.tx, c.ty, this.flow);
      if (n >= 0) { c.ntx = n % GW; c.nty = (n / GW) | 0; }
    }
  }

  startWave() {
    for (const t of this.towers) t.freshSpent = 0;  // межа хвилі знімає повне повернення
    this.wave++;
    const s = waveSpec(this.wave);
    this.spec  = s;
    this.queue = [];
    for (let i = 0; i < s.n; i++) this.queue.push(s);
    // бос іде не сам: інакше вся хвиля — одна ціль, і мортира марна
    if (s.esc) for (let i = 0; i < s.esc.n; i++) this.queue.push(s.esc);
    this.toSpawn  = this.queue.length;
    this.spawnGap = this.queue.length > 4 ? 14 : 40;
    this.spawnCd  = 0;
    this.phase    = 1;
    this.events.push({ e:'wave', n:this.wave, kind:s.kind, esc:!!s.esc });
  }

  spawnOne() {
    const s = this.queue.shift();
    if (!s) return;
    /* Здоров'я масштабується покриттям мапи, золото — НІ. Якби масштабувались
       обидва, слабша мапа давала б і менше веж, і виграшу не було б. */
    const hp   = (((((s.hp * this.diff) / 100) | 0) * this.cov) / BALANCE.refCoverage) | 0;
    const gold = (((s.gold * BALANCE.killCut) / 100) | 0) || 1;
    const c = {
      id: this.nextCreepId++, ri: 0,
      tx: this.sx, ty: this.sy, ntx: this.sx, nty: this.sy,
      x: this.sx * SUB + (SUB >> 1), y: this.sy * SUB + (SUB >> 1),
      px: this.sx * SUB + (SUB >> 1), py: this.sy * SUB + (SUB >> 1),
      hp, maxHp: hp, sp: s.sp, kind: s.kind, gold,
      slowT: 0, slowP: 0, dotT: 0, dotD: 0, dotCd: 0, hurt: 0,
    };
    this.creeps.push(c);
    const n = this.mode === MODE_FIXED
      ? (this.route.length > 1 ? this.route[1] : -1)
      : this.stepTile(this.sx, this.sy, this.flow);
    if (n >= 0) { c.ntx = n % GW; c.nty = (n / GW) | 0; }
  }

  /* ── один тік ────────────────────────────────────────────────────── */
  step(cmds) {
    this.events.length = 0;
    if (this.over) { this.tick++; return; }

    if (cmds) for (const c of cmds) this.apply(c);

    // На паузі команди вже застосовано, а світ не рухається.
    if (this.frozen) { this.tick++; return; }

    // фаза хвилі
    if (this.phase === 0) {
      if (--this.prep <= 0) this.startWave();
    } else {
      if (this.toSpawn > 0) {
        if (--this.spawnCd <= 0) { this.spawnOne(); this.toSpawn--; this.spawnCd = this.spawnGap; }
      } else if (this.creeps.length === 0) {
        const bonus = BALANCE.waveBonus(this.wave);
        for (const p of this.players) p.gold += bonus;   // премія кожному
        this.events.push({ e:'clear', n:this.wave, gold:bonus });
        for (const t of this.towers) t.freshSpent = 0;
        this.phase = 0;
        this.prep  = TPS * BALANCE.prepAfter;
        this.waveVotes.clear();
      }
    }

    this.moveCreeps();
    this.fireTowers();
    this.moveShots();

    if (this.lives <= 0) { this.over = true; this.events.push({ e:'lost' }); }
    this.tick++;
  }

  moveCreeps() {
    const keep = [];
    for (const c of this.creeps) {
      c.px = c.x; c.py = c.y;
      if (c.hurt > 0) c.hurt--;

      // отрута
      if (c.dotT > 0) {
        c.dotT--;
        if (--c.dotCd <= 0) { c.dotCd = 15; c.hp -= c.dotD; }
      }
      if (c.hp <= 0) { this.kill(c, -1); continue; }

      // сповільнення
      let sp = c.sp;
      if (c.slowT > 0) { c.slowT--; sp = ((sp * (100 - c.slowP)) / 100) | 0; if (sp < 1) sp = 1; }

      // рух по осях — ціль завжди ортогональний сусід
      let budget = sp, arrived = false;
      for (let guard = 0; guard < 6 && budget > 0; guard++) {
        const cx = c.ntx * SUB + (SUB >> 1), cy = c.nty * SUB + (SUB >> 1);
        const dx = cx - c.x, dy = cy - c.y;
        if (dx === 0 && dy === 0) {
          c.tx = c.ntx; c.ty = c.nty;
          if (this.mode === MODE_FIXED) {
            c.ri++;                                       // крок уперед по маршруту
            if (c.ri >= this.route.length - 1) { arrived = true; break; }
            const n = this.route[c.ri + 1];
            c.ntx = n % GW; c.nty = (n / GW) | 0;
            continue;
          }
          if (c.tx === this.gx && c.ty === this.gy) { arrived = true; break; }
          const n = this.stepTile(c.tx, c.ty, this.flow);
          if (n < 0) break;                       // шляху нема — стоїмо
          c.ntx = n % GW; c.nty = (n / GW) | 0;
          continue;
        }
        if (dx !== 0) {
          const s = dx > 0 ? 1 : -1, m = Math.abs(dx) < budget ? Math.abs(dx) : budget;
          c.x += s * m; budget -= m;
        } else {
          const s = dy > 0 ? 1 : -1, m = Math.abs(dy) < budget ? Math.abs(dy) : budget;
          c.y += s * m; budget -= m;
        }
      }

      if (arrived) {
        const dmg = c.kind === 3 ? 5 : 1;
        this.lives -= dmg;
        this.events.push({ e:'leak', dmg, x:c.x, y:c.y });
        continue;
      }
      keep.push(c);
    }
    this.creeps = keep;
  }

  kill(c, owner) {
    let g = c.gold;
    if (this.randMod(100) < BALANCE.bountyPct) { g *= 2; this.events.push({ e:'bounty', x:c.x, y:c.y, gold:g }); }
    const pl = this.players[owner >= 0 ? owner : 0];
    pl.gold += g; pl.kills++;
    this.events.push({ e:'kill', p:owner, x:c.x, y:c.y, gold:g });
  }

  /* Ціль — той крип, що найближче до виходу. Дистанція береться з
     потокового поля, тож вибір однаковий у всіх клієнтів. */
  pickTarget(t) {
    const cx = t.x * SUB + (SUB >> 1), cy = t.y * SUB + (SUB >> 1);
    const r2 = t.st.range * t.st.range;
    let best = null, bestK = 0;
    for (const c of this.creeps) {
      const dx = c.x - cx, dy = c.y - cy;
      if (dx * dx + dy * dy > r2) continue;
      let k;
      if (t.aim === 1) k = -this.progress(c);        // останній
      else if (t.aim === 2) k = -c.hp;               // найміцніший
      else if (t.aim === 3) k = c.hp;                // найслабший
      else k = this.progress(c);                     // перший до виходу
      if (!best || k < bestK || (k === bestK && c.id < best.id)) { bestK = k; best = c; }
    }
    return best;
  }

  fireTowers() {
    for (const t of this.towers) {
      const st = t.st;
      if (st.cd === 0) continue;
      if (t.cd > 0) { t.cd--; continue; }
      const tgt = this.pickTarget(t);
      if (!tgt) continue;
      t.cd = st.cd;
      const cx = t.x * SUB + (SUB >> 1), cy = t.y * SUB + (SUB >> 1);
      t.ax = tgt.x - cx; t.ay = tgt.y - cy;      // напрям ствола цілими; кут рахує рендер
      this.shots.push({
        x:cx, y:cy, px:cx, py:cy, tid:tgt.id, k:t.k, owner:t.owner,
        dmg:st.dmg, sp:st.shot, splash:st.splash,
        slow:st.slow, slowT:st.slowT, dot:st.dot, dotT:st.dotT,
      });
    }
  }

  moveShots() {
    const keep = [];
    for (const s of this.shots) {
      s.px = s.x; s.py = s.y;
      const tgt = this.creeps.find(c => c.id === s.tid);
      if (!tgt) continue;                       // ціль зникла — набій згасає
      const dx = tgt.x - s.x, dy = tgt.y - s.y;
      const d = isqrt(dx * dx + dy * dy);
      if (d <= s.sp || d === 0) { this.impact(s, tgt); continue; }
      s.x += ((dx * s.sp) / d) | 0;
      s.y += ((dy * s.sp) / d) | 0;
      keep.push(s);
    }
    this.shots = keep;
  }

  hurt(c, dmg, owner) {
    const a = ARMOR[c.kind];
    let d = dmg - a;
    if (d < 1) d = 1;
    c.hp -= d;
    c.hurt = 3;
    const pl = this.players[owner >= 0 ? owner : 0];
    if (pl) pl.dmg += d;   // для панелі гравців — реально завдана шкода, після броні
    if (c.hp <= 0) {
      const n = this.creeps.indexOf(c);
      if (n >= 0) this.creeps.splice(n, 1);
      this.kill(c, owner);
    }
  }

  impact(s, tgt) {
    this.events.push({ e:'hit', x:s.x, y:s.y, k:s.k });
    if (s.splash > 0) {
      const r2 = s.splash * s.splash;
      const hitList = [];
      for (const c of this.creeps) {
        const dx = c.x - s.x, dy = c.y - s.y;
        if (dx * dx + dy * dy <= r2) hitList.push(c);
      }
      hitList.sort((a, b) => a.id - b.id);       // сталий порядок = сталий результат
      for (const c of hitList) this.hurt(c, s.dmg, s.owner);
      this.events.push({ e:'boom', x:s.x, y:s.y, r:s.splash });
    } else {
      if (s.slow > 0) { tgt.slowP = s.slow; tgt.slowT = s.slowT; }
      if (s.dot > 0)  { tgt.dotD = s.dot; tgt.dotT = s.dotT; if (tgt.dotCd <= 0) tgt.dotCd = 15; }
      this.hurt(tgt, s.dmg, s.owner);
    }
  }

  /* ── хеш стану: єдине число, яким клієнти звіряються ── */
  hash() {
    let h = 0x811c9dc5;
    const mix = v => { h ^= (v | 0); h = Math.imul(h, 0x01000193); };
    // мапа й режим — теж у хеш: інакше розбіжність налаштувань лишалась би
    // непоміченою, поки не з'являться перші крипи
    mix(this.mapIdx); mix(this.mode); mix(this.diff); mix(this.cov);
    mix(this.tick); mix(this.lives); mix(this.wave); mix(this.rng); mix(this.waveVotes.size);
    for (const p of this.players) { mix(p.gold); mix(p.dmg); mix(p.kills); }
    for (const t of this.towers) { mix(t.x); mix(t.y); mix(t.cd); mix(t.lvl); mix(t.aim); mix(t.k.charCodeAt(0)); }
    for (const c of this.creeps) { mix(c.id); mix(c.x); mix(c.y); mix(c.hp); mix(c.slowT); }
    for (const s of this.shots)  { mix(s.x); mix(s.y); mix(s.tid); }
    return (h >>> 0).toString(16).padStart(8, '0');
  }
}

export { Sim };
