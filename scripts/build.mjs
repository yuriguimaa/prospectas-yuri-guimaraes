// Gera dist/worker.js: o backend com o site embutido (substitui __ASSETS__).
// Uso: node scripts/build.mjs          -> build de produção (API_BASE original)
//      node scripts/build.mjs --local  -> app chama a API na mesma origem (para rodar localmente)
import {readFileSync, writeFileSync, mkdirSync, readdirSync, statSync} from 'node:fs';
import {join, extname, relative} from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const local = process.argv.includes('--local') || process.argv.includes('--same-origin');
const types = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml',
  '.csv': 'text/csv; charset=utf-8', '.json': 'application/json; charset=utf-8',
};

function walk(dir) {
  return readdirSync(dir).flatMap(name => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const assets = {};
function add(dir, prefix) {
  for (const file of walk(join(root, dir))) {
    const type = types[extname(file)];
    if (!type) continue;
    let body = readFileSync(file, 'utf8');
    if (local && file.endsWith('app.js')) body = body.replace(/const API_BASE='[^']*';/, "const API_BASE='';");
    const path = prefix + relative(join(root, dir), file).split('\\').join('/');
    assets[path] = {body, type};
    if (path.endsWith('/index.html')) assets[path.slice(0, -'index.html'.length)] = {body, type};
  }
}
add('cloudflare', '/');        // landing pública em /
add('frontend', '/app/');      // aplicação em /app/ (sobrescreve a cópia cloudflare/app)

const worker = readFileSync(join(root, 'backend/worker/index.js'), 'utf8')
  .replace('__ASSETS__', JSON.stringify(assets));
mkdirSync(join(root, 'dist'), {recursive: true});
writeFileSync(join(root, 'dist/worker.js'), worker);
console.log(`dist/worker.js gerado (${Object.keys(assets).length} rotas${local ? ', modo local' : ''})`);
