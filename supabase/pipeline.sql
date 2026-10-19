-- Etapas e observações dos leads salvos (funil de prospecção).
-- Execute uma vez no SQL Editor do Supabase. Pode rodar de novo sem problema.
alter table public.saved_leads add column if not exists status text not null default 'novo';
alter table public.saved_leads add column if not exists notes text not null default '';
alter table public.saved_leads add column if not exists updated_at timestamptz not null default now();

alter table public.saved_leads drop constraint if exists saved_leads_status_check;
alter table public.saved_leads add constraint saved_leads_status_check
  check (status in ('novo','contatado','negociando','fechado','perdido'));
