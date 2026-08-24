import Peer from 'peerjs';
import { ICE } from './ice';
import { BUILD } from '../version';

/* ── Лобі через PeerJS: короткий код замість ручного обміну кодами ──────
   PeerJS сам домовляється про з'єднання через свій хмарний брокер — той
   бачить лише метадані рукостискання (хто з ким хоче з'єднатись), гра
   після цього йде так само напряму P2P, повз цей сервер. Room-код — це
   ID пірингу з коротким неймспейсом, щоб не перетнутись з чужими
   застосунками на тому самому публічному брокері.

   Клас незалежний від Net (ручний обмін): якщо PeerJS чи публічний
   брокер колись підведе, ручний спосіб лишається робочим запасним
   варіантом — саме тому це окремий клас, а не заміна. */
const ROOM_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   // без 0/O/1/I/L
const ROOM_PREFIX = 'chokepoint-';
function randRoomCode(n) {
  let s = '';
  for (let i = 0; i < n; i++) s += ROOM_ALPHABET[Math.floor(Math.random() * ROOM_ALPHABET.length)];
  return s;
}

class PeerNet {
  conn: any;
  evt: any;
  hiTimer: any;
  me: any;
  myId: any;
  onCfg: any;
  onCmds: any;
  onDiag: any;
  onHash: any;
  onIdent: any;
  onReady: any;
  onRestart: any;
  onSpeed: any;
  onState: any;
  peer: any;
  peerBuild: any;
  peerId: any;
  roomCode: any;
  rtt: any;
  rxAny: any;
  rxCmd: any;
  state: any;
  t0: any;
  txCmd: any;

  constructor() {
    this.state = 'off'; this.me = 0; this.rtt = 0;
    this.txCmd = 0; this.rxCmd = 0; this.rxAny = 0;
    this.myId = Math.floor(Math.random() * 900000) + 100000;
    this.peerId = null; this.peerBuild = null;
    this.evt = []; this.t0 = performance.now();
    this.peer = null; this.conn = null; this.roomCode = null; this.hiTimer = 0;
    this.onCmds = null; this.onHash = null; this.onRestart = null;
    this.onState = null; this.onDiag = null; this.onCfg = null; this.onReady = null; this.onSpeed = null; this.onIdent = null;
  }
  get live() { return this.state === 'live'; }
  get solo() { return this.state === 'off'; }
  note(s) {
    const t = ((performance.now() - this.t0) / 1000).toFixed(1);
    this.evt.push(t + 's ' + s);
    if (this.evt.length > 22) this.evt.shift();
    if (this.onDiag) this.onDiag();
  }
  setState(s) {
    this.note('стан → ' + s);
    this.state = s;
    if (this.onState) this.onState(s);
  }
  diag() {
    const broker = !this.peer ? '—'
      : this.peer.destroyed ? 'знищено'
      : this.peer.disconnected ? 'відʼєднано від брокера'
      : this.peer.open ? 'на зв’язку' : 'з’єдную з брокером';
    const pcState = this.conn && this.conn.peerConnection ? this.conn.peerConnection.connectionState : null;
    const ch = !this.conn ? 'канал не створено' : this.conn.open ? 'канал: open' : 'канал: ' + (pcState || 'зв’язуюсь');
    return 'вікно №' + this.myId + (this.peerId ? ', з’єднано з №' + this.peerId : ', ні з ким') +
           ' · кімната ' + (this.roomCode || '—') + ' · брокер: ' + broker + ' · ' + ch +
           ' · стан: ' + this.state +
           (this.peerBuild ? ' · збірка напарника: ' + this.peerBuild : '');
  }
  reset() {
    if (this.hiTimer) { clearTimeout(this.hiTimer); this.hiTimer = 0; }
    if (this.conn) { try { this.conn.close(); } catch (e) {} }
    if (this.peer) { try { this.peer.destroy(); } catch (e) {} }
    this.peer = null; this.conn = null; this.peerId = null; this.peerBuild = null;
    this.txCmd = 0; this.rxCmd = 0; this.rxAny = 0; this.rtt = 0;
    this.state = 'off';
  }
  send(o) {
    if (!this.conn || !this.conn.open) return;
    if (o.t === 'c') this.txCmd++;
    try { this.conn.send(o); } catch (e) {}
  }
  dispatch(m) {
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
    else if (m.t === 'hi2') { this.peerBuild = m.b || '?'; this.peerId = m.w || null; this.goLive(); }
    else if (m.t === 'ping') this.send({ t:'pong', at:m.at });
    else if (m.t === 'pong') this.rtt = Math.round(performance.now() - m.at);
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
  bindConn(conn) {
    if (this.conn) { try { conn.close(); } catch (e) {} return; }   // одне з'єднання за раз
    this.conn = conn;
    this.note('з’єднання отримано');
    if (this.onDiag) this.onDiag();
    conn.on('open', () => {
      this.note('канал ВІДКРИВСЯ, шлю привітання');
      this.send({ t:'hi', b: BUILD, w: this.myId });
      this.hiTimer = setTimeout(() => { if (this.state !== 'live') this.setState('stale'); }, 8000);
    });
    conn.on('data', m => {
      this.rxAny++;
      if (m && m.t !== 'ping' && m.t !== 'pong' && m.t !== 'c') this.note('прийшло: ' + m.t);
      try { this.dispatch(m); } catch (e) { this.note('ПОМИЛКА на ' + (m && m.t) + ': ' + (e && e.message ? e.message : e)); }
    });
    conn.on('close', () => this.setState('dead'));
    conn.on('error', e => this.note('помилка каналу: ' + (e && e.message ? e.message : e)));
  }
  /* До трьох спроб на випадок зайнятого коду — рідкісно, простір 30^5, але
     трапляється. Для гостя такого механізму не треба: він приєднується до
     ЧУЖОГО коду, колізій там немає. */
  async createRoom() {
    this.reset(); this.me = 0;
    for (let tries = 3; tries > 0; tries--) {
      this.roomCode = randRoomCode(5);
      try {
        await new Promise<void>((resolve, reject) => {
          this.peer = new Peer(ROOM_PREFIX + this.roomCode, { config: ICE, debug: 1 });
          const to = setTimeout(() => reject(new Error('брокер не відповідає')), 10000);
          this.peer.on('open', () => { clearTimeout(to); resolve(); });
          this.peer.on('connection', conn => this.bindConn(conn));
          this.peer.on('error', err => { clearTimeout(to); reject(err); });
        });
        this.setState('waiting');
        return this.roomCode;
      } catch (e) {
        if (e && e.type === 'unavailable-id') { try { this.peer.destroy(); } catch (er) {} continue; }
        throw e;
      }
    }
    throw new Error('не вдалось підібрати вільний код кімнати — спробуй ще раз');
  }
  async joinRoom(code) {
    this.reset(); this.me = 1; this.roomCode = code;
    await new Promise<void>((resolve, reject) => {
      this.peer = new Peer(undefined, { config: ICE, debug: 1 });
      const to = setTimeout(() => reject(new Error('брокер не відповідає')), 10000);
      this.peer.on('open', () => {
        clearTimeout(to);
        this.setState('waiting');
        this.bindConn(this.peer.connect(ROOM_PREFIX + code, { reliable: true, serialization: 'json' }));
        resolve();
      });
      this.peer.on('error', err => {
        clearTimeout(to);
        reject(err.type === 'peer-unavailable' ? new Error('кімнати ' + code + ' не існує — перевір код') : err);
      });
    });
  }
}

export { PeerNet, randRoomCode, ROOM_PREFIX, ROOM_ALPHABET };
