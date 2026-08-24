/* ── дрібні цілочисельні утиліти ─────────────────────────────────────── */
function isqrt(n) {                          // ціле квадратне коріння, без Math.sqrt
  if (n <= 0) return 0;
  let x = n, y = ((x + 1) / 2) | 0;
  while (y < x) { x = y; y = ((x + ((n / x) | 0)) / 2) | 0; }
  return x;
}
function seedFrom(str) {                     // рядок → 32-бітне зерно
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}


export { isqrt, seedFrom };
