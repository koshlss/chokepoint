import { tiles } from '../sim/constants';
import type { Tool } from './types';

/* ══════════════════════════════════════════════════════════════════════
   ГІЛКИ ПРОКАЧКИ

   Прокачка більше не «те саме, але більше». На кожному рівні вежа
   обирає, ким їй стати, і другий вибір залежить від першого:

     рівень 2   дві гілки
     рівень 3   по дві гілки в кожній   →  чотири різні вежі з однієї

   Прості вежі (найдешевші базові) вибору на другому рівні НЕ мають —
   вони просто ростуть. Свій єдиний вибір вони роблять на третьому, і це
   та сама головна пара, що в решти на другому. Так найперша вежа
   лишається найперною вежею: поставив і забув, поки не дійшло до
   справжньої прокачки.

   ── Головне правило ──────────────────────────────────────────────────
   Гілка ПЕРЕРОЗПОДІЛЯЄ силу, а не додає її. Кожна пара тримає power()
   приблизно однаковою: що додається в одному, те віднімається в іншому.
   Інакше одна гілка з пари була б просто кращою, і вибору знову не було
   б — рівно та сама вада, через яку колись переробляли ціни.

   Тому й осі підібрані так, щоб модель їх БАЧИЛА:

     дальність ↔ шкода   довше тримає ціль під вогнем проти важчого удару
     темп ↔ вага         сумарна шкода за секунду та сама, але…
     площа ↔ шкода       ширший вибух проти щільнішого

   «Темп ↔ вага» модель узагалі рахує рівним — і це навмисно. Різниця
   там у тому, чого модель не міряє: броня знімається з КОЖНОГО удару,
   тож рідкі важкі удари втрачають на ній менше, а часті дрібні краще
   накладають ефекти й менше б'ють у порожнє. Це вибір під ситуацію, а
   не під арифметику.
   ══════════════════════════════════════════════════════════════════════ */

/** Множники у відсотках: 100 — без змін. splashAdd додається в під-одиницях. */
export interface Perk {
  key: string;
  name: string;
  blurb: string;
  dmg?: number;
  range?: number;
  cd?: number;        // >100 повільніше, <100 частіше
  splash?: number;
  splashAdd?: number; // дає площу тим, хто б'є в одну ціль
  spread?: number;
  slowT?: number;
  dot?: number;
  dotT?: number;
  mark?: number;
}

export interface Tree {
  /** Пара на другому рівні. Прості вежі беруть її аж на третьому. */
  main: [Perk, Perk];
  /** Що пропонують на третьому — залежно від того, що обрали на другому. */
  then: Record<string, [Perk, Perk]>;
}

/* ── спільні гілки, що трапляються в кількох деревах ──────────────── */
const SLEDGE: Perk = { key:'sledge', name:'Кувалда', dmg:134, cd:134,
  blurb:'Рідше, зате кожен удар набагато важчий.' };
const RAPID: Perk = { key:'rapid', name:'Подача', dmg:80, cd:80,
  blurb:'Частіше, зате дрібнішими ударами.' };

/* ══ ТОЧКОВІ ══ ті, що б'ють в одну ціль ─────────────────────────── */
const POINT: Tree = {
  main: [
    { key:'barrel', name:'Довгий ствол', range:118, dmg:86,
      blurb:'Дістає помітно далі, але б’є легше.' },
    { key:'shell',  name:'Важкий набій', dmg:124, range:81,
      blurb:'Б’є помітно важче, але дістає ближче.' },
  ],
  then: {
    barrel: [
      { key:'scope', name:'Приціл', range:116, dmg:87,
        blurb:'Ще далі. Шкода знову трохи падає.' },
      RAPID,
    ],
    shell: [
      SLEDGE,
      { key:'spray', name:'Розсів', splashAdd:tiles(0.55), dmg:65,
        blurb:'Удар зачіпає й тих, хто поруч із ціллю.' },
    ],
  },
};

/* ══ ВИБУХОВІ ══ ті, що вже б'ють площею ─────────────────────────── */
const AREA: Tree = {
  main: [
    { key:'wide', name:'Розкид', splashAdd:tiles(0.45), dmg:84,
      blurb:'Вибух ширший, але слабший.' },
    { key:'core', name:'Осердя', dmg:115, splash:78,
      blurb:'Вибух вужчий, зате щільніший.' },
  ],
  then: {
    wide: [
      { key:'wave', name:'Хвиля', splashAdd:tiles(0.4), dmg:88,
        blurb:'Ще ширше.' },
      { key:'guide', name:'Наведення', range:120, dmg:84,
        blurb:'Дістає далі.' },
    ],
    core: [
      SLEDGE,
      RAPID,
    ],
  },
};

/* ══ КРИГА ══ допоміжна: коротко й жорстко ───────────────────────── */
const CHILL: Tree = {
  main: [
    { key:'blizzard', name:'Хуртовина', spread:135, slowT:72,
      blurb:'Холод бере ширшу пляму, зате відпускає швидше.' },
    { key:'deepfreeze', name:'Глибокий мороз', slowT:132, spread:78,
      blurb:'Тримає помітно довше, зате пляма вужча.' },
  ],
  then: {
    blizzard: [
      { key:'whiteout', name:'Заметіль', spread:122, slowT:82,
        blurb:'Пляма ще ширша, холод ще коротший.' },
      { key:'hail', name:'Град', cd:78, mark:92, dmg:90,
        blurb:'Б’є значно частіше, зате кожна позначка слабша.' },
    ],
    deepfreeze: [
      { key:'permafrost', name:'Вічна мерзлота', slowT:128, spread:88,
        blurb:'Тримає ще довше, пляма ще вужча.' },
      { key:'brand', name:'Тавро', mark:140, range:88,
        blurb:'Позначка значно вагоміша, але рука коротша.' },
    ],
  },
};

/* ══ ОТРУТА ══ допоміжна: довго й м'яко ──────────────────────────── */
const VENOM: Tree = {
  main: [
    { key:'concentrate', name:'Концентрат', dot:115, dotT:88, dmg:90,
      blurb:'Отрута міцніша, але вигорає швидше.' },
    { key:'solution', name:'Розчин', dotT:135, dot:92, dmg:106,
      blurb:'Отрута слабша, зате тримається набагато довше.' },
  ],
  then: {
    concentrate: [
      { key:'acid', name:'Кислота', dot:128, dotT:92, dmg:88,
        blurb:'Ще міцніша.' },
      { key:'stigma', name:'Тавро', mark:130, range:85,
        blurb:'Позначка значно вагоміша, але рука коротша.' },
    ],
    solution: [
      { key:'bog', name:'Драговина', slowT:135, range:92, dot:92,
        blurb:'Тримає на місці помітно довше, але дістає ближче.' },
      { key:'spores', name:'Спори', splashAdd:tiles(0.30), range:82, dmg:88,
        blurb:'Отрута лягає й на сусідів, зате рука коротка.' },
    ],
  },
};

/* Дерево вибирається за тим, ЩО вежа робить, а не за фракцією: у Сталі
   є і точкові, і вибухові, і пропонувати ширший вибух Стрілометові,
   який вибуху не має, було б порожнім вибором. */
export function treeOf(t: Tool): Tree | null {
  if (!t.shot) return null;                    // бар'єр не качається
  if (t.faction === 'ice')   return CHILL;
  if (t.faction === 'toxic') return VENOM;
  return t.splash ? AREA : POINT;
}

/* Прості — найдешевші базові. Їхня роль у тому, щоб їх ставили не
   думаючи, тож і вибору на другому рівні в них немає. */
export const isSimple = (t: Tool) => t.tier === 1 && t.cost <= 90;

/** Що пропонують при переході на рівень lvl. Порожньо — вибору немає. */
export function choicesAt(t: Tool, lvl: number, path: string[]): Perk[] {
  const tree = treeOf(t);
  if (!tree) return [];
  if (isSimple(t)) return lvl === 3 ? tree.main.slice() : [];
  if (lvl === 2) return tree.main.slice();
  if (lvl === 3) return (tree.then[path[0]] || []).slice();
  return [];
}

/** Перк за ключем — для показу вже обраного шляху. */
export function perkOf(t: Tool, key: string): Perk | null {
  const tree = treeOf(t);
  if (!tree || !key) return null;
  for (const p of tree.main) if (p.key === key) return p;
  for (const pair of Object.values(tree.then)) for (const p of pair) if (p.key === key) return p;
  return null;
}

/* ── характеристики вежі на рівні lvl із обраним шляхом ──────────────
   Одна функція і для симуляції, і для перевірок балансу: інакше стенд
   міряв би свою копію формули, а гра жила б за іншою. Уся арифметика
   ціла — симуляція не має права на дроби. */
export function statsFor(b: Tool, u: { dmg: number; range: number }, lvl: number, path: string[]) {
  const s = {
    cd:     b.cd,
    dmg:    ((b.dmg * u.dmg) / 100) | 0,
    range:  ((b.range * u.range) / 100) | 0,
    shot:   b.shot,
    splash: b.splash ? ((b.splash * u.range) / 100) | 0 : 0,
    spread: b.spread ? ((b.spread * u.range) / 100) | 0 : 0,
    mark:   b.mark | 0,
    /* Стеля 70% боронить від «вічно стоїть» на звичайному морозі, але
       повну заморозку вона б мовчки скасувала — та й перестала б бути
       повною. Тому 100 проходить як є. */
    slow:   b.slow ? (b.slow >= 100 ? 100 : Math.min(70, b.slow + (lvl - 1) * 6)) : 0,
    slowT:  b.slowT | 0,
    dot:    b.dot ? ((b.dot * u.dmg) / 100) | 0 : 0,
    dotT:   b.dotT | 0,
  };
  // Гілки лягають ПОВЕРХ рівня, у порядку вибору.
  for (const key of path) {
    const p = perkOf(b, key);
    if (!p) continue;
    if (p.dmg)    s.dmg    = ((s.dmg * p.dmg) / 100) | 0;
    if (p.range)  s.range  = ((s.range * p.range) / 100) | 0;
    if (p.cd)     s.cd     = Math.max(1, ((s.cd * p.cd) / 100) | 0);
    if (p.splash) s.splash = ((s.splash * p.splash) / 100) | 0;
    if (p.splashAdd) s.splash = (s.splash | 0) + p.splashAdd;
    if (p.spread) s.spread = ((s.spread * p.spread) / 100) | 0;
    if (p.slowT)  s.slowT  = ((s.slowT * p.slowT) / 100) | 0;
    if (p.dot)    s.dot    = ((s.dot * p.dot) / 100) | 0;
    if (p.dotT)   s.dotT   = ((s.dotT * p.dotT) / 100) | 0;
    if (p.mark)   s.mark   = ((s.mark * p.mark) / 100) | 0;
  }
  return s;
}

/** Усі шляхи, якими вежа може дійти до максимального рівня. */
export function allPaths(t: Tool): string[][] {
  const tree = treeOf(t);
  if (!tree) return [[]];
  if (isSimple(t)) return tree.main.map(p => ['', p.key]);
  const out: string[][] = [];
  for (const a of tree.main)
    for (const b of tree.then[a.key] || []) out.push([a.key, b.key]);
  return out;
}

/* Кожен перк має сталий номер — його домішують у хеш стану. Порядок у
   цьому списку МІНЯТИ НЕ МОЖНА: він і є номером. */
const ALL_PERKS: string[] = [];
for (const tree of [POINT, AREA, CHILL, VENOM]) {
  for (const p of tree.main) if (!ALL_PERKS.includes(p.key)) ALL_PERKS.push(p.key);
  for (const pair of Object.values(tree.then))
    for (const p of pair) if (!ALL_PERKS.includes(p.key)) ALL_PERKS.push(p.key);
}
export const perkCode = (key: string) => (key ? ALL_PERKS.indexOf(key) + 1 : 0);
export const PERK_KEYS = ALL_PERKS.slice();
