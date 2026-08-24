import { tiles } from '../sim/constants';
import type { Tool, ToolKey } from './types';

/* ── арсенал ───────────────────────────────────────────────────────────
   Спільний реєстр усіх башт гри. Набори (loadouts.ts) не заводять власних
   башт — вони лише дозволяють підмножину звідси, тож ключ означає те саме
   в усіх гравців і в хеші звірки.                                       */
const TOOLS: Tool[] = ([
  { key:'wall',   name:"Бар'єр",     cost:10,  dmg:0,   cd:0,  range:0,          shot:0,   swatch:'--t-wall',
    blurb:'Не стріляє. Тільки довший шлях.' },
  { key:'arrow',  name:'Стріломет',  cost:60,  dmg:15,  cd:16, range:tiles(3.3), shot:110, swatch:'--t-arrow',
    blurb:'Дешевий, швидкий, одна ціль.' },
  { key:'mortar', name:'Мортира',    cost:130, dmg:34,  cd:42, range:tiles(3.1), shot:70,  swatch:'--t-mortar',
    splash:tiles(1.15), blurb:'Осколки по площі.' },
  { key:'frost',  name:'Кріостат',   cost:95,  dmg:9,   cd:22, range:tiles(3.0), shot:95,  swatch:'--t-frost',
    slow:45, slowT:45, blurb:'Сповільнює на 45%.' },
  { key:'venom',  name:'Токсин',     cost:110, dmg:8,   cd:26, range:tiles(3.1), shot:95,  swatch:'--t-venom',
    dot:11, dotT:90, blurb:'Отрута йде крізь броню.' },
  { key:'rail',   name:'Рейкотрон',  cost:200, dmg:110, cd:74, range:tiles(6.5), shot:240, swatch:'--t-rail',
    blurb:'Далеко й боляче, але рідко.' },
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
