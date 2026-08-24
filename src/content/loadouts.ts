import { TOOL_BY_KEY } from './towers';
import type { Loadout, Role, ToolKey } from './types';

/* ══════════════════════════════════════════════════════════════════════
   ФРАКЦІЇ: ОСНОВНА + ДОПОМІЖНА

   Гравець бере рівно одну основну й одну допоміжну. Основна дає хребет
   шкоди, допоміжна — контроль. Комбінацій виходить (основні × допоміжні),
   і саме вони, а не окремі фракції, є одиницею балансу.

   Будова однакова в кожної комбінації — це й робить їх порівнюваними:

     старт      3 основної + 2 допоміжної = 5   (45 … 170 золота)
     хвиля 5    +2 основної, +1 допоміжної = 3  (260 … 380)
     хвиля 12   +1 основної, +1 допоміжної = 2  (600 … 620)

   Разом десять. Найдорожча базова навмисно поза межами стартового
   золота — перші хвилі на неї заробляють.

   Обидві допоміжні сповільнюють, але протилежно:
     Крига  — коротко й жорстко: часті слабкі постріли, повна заморозка
     Отрута — довго й м'яко: в'язко, масово, крізь броню
   ══════════════════════════════════════════════════════════════════════ */

export const UNIVERSAL: ToolKey[] = ['wall'];

export const LOADOUTS: Loadout[] = [
  {
    key: 'steel',
    role: 'primary',
    name: 'Сталь',
    blurb: 'Пряма шкода без фокусів. Найширший спектр дальностей — прощає погане місце.',
    tools: [...UNIVERSAL, 'shard', 'arrow', 'mortar', 'lance', 'cannon', 'rail'],
  },
  {
    key: 'fire',
    role: 'primary',
    name: 'Вогонь',
    blurb: 'Найбільша шкода в грі й найкоротша рука. Живе на вузьких місцях, гине на відкритих.',
    tools: [...UNIVERSAL, 'ember', 'flamer', 'blaze', 'forge', 'pyre', 'inferno'],
  },
  {
    key: 'ice',
    role: 'support',
    name: 'Крига',
    blurb: 'Короткий різкий контроль. Позначені нею цілі отримують набагато більше шкоди від усіх твоїх веж — але ненадовго.',
    tools: ['frost', 'sleet', 'glacier', 'rift'],
  },
  {
    key: 'toxic',
    role: 'support',
    name: 'Отрута',
    blurb: 'Довгий м’який контроль. Позначає слабше, зате надовго, і позначка їде з крипом далі трасою. Труїть крізь броню.',
    tools: ['venom', 'mire', 'blight', 'plague'],
  },
];

export const LOADOUT_BY_KEY: Record<string, Loadout> = {};
for (const l of LOADOUTS) LOADOUT_BY_KEY[l.key] = l;

export const PRIMARIES = LOADOUTS.filter(l => l.role === 'primary');
export const SUPPORTS  = LOADOUTS.filter(l => l.role === 'support');

export const DEFAULT_PRIMARY = 'steel';
export const DEFAULT_SUPPORT = 'ice';

/** Усі можливі пари — одиниця балансу. */
export const COMBOS: { primary: Loadout; support: Loadout; name: string }[] =
  PRIMARIES.flatMap(p => SUPPORTS.map(s => ({ primary: p, support: s, name: `${p.name} + ${s.name}` })));

/** Реєстр цілком — режим «без обмежень», ним ганяється базова лінія стенда. */
export const FULL_ARSENAL: ToolKey[] = Object.keys(TOOL_BY_KEY);

/** Пара ключів → список дозволених башт. Порядок беремо з реєстру, щоб
 *  арсенал виглядав однаково незалежно від того, як вибирали. */
export function toolsOf(primary: string, support: string): ToolKey[] {
  const p = LOADOUT_BY_KEY[primary]?.role === 'primary' ? LOADOUT_BY_KEY[primary] : LOADOUT_BY_KEY[DEFAULT_PRIMARY];
  const s = LOADOUT_BY_KEY[support]?.role === 'support' ? LOADOUT_BY_KEY[support] : LOADOUT_BY_KEY[DEFAULT_SUPPORT];
  const seen = new Set([...p.tools, ...s.tools]);
  return FULL_ARSENAL.filter(k => seen.has(k));
}

/* Перевірки при старті — щоб зламаний контент падав тут, а не посеред партії. */
for (const lo of LOADOUTS) {
  for (const k of lo.tools)
    if (!TOOL_BY_KEY[k]) throw new Error(`фракція «${lo.key}» вимагає невідому башту «${k}»`);
}
export const PRIMARY_SHAPE = [3, 2, 1];   // базові / середні / топові
export const SUPPORT_SHAPE = [2, 1, 1];

const shapeOf = (lo: Loadout) => {
  const own = lo.tools.map(k => TOOL_BY_KEY[k]).filter(t => t.shot);
  return [1, 2, 3].map(t => own.filter(x => x.tier === t).length);
};
for (const p of PRIMARIES) {
  if (!p.tools.includes('wall')) throw new Error(`основна «${p.key}» без бар'єра`);
  if (String(shapeOf(p)) !== String(PRIMARY_SHAPE))
    throw new Error(`основна «${p.key}»: рівні ${shapeOf(p)}, а має бути ${PRIMARY_SHAPE}`);
}
for (const s of SUPPORTS) {
  if (String(shapeOf(s)) !== String(SUPPORT_SHAPE))
    throw new Error(`допоміжна «${s.key}»: рівні ${shapeOf(s)}, а має бути ${SUPPORT_SHAPE}`);
}
for (const c of COMBOS) {
  const own = toolsOf(c.primary.key, c.support.key).map(k => TOOL_BY_KEY[k]).filter(t => t.shot);
  if (!own.some(t => t.tier === 1 && t.cost <= 65))
    throw new Error(`${c.name}: немає дешевої стартової башти`);
  // найдорожча базова має бути ціллю, а не покупкою з першого кліку
  const topBase = Math.max(...own.filter(t => t.tier === 1).map(t => t.cost));
  if (topBase <= 120) throw new Error(`${c.name}: базові надто дешеві, немає до чого тягнутись`);
}
