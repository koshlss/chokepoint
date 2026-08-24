function iceDone(pc: RTCPeerConnection, ms: number): Promise<void> {
  return new Promise<void>(res => {
    if (pc.iceGatheringState === 'complete') return res();
    let tm: ReturnType<typeof setTimeout>;
    const fin = () => { pc.removeEventListener('icegatheringstatechange', chk); clearTimeout(tm); res(); };
    const chk = () => { if (pc.iceGatheringState === 'complete') fin(); };
    pc.addEventListener('icegatheringstatechange', chk);
    tm = setTimeout(fin, ms);
  });
}

/* Скільки й яких адрес знайшлося. Це головна діагностика: якщо немає
   ні srflx, ні relay — назовні вас не видно, і прямий зв'язок неможливий. */
function candKind(c: RTCIceCandidate | null) {
  if (!c || !c.candidate) return null;
  const m = /(?: typ )(\w+)/.exec(c.candidate);
  return m ? m[1] : null;
}

/* STUN лише повідомляє твою зовнішню адресу. Якщо провайдер за CGNAT або
   NAT симетричний, прямого маршруту між гравцями немає — тоді потрібен
   TURN, який ретранслює трафік. Через нього йдуть тільки команди. */
const ICE = { iceServers: [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'turn:openrelay.metered.ca:80',  username:'openrelayproject', credential:'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443', username:'openrelayproject', credential:'openrelayproject' },
] };

/* WebRTC є не скрізь: у пісочниці опублікованої сторінки його вимикають.
   Ловимо це один раз тут, щоб замість «not a constructor» показати людям
   зрозуміле пояснення. */
/* Канал створюють ОБИДВІ сторони з тим самим номером (negotiated). Так
   не потрібна подія ondatachannel — саме її гість і не отримував, через
   що мовчав, хоча ICE був connected. */
const CHAN = { ordered: true, negotiated: true, id: 0 };


const webkitRTC = (globalThis as any).webkitRTCPeerConnection;
const RTC: typeof RTCPeerConnection | null =
            (typeof RTCPeerConnection === 'function') ? RTCPeerConnection
          : (typeof webkitRTC === 'function') ? webkitRTC
          : null;

export { iceDone, candKind, ICE, CHAN, RTC };
