import { packCode, unpackCode } from './codec';
import { iceDone, candKind, ICE, CHAN, RTC } from './ice';
import { BUILD } from '../version';

class Net {
  cand: any;
  dc: any;
  evt: any;
  gotChannel: any;
  hiTimer: any;
  hist: any;
  iceErr: any;
  me: any;
  myId: any;
  nonce: any;
  onCfg: any;
  onCmds: any;
  onDiag: any;
  onHash: any;
  onIdent: any;
  onReady: any;
  onRestart: any;
  onSpeed: any;
  onState: any;
  pc: any;
  peerBuild: any;
  peerId: any;
  rtt: any;
  rxAny: any;
  rxCmd: any;
  state: any;
  t0: any;
  txCmd: any;

  constructor() {
    this.pc = null; this.dc = null;
    this.state = 'off';          // off | waiting | live | dead
    this.me = 0;                 // 0 — господар, 1 — гість
    this.rtt = 0;
    this.cand = { host:0, srflx:0, relay:0 };
    this.txCmd = 0; this.rxCmd = 0; this.rxAny = 0;
    this.gotChannel = false; this.peerBuild = null; this.nonce = 0;
    this.hist = [];
    this.myId = Math.floor(Math.random() * 900000) + 100000;   // хто саме це вікно
    this.evt = []; this.t0 = performance.now();
    this.peerId = null;
    this.iceErr = 0;
    this.onCmds = null; this.onHash = null; this.onRestart = null; this.onState = null;
    this.onDiag = null; this.onCfg = null; this.onReady = null; this.onSpeed = null; this.onIdent = null;
  }
  diag() {
    if (!this.pc) return 'з’єднання не почато';
    const c = this.cand;
    const dc = this.dc ? this.dc.readyState : (this.gotChannel ? '?' : 'НЕ ОТРИМАНО');
    return 'вікно №' + this.myId + (this.peerId ? ', з’єднано з №' + this.peerId : ', ні з ким') +
           ' · адрес: локальних ' + c.host + ', зовнішніх ' + c.srflx + ', ретранслятор ' + c.relay +
           (this.iceErr ? ' · помилок STUN/TURN: ' + this.iceErr : '') +
           ' · ICE: ' + this.pc.iceConnectionState +
           ' · транспорт: ' + (this.pc.sctp ? this.pc.sctp.state : 'нема') +
           ' · зв’язок: ' + this.pc.connectionState +
           ' · канал даних: ' + dc +
           ' · стан: ' + this.state + ' (' + this.hist.join('→') + ')' +
           (this.peerBuild ? ' · збірка напарника: ' + this.peerBuild : '');
  }
  watch(pc) {
    pc.onicecandidate = e => {
      const k = candKind(e.candidate);
      if (k && this.cand[k] !== undefined) this.cand[k]++;
      if (this.onDiag) this.onDiag();
    };
    pc.onicecandidateerror = () => { this.iceErr++; if (this.onDiag) this.onDiag(); };
    pc.oniceconnectionstatechange = () => {
      const s = pc.iceConnectionState;
      this.note('ICE → ' + s);
      if (s === 'failed' || s === 'disconnected') this.setState('dead');
      if (this.onDiag) this.onDiag();
    };
  }
  reset() {
    /* Недостатньо закрити з'єднання: старий канал зберігає обробники й
       далі приймає повідомлення, тоді як відправляння вже йде в новий.
       Саме через це частина даних «проходила», а команди — ні. */
    if (this.dc) {
      this.dc.onopen = this.dc.onclose = this.dc.onerror = this.dc.onmessage = null;
      try { this.dc.close(); } catch (e) {}
    }
    if (this.pc) {
      this.pc.onicecandidate = this.pc.oniceconnectionstatechange = null;
      this.pc.onicecandidateerror = null;
      try { this.pc.close(); } catch (e) {}
    }
    if (this.hiTimer) { clearTimeout(this.hiTimer); this.hiTimer = 0; }
    this.pc = null; this.dc = null; this.gotChannel = false; this.peerBuild = null;
    this.cand = { host:0, srflx:0, relay:0 }; this.iceErr = 0;
    this.txCmd = 0; this.rxCmd = 0; this.rxAny = 0; this.rtt = 0;
    this.state = 'off';
  }
  get live() { return this.state === 'live'; }
  get solo() { return this.state === 'off'; }

  /* Журнал подій мережі. Стан показує лише зріз «зараз», а тут видно
     порядок: що відкрилось, що надіслано, що прийшло. */
  note(s) {
    const t = ((performance.now() - this.t0) / 1000).toFixed(1);
    this.evt.push(t + 's ' + s);
    if (this.evt.length > 22) this.evt.shift();
    if (this.onDiag) this.onDiag();
  }
  setState(s) {
    this.note('стан → ' + s);
    this.state = s;
    this.hist.push(s);
    if (this.hist.length > 8) this.hist.shift();
    if (this.onState) this.onState(s);
  }

  wire(dc) {
    this.dc = dc; this.gotChannel = true;
    this.note('канал отримано, стан ' + dc.readyState);
    /* Канал може бути вже відкритим до того, як ми повісимо обробник,
       тож перевіряємо стан напряму, а не покладаємось лише на подію. */
    /* Відкритий канал ще не означає, що на тому кінці хтось є: він може
       лишатись від старої спроби. Тому спершу вітаємось, і живим
       вважаємо з'єднання лише коли привітання прийшло у відповідь. */
    const opened = () => {
      if (this.state === 'live') return;
      this.note('канал ВІДКРИВСЯ, шлю привітання');
      this.send({ t:'hi', b: BUILD, w: this.myId });
      if (this.hiTimer) clearTimeout(this.hiTimer);
      this.hiTimer = setTimeout(() => {
        if (this.state !== 'live') this.setState('stale');
      }, 8000);
    };
    dc.onopen = opened;
    if (dc.readyState === 'open') opened();
    dc.onclose = () => this.setState('dead');
    dc.onerror = () => this.setState('dead');
    dc.onmessage = ev => {
      if (this.dc !== dc) { this.note('відкинуто пакет зі старого каналу'); return; }
      this.rxAny++;
      let m; try { m = JSON.parse(ev.data); } catch (e) { this.note('прийшло нечитабельне'); return; }
      if (m.t !== 'ping' && m.t !== 'pong' && m.t !== 'c') this.note('прийшло: ' + m.t);
      try { this.dispatch(m); } catch (e) { this.note('ПОМИЛКА на ' + m.t + ': ' + (e && e.message ? e.message : e)); }
    };
  }
  dispatch(m) {
    {
      if (m.t === 'c') { this.rxCmd++; if (this.onCmds) this.onCmds(m.g, m.k, m.m); }
      else if (m.t === 'h' && this.onHash) this.onHash(m.g, m.k, m.h);
      else if (m.t === 'r' && this.onRestart) this.onRestart(m.g, m.s);
      else if (m.t === 'cfg' && this.onCfg) this.onCfg(m.s, m.seq);
      else if (m.t === 'ready' && this.onReady) this.onReady(m.seq);
      else if (m.t === 'speed' && this.onSpeed) this.onSpeed(m.v);
      else if (m.t === 'ident' && this.onIdent) this.onIdent(m.name, m.color);
      else if (m.t === 'hi') {
        this.peerBuild = m.b || '?'; this.peerId = m.w || null;
        this.send({ t:'hi2', b: BUILD, w: this.myId });
        this.goLive();
      }
      else if (m.t === 'hi2') {
        this.peerBuild = m.b || '?'; this.peerId = m.w || null;
        this.goLive();
      }
      else if (m.t === 'ping') this.send({ t:'pong', at:m.at });
      else if (m.t === 'pong') this.rtt = Math.round(performance.now() - m.at);
    };
  }
  goLive() {
    if (this.state === 'live') return;
    if (this.hiTimer) { clearTimeout(this.hiTimer); this.hiTimer = 0; }
    this.setState('live');
    this.ping();
  }
  ping() {
    if (!this.live) return;
    this.send({ t:'ping', at: performance.now() });
    setTimeout(() => this.ping(), 2000);
  }
  send(o) {
    if (!this.dc || this.dc.readyState !== 'open') return;
    if (o.t === 'c') this.txCmd++;
    this.dc.send(JSON.stringify(o));
  }

  async host(setup) {
    this.me = 0;
    /* Мітка запрошення. Відповідь мусить її повернути — інакше це
       відповідь на ПОЗАМИНУЛЕ запрошення, скопійована з чату, і вона
       з'єднає з уже мертвою стороною. */
    this.nonce = Math.floor(Math.random() * 1e9);
    this.pc = new RTC(ICE);
    this.watch(this.pc);
    this.pc.onconnectionstatechange = () => this.note("зв'язок → " + this.pc.connectionState);
    this.wire(this.pc.createDataChannel('lockstep', CHAN));
    await this.pc.setLocalDescription(await this.pc.createOffer());
    await iceDone(this.pc, 9000);
    if (this.state !== 'live') this.setState('waiting');
    return packCode({ r:'o', sdp: this.pc.localDescription, s: setup, b: BUILD, n: this.nonce });
  }
  async join(code) {
    const m = await unpackCode(code);
    if (m.r !== 'o') throw new Error('це не код запрошення');
    this.reset();                       // друга спроба не має тягнути старе з'єднання
    this.me = 1;
    this.pc = new RTC(ICE);
    this.watch(this.pc);
    this.pc.onconnectionstatechange = () => this.note("зв'язок → " + this.pc.connectionState);
    this.wire(this.pc.createDataChannel('lockstep', CHAN));
    await this.pc.setRemoteDescription(m.sdp);
    await this.pc.setLocalDescription(await this.pc.createAnswer());
    await iceDone(this.pc, 9000);
    if (this.state !== 'live') this.setState('waiting');
    this.peerBuild = m.b || '?';
    return { code: await packCode({ r:'a', sdp: this.pc.localDescription, b: BUILD, n: m.n }), s: m.s, b: this.peerBuild };
  }
  async confirm(code) {
    const m = await unpackCode(code);
    if (m.r !== 'a') throw new Error('це не код відповіді');
    if (this.nonce && m.n !== this.nonce)
      throw new Error('це відповідь на старе запрошення — візьміть найсвіжіші коди');
    this.peerBuild = m.b || '?';
    await this.pc.setRemoteDescription(m.sdp);
  }
}

export { Net };
