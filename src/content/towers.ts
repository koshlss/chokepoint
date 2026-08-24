import { tiles } from '../sim/constants';
import type { Tool, ToolKey } from './types';

/* ══════════════════════════════════════════════════════════════════════
   РЕЄСТР БАШТ

   Спільний реєстр усієї гри. Фракції (loadouts.ts) не заводять власних
   башт — вони дозволяють підмножину звідси. Тому ключ означає ту саму
   башту в усіх гравців і в звірці хешів, скільки б фракцій не додалось.

   ── Чому рівні ростуть саме так ──────────────────────────────────────
   Гравця тиснуть два обмеження одночасно: ЗОЛОТО (приблизно дві третини
   ваги) і КЛІТИНИ вздовж траси (решта). Тому ладдер побудований так:

     віддача на золото    лишається приблизно РІВНОЮ між рівнями
     абсолютна шкода      з однієї башти РОСТЕ: ~40 → ~100 → ~200

   Це навмисно робить вибір ситуативним, а не приписаним. Поки місця
   вдосталь, дешеві вежі не гірші за золото. Коли хороші клітини скінчились,
   дорога вежа на тій самій клітині — єдиний спосіб додати шкоди.

   Знос старої вежі заради нової — НЕ закладений крок, а ставка гравця:
   повертається 70%, тож він платить третину ціни за перетворення клітини
   на шкоду. Іноді це вигідно, іноді ні — і саме тому це рішення.

   Найдорожча базова навмисно не по кишені на старті: 500 золота на неї
   не вистачає, і перші хвилі гравець дивиться на неї як на ціль.

   ── Описи ────────────────────────────────────────────────────────────
   Тільки загальний тон, без підказок про радіус, площу чи ефекти. Що саме
   робить башта, гравець дізнається, поставивши її.
   ══════════════════════════════════════════════════════════════════════ */

const TOOLS: Tool[] = ([

  /* ── спільне ─────────────────────────────────────────────────────── */
  { key:'wall',    faction:'any',   tier:1, name:"Бар'єр",     cost:10,  dmg:0,   cd:0,  range:0,          shot:0,   swatch:'--t-wall',
    mazeOnly:true, blurb:'Просто камінь. Нікого не вб’є.' },

  /* ══ СТАЛЬ ══ основна ─────────────────────────────────────────────── */
  { key:'shard',   faction:'steel', tier:1, name:'Картеч',     cost:45,  dmg:9,   cd:18, range:tiles(2.3), shot:90,  swatch:'--t-shard',
    splash:tiles(0.6), blurb:'Грубо, дешево й багато.' },
  { key:'arrow',   faction:'steel', tier:1, name:'Стріломет',  cost:90,  dmg:22,  cd:15, range:tiles(3.3), shot:110, swatch:'--t-arrow',
    blurb:'Робоча конячка оборони.' },
  { key:'mortar',  faction:'steel', tier:1, name:'Мортира',    cost:170, dmg:38,  cd:38, range:tiles(3.0), shot:70,  swatch:'--t-mortar',
    splash:tiles(1.1), blurb:'Гупає глухо й нечасто.' },
  { key:'lance',   faction:'steel', tier:2, name:'Спис',       cost:260, dmg:90,  cd:32, range:tiles(4.2), shot:200, swatch:'--t-lance',
    blurb:'Точний різкий удар з відстані.' },
  { key:'cannon',  faction:'steel', tier:2, name:'Гармата',    cost:380, dmg:130, cd:38, range:tiles(3.4), shot:90,  swatch:'--t-cannon',
    splash:tiles(1.35), blurb:'Важка, гучна, впевнена.' },
  { key:'rail',    faction:'steel', tier:3, name:'Рейкотрон',  cost:620, dmg:380, cd:58, range:tiles(6.5), shot:260, swatch:'--t-rail',
    blurb:'Вершина інженерії. Дуже дорога.' },

  /* ══ ВОГОНЬ ══ основна ────────────────────────────────────────────── */
  { key:'ember',   faction:'fire',  tier:1, name:'Іскра',      cost:45,  dmg:8,   cd:13, range:tiles(2.4), shot:105, swatch:'--t-ember',
    blurb:'Дрібна, метушлива, дешева.' },
  { key:'flamer',  faction:'fire',  tier:1, name:'Вогнемет',   cost:90,  dmg:7,   cd:7,  range:tiles(2.0), shot:70,  swatch:'--t-flamer',
    dot:3, dotT:45, blurb:'Ллє без упину.' },
  { key:'blaze',   faction:'fire',  tier:1, name:'Жаровня',    cost:170, dmg:33,  cd:34, range:tiles(2.7), shot:75,  swatch:'--t-blaze',
    splash:tiles(1.15), dot:3, dotT:60, blurb:'Розжарена й непривітна.' },
  { key:'forge',   faction:'fire',  tier:2, name:'Горнило',    cost:260, dmg:56,  cd:28, range:tiles(2.6), shot:85,  swatch:'--t-forge',
    dot:5, dotT:60, blurb:'Гуде так, що чути здалеку.' },
  { key:'pyre',    faction:'fire',  tier:2, name:'Вогнище',    cost:380, dmg:105, cd:40, range:tiles(3.2), shot:120, swatch:'--t-pyre',
    splash:tiles(1.4), blurb:'Після неї лишається попіл.' },
  { key:'inferno', faction:'fire',  tier:3, name:'Пекло',      cost:620, dmg:235, cd:52, range:tiles(3.6), shot:130, swatch:'--t-inferno',
    splash:tiles(1.7), dot:9, dotT:80, blurb:'Не питай, що воно робить.' },

  /* ══ КРИГА ══ допоміжна: коротко й жорстко ────────────────────────── */
  { key:'frost',   faction:'ice',   tier:1, name:'Кріостат',   cost:60,  dmg:4,   cd:9,  range:tiles(3.0), shot:120, swatch:'--t-frost',
    spread:tiles(0.9), slow:25, slowT:16, mark:60, blurb:'Тихо потріскує холодом.' },
  { key:'sleet',   faction:'ice',   tier:1, name:'Ожеледь',    cost:150, dmg:14,  cd:20, range:tiles(3.2), shot:100, swatch:'--t-sleet',
    spread:tiles(1.3), slow:40, slowT:18, mark:60, blurb:'Під нею незатишно.' },
  { key:'glacier', faction:'ice',   tier:2, name:'Льодовик',   cost:320, dmg:40,  cd:40, range:tiles(3.2), shot:80,  swatch:'--t-glacier',
    splash:tiles(1.1), spread:tiles(1.9), slow:100, slowT:18, mark:60, blurb:'Важка, повільна, невблаганна.' },
  { key:'rift',    faction:'ice',   tier:3, name:'Розлом',     cost:600, dmg:120, cd:46, range:tiles(3.8), shot:90,  swatch:'--t-rift',
    splash:tiles(1.4), spread:tiles(2.4), slow:100, slowT:26, mark:60, blurb:'Повітря навколо неї тріскається.' },

  /* ══ ОТРУТА ══ допоміжна: довго й м'яко ───────────────────────────── */
  { key:'venom',   faction:'toxic', tier:1, name:'Токсин',     cost:60,  dmg:5,   cd:20, range:tiles(3.0), shot:95,  swatch:'--t-venom',
    dot:4, dotT:90, mark:25, blurb:'Пахне кисло. Краще не підходити.' },
  { key:'mire',    faction:'toxic', tier:1, name:'Багно',      cost:150, dmg:12,  cd:24, range:tiles(3.1), shot:85,  swatch:'--t-mire',
    slow:25, slowT:40, dot:4, dotT:90, mark:25, blurb:'Чвакає й затягує.' },
  { key:'blight',  faction:'toxic', tier:2, name:'Пошесть',    cost:320, dmg:40,  cd:44, range:tiles(3.4), shot:110, swatch:'--t-blight',
    splash:tiles(1.3), slow:25, slowT:35, dot:8, dotT:120, mark:25, blurb:'Хмара, яку не хочеться вдихати.' },
  { key:'plague',  faction:'toxic', tier:3, name:'Мор',        cost:600, dmg:110, cd:50, range:tiles(3.8), shot:100, swatch:'--t-plague',
    splash:tiles(1.5), dot:14, dotT:150, mark:25, blurb:'Те, від чого не тікають.' },

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
