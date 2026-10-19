// Servidor local que roda o Worker no Node (sem precisar do Cloudflare).
// Lê variáveis do arquivo .env, se existir.
import http from 'node:http';
import {existsSync, readFileSync} from 'node:fs';

const root = new URL('..', import.meta.url).pathname;
const env = {};
if (existsSync(root + '.env')) {
  for (const line of readFileSync(root + '.env', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2];
  }
}
const {default: worker} = await import(root + 'dist/worker.js');
const port = Number(process.env.PORT || 8787);

http.createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks);
  const request = new Request(`http://localhost:${port}${req.url}`, {method: req.method, headers: req.headers, body});
  try {
    const out = await worker.fetch(request, env);
    res.writeHead(out.status, Object.fromEntries(out.headers));
    res.end(Buffer.from(await out.arrayBuffer()));
  } catch (e) {
    console.error(e);
    res.writeHead(500); res.end('Erro interno');
  }
}).listen(port, () => {
  console.log(`Prospectas rodando em http://localhost:${port}  (app em /app/)`);
  if (!env.SUPABASE_URL) console.log('Aviso: sem .env com SUPABASE_URL/SUPABASE_SECRET_KEY, login e leads salvos ficam indisponíveis.');
});
