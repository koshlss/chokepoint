/* ══════════════════════════════════════════════════════════════════════
   АРХІВ ВЕРСІЙ

   Збирає кожну випущену версію гри в свою підпапку dist/v/<версія>/, щоб
   їх можна було відкрити й порівняти — як саме грався баланс до правки,
   що змінилось у відчутті, коли зникла та чи інша вада.

   Звідки береться список: кожен випуск міняв src/version.ts, тож коміти,
   що торкались цього файлу, і є списком версій. Нічого вести вручну не
   треба — історія сама себе описує.

   Як збирається: один робочий каталог, у якому по черзі переключаються
   коміти. Це на порядок швидше за окремий каталог на версію, а
   node_modules беруться з основного дерева посиланням.

   Збірка старої версії робиться БЕЗ tsc: типи тодішнього коду можуть не
   сходитись із теперішнім TypeScript, а нам потрібен лише той самий
   результат, що колись поїхав на сайт.
   ══════════════════════════════════════════════════════════════════════ */
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync, symlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(process.cwd());
const OUT = join(ROOT, 'dist', 'v');
const WT = join(ROOT, '.versions-wt');
const BASE = process.env.VITE_BASE || '/chokepoint/';

const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim();

/** Версія → коміт, що її випустив, з назвою й датою. */
function releases() {
  const shas = git('log', '--format=%H', '--', 'src/version.ts').split('\n').filter(Boolean);
  const seen = new Map();
  for (const sha of shas) {
    let stamp = '';
    try {
      const src = git('show', `${sha}:src/version.ts`);
      stamp = (src.match(/'([^']+)'/) || [])[1] || '';
    } catch { continue; }
    if (!stamp || seen.has(stamp)) continue;
    seen.set(stamp, {
      v: stamp,
      sha: sha.slice(0, 7),
      date: git('show', '-s', '--format=%ad', '--date=short', sha),
      title: git('show', '-s', '--format=%s', sha),
    });
  }
  return [...seen.values()];   // від найновішої до найстарішої
}

/* Кожна архівна збірка отримує смужку «повернутись до останньої»: сама вона
   про існування архіву не знає й знати не може — її код давно зафіксовано. */
function backBar(v, current) {
  return `<div style="position:fixed;left:0;right:0;bottom:0;z-index:99999;
  background:#0B1116;border-top:1px solid #22323C;color:#7E929D;
  font:12px/1.6 system-ui,sans-serif;padding:6px 14px;display:flex;
  gap:14px;align-items:center;justify-content:center">
  <span>архівна версія <b style="color:#E9A93C">${v}</b></span>
  <a href="${BASE}" style="color:#57A0BE">← до останньої (${current})</a>
</div>`;
}

function main() {
  const list = releases();
  if (!list.length) { console.log('версій не знайдено'); return; }
  const current = list[0].v;
  const older = list.slice(1);            // найновіша вже лежить у корені
  console.log(`версій: ${list.length}, поточна ${current}, в архів іде ${older.length}`);

  rmSync(WT, { recursive: true, force: true });
  try { git('worktree', 'remove', '--force', WT); } catch {}
  git('worktree', 'add', '--detach', '-f', WT, 'HEAD');
  const nm = join(WT, 'node_modules');
  if (!existsSync(nm)) {
    try { symlinkSync(join(ROOT, 'node_modules'), nm, 'junction'); }
    catch (e) { console.log('не вдалось підв’язати node_modules: ' + e.message); }
  }

  mkdirSync(OUT, { recursive: true });
  const done = [];
  for (const r of older) {
    const dir = join(OUT, r.v);
    try {
      execFileSync('git', ['-C', WT, 'checkout', '--force', '--detach', r.sha], { stdio: 'ignore' });
      execFileSync('npx', ['vite', 'build',
        `--base=${BASE}v/${r.v}/`, `--outDir=${dir}`, '--emptyOutDir', '--logLevel=error'],
        { cwd: WT, stdio: 'inherit', shell: process.platform === 'win32' });
      const idx = join(dir, 'index.html');
      const html = readFileSync(idx, 'utf8');
      writeFileSync(idx, html.replace('</body>', backBar(r.v, current) + '</body>'), 'utf8');
      done.push(r);
      console.log(`  ✓ ${r.v}  ${r.title.slice(0, 58)}`);
    } catch (e) {
      // одна зламана версія не має валити весь архів
      console.log(`  ✗ ${r.v}  не зібралась: ${String(e.message).split('\n')[0]}`);
      rmSync(dir, { recursive: true, force: true });
    }
  }

  try { git('worktree', 'remove', '--force', WT); } catch {}
  rmSync(WT, { recursive: true, force: true });

  writeFileSync(join(OUT, 'index.json'),
    JSON.stringify({ current, versions: done.map(({ v, date, title }) => ({ v, date, title })) }, null, 1),
    'utf8');
  console.log(`архів готовий: ${done.length} із ${older.length}`);
}

main();
