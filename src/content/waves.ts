import type { WaveSpec } from './types';

/* ── хвилі ───────────────────────────────────────────────────────────── */
/* Здоров'я росте приблизно на третину за хвилю, золото — лінійно. Це
   навмисно: самим докупанням башт не витягнути, треба покращувати
   розміщення. Кожна п'ята хвиля — бос. Числа зверстані під трасу в
   BALANCE.refRoute клітин і масштабуються під реальну довжину мапи. */
const WAVES: WaveSpec[] = [
  { n:12, hp:90,    sp:26, gold:12,  kind:0 },
  { n:14, hp:130,   sp:26, gold:14,  kind:0 },
  { n:16, hp:175,   sp:30, gold:16,  kind:1 },   // перші бігуни — м'якше, ніж далі
  { n:16, hp:250,   sp:24, gold:18,  kind:0 },
  { n:1,  hp:2500,  sp:18, gold:160, kind:3, esc:{ n:10, hp:250,  sp:24, gold:18, kind:0 } },
  { n:18, hp:420,   sp:26, gold:22,  kind:0 },
  { n:20, hp:560,   sp:36, gold:24,  kind:1 },
  { n:20, hp:760,   sp:22, gold:26,  kind:2 },
  { n:22, hp:1000,  sp:26, gold:28,  kind:0 },
  { n:1,  hp:8400,  sp:18, gold:400, kind:3, esc:{ n:12, hp:1000, sp:26, gold:28, kind:0 } },
  { n:22, hp:1350,  sp:28, gold:32,  kind:0 },
  { n:24, hp:1750,  sp:36, gold:34,  kind:1 },
  { n:24, hp:2300,  sp:22, gold:36,  kind:2 },
  { n:24, hp:3000,  sp:28, gold:38,  kind:0 },
  { n:1,  hp:19000, sp:18, gold:800, kind:3, esc:{ n:14, hp:3000, sp:28, gold:38, kind:0 } },
];
const KIND_NAME = ['піхота', 'бігуни', 'броньовані', 'титан'];
const ARMOR = [0, 0, 3, 10];   // плоске зменшення шкоди за удар; отрута його не бачить

function waveSpec(w: number): WaveSpec {     // w — 1-базований
  if (w <= WAVES.length) return WAVES[w - 1];
  const over = w - WAVES.length;             // нескінченний режим, чиста формула
  const body = { n:24, hp:((3000 * (100 + over * 30)) / 100) | 0, sp:24 + (over % 3) * 5, gold:38 + over * 3, kind:over % 3 };
  if ((w % 5) === 0) return { n:1 + ((over / 12) | 0), hp:19000 + over * 5400, sp:18, gold:800 + over * 70, kind:3,
                              esc:{ n:14, hp:(body.hp / 2) | 0, sp:28, gold:body.gold, kind:0 } };
  return body;
}


export { WAVES, KIND_NAME, ARMOR, waveSpec };
