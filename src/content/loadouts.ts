import { TOOL_BY_KEY } from './towers';
import type { Loadout, ToolKey } from './types';

/* ══════════════════════════════════════════════════════════════════════
   ФРАКЦІЇ

   Чотири неперетинні арсенали. Спільний у них лише бар'єр — він не
   башта, а сам засіб мазингу: набір без нього не давав би характеру,
   а відбирав би режим «Лабіринт».

   Набір не заводить власних башт, а дозволяє підмножину спільного
   реєстру. Тому ключ 'venom' означає той самий Токсин у всіх, команда
   build лишається однозначною по дроту, а «стартовий + набутий» — це
   просто об'єднання множин, яке можна розширювати під час партії.

   Кожна фракція обов'язково має дешеву ранню башту. Це не смак:
   прогін показав, що набір із самих дорогих гине на 7-й хвилі
   незалежно від майстерності — стартових 500 золота просто не
   вистачає, щоб щось поставити до перших хвиль.
   ══════════════════════════════════════════════════════════════════════ */

export const UNIVERSAL: ToolKey[] = ['wall'];

export const LOADOUTS: Loadout[] = [
  {
    key: 'steel',
    name: 'Сталь',
    blurb: 'Пряма шкода без фокусів. Найширший вибір дальностей — прощає погане місце.',
    tools: [...UNIVERSAL, 'shard', 'arrow', 'mortar', 'rail'],
    startable: true,
  },
  {
    key: 'ice',
    name: 'Крига',
    blurb: 'Б’є слабко, зате все сповільнює. Виграє часом: крип довше стоїть під вогнем.',
    tools: [...UNIVERSAL, 'rime', 'frost', 'glacier', 'hail'],
    startable: true,
  },
  {
    key: 'fire',
    name: 'Вогонь',
    blurb: 'Найбільша шкода в грі й найкоротша рука. Живе на вузьких місцях, гине на відкритих.',
    tools: [...UNIVERSAL, 'ember', 'flamer', 'blaze', 'pyre'],
    startable: true,
  },
  {
    key: 'toxic',
    name: 'Отрута',
    blurb: 'Слабкий удар, сильне тління. Броня отруту не бачить — але швидкі встигають утекти.',
    tools: [...UNIVERSAL, 'spore', 'venom', 'mire', 'blight'],
    startable: true,
  },
];

export const LOADOUT_BY_KEY: Record<string, Loadout> = {};
for (const l of LOADOUTS) LOADOUT_BY_KEY[l.key] = l;

/** Набір за замовчуванням, якщо гравець ще нічого не обрав. */
export const DEFAULT_LOADOUT = 'steel';

/** Увесь реєстр — режим «без обмежень», ним ганяється базова лінія стенда. */
export const FULL_ARSENAL: ToolKey[] = Object.keys(TOOL_BY_KEY);

/** Набори гравця (стартовий + усе набуте) згортаються в один дозвіл. */
export function mergeLoadouts(keys: string[]): ToolKey[] {
  const seen = new Set<ToolKey>();
  for (const k of keys) {
    const lo = LOADOUT_BY_KEY[k];
    if (!lo) continue;
    for (const t of lo.tools) seen.add(t);
  }
  // порядок беремо з реєстру, щоб арсенал виглядав однаково незалежно
  // від того, в якій послідовності набори відкривались
  return FULL_ARSENAL.filter(k => seen.has(k));
}

/** Ключ набору → список башт. Невідомий ключ падає на типовий. */
export function toolsOf(key: string): ToolKey[] {
  return (LOADOUT_BY_KEY[key] || LOADOUT_BY_KEY[DEFAULT_LOADOUT]).tools;
}

/* Перевірки при старті — щоб зламаний контент падав тут, а не посеред партії. */
for (const lo of LOADOUTS) {
  for (const k of lo.tools)
    if (!TOOL_BY_KEY[k]) throw new Error(`набір «${lo.key}» вимагає невідому башту «${k}»`);
  if (!lo.tools.includes('wall')) throw new Error(`набір «${lo.key}» без бар'єра`);
  const cheap = lo.tools.filter(k => TOOL_BY_KEY[k].shot && TOOL_BY_KEY[k].cost <= 65);
  if (!cheap.length) throw new Error(`набір «${lo.key}» без дешевої ранньої башти`);
}
