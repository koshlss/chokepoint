import { TPS, SUB, GW, GH, idx, MODE_MAZE, MODE_FIXED } from './constants';
import { BALANCE } from './balance';
import { isqrt, seedFrom } from './math';
import { buildRoute, buildRoutes, buildTerrain } from './pathing';
import { MAPS } from '../content/maps';
import { TOOL_BY_KEY, UPG, MAX_LVL, AIMS } from '../content/towers';
import { ARMOR, waveSpec } from '../content/waves';
import { tierAt, TIER_WAVE } from '../content/types';
import { buildTicks } from '../content/power';
import { choicesAt, statsFor, perkCode } from '../content/upgrades';

/* Скільки тіків крип не піддається морозу після того, як попередній спав.
   Разом зі slowT задає СТАЛУ частку часу під уповільненням — саме це й
   відв'язує цінність морозу від щільності траси. */
const SLOW_IMMUNE = 20;

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
  routes: any;
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
  holdPrep: boolean;
  holdLeft: any;
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
    /* Маршрутів може бути кілька — по одному на кут гравця (Кільце).
       route лишається першим із них: за ним міряються довжина й покриття,
       а на звичайних мапах він і є єдиним. */
    this.routes  = buildRoutes(this.map);
    this.route   = this.routes[0];
    this.terrain = buildTerrain(this.map, this.routes);
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
    this.holdPrep    = false;      // дуель: не відлічувати підготовку, поки напарник у бою
    this.holdLeft    = TPS * BALANCE.holdMax;   // і не довше, ніж це
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
      if (!this.buildable(x, y) || !this.inAnyZone(x, y)) continue;
      const cx = x * SUB + (SUB >> 1), cy = y * SUB + (SUB >> 1);
      let s = 0;
      for (const rt of this.routes) for (let k = 0; k < rt.length; k++) {
        const p = rt[k];
        const dx = (p % GW) * SUB + (SUB >> 1) - cx;
        const dy = ((p / GW) | 0) * SUB + (SUB >> 1) - cy;
        if (dx * dx + dy * dy <= R2) s++;
      }
      if (s > 0) scores.push(s);
    }
    scores.sort((a, b) => b - a);
    let sum = 0;
    for (let i = 0; i < BALANCE.covTop && i < scores.length; i++) sum += scores[i];
    /* Ділимо на кількість трас. Покриття має міряти, яку частину дороги
       ОДНОГО крипа накриває дошка, а крипи розподіляються по кутах порівну.
       Без поділу спільне коло рахувалось двічі, і на Кільці крипи виходили
       вдвічі міцнішими, ніж дошка здатна побити. */
    /* covMult — знятий прогоном множник для кільцевих мап: там і крипів,
       і веж удвічі більше, і жодне з двох крайніх припущень (сумувати
       траси чи усереднювати) не дало паритету зі звичайними мапами. */
    const mult = this.map.covMult || 1;
    return (((sum * mult) / this.routes.length) | 0) || 1;
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
    if (this.mode === MODE_FIXED) return this.routeOf(c).length - 1 - c.ri;
    const d = this.flow[idx(c.tx, c.ty)];
    return d < 0 ? (1 << 29) : d;
  }

  /* Характеристики рахуємо раз — при будівництві й прокачці.
     Сама формула живе в content/upgrades.ts: нею ж міряє баланс, тож
     стенд не може розійтися з грою. */
  recalcTower(t) {
    t.st = statsFor(TOOL_BY_KEY[t.k], UPG[t.lvl], t.lvl, t.up);
  }
  /* Що пропонують цій вежі на наступному рівні. Порожньо — вибору немає,
     прокачка йде просто вгору (так качаються прості вежі на другому). */
  upChoices(t) {
    if (t.lvl >= MAX_LVL) return [];
    return choicesAt(TOOL_BY_KEY[t.k], t.lvl + 1, t.up);
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

  /* Найвищий рівень башт, відкритий на поточній хвилі. Похідна від
     sim.wave, тож детермінована й однакова в усіх без окремої синхронізації. */
  tier() { return tierAt(this.wave); }

  /* Чи дозволяє набір цього гравця ставити таку башту. Дві незалежні
     умови: башта має бути у фракції гравця І її рівень має бути вже
     відкритий. Без наборів (arsenals === null) фракція не обмежує —
     але рівні відкриваються все одно, це загальне правило партії. */
  allows(p: number, key: string): boolean {
    const tool = TOOL_BY_KEY[key];
    if (!tool) return false;
    /* Бар'єр на фіксованій трасі не робить нічого: перевірено прогоном —
       375 поставлених бар'єрів не змінили ні довжину траси, ні жодного
       життя. Це був чистий злив золота на першому ж слоті арсеналу. */
    if (tool.mazeOnly && this.mode === MODE_FIXED) return false;
    if (tool.tier > this.tier()) return false;
    if (!this.arsenals) return true;
    const a = this.arsenals[p] || this.arsenals[0];
    return a ? a.has(key) : true;
  }

  /* Кут гравця. На звичайних мапах кутів немає — там будують де завгодно,
     тож перевірка мовчки пропускає всіх. */
  zoneOf(p) {
    const z = this.map.zones;
    return (z && z.length) ? z[p % z.length] : null;
  }
  inZone(p, x, y) {
    const z = this.zoneOf(p);
    if (!z) return true;
    return x >= z[0] && y >= z[1] && x < z[0] + z[2] && y < z[1] + z[3];
  }
  /* Чи дістанеться ця клітина комусь узагалі. Кути без гравця не працюють:
     удвох на кільці зайняті обидва, соло — лише один. Це й треба знати
     покриттю, інакше воно приписує гравцю чужу половину дошки, і крипи
     виходять удвічі міцнішими, ніж він здатен побити. */
  inAnyZone(x, y) {
    const z = this.map.zones;
    if (!z || !z.length) return true;
    const n = Math.min(this.nPlayers, z.length);
    for (let p = 0; p < n; p++) if (this.inZone(p, x, y)) return true;
    return false;
  }

  buildable(x, y) {
    if (x < 0 || y < 0 || x >= GW || y >= GH) return false;
    const i = idx(x, y);
    if (this.terrain[i] === 1) return false;                             // скеля
    if (this.mode === MODE_FIXED && this.terrain[i] === 2) return false; // дорога
    // вхід і вихід кожної траси: на кільцевих мапах їх кілька
    for (const rt of this.routes) {
      const s0 = rt[0], g0 = rt[rt.length - 1];
      if (x === s0 % GW && y === (s0 / GW | 0)) return false;
      if (x === g0 % GW && y === (g0 / GW | 0)) return false;
    }
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
      if (!this.inZone(cmd.p, cmd.x, cmd.y)) { this.events.push({ e:'deny', p:cmd.p, why:'не твій кут' }); return; }
      if (!this.allows(cmd.p, cmd.k)) {
        // причину розрізняємо, бо це різні поради гравцю: одне — «не твоя
        // фракція», інше — «ще зарано, чекай хвилі»
        const why = (tool.mazeOnly && this.mode === MODE_FIXED)
          ? 'тільки в лабіринті'
          : tool.tier > this.tier()
          ? 'рівень ' + tool.tier + ' з хвилі ' + TIER_WAVE[tool.tier]
          : 'не у твоїй фракції';
        this.events.push({ e:'deny', p:cmd.p, why });
        return;
      }
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
                   lvl:1, spent:tool.cost, freshSpent:tool.cost, aim:0,
                   build:buildTicks(tool.cost), up:[] as string[] };
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
      /* Гілку перевіряємо ДО списання: команда приходить мережею, і
         підсунутий чужий ключ інакше розвів би дошки. Порожній вибір
         дозволений лише там, де вибору справді немає. */
      const opts = this.upChoices(t);
      if (opts.length && !opts.some(o => o.key === cmd.k)) {
        this.events.push({ e:'deny', p:cmd.p, why:'невідома гілка' }); return;
      }
      const cost = this.upgradeCost(t);
      if (p.gold < cost) { this.events.push({ e:'deny', p:cmd.p, why:'мало золота' }); return; }
      p.gold -= cost;
      t.up.push(opts.length ? cmd.k : '');
      t.lvl++; t.spent += cost; t.freshSpent += cost;
      this.recalcTower(t);
      // прокачка теж займає час, і теж пропорційно вкладеному
      t.build = buildTicks(cost);
      this.events.push({ e:'up', p:cmd.p, x:cmd.x, y:cmd.y, lvl:t.lvl, k:cmd.k || '' });

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
    /* Кожен кут шле СВОЮ хвилю. Інакше двоє гравців ставили б удвічі
       більше веж проти тієї самої купки крипів, і мапа на двох виходила б
       удвічі легшою за мапу на одного. */
    const lanes = this.activeRoutes();
    for (let i = 0; i < s.n * lanes; i++) this.queue.push(s);
    // бос іде не сам: інакше вся хвиля — одна ціль, і мортира марна
    if (s.esc) for (let i = 0; i < s.esc.n * lanes; i++) this.queue.push(s.esc);
    this.toSpawn  = this.queue.length;
    this.spawnGap = this.queue.length > 4 ? 14 : 40;
    this.spawnCd  = 0;
    this.phase    = 1;
    this.events.push({ e:'wave', n:this.wave, kind:s.kind, esc:!!s.esc });
  }

  /** Траса самого крипа. На звичайних мапах вона одна на всіх. */
  routeOf(c) { return this.routes[c.rt | 0] || this.route; }

  /** Скільки кутів працює: по одному на гравця, але не більше, ніж мапа має. */
  activeRoutes() { return Math.min(this.nPlayers, this.routes.length); }

  spawnOne() {
    const s = this.queue.shift();
    if (!s) return;
    /* Здоров'я масштабується покриттям мапи, золото — НІ. Якби масштабувались
       обидва, слабша мапа давала б і менше веж, і виграшу не було б. */
    const hp   = (((((s.hp * this.diff) / 100) | 0) * this.cov) / BALANCE.refCoverage) | 0;
    const gold = (((s.gold * BALANCE.killCut) / 100) | 0) || 1;
    /* На кільцевих мапах крипи виходять по черзі з КОЖНОГО кута — саме
       тому повз вежі кожного гравця проходять усі. Черга йде за
       порядковим номером крипа, тож вона однакова в усіх клієнтів. */
    const rt = this.activeRoutes() > 1 ? (this.nextCreepId - 1) % this.activeRoutes() : 0;
    const route = this.routes[rt];
    const sx = route[0] % GW, sy = (route[0] / GW) | 0;
    const c = {
      id: this.nextCreepId++, ri: 0, rt,
      tx: sx, ty: sy, ntx: sx, nty: sy,
      x: sx * SUB + (SUB >> 1), y: sy * SUB + (SUB >> 1),
      px: sx * SUB + (SUB >> 1), py: sy * SUB + (SUB >> 1),
      hp, maxHp: hp, sp: s.sp, kind: s.kind, gold,
      slowT: 0, slowP: 0, slowImm: 0, vulnT: 0, vulnP: 0, dotT: 0, dotD: 0, dotCd: 0, dotMax: 0, dotBy: -1, hurt: 0,
    };
    this.creeps.push(c);
    const n = this.mode === MODE_FIXED
      ? (route.length > 1 ? route[1] : -1)
      : this.stepTile(sx, sy, this.flow);
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
      /* holdPrep ставить дуель: поки напарник ще добиває свою хвилю, мій
         відлік стоїть. Інакше той, хто впорався швидше, отримував і
         наступну хвилю раніше, з кожною хвилею відриваючись усе далі —
         і порівнювати два боки ставало нема з чим. Хто швидший, той
         однаково виграє: у нього більше часу на будівництво. */
      /* Притримати відлік можна лише обмежений час: інакше хвилю
         запускав би не годинник, а згода обох, і в заміряному забігу
         вона приходила на 109-й секунді замість 50-ї. */
      if (this.holdPrep && this.holdLeft > 0) this.holdLeft--;
      else if (--this.prep <= 0) this.startWave();
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
        this.holdLeft = TPS * BALANCE.holdMax;
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
        if (--c.dotCd <= 0) {
          c.dotCd = 15;
          c.hp -= c.dotD;
          const pl = this.players[c.dotBy >= 0 ? c.dotBy : 0];
          if (pl) pl.dmg += c.dotD;   // отрута теж чиясь шкода, а не нічия
        }
        // отрута вигоріла — накопичене й стеля скидаються разом із нею
        if (c.dotT === 0) { c.dotD = 0; c.dotMax = 0; c.dotBy = -1; }
      }
      if (c.vulnT > 0) {
        c.vulnT--;
        if (c.vulnT === 0) c.vulnP = 0;
      }
      // смерть від отрути — вбивство того, хто отруїв, а не гравця 0
      if (c.hp <= 0) { this.kill(c, c.dotBy); continue; }

      // сповільнення
      let sp = c.sp;
      if (c.slowT > 0) {
        c.slowT--;
        sp = ((sp * (100 - c.slowP)) / 100) | 0; if (sp < 1) sp = 1;
        if (c.slowT === 0) { c.slowP = 0; c.slowImm = SLOW_IMMUNE; }
      } else if (c.slowImm > 0) c.slowImm--;

      // рух по осях — ціль завжди ортогональний сусід
      let budget = sp, arrived = false;
      for (let guard = 0; guard < 6 && budget > 0; guard++) {
        const cx = c.ntx * SUB + (SUB >> 1), cy = c.nty * SUB + (SUB >> 1);
        const dx = cx - c.x, dy = cy - c.y;
        if (dx === 0 && dy === 0) {
          c.tx = c.ntx; c.ty = c.nty;
          if (this.mode === MODE_FIXED) {
            c.ri++;                                       // крок уперед по маршруту
            const rt = this.routeOf(c);
            if (c.ri >= rt.length - 1) { arrived = true; break; }
            const n = rt[c.ri + 1];
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
        /* Титан коштує дорожче за звичайного крипа, але вже не чверть
           оборони: 5 із 20 життів робили боса не перевіркою, а косою —
           один пропущений і забіг фактично скінчено. */
        const dmg = c.kind === 3 ? 3 : 1;
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
      /* Поки вежа будується — не стріляє. Це третій ресурс поруч із
         золотом і клітинами: пауза між хвилями перестає бути безмежним
         вікном для покупок, і «п'ять дешевих чи одна важка» стає
         питанням не лише грошей, а й того, скільки з них устигне
         вистрілити цієї хвилі. */
      if (t.build > 0) { t.build--; continue; }
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
        dmg:st.dmg, sp:st.shot, splash:st.splash, spread:st.spread, mark:st.mark,
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
    /* Позначена ціль вразливіша. Множник іде ДО броні: інакше він майже
       не діяв би саме там, де потрібен найбільше — на титанах. */
    if (c.vulnT > 0) dmg = ((dmg * (100 + c.vulnP)) / 100) | 0;
    const a = ARMOR[c.kind];
    /* Броня зрізає не більше 60% удару.

       Плоске віднімання без цієї межі карає ЧАСТОТУ, а не силу: башта, що
       б'є вдвічі частіше вдвічі слабшими ударами, має ту саму шкоду за
       секунду, але проти броні втрачає вдвічі більше. Титан із бронею 10
       зводив Вогнемет (9 за удар) до мінімального 1 — тобто до нуля, — і
       ціла фракція виявлялась безсилою проти боса, хоч на папері мала
       найбільшу шкоду в грі.

       Межа лишає бронi сенс (дрібні удари й далі втрачають більше), але
       прибирає провал, де вона знищує 90% шкоди. Цілочисельна, тож
       детермінізм не страждає. */
    const floor = Math.max(1, ((dmg * 40) / 100) | 0);
    let d = dmg - a;
    if (d < floor) d = floor;
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

  /* Накладає ефекти пострілу на крипа.

     Беремо СИЛЬНІШЕ, а не останнє. Раніше кожне влучання перезаписувало
     ефект, тож дешева башта, вистріливши після важкої, знижувала отруту
     чи сповільнення — набір воював сам із собою, і що більше веж, то
     гірше. Тривалість натомість завжди оновлюється: свіже влучання
     продовжує дію.

     Ефекти цілочисельні й порядок обходу сталий, тож детермінізм
     зберігається. */
  affect(c, s) {
    /* Мороз не поновлюється, поки діє, і після нього крип якийсь час
       несприйнятливий.

       Без цього частка часу під морозом залежала від ПОКРИТТЯ: на трасі,
       що перетинає сама себе, одна вежа дістає до крипа двічі, мороз
       тримається безперервно, і він множить час під вогнем усієї армії —
       не лише крижаної. Тому Крига давала 22 хвилі на «Вузлі» й 8.7 на
       «Гребені», і жодне число не зводило це докупи: нижче порога вона
       нічого не вбивала, вище — вигравала з відривом.

       Тепер уповільнення діє SLOW_T тіків із SLOW_T + SLOW_IMMUNE, тобто
       сталу частку часу незалежно від щільності траси. Відсоток лишається
       відчутним — обмежена саме тривалість, а не сила. */
    /* landed — на скільки тіків ефект СПРАВДІ ліг цього разу. Саме на цей
       строк чіпляється позначка (див. нижче). */
    let landed = 0;
    if (s.slow > 0) {
      if (c.slowT <= 0 && c.slowImm <= 0) {
        c.slowP = s.slow;
        c.slowT = s.slowT;
        landed = s.slowT;
      } else if (c.slowT > 0 && s.slow > c.slowP) {
        /* Сильніше перебиває слабше, але НЕ продовжує тривалість. Інакше
           дешевий частий мороз блокував би власну повну заморозку тієї ж
           фракції — та сама анти-синергія, що колись була в отрути. */
        c.slowP = s.slow;
      }
    }
    /* Отрута НАКОПИЧУЄТЬСЯ, але не безмежно: до подвійної сили
       найпотужнішого джерела на цій цілі.

       Доти вона просто перезаписувалась, тож десять токсинових веж по
       ОДНІЙ цілі давали шкоду однієї. Проти натовпу це не помітно, а
       проти боса нищівно — фракція, побудована на отруті, виявлялась
       найгіршою саме там, де мала б бути найкращою: броню отрута ігнорує.

       Межа у 2× тримає її від нескінченного росту й лишає сенс у
       потужніших джерелах: стеля рахується від найсильнішого, тож
       дешевими спорами високої стелі не набити. */
    if (s.dot > 0) {
      if (s.dotT > c.dotT) c.dotT = s.dotT;
      if (s.dot > c.dotMax) c.dotMax = s.dot;
      const cap = c.dotMax * 2;
      c.dotD = c.dotD + s.dot > cap ? cap : c.dotD + s.dot;
      if (c.dotCd <= 0) c.dotCd = 15;
      if (s.dotT > landed) landed = s.dotT;
      /* Хто отруїв — щоб і шкода, і вбивство дісталися йому. Доти отрута
         була нічия: шкода не рахувалась нікому, а вбивство падало
         гравцю 0 незалежно від того, чи має він хоч одну вежу. */
      c.dotBy = s.owner;
    }

    /* Позначка ЇДЕ НА САМОМУ ЕФЕКТІ, тому ставиться останньою — їй треба
       знати, чи ефект справді ліг.

       Це і є вся різниця між допоміжними. Мороз має вікно несприйнятливості
       (SLOW_IMMUNE), тож позначка Криги сама по собі переривчаста — близько
       45% часу, зате сильна. Тління такого вікна не має й тримається довго,
       тож позначка Отрути майже безперервна, зате слабка.

       Спершу я прив'язав тривалість позначки просто до slowT/dotT — і Крига
       поглинула все: Кріостат стріляє кожні 9 тіків, тож «коротка» позначка
       поновлювалась безперервно й ставала вічною. Різниця в тривалості не
       означала нічого. */
    if (s.mark > 0 && landed > 0) {
      if (s.mark >= c.vulnP || c.vulnT <= 0) c.vulnP = s.mark;
      if (landed > c.vulnT) c.vulnT = landed;
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
      /* Вибух накладає свої ефекти на все, що зачепив. Доти сповільнення
         й отрута жили лише в одиночній гілці, тож будь-яка башта з площею
         І ефектом мовчки не давала ефекту зовсім. */
      for (const c of hitList) { this.affect(c, s); this.hurt(c, s.dmg, s.owner); }
      this.events.push({ e:'boom', x:s.x, y:s.y, r:s.splash, k:s.k });
    } else {
      this.affect(tgt, s);
      this.hurt(tgt, s.dmg, s.owner);
    }

    /* Поширення ефекту без шкоди — окрема вісь від площі. Башта може
       бити одну ціль, а студити всіх поруч; саме на цьому побудована
       Крига. Порядок обходу сталий, тож детермінізм зберігається. */
    if (s.spread > 0) {
      const r2 = s.spread * s.spread;
      const near = [];
      for (const c of this.creeps) {
        if (c === tgt) continue;
        const dx = c.x - s.x, dy = c.y - s.y;
        if (dx * dx + dy * dy <= r2) near.push(c);
      }
      near.sort((a, b) => a.id - b.id);
      for (const c of near) this.affect(c, s);
      if (near.length) this.events.push({ e:'chill', x:s.x, y:s.y, r:s.spread });
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
    for (const t of this.towers) { mix(t.x); mix(t.y); mix(t.cd); mix(t.lvl); mix(t.aim); mix(t.build); mix(t.k.charCodeAt(0));
      for (const u of t.up) mix(perkCode(u)); }   // гілки міняють характеристики, тож теж у хеш
    for (const c of this.creeps) { mix(c.id); mix(c.x); mix(c.y); mix(c.hp); mix(c.slowT); }
    for (const s of this.shots)  { mix(s.x); mix(s.y); mix(s.tid); }
    return (h >>> 0).toString(16).padStart(8, '0');
  }
}

export { Sim };
