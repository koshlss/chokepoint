/* Скільки насправді б'є кожна башта по кожному типу крипа.
   Плоске віднімання броні карає ЧАСТОТУ, а не силу: башта, що б'є вдвічі
   частіше вдвічі слабшими ударами, проти броні втрачає вдвічі більше.
   Ця таблиця показує, наскільки перекошено. */
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { TOOLS } from '../src/content/towers';
import { ARMOR, KIND_NAME } from '../src/content/waves';
import { LOADOUTS } from '../src/content/loadouts';
import { TPS } from '../src/sim/constants';

/** Пряма шкода за секунду з урахуванням броні (як її рахує Sim.hurt). */
function directDps(t: any, armor: number) {
  if (!t.cd || !t.shot) return 0;
  const perHit = Math.max(1, t.dmg - armor);
  return perHit * TPS / t.cd;
}
/** Отрута тікає раз на 15 тіків і броні не бачить. Рахуємо стале горіння. */
function dotDps(t: any) {
  return t.dot ? t.dot * (TPS / 15) : 0;
}

it('таблиця шкоди по типах крипів', () => {
  const out: string[] = ['Шкода за секунду по типах крипів (1-й рівень башти)', ''];
  const head = ['башта', 'фракція', 'рів', ...ARMOR.map((a, i) => `${KIND_NAME[i]} (бр.${a})`)];
  const w = [11, 8, 3, 14, 14, 16, 13];
  const line = (c: string[]) => c.map((s, i) => s.padEnd(w[i] || 12)).join(' ');
  out.push(line(head), line(w.map(n => '─'.repeat(n))));

  for (const lo of LOADOUTS) {
    for (const key of lo.tools) {
      const t: any = TOOLS.find(x => x.key === key);
      if (!t || !t.shot) continue;
      const cells = ARMOR.map(a => {
        const d = directDps(t, a), p = dotDps(t);
        const full = directDps(t, 0) + p;
        const now = d + p;
        const pct = full > 0 ? Math.round(now * 100 / full) : 100;
        return `${now.toFixed(1)}${p ? '+отр' : ''} ${pct}%`;
      });
      out.push(line([t.name, lo.name, String(t.tier), ...cells]));
    }
    out.push('');
  }

  /* Підсумок по фракції проти титана — саме він і є першим босом. */
  out.push('Сума шк/с фракції проти титана (броня 10), базові + середні:');
  for (const lo of LOADOUTS) {
    const open = lo.tools.map(k => TOOLS.find(x => x.key === k)).filter((t: any) => t && t.shot && t.tier <= 2);
    const vsTitan = open.reduce((s, t: any) => s + directDps(t, 10) + dotDps(t), 0);
    const vsPlain = open.reduce((s, t: any) => s + directDps(t, 0) + dotDps(t), 0);
    out.push(`  ${lo.name.padEnd(8)} ${vsTitan.toFixed(1).padStart(6)} проти ${vsPlain.toFixed(1).padStart(6)} — лишається ${Math.round(vsTitan * 100 / vsPlain)}%`);
  }

  const text = out.join('\n') + '\n';
  console.log('\n' + text);
  writeFileSync(new URL('./armor.txt', import.meta.url), text, 'utf8');
});
