-- Leads salvos por usuário do site. A API do site aplica owner_id em cada operação.
create table if not exists public.saved_leads (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null,
  record_key text not null,
  name text not null,
  category text not null default '',
  city text not null default '',
  uf text not null default '',
  phone text not null default '',
  email text not null default '',
  source text not null default '',
  source_url text not null default '',
  site text not null default '',
  created_at timestamptz not null default now(),
  unique (owner_id, record_key)
);

create index if not exists saved_leads_owner_created_idx
  on public.saved_leads (owner_id, created_at desc);

alter table public.saved_leads enable row level security;
revoke all on public.saved_leads from anon;
grant usage on schema public to service_role;
grant select, insert, update, delete on public.saved_leads to service_role;
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.saved_leads to authenticated;

drop policy if exists "users manage own saved leads" on public.saved_leads;
create policy "users manage own saved leads" on public.saved_leads
  for all to authenticated
  using (owner_id = auth.uid()::text)
  with check (owner_id = auth.uid()::text);
