import { TOOL_BY_KEY } from './towers';
import type { Loadout, ToolKey } from './types';

/* ══════════════════════════════════════════════════════════════════════
   НАБОРИ АРСЕНАЛУ

   Набір не заводить власних башт — він дозволяє підмножину спільного
   реєстру TOOLS. Тому 'mortar' означає ту саму мортиру в усіх, незалежно
   від того, хто який набір узяв, і команда build лишається однозначною
   по дроту.

   Бар'єр є всюди: це не башта, а сам засіб мазингу. Набір без нього
   позбавляв би гравця режиму «Лабіринт», а не давав би йому характер.
   ══════════════════════════════════════════════════════════════════════ */

export const UNIVERSAL: ToolKey[] = ['wall'];

export const LOADOUTS: Loadout[] = [
  {
    key: 'classic',
    name: 'Класика',
    blurb: 'Пряма шкода без хитрощів. Дешевий стрільник, площа, далекобій.',
    tools: [...UNIVERSAL, 'arrow', 'mortar', 'rail'],
    startable: true,
  },
  {
    key: 'control',
    name: 'Контроль',
    blurb: 'Сповільнити й отруїти. Сирої шкоди мало — тримається на часі під вогнем.',
    tools: [...UNIVERSAL, 'arrow', 'frost', 'venom'],
    startable: true,
  },
  {
    key: 'siege',
    name: 'Облога',
    blurb: 'Площа й далекобій. Картеч тримає ранні хвилі впритул, далі — важка артилерія.',
    tools: [...UNIVERSAL, 'shard', 'mortar', 'rail'],
    startable: true,
  },
];

export const LOADOUT_BY_KEY: Record<string, Loadout> = {};
for (const l of LOADOUTS) LOADOUT_BY_KEY[l.key] = l;

/** Набір за замовчуванням — повний арсенал. Ним грали до появи наборів,
 *  і саме він лишається у соло, поки гравець не вибрав інше. */
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

/** Перевірка при старті: набір не має посилатись на неіснуючу башту. */
for (const lo of LOADOUTS)
  for (const k of lo.tools)
    if (!TOOL_BY_KEY[k]) throw new Error(`набір «${lo.key}» вимагає невідому башту «${k}»`);
