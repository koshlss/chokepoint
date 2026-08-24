/* Планувальник. Тік N виконується лише коли є команди ВІД УСІХ за цей
   тік. Свої команди публікуються на DELAY тіків уперед — цей запас і
   ховає затримку каналу. */
const DELAY = 5;

class Lockstep {
  gen: any;
  hist: any;
  local: any;
  peers: any;
  pending: any;
  published: any;
  remote: any;
  seq: any;

  /* gen — номер партії. Команди наступного покоління, що прилетіли до
     нашого перезапуску, лежать у stash і забираються тут. Саме через їх
     втрату сторони раніше вічно чекали одна одну. */
  constructor(peers, gen, stash) {
    this.peers = peers;
    this.gen = gen | 0;
    this.local = new Map();      // tick → мої команди
    this.remote = new Map();     // tick → чужі команди
    this.hist = [];              // повний лог для перевірки
    this.pending = [];           // натиснуте, ще не опубліковане
    this.published = DELAY - 1;
    this.seq = 0;
    for (let t = 0; t < DELAY; t++) { this.local.set(t, []); this.remote.set(t, []); }
    if (stash) {
      for (let i = stash.length - 1; i >= 0; i--) {
        if (stash[i].g === this.gen) { this.remote.set(stash[i].k, stash[i].m); stash.splice(i, 1); }
        else if (stash[i].g < this.gen) stash.splice(i, 1);
      }
    }
  }
  /* Єдина точка прийому чужих команд. */
  accept(g, tick, cmds, stash) {
    if (g === this.gen) this.remote.set(tick, cmds);
    else if (g > this.gen && stash) stash.push({ g, k:tick, m:cmds });
  }
  queue(cmd) { cmd.seq = this.seq++; this.pending.push(cmd); }
  publishTo(tick, send) {
    while (this.published < tick) {
      this.published++;
      const batch = this.pending; this.pending = [];
      this.local.set(this.published, batch);
      if (send) send(this.published, batch);
    }
  }
  ready(tick, networked) { return !networked || this.remote.has(tick); }
  merged(tick) {
    const a = (this.local.get(tick) || []).concat(this.remote.get(tick) || []);
    a.sort((x, y) => (x.p - y.p) || (x.seq - y.seq));   // порядок не залежить від мережі
    for (const c of a) this.hist.push({ tick, cmd: c });
    this.local.delete(tick); this.remote.delete(tick);
    return a.length ? a : null;
  }
}

export { Lockstep, DELAY };
