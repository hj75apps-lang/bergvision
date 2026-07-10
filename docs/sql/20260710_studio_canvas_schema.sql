-- =====================================================================
-- BERG VISION — Studio (canvas editor): schema faltante
-- Idempotente. Rodar no SQL Editor do projeto Supabase do usuário:
--   https://supabase.com/dashboard/project/yplclxvrstdkyauxazgb/sql/new
--
-- Adiciona colunas em public.templates e cria public.template_elements
-- com GRANTs + RLS alinhados ao RBAC (owner/admin/editor/viewer via
-- public.users.role) que o restante do projeto já usa.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Colunas novas em public.templates
-- ---------------------------------------------------------------------
alter table public.templates
  add column if not exists type                text        not null default 'grid',
  add column if not exists background_color    text                 default '#0F172A',
  add column if not exists scaling_mode        text        not null default 'fit',
  add column if not exists background_media_id uuid        references public.media_files(id) on delete set null;

alter table public.templates drop constraint if exists templates_type_check;
alter table public.templates
  add constraint templates_type_check
  check (type in ('grid','canvas'));

alter table public.templates drop constraint if exists templates_scaling_check;
alter table public.templates
  add constraint templates_scaling_check
  check (scaling_mode in ('fit','fill','stretch','letterbox'));

create index if not exists templates_type_idx on public.templates(type);

-- ---------------------------------------------------------------------
-- 2. Tabela public.template_elements (elementos do canvas Studio)
-- ---------------------------------------------------------------------
create table if not exists public.template_elements (
  id           uuid primary key default gen_random_uuid(),
  template_id  uuid not null references public.templates(id) on delete cascade,
  element_type text not null check (element_type in ('text','image','video','logo','playlist','widget','shape')),
  x            numeric(6,2) not null default 0    check (x between 0 and 100),
  y            numeric(6,2) not null default 0    check (y between 0 and 100),
  width        numeric(6,2) not null default 20   check (width  > 0 and width  <= 100),
  height       numeric(6,2) not null default 20   check (height > 0 and height <= 100),
  rotation     numeric(6,2) not null default 0,
  z_index      integer      not null default 0,
  opacity      numeric(4,3) not null default 1    check (opacity between 0 and 1),
  locked       boolean      not null default false,
  visible      boolean      not null default true,
  content      jsonb        not null default '{}'::jsonb,
  created_at   timestamptz  not null default now(),
  updated_at   timestamptz  not null default now()
);

create index if not exists template_elements_template_idx on public.template_elements(template_id, z_index);

-- Trigger updated_at
create or replace function public.tg_template_elements_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists template_elements_touch on public.template_elements;
create trigger template_elements_touch
  before update on public.template_elements
  for each row execute function public.tg_template_elements_touch();

-- ---------------------------------------------------------------------
-- 3. GRANTs (obrigatórios no Data API do Supabase)
-- ---------------------------------------------------------------------
grant select, insert, update, delete on public.template_elements to authenticated;
grant all on public.template_elements to service_role;
-- Sem GRANT para anon: elementos são sempre acessados por usuário logado.

-- ---------------------------------------------------------------------
-- 4. RLS em public.template_elements
-- ---------------------------------------------------------------------
alter table public.template_elements enable row level security;

-- Helper: papel do usuário na organização dona do template do elemento
drop policy if exists "elements_select_own_org" on public.template_elements;
create policy "elements_select_own_org"
  on public.template_elements for select
  to authenticated
  using (
    exists (
      select 1
        from public.templates t
        join public.users u on u.organization_id = t.organization_id
       where t.id = template_elements.template_id
         and u.id = auth.uid()
    )
    -- Templates de sistema (organization_id null) não usam template_elements,
    -- mas caso alguém insira, permite leitura por qualquer usuário logado.
    or exists (
      select 1 from public.templates t
       where t.id = template_elements.template_id
         and t.is_system = true
    )
  );

drop policy if exists "elements_write_owner_admin_editor" on public.template_elements;
create policy "elements_write_owner_admin_editor"
  on public.template_elements for all
  to authenticated
  using (
    exists (
      select 1
        from public.templates t
        join public.users u on u.organization_id = t.organization_id
       where t.id = template_elements.template_id
         and u.id = auth.uid()
         and u.role in ('owner','admin','editor')
         and t.is_system = false
    )
  )
  with check (
    exists (
      select 1
        from public.templates t
        join public.users u on u.organization_id = t.organization_id
       where t.id = template_elements.template_id
         and u.id = auth.uid()
         and u.role in ('owner','admin','editor')
         and t.is_system = false
    )
  );

commit;

-- ---------------------------------------------------------------------
-- 5. Validação — rodar depois do commit para conferir
-- ---------------------------------------------------------------------
-- Colunas novas em templates:
select column_name, data_type, is_nullable, column_default
  from information_schema.columns
 where table_schema = 'public'
   and table_name   = 'templates'
   and column_name in ('type','background_color','scaling_mode','background_media_id')
 order by column_name;

-- Tabela template_elements + policies:
select 'table'  as kind, count(*) as n from pg_tables    where schemaname='public' and tablename='template_elements'
union all
select 'policy' as kind, count(*)      from pg_policies  where schemaname='public' and tablename='template_elements'
union all
select 'grants' as kind, count(*)      from information_schema.role_table_grants
  where table_schema='public' and table_name='template_elements' and grantee in ('authenticated','service_role');