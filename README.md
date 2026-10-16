# Prospectas Yuri Guimaraes — pacote para Claude

Este pacote contém o código do site, backend e arquivos da hospedagem Cloudflare. Ele não contém senhas, tokens ou chaves de produção.

## Estrutura

- `frontend/`: tela de cadastro/login, busca de empresas e leads salvos.
- `backend/worker/index.js`: API que conversa com Supabase e as fontes de busca.
- `cloudflare/`: landing pública e a cópia estática da aplicação para Cloudflare Workers.
- `supabase/schema.sql`: tabela de leads e regras de acesso por usuário.
- `supabase/admin-role.sql`: regra para definir o administrador pelo e-mail.
- `.env.example`: nomes das variáveis que precisam ser cadastradas no servidor.

## Para continuar no Claude

1. Importe esta pasta como projeto.
2. Mantenha `SUPABASE_SECRET_KEY` apenas no ambiente do backend; nunca no JavaScript do navegador.
3. Configure Supabase Auth com confirmação de e-mail e a URL pública no redirecionamento.
4. Configure SMTP no Supabase depois de verificar a conta do Resend e criar uma chave SMTP/API.
5. Publique a pasta `cloudflare/` no Cloudflare Workers ou Pages.

## URLs em uso

- Backend atual: `https://prospecta-br-bot.yuryguimaa.chatgpt.site`
- Landing pública: `https://prospectas-yuri-guimaraes.yuryguimaa.workers.dev`

Antes de mover o backend para outro domínio, atualize `API_BASE` em `frontend/app.js` e `cloudflare/app/app.js`.

## Rodar localmente

Precisa só do Node.js 18 ou mais novo (não tem dependências).

1. Copie `.env.example` para `.env` e preencha `SUPABASE_URL` e `SUPABASE_SECRET_KEY` (sem isso o login não funciona).
2. Rode `npm run dev` e abra `http://localhost:8787` (landing) ou `http://localhost:8787/app/` (aplicação).

`npm run build` gera `dist/worker.js` (backend com o site embutido) para publicar no Cloudflare Workers.
