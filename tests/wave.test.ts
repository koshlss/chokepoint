/* Хвилю запускає ГОДИННИК, а не згода гравців.

   Голоси лише прискорюють підготовку, а дуель може її притримати — але
   обидва механізми обмежені: якщо нічого не робити взагалі, хвиля прийде
   сама і в передбачуваний строк. Спершу було не так: у дуелі відлік стояв,
   поки напарник добиває свою хвилю, і в заміряному забігу хвиля прийшла
   на 109-й секунді замість 50-ї. */
import { describe, it, expect } from 'vitest';
import { Sim } from '../src/sim/sim';
import { MODE_FIXED, TPS } from '../src/sim/constants';
import { BALANCE } from '../src/sim/balance';

const untilWave = (s: any, limit: number) => {
  let t = 0;
  for (; t < limit * TPS && s.wave === 0; t++) s.step();
  return t / TPS;
};

describe('запуск хвилі', () => {
  it('соло: приходить сама, без жодного натискання', () => {
    const s: any = new Sim('W-1', 100, 1, 0, MODE_FIXED);
    expect(untilWave(s, 90)).toBeCloseTo(BALANCE.prepFirst, 0);
  });

  it('удвох на спільній лінії: теж сама, навіть якщо ніхто не голосує', () => {
    const s: any = new Sim('W-2', 100, 2, 0, MODE_FIXED);
    expect(untilWave(s, 90)).toBeCloseTo(BALANCE.prepFirst, 0);
  });

  it('один голос із двох нічого не ламає — годинник добігає своє', () => {
    const s: any = new Sim('W-3', 100, 2, 0, MODE_FIXED);
    s.apply({ t: 'wave', p: 0, seq: 1 });
    expect(untilWave(s, 90)).toBeCloseTo(BALANCE.prepFirst, 0);
  });

  it('обидва голоси прискорюють одразу', () => {
    const s: any = new Sim('W-4', 100, 2, 0, MODE_FIXED);
    s.apply({ t: 'wave', p: 0, seq: 1 });
    s.apply({ t: 'wave', p: 1, seq: 2 });
    expect(untilWave(s, 90)).toBeLessThan(2);
  });

  it('дуель: очікування напарника обмежене, хвиля все одно приходить', () => {
    const me: any = new Sim('W-5', 100, 1, 0, MODE_FIXED);
    const mate: any = new Sim('W-5', 100, 1, 0, MODE_FIXED);
    mate.apply({ t: 'wave', p: 0, seq: 1 });     // напарник одразу пішов у бій
    let t = 0;
    for (; t < 200 * TPS && me.wave === 0; t++) {
      me.holdPrep = !mate.over && mate.phase === 1;
      mate.holdPrep = !me.over && me.phase === 1;
      me.step(); mate.step();
    }
    const sec = t / TPS;
    expect(sec, `${sec.toFixed(0)} с`).toBeGreaterThan(BALANCE.prepFirst - 1);
    expect(sec, `${sec.toFixed(0)} с — довше за межу очікування`)
      .toBeLessThanOrEqual(BALANCE.prepFirst + BALANCE.holdMax + 1);
  });

  it('межа очікування помітно коротша за саму паузу', () => {
    // інакше очікування перестає бути «трохи зачекати» й стає другою паузою
    expect(BALANCE.holdMax).toBeLessThan(BALANCE.prepAfter);
  });
});
