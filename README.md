# Prospectas Yuri Guimaraes — pacote para Claude

Este pacote contém o código do site, backend e arquivos da hospedagem Cloudflare. Ele não contém senhas, tokens ou chaves de produção.

## Estrutura

- `frontend/`: tela de cadastro/login, busca de empresas e leads salvos.
- `backend/worker/index.js`: API que conversa com Supabase e as fontes de busca.
- `cloudflare/`: landing pública e a cópia estática da aplicação para Cloudflare Workers.
- `supabase/schema.sql`: tabela de leads e regras de acesso por usuário.
- `supabase/admin-role.sql`: regra para definir o administrador pelo e-mail.
- `supabase/pipeline.sql`: etapas (novo, contatado, negociando, fechado, perdido) e anotações dos leads salvos. Rode uma vez no SQL Editor; sem ele, a plataforma funciona mas esconde etapas e anotações.
- `.env.example`: nomes das variáveis que precisam ser cadastradas no servidor.

## Para continuar no Claude

1. Importe esta pasta como projeto.
2. Mantenha `SUPABASE_SECRET_KEY` apenas no ambiente do backend; nunca no JavaScript do navegador.
3. Configure Supabase Auth com confirmação de e-mail e a URL pública no redirecionamento.
4. Configure SMTP no Supabase depois de verificar a conta do Resend e criar uma chave SMTP/API.
5. Publique a pasta `cloudflare/` no Cloudflare Workers ou Pages.

## URLs em uso

- Site e servidor (Cloudflare Worker `prospectayuriguimaraes`): `https://prospectayuriguimaraes.yuryguimaa.workers.dev`
- Plataforma: `https://prospectayuriguimaraes.yuryguimaa.workers.dev/app/`
- Variáveis no Cloudflare: `SUPABASE_URL` (texto) e `SUPABASE_SECRET_KEY` (secret).

## Publicar uma nova versão

A publicação é automática: o worker `prospectayuriguimaraes` no Cloudflare está ligado a este repositório (Workers Builds). Cada envio para a branch `main` roda `node scripts/build.mjs --same-origin` e publica `dist/worker.js`, conforme `wrangler.toml`. As variáveis `SUPABASE_URL` e `SUPABASE_SECRET_KEY` ficam no painel do Cloudflare (`keep_vars = true` impede que sejam apagadas).

Publicação manual (alternativa): rode `npm run build:cloudflare` e cole o conteúdo de `dist/worker.js` em Edit code no worker.

## Rodar localmente

Precisa só do Node.js 18 ou mais novo (não tem dependências).

1. Copie `.env.example` para `.env` e preencha `SUPABASE_URL` e `SUPABASE_SECRET_KEY` (sem isso o login não funciona).
2. Rode `npm run dev` e abra `http://localhost:8787` (landing) ou `http://localhost:8787/app/` (aplicação).

`npm run build` gera `dist/worker.js` (backend com o site embutido) para publicar no Cloudflare Workers.
