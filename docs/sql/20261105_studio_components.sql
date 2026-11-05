-- Biblioteca de componentes do Studio (Fase 5)
-- Colar em: https://supabase.com/dashboard/project/yplclxvrstdkyauxazgb/sql/new
-- Cria apenas uma tabela nova; não altera nenhuma tabela existente.

create table if not exists public.studio_components (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_user_org()
    references public.organizations(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  category text not null default 'templates'
    check (category in ('titulos','lower_thirds','templates','formas','imagens','tickers','dinamicos')),
  collection text check (collection is null or char_length(collection) <= 80),
  parts jsonb not null check (jsonb_typeof(parts) = 'array' and jsonb_array_length(parts) between 1 and 200),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists studio_components_org_idx
  on public.studio_components (organization_id, category, name);

grant select, insert, update, delete on public.studio_components to authenticated;
grant all on public.studio_components to service_role;

alter table public.studio_components enable row level security;

drop policy if exists sc_select on public.studio_components;
create policy sc_select on public.studio_components for select to authenticated
  using (organization_id = public.current_user_org());

drop policy if exists sc_insert on public.studio_components;
create policy sc_insert on public.studio_components for insert to authenticated
  with check (organization_id = public.current_user_org()
              and public.current_user_role() in ('owner','admin','editor'));

drop policy if exists sc_update on public.studio_components;
create policy sc_update on public.studio_components for update to authenticated
  using (organization_id = public.current_user_org()
         and public.current_user_role() in ('owner','admin','editor'))
  with check (organization_id = public.current_user_org());

drop policy if exists sc_delete on public.studio_components;
create policy sc_delete on public.studio_components for delete to authenticated
  using (organization_id = public.current_user_org()
         and public.current_user_role() in ('owner','admin','editor'));

create or replace function public.studio_components_touch()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists studio_components_touch on public.studio_components;
create trigger studio_components_touch before update on public.studio_components
  for each row execute function public.studio_components_touch();
