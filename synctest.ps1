# Перевірка злагодження двох гравців БЕЗ мережі: канал підмінено чергою
# з затримкою, зате відтворено головне — гість перезапускається пізніше
# за господаря. Саме на цьому кооп і ламався: ранні команди господаря
# падали в стару чергу й зникали.
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$html = Get-Content (Join-Path $root 'index.html') -Raw

function Slice($from, $to) {
  $b = $html.IndexOf($from); $e = $html.IndexOf($to)
  if ($b -lt 0 -or $e -lt 0) { throw "маркери не знайдено: $from" }
  return $html.Substring($b, $e - $b)
}
$sim = Slice '/* ===SIM-CORE-BEGIN===' '/* ===SIM-CORE-END==='
$net = Slice '/* ===NET-CORE-BEGIN===' '/* ===NET-CORE-END==='

$test = @'
const out = [];
const say = s => out.push(s);
let fails = 0;
function check(name, ok, extra) {
  say((ok ? '  ok   ' : '  ЗБІЙ ') + name + (extra ? '  — ' + extra : ''));
  if (!ok) fails++;
}

/* Один клієнт: симуляція + планувальник + вихідна черга «в мережу». */
function Client(id, peers) {
  this.id = id; this.peers = peers;
  this.gen = 0; this.stash = [];
  this.wire = null;                 // куди складати вихідні пакети
  this.boot(0, 1);                  // соло до з'єднання
}
Client.prototype.boot = function (gen, n) {
  this.gen = gen;
  this.sim = new Sim('SYNC', 100, n, 0, MODE_FIXED);
  this.ls = new Lockstep(n, gen, this.stash);
};
Client.prototype.recv = function (p) {
  if (p.t === 'c') this.ls.accept(p.g, p.k, p.m, this.stash);
  else if (p.t === 'r') this.boot(p.g, 2);
};
Client.prototype.tick = function () {
  const send = (t, b) => this.wire.push({ t:'c', g:this.gen, k:t, m:b });
  this.ls.publishTo(this.sim.tick + DELAY, send);
  if (!this.ls.ready(this.sim.tick, true)) return false;   // чекаємо напарника
  this.sim.step(this.ls.merged(this.sim.tick));
  return true;
};

// ── сценарій: господар з'єднався й одразу пішов, гість запізнився ──
const A = new Client(0, 2), B = new Client(1, 2);
const toB = [], toA = [];
A.wire = toB; B.wire = toA;

// господар перезапускається в покоління 1 і шле налаштування
A.boot(1, 2);
toB.push({ t:'r', g:1 });

// господар устигає зробити 8 тіків, поки гість ще в старій партії
for (let i = 0; i < 8; i++) A.tick();
say('господар відірвався на ' + A.sim.tick + ' тіків до старту гостя');
check('щось уже відправлено гостю', toB.length > 1, toB.length + ' пакетів');

// тепер гість розбирає все, що встигло прилетіти (у т.ч. до свого boot)
while (toB.length) B.recv(toB.shift());
check('гість перейшов у покоління 1', B.gen === 1);
check('ранні команди господаря не загублені', B.ls.remote.size > DELAY,
      'у черзі ' + B.ls.remote.size + ' тіків');

// далі крутимо обох разом
let stalledA = 0, stalledB = 0;
for (let step = 0; step < 400; step++) {
  while (toA.length) A.recv(toA.shift());
  while (toB.length) B.recv(toB.shift());
  if (!A.tick()) stalledA++;
  if (!B.tick()) stalledB++;
}
say('господар дійшов до тіку ' + A.sim.tick + ', гість — до ' + B.sim.tick);
check('обидва просунулись', A.sim.tick > 100 && B.sim.tick > 100);
check('розбіжність тіків не росте', Math.abs(A.sim.tick - B.sim.tick) <= DELAY + 1,
      'різниця ' + Math.abs(A.sim.tick - B.sim.tick));

// зводимо до спільного тіку й звіряємо стан
const target = Math.min(A.sim.tick, B.sim.tick);
while (A.sim.tick > target) A.sim.tick--;
while (B.sim.tick > target) B.sim.tick--;
check('однаковий стан на тіку ' + target, A.sim.hash() === B.sim.hash(),
      A.sim.hash() + ' / ' + B.sim.hash());

/* ── контроль: якщо гість стартує на іншій мапі (саме так було, коли
      господар міняв налаштування вже після створення коду), стани мусять
      розійтися. Якщо цей сценарій «зійдеться» — звірка хешів нічого не
      ловить і решта перевірок нічого не варта. ── */
say('');
say('контроль: гість на іншій мапі, ніж господар');
const A2 = new Sim('SYNC', 100, 2, 0, MODE_FIXED);
const B2 = new Sim('SYNC', 100, 2, 1, MODE_FIXED);   // мапа 1 замість 0
for (let i = 0; i < 400; i++) { A2.step(null); B2.step(null); }
say('  господар ' + A2.hash() + ' / гість ' + B2.hash());
check('різні налаштування дають різний стан', A2.hash() !== B2.hash(),
      'інакше розсинхрон лишився б непоміченим');

document.getElementById('out').textContent =
  out.join('\n') + '\n\n══ ' + (fails ? 'ЗБОЇВ: ' + fails : 'УСЕ ЗІЙШЛОСЯ') + ' ══';
'@

$outHtml = @"
<!doctype html><meta charset="utf-8"><title>synctest</title>
<body style="background:#0B1116;color:#C8D6DE;font:13px/1.6 ui-monospace,Consolas,monospace;padding:20px">
<pre id="out">…</pre>
<script>
"use strict";
$sim
$net
$test
</script>
"@
$dest = Join-Path $root 'synctest.html'
Set-Content -Path $dest -Value $outHtml -Encoding UTF8
"зібрано → $dest"
