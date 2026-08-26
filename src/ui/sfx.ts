/* ══════════════════════════════════════════════════════════════════════
   ЗВУК

   Жодних файлів: усе синтезується на місці. Це не аскетизм заради
   аскетизму — гра важить 50 КБ і вантажиться з GitHub Pages, і тягнути
   мегабайти семплів заради восьми «пік» було б непропорційно.

   Чого тут навмисно НЕМАЄ — звуку пострілу. У середині партії на дошці
   під п'ятдесят веж, це сотні пострілів за секунду: будь-який звук на
   кожен перетворюється на суцільний шум, у якому не чути нічого
   важливого. Озвучені лише події, на які гравець реагує: влучив,
   пропустив, побудував, хвиля пішла.

   Контекст створюється з ПЕРШОГО кліку гравця, бо браузери не дають
   завести звук раніше. Доти всі виклики просто нічого не роблять.
   ══════════════════════════════════════════════════════════════════════ */

type Voice = {
  /** Частота на початку й у кінці, Гц. */
  from: number; to: number;
  /** Тривалість, секунди. */
  dur: number;
  /** Гучність 0..1. */
  gain: number;
  type?: OscillatorType;
  /** Скільки разів на секунду цей звук може лунати щонайбільше. */
  rate?: number;
};

const VOICES: Record<string, Voice> = {
  kill:  { from: 620, to: 300, dur: 0.07, gain: 0.05, type: 'square',   rate: 10 },
  boom:  { from: 180, to:  60, dur: 0.16, gain: 0.09, type: 'triangle', rate: 8  },
  /* Прорив був пилою на низькій частоті з гучністю 0.22 — саме та
     комбінація, що деренчить. Тепер це глухий удар: синус, тихіше й
     коротше. Подія й так підкріплена трясінням і спалахом, звукові
     лишається тільки позначити її, а не перекрикувати. */
  leak:  { from: 210, to:  62, dur: 0.26, gain: 0.09, type: 'sine' },
  build: { from: 380, to: 620, dur: 0.07, gain: 0.10, type: 'square'   },
  up:    { from: 520, to: 880, dur: 0.13, gain: 0.11, type: 'triangle' },
  raze:  { from: 300, to: 120, dur: 0.11, gain: 0.10, type: 'sawtooth' },
  wave:  { from: 300, to: 520, dur: 0.20, gain: 0.14, type: 'triangle' },
  clear: { from: 520, to: 780, dur: 0.24, gain: 0.14, type: 'triangle' },
  lost:  { from: 220, to:  62, dur: 0.85, gain: 0.16, type: 'triangle' },
  deny:  { from: 200, to: 160, dur: 0.09, gain: 0.08, type: 'square'   },
};

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let on = localStorage.getItem('cp_sfx') !== 'off';
const last: Record<string, number> = {};

/** Чи ввімкнений звук. Стан живе між сесіями. */
export const sfxOn = () => on;
export function setSfx(v: boolean) {
  on = v;
  localStorage.setItem('cp_sfx', v ? 'on' : 'off');
  if (master) master.gain.value = v ? 1 : 0;
}

/** Завести контекст. Кличеться з першого справжнього кліку гравця. */
export function wakeSfx() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
  if (!AC) return;
  try {
    ctx = new AC();
    master = ctx!.createGain();
    master.gain.value = on ? 1 : 0;
    /* Синтезовані хвилі різкі на верхах — square й sawtooth дають гострі
       гармоніки, від яких вухо втомлюється за хвилину гри. М'який зріз
       знімає це з усього виходу одразу, не чіпаючи самих голосів. */
    const lp = ctx!.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2600;
    lp.Q.value = 0.7;
    master.connect(lp);
    lp.connect(ctx!.destination);
  } catch { ctx = null; }
}

export function sfx(name: string) {
  if (!on || !ctx || !master) return;
  const v = VOICES[name];
  if (!v) return;
  const now = ctx.currentTime;
  /* Дросель за подіями: на пікові хвилі крипи гинуть пачками, і без нього
     десяток однакових «піків» в один тік зливається в тріск. */
  if (v.rate) {
    const gap = 1 / v.rate;
    if (last[name] !== undefined && now - last[name] < gap) return;
  }
  last[name] = now;

  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = v.type || 'sine';
  o.frequency.setValueAtTime(v.from, now);
  o.frequency.exponentialRampToValueAtTime(Math.max(1, v.to), now + v.dur);
  // різка атака й м'який спад: так звук читається навіть на 0.07 с
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(v.gain, now + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, now + v.dur);
  o.connect(g); g.connect(master);
  o.start(now);
  o.stop(now + v.dur + 0.02);
}
