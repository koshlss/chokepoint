# Збирає bench.html: сим-ядро вирізається з index.html між маркерами,
# тож стенд ганяє рівно той код, який стоїть у грі.
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$html = Get-Content (Join-Path $root 'index.html') -Raw

$b = $html.IndexOf('/* ===SIM-CORE-BEGIN===')
$e = $html.IndexOf('/* ===SIM-CORE-END===')
if ($b -lt 0 -or $e -lt 0) { throw 'маркери сим-ядра не знайдено в index.html' }
$core = $html.Substring($b, $e - $b)

$player = Get-Content (Join-Path $root 'bench-player.js') -Raw

$out = @"
<!doctype html><meta charset="utf-8"><title>bench</title><body>
<script>
"use strict";
$core
$player
</script>
"@
$dest = Join-Path $root 'bench.html'
Set-Content -Path $dest -Value $out -Encoding UTF8
"ядро: {0:N0} символів  →  {1}" -f $core.Length, $dest
