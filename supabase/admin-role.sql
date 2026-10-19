-- Execute no SQL Editor do Supabase. Substitua o e-mail antes de rodar.
create table if not exists public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','member')) default 'member',
  created_at timestamptz not null default now()
);

alter table public.user_roles enable row level security;

drop policy if exists "users read own role" on public.user_roles;
create policy "users read own role" on public.user_roles
  for select to authenticated using (user_id = auth.uid());

create or replace function public.assign_prospectas_role()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.user_roles (user_id, role)
  values (new.id, case when lower(new.email) = '<ADMIN_EMAIL>' then 'admin' else 'member' end)
  on conflict (user_id) do update set role = excluded.role;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_assign_prospectas_role on auth.users;
create trigger on_auth_user_created_assign_prospectas_role
after insert on auth.users
for each row execute procedure public.assign_prospectas_role();
