import { tiles } from '../sim/constants';
import type { Tool, ToolKey } from './types';

/* ══════════════════════════════════════════════════════════════════════
   РЕЄСТР БАШТ

   Спільний реєстр усієї гри. Фракції (loadouts.ts) не заводять власних
   башт — вони дозволяють підмножину звідси. Тому ключ означає ту саму
   башту в усіх гравців і в звірці хешів, скільки б фракцій не додалось.

   Поле faction — суто для угруповання в інтерфейсі. Ядро його не читає:
   що кому дозволено, вирішує набір, а не напис на башті.

   Числа «Сталі» вивірені прогонами бота ще до появи фракцій — саме тому
   вона й лишається еталоном, під який підганяються стихії.
   ══════════════════════════════════════════════════════════════════════ */

const TOOLS: Tool[] = ([

  /* ── спільне ─────────────────────────────────────────────────────── */
  { key:'wall',    faction:'any',   tier:1, name:"Бар'єр",     cost:10,  dmg:0,   cd:0,  range:0,          shot:0,   swatch:'--t-wall',
    blurb:'Не стріляє. Тільки довший шлях.' },

  /* ── СТАЛЬ ── еталон: пряма шкода, широкий спектр дальностей ─────── */
  { key:'shard',   faction:'steel', tier:1, name:'Картеч',     cost:55,  dmg:10,  cd:20, range:tiles(2.4), shot:90,  swatch:'--t-shard',
    splash:tiles(0.7), blurb:'Дешева площа, але б’є майже впритул.' },
  { key:'arrow',   faction:'steel', tier:1, name:'Стріломет',  cost:60,  dmg:15,  cd:16, range:tiles(3.3), shot:110, swatch:'--t-arrow',
    blurb:'Дешевий, швидкий, одна ціль.' },
  { key:'mortar',  faction:'steel', tier:2, name:'Мортира',    cost:130, dmg:34,  cd:42, range:tiles(3.1), shot:70,  swatch:'--t-mortar',
    splash:tiles(1.15), blurb:'Осколки по площі.' },
  { key:'rail',    faction:'steel', tier:3, name:'Рейкотрон',  cost:200, dmg:110, cd:74, range:tiles(6.5), shot:240, swatch:'--t-rail',
    blurb:'Далеко й боляче, але рідко.' },

  /* ── КРИГА ── мало шкоди, багато часу: крип довше стоїть під вогнем ─ */
  { key:'rime',    faction:'ice',   tier:1, name:'Паморозь',   cost:55,  dmg:13,  cd:18, range:tiles(3.2), shot:100, swatch:'--t-rime',
    slow:5, slowT:26, blurb:'Дешево підморожує все, що проходить.' },
  { key:'frost',   faction:'ice',   tier:1, name:'Кріостат',   cost:95,  dmg:21,  cd:22, range:tiles(3.4), shot:95,  swatch:'--t-frost',
    slow:10, slowT:28, blurb:'Головне сповільнення фракції.' },
  { key:'glacier', faction:'ice',   tier:2, name:'Льодовик',   cost:140, dmg:32,  cd:40, range:tiles(3.5), shot:80,  swatch:'--t-glacier',
    splash:tiles(1.05), slow:5, slowT:26, blurb:'Морозний вибух: б’є площею і студить усіх у ньому.' },
  { key:'hail',    faction:'ice',   tier:3, name:'Град',       cost:205, dmg:60,  cd:52, range:tiles(4.6), shot:150, swatch:'--t-hail',
    splash:tiles(1.35), blurb:'Важка площа з пристойною дальністю.' },

  /* ── ВОГОНЬ ── найбільша шкода, найкоротша рука: живе на вузьких місцях */
  { key:'ember',   faction:'fire',  tier:1, name:'Іскра',      cost:55,  dmg:12,  cd:15, range:tiles(2.5), shot:105, swatch:'--t-ember',
    blurb:'Часто й дешево, але дістає недалеко.' },
  { key:'flamer',  faction:'fire',  tier:1, name:'Вогнемет',   cost:105, dmg:9,   cd:9,  range:tiles(2.1), shot:70,  swatch:'--t-flamer',
    dot:4, dotT:45, blurb:'Ллє безперервно й підпалює. Дістає майже впритул.' },
  { key:'blaze',   faction:'fire',  tier:2, name:'Жаровня',    cost:140, dmg:30,  cd:40, range:tiles(2.9), shot:75,  swatch:'--t-blaze',
    splash:tiles(1.2), dot:4, dotT:60, blurb:'Вибух і підпал по всьому, що зачепило.' },
  { key:'pyre',    faction:'fire',  tier:3, name:'Вогнище',    cost:210, dmg:72,  cd:60, range:tiles(3.6), shot:120, swatch:'--t-pyre',
    splash:tiles(1.45), blurb:'Найважчий вибух у грі. Ставити тільки в тісняву.' },

  /* ── ОТРУТА ── слабкий удар, сильне тління; броня отруту не бачить ── */
  { key:'spore',   faction:'toxic', tier:1, name:'Спора',      cost:50,  dmg:8,   cd:17, range:tiles(2.9), shot:95,  swatch:'--t-spore',
    dot:4, dotT:50, blurb:'Майже не б’є — труїть.' },
  { key:'venom',   faction:'toxic', tier:1, name:'Токсин',     cost:110, dmg:12,  cd:26, range:tiles(3.1), shot:95,  swatch:'--t-venom',
    dot:7, dotT:75, blurb:'Отрута йде крізь броню.' },
  { key:'mire',    faction:'toxic', tier:2, name:'Багно',      cost:125, dmg:12,  cd:22, range:tiles(3.0), shot:85,  swatch:'--t-mire',
    slow:18, slowT:40, dot:5, dotT:60, blurb:'В’язко й отруйно: сповільнює й труїть заразом.' },
  { key:'blight',  faction:'toxic', tier:3, name:'Пошесть',    cost:200, dmg:35,  cd:44, range:tiles(3.5), shot:110, swatch:'--t-blight',
    splash:tiles(1.2), dot:10, dotT:85, blurb:'Хмара, що труїть усю групу одразу.' },

] as Omit<Tool, 'slot'>[]).map((t, i) => ({ ...t, slot: i }));

const TOOL_BY_KEY: Record<ToolKey, Tool> = {};
for (const t of TOOLS) TOOL_BY_KEY[t.key] = t;

/* Прокачка. Разом за третій рівень виходить 360% ціни за 4.4× шкоди —
   вигідніше за нові вежі по золоту, але дає менше покриття. Тобто вибір:
   рости вгору на хорошому місці чи вшир на посередніх. */
export interface Upgrade { dmg: number; range: number; pct: number }

const UPG: (Upgrade | null)[] = [
  null,
  { dmg:100, range:100, pct:0   },
  { dmg:210, range:112, pct:90  },
  { dmg:440, range:125, pct:170 },
];
const MAX_LVL = 3;

/* Кого бере на приціл: перший до виходу, останній, найміцніший, найслабший. */
const AIMS = ['перший', 'останній', 'міцний', 'слабкий'];

export { TOOLS, TOOL_BY_KEY, UPG, MAX_LVL, AIMS };
