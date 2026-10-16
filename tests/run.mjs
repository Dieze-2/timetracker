// Lance les suites de tests navigateur (Playwright + Chromium).
//
//   npm test                 toutes les suites
//   npm test -- mobile cta   seulement celles dont le nom contient « mobile » ou « cta »
//
// Deux serveurs statiques sont démarrés sur des ports libres : l'app du dépôt
// et la version d'origine figée dans tests/legacy/ (référence des calculs).
// Les captures d'écran vont dans tests/output/ (ignoré par Git).
import http from 'node:http';
import { readFile, readdir, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8',
};

// `suffix` : extension ajoutée sur le disque (« .txt » pour la version figée,
// qui ne doit pas être exécutable si le dépôt est publié en site statique).
function serve(dir, suffix = '') {
  const server = http.createServer(async (req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(dir, p);
    if (!file.startsWith(dir + path.sep)) { res.writeHead(403).end(); return; }
    try {
      const body = await readFile(file + suffix);
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(body);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' }).end('<h1>404</h1>');
    }
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

const sw = await readFile(path.join(root, 'sw.js'), 'utf8');
const cache = (sw.match(/CACHE_NAME\s*=\s*'([^']+)'/) || [])[1];
if (!cache) { console.error('CACHE_NAME introuvable dans sw.js'); process.exit(1); }

const app = await serve(root);
const legacy = await serve(path.join(here, 'legacy'), '.txt');
// « localhost » (et non 127.0.0.1) : contexte sécurisé, requis par le service worker.
const env = {
  ...process.env,
  BASE_URL: `http://localhost:${app.address().port}/`,
  LEGACY_URL: `http://localhost:${legacy.address().port}/`,
  CACHE_NAME: cache,
};

const out = path.join(here, 'output');
await mkdir(out, { recursive: true });

const filters = process.argv.slice(2);
const suites = (await readdir(here))
  .filter(f => f.endsWith('.test.mjs'))
  .filter(f => !filters.length || filters.some(x => f.includes(x)))
  .sort();

let failed = [];
for (const suite of suites) {
  console.log(`\n── ${suite}`);
  const code = await new Promise(resolve => {
    const child = spawn(process.execPath, [path.join(here, suite)], { cwd: out, env, stdio: 'inherit' });
    child.on('exit', c => resolve(c ?? 1));
  });
  if (code !== 0) failed.push(suite);
}

app.close(); legacy.close();
console.log(failed.length ? `\nÉchec : ${failed.join(', ')}` : `\n${suites.length} suites vertes`);
process.exit(failed.length ? 1 : 0);
