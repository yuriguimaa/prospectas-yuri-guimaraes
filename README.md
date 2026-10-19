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

## API (backend/worker/index.js)

Todas as rotas exigem login (token do Supabase), exceto `/api/auth/*`.

| Rota | O que faz |
|---|---|
| `GET /api/cnes?uf=SP&municipio=3509502&tipo=36&offset=0` | Estabelecimentos de saúde (CNES) por estado, cidade (código IBGE) e tipo de unidade. Inclui o nome da cidade. |
| `GET /api/municipios?uf=SP` | Cidades do estado (IBGE), para o filtro de cidade. |
| `GET /api/cnpj?cnpj=...` (ou `/api/contato`) | Dados de um CNPJ juntando OpenCNPJ → BrasilAPI → CNPJ.ws: telefones, e-mail, endereço, situação, atividades. |
| `POST /api/empresas?cnae=...&uf=...&municipio=...` | Busca de empresas na SINTEGRA Brasil (chave do usuário no corpo). |
| `GET /api/maps?q=dentista&cidade=Porto Alegre&uf=RS&page=` | Estabelecimentos do Google Maps (Places API oficial, Text Search): nome, endereço, telefone, site, nota e avaliações; 20 por página, até 60. Exige `GOOGLE_MAPS_API_KEY` (secret) no Cloudflare. |
| `GET /api/socios?cnpj=...` | Sócios e decisores da empresa (Receita Federal, Dados Abertos CNPJ). `/api/cnpj` também já devolve `partners`. |
| `GET/POST/PATCH/DELETE /api/leads` | Leads salvos do usuário (etapa e anotações via PATCH). |

Robustez: validação dos dígitos do CNPJ; cache (Cache API do Cloudflare + memória) de 7 dias para CNPJ, 5 min para CNES e 30 dias para cidades; se uma fonte responde 429 ela fica em pausa por 1 minuto e a próxima é usada; limite por usuário (60 consultas de CNPJ e 90 buscas por minuto); tentativas automáticas em erros 502/503/504.

## Base de sócios (Receita Federal)

`data/assets/socios/` guarda o quadro de sócios dos Dados Abertos do CNPJ em ~9.600 arquivos compactados (um por prefixo de 4 dígitos do CNPJ). Os arquivos são servidos só pelo binding `ASSETS` do worker (`run_worker_first = true`), nunca diretamente na web, e só para usuários logados.

Ficam guardados apenas nome, cargo, data de entrada e tipo (PF/PJ). CPF parcial e faixa etária são descartados, assim como sócios menores de idade ou incapazes. Não existe busca por nome de pessoa.

Para atualizar (a Receita publica todo mês): baixe os arquivos `Socios0.zip` … `Socios9.zip`, rode `node scripts/build-socios.mjs /pasta/dos/zips` e envie a pasta `data/assets` para o GitHub.

## Rodar localmente

Precisa só do Node.js 18 ou mais novo (não tem dependências).

1. Copie `.env.example` para `.env` e preencha `SUPABASE_URL` e `SUPABASE_SECRET_KEY` (sem isso o login não funciona).
2. Rode `npm run dev` e abra `http://localhost:8787` (landing) ou `http://localhost:8787/app/` (aplicação).

`npm run build` gera `dist/worker.js` (backend com o site embutido) para publicar no Cloudflare Workers.
