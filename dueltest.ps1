# Перевіряє механіку «кожен на своїй лінії» на рівні ядра: дві сольні
# Sim з однаковим сідом мають лишатись ідентичними, поки на одну з них
# не подіяли, і розходитись одразу після — без жодної мережі чи UI.
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$html = Get-Content (Join-Path $root 'index.html') -Raw
$b = $html.IndexOf('/* ===SIM-CORE-BEGIN===')
$e = $html.IndexOf('/* ===SIM-CORE-END===')
if ($b -lt 0 -or $e -lt 0) { throw 'маркери сим-ядра не знайдено' }
$core = $html.Substring($b, $e - $b)

$test = @'
const out = []; const say = s => out.push(s); let fails = 0;
function check(name, ok, extra) {
  say((ok ? '  ok   ' : '  ЗБІЙ ') + name + (extra ? '  — ' + extra : ''));
  if (!ok) fails++;
}

const MAP = 1, MODE = MODE_FIXED, SEED = 'DUEL-TEST', DIFF = 100;

// 1. однаковий сід -> однаковий старт
const a = new Sim(SEED, DIFF, 1, MAP, MODE);
const b = new Sim(SEED, DIFF, 1, MAP, MODE);
check('дві сольні дошки з тим самим сідом стартують однаково', a.hash() === b.hash());

// 2. будівництво на ОДНІЙ дошці не чіпає другу. Порівнюємо не з хешем
//    ДО кроку (тік однаково зрушить обидві), а з дошкою c, яка теж
//    крутнулась на один тік без жодних команд — це і є «нульовий вплив».
const c0 = new Sim(SEED, DIFF, 1, MAP, MODE);
a.step([{ t:'build', p:0, seq:0, x:2, y:2, k:'arrow' }]);
b.step([]);
c0.step([]);
check('дошка без команд іде так само, як і зовсім чужа дошка', b.hash() === c0.hash());
check('дошка з будівництвом розійшлась', a.hash() !== b.hash());
check('вежа є лише на своїй дошці', a.towers.length === 1 && b.towers.length === 0);

// 3. далі обидві крутяться БЕЗ команд (a вже має вежу, b порожня) —
//    a має протриматись довше або принаймні НЕ гірше за b
for (let i = 0; i < 20000 && !a.over && !b.over; i++) { a.step(null); b.step(null); }
say('a (з вежею) дожила до тіку ' + a.tick + ', хвиля ' + a.wave + (a.over ? ' (впала)' : ''));
say('b (без веж) дожила до тіку ' + b.tick + ', хвиля ' + b.wave + (b.over ? ' (впала)' : ''));
check('обидві дошки самостійно дійшли до якогось результату', a.tick > 100 && b.tick > 100);
check('вежа реально допомагає — a протрималась не менше, ніж b', a.wave >= b.wave);

// 4. третя дошка з ТИМ САМИМ сідом і БЕЗ команд має повторити b точно
const c = new Sim(SEED, DIFF, 1, MAP, MODE);
for (let i = 0; i < b.tick; i++) c.step(null);
check('незалежна повторна симуляція збігається з b (детермінізм)', c.hash() === b.hash(),
      'b=' + b.hash() + ' c=' + c.hash());

say('');
say(fails ? '══ ЗБОЇВ: ' + fails + ' ══' : '══ УСЕ ЧИСТО ══');
document.getElementById('out').textContent = out.join('\n');
'@

$outHtml = @"
<!doctype html><meta charset="utf-8"><title>dueltest</title>
<body style="background:#0B1116;color:#C8D6DE;font:13px/1.6 ui-monospace,Consolas,monospace;padding:20px">
<pre id="out">…</pre>
<script>
"use strict";
$core
$test
</script>
"@
$dest = Join-Path $root 'dueltest.html'
Set-Content -Path $dest -Value $outHtml -Encoding UTF8
"зібрано -> $dest"
