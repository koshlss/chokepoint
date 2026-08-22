# Перевірка мережевого шару без другої машини: два Net в одній сторінці
# з'єднуються між собою тим самим кодом, що й гравці. Не перевіряє NAT,
# але точно каже, чи справний сам обмін кодами й канал даних.
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$html = Get-Content (Join-Path $root 'index.html') -Raw
$b = $html.IndexOf('/* ===NET-CORE-BEGIN===')
$e = $html.IndexOf('/* ===NET-CORE-END===')
if ($b -lt 0 -or $e -lt 0) { throw 'маркери мережевого ядра не знайдено' }
$core = $html.Substring($b, $e - $b)

$test = @'
(async function () {
  const log = [];
  const el = () => document.getElementById('out');
  const say = s => { log.push(s); el().textContent = log.join('\n'); };
  const done = (ok, why) => {
    el().textContent = log.join('\n') + '\n\n══ ' + (ok ? 'УСЕ ПРАЦЮЄ' : 'ЗБІЙ') + ' ══' + (why ? '\n' + why : '');
    document.body.style.borderTop = '6px solid ' + (ok ? '#6FB07A' : '#E0574A');
  };
  window.onerror = (m) => { say('ПОМИЛКА: ' + m); done(false); };

  try {
  if (!RTC) { say('RTCPeerConnection недоступний у цьому середовищі'); return done(false); }

  const A = new Net(), B = new Net();
  let liveA = false, liveB = false;
  A.onState = s => { say('господар: ' + s); if (s === 'live') liveA = true; };
  B.onState = s => { say('гість:    ' + s); if (s === 'live') liveB = true; };

  const setup = { seed:'TEST', diff:100, map:0, mode:1 };
  const t0 = Date.now ? 0 : 0;

  const offer = await A.host(setup);
  say('код запрошення: ' + offer.length + ' символів');

  const r = await B.join(offer);
  say('код відповіді:  ' + r.code.length + ' символів');
  say('налаштування дійшли: ' + JSON.stringify(r.s));

  await A.confirm(r.code);

  // чекаємо відкриття каналу
  for (let i = 0; i < 100 && !(liveA && liveB); i++) await new Promise(z => setTimeout(z, 100));
  say('адреси господаря: ' + JSON.stringify(A.cand));
  say('адреси гостя:     ' + JSON.stringify(B.cand));

  if (!(liveA && liveB)) {
    const noOut = A.cand.srflx === 0 && A.cand.relay === 0;
    return done(false, noOut
      ? 'Назовні вас не видно: ні зовнішніх адрес, ні ретранслятора.\nГра вдвох спрацює лише в межах однієї мережі.'
      : 'Адреси є, але канал не відкрився — блокує фаєрвол або NAT.');
  }

  // перевіряємо, що команди справді ходять в обидва боки
  let gotB = null, gotA = null;
  B.onCmds = (g, k, m) => { gotB = { g, k, m }; };
  A.onCmds = (g, k, m) => { gotA = { g, k, m }; };
  A.send({ t:'c', g:0, k:5, m:[{ t:'build', p:0, seq:1, x:3, y:4, k:'arrow' }] });
  B.send({ t:'c', g:0, k:5, m:[{ t:'build', p:1, seq:1, x:9, y:9, k:'wall' }] });
  for (let i = 0; i < 40 && !(gotA && gotB); i++) await new Promise(z => setTimeout(z, 50));
  say('гість отримав:    ' + JSON.stringify(gotB));
  say('господар отримав: ' + JSON.stringify(gotA));
  done(!!(gotA && gotB), (gotA && gotB) ? 'Обмін кодами й канал даних справні.' : 'Канал відкрився, але команди не дійшли.');
  } catch (err) { say('ВИНЯТОК: ' + (err && err.message ? err.message : err)); done(false); }
})();
'@

$out = @"
<!doctype html><meta charset="utf-8"><title>Chokepoint — перевірка мережі</title>
<body style="background:#0B1116;color:#C8D6DE;font:14px/1.5 system-ui;margin:0;padding:24px">
<h1 style="font:600 20px/1.2 system-ui;margin:0 0 4px">Перевірка кооперативу</h1>
<p style="color:#7E929D;margin:0 0 16px">Зводить двох гравців в одному вікні тим самим кодом, що й гра.
Займає до 15 секунд.</p>
<pre id="out" style="font:12px/1.5 ui-monospace,Consolas,monospace;background:#131E25;
  border:1px solid #22323C;border-radius:3px;padding:12px;white-space:pre-wrap">працює…</pre>
<script>
"use strict";
$core
$test
</script>
"@
$dest = Join-Path $root 'nettest.html'
Set-Content -Path $dest -Value $out -Encoding UTF8
"мережеве ядро: {0:N0} символів  →  {1}" -f $core.Length, $dest
