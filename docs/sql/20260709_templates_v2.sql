-- =====================================================================
-- BERG VISION — Fase 5 v2: Templates customizáveis + editor visual
-- Idempotente. Rodar no SQL Editor do Supabase (projeto do usuário).
-- =====================================================================
-- Adapta o spec v2 para o RBAC real do projeto (4 papéis em public.users):
--   owner, admin  -> criar/editar/excluir templates customizados,
--                    trocar template ativo em players
--   owner, admin, editor -> configurar CONTEÚDO das zonas
--   viewer        -> somente leitura
-- Templates de sistema (organization_id IS NULL, is_system = true) são
-- read-only para todos.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Novos campos em templates
-- ---------------------------------------------------------------------
alter table public.templates
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade,
  add column if not exists created_by      uuid references public.users(id) on delete set null,
  add column if not exists is_system       boolean not null default false,
  add column if not exists aspect_ratio    text    not null default '16:9',
  add column if not exists canvas_width    integer not null default 1920,
  add column if not exists canvas_height   integer not null default 1080,
  add column if not exists thumbnail_url   text,
  add column if not exists allow_overlap   boolean not null default false,
  add column if not exists updated_at      timestamptz not null default now(),
  add column if not exists updated_by      uuid references public.users(id) on delete set null;

-- Marca os 5 templates pré-existentes como sistema (organization_id fica NULL)
update public.templates
   set is_system = true
 where organization_id is null
   and is_system is distinct from true;

-- Constraint de sanidade: system => sem org; custom => com org
alter table public.templates drop constraint if exists templates_scope_check;
alter table public.templates
  add constraint templates_scope_check
  check ((is_system = true and organization_id is null)
      or (is_system = false and organization_id is not null));

-- Constraint de aspect ratio
alter table public.templates drop constraint if exists templates_aspect_check;
alter table public.templates
  add constraint templates_aspect_check
  check (aspect_ratio in ('16:9','9:16','4:3','21:9','custom'));

create index if not exists templates_org_idx on public.templates(organization_id) where is_system = false;

-- ---------------------------------------------------------------------
-- 2. Novos campos em template_zones (posicionamento livre)
-- ---------------------------------------------------------------------
alter table public.template_zones
  add column if not exists pos_x       numeric(5,2),
  add column if not exists pos_y       numeric(5,2),
  add column if not exists width_pct   numeric(5,2),
  add column if not exists height_pct  numeric(5,2),
  add column if not exists z_index     integer not null default 0;

alter table public.template_zones drop constraint if exists template_zones_bounds_check;
alter table public.template_zones
  add constraint template_zones_bounds_check
  check (
    (pos_x is null and pos_y is null and width_pct is null and height_pct is null)
    or (
         pos_x      between 0 and 100
     and pos_y      between 0 and 100
     and width_pct  between 1 and 100
     and height_pct between 1 and 100
     and (pos_x + width_pct)  <= 100.01
     and (pos_y + height_pct) <= 100.01
    )
  );

-- ---------------------------------------------------------------------
-- 3. Backfill dos 5 templates de sistema: grid_area -> percentuais
-- ---------------------------------------------------------------------
-- fullscreen: 1 zona ocupando 100%
update public.template_zones z
   set pos_x = 0, pos_y = 0, width_pct = 100, height_pct = 100, z_index = 0
  from public.templates t
 where z.template_id = t.id
   and t.is_system = true
   and t.name ilike 'fullscreen%'
   and z.pos_x is null;

-- split-horizontal: 2 zonas 50/50 lado a lado (zone_index 0 esq, 1 dir)
update public.template_zones z
   set pos_x = case z.zone_index when 0 then 0 else 50 end,
       pos_y = 0, width_pct = 50, height_pct = 100, z_index = 0
  from public.templates t
 where z.template_id = t.id
   and t.is_system = true
   and t.name ilike 'split-horizontal%'
   and z.pos_x is null;

-- main-ticker: main 100x85 topo, ticker 100x15 rodapé (index 0 main, 1 ticker)
update public.template_zones z
   set pos_x = 0,
       pos_y     = case z.zone_index when 0 then 0  else 85 end,
       width_pct = 100,
       height_pct= case z.zone_index when 0 then 85 else 15 end,
       z_index = 0
  from public.templates t
 where z.template_id = t.id
   and t.is_system = true
   and t.name ilike 'main-ticker%'
   and z.pos_x is null;

-- l-shape: main 75x75 top-left, right 25x100 direita, bottom 75x25 rodapé
-- (index 0 main, 1 right, 2 bottom)
update public.template_zones z
   set pos_x = case z.zone_index when 0 then 0  when 1 then 75 else 0  end,
       pos_y = case z.zone_index when 0 then 0  when 1 then 0  else 75 end,
       width_pct  = case z.zone_index when 0 then 75 when 1 then 25 else 75 end,
       height_pct = case z.zone_index when 0 then 75 when 1 then 100 else 25 end,
       z_index = 0
  from public.templates t
 where z.template_id = t.id
   and t.is_system = true
   and t.name ilike 'l-shape%'
   and z.pos_x is null;

-- multi-4k: quadrantes 2x2 (index 0 TL, 1 TR, 2 BL, 3 BR)
update public.template_zones z
   set pos_x = case z.zone_index when 0 then 0 when 1 then 50 when 2 then 0 else 50 end,
       pos_y = case z.zone_index when 0 then 0 when 1 then 0  when 2 then 50 else 50 end,
       width_pct  = 50,
       height_pct = 50,
       z_index = 0
  from public.templates t
 where z.template_id = t.id
   and t.is_system = true
   and t.name ilike 'multi-4k%'
   and z.pos_x is null;

-- ---------------------------------------------------------------------
-- 4. GRANTs (Data API) — templates e template_zones já são user-facing
-- ---------------------------------------------------------------------
grant select, insert, update, delete on public.templates       to authenticated;
grant select, insert, update, delete on public.template_zones  to authenticated;
grant all on public.templates      to service_role;
grant all on public.template_zones to service_role;

-- ---------------------------------------------------------------------
-- 5. Helpers de RBAC (evitam recursão em RLS)
-- ---------------------------------------------------------------------
create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role::text from public.users where id = auth.uid()
$$;

create or replace function public.current_user_org()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select organization_id from public.users where id = auth.uid()
$$;

-- ---------------------------------------------------------------------
-- 6. RLS em templates
-- ---------------------------------------------------------------------
alter table public.templates enable row level security;

drop policy if exists templates_select        on public.templates;
drop policy if exists templates_insert_custom on public.templates;
drop policy if exists templates_update_custom on public.templates;
drop policy if exists templates_delete_custom on public.templates;

-- Ver: sistema é global; customizado só da própria org
create policy templates_select
  on public.templates for select
  to authenticated
  using (
    is_system = true
    or organization_id = public.current_user_org()
  );

-- Criar: só owner/admin, sempre custom (is_system=false), sempre na própria org
create policy templates_insert_custom
  on public.templates for insert
  to authenticated
  with check (
    is_system = false
    and organization_id = public.current_user_org()
    and public.current_user_role() in ('owner','admin')
  );

-- Editar: só owner/admin, só custom da própria org, nunca sistema
create policy templates_update_custom
  on public.templates for update
  to authenticated
  using (
    is_system = false
    and organization_id = public.current_user_org()
    and public.current_user_role() in ('owner','admin')
  )
  with check (
    is_system = false
    and organization_id = public.current_user_org()
  );

-- Excluir: só owner/admin, só custom da própria org
create policy templates_delete_custom
  on public.templates for delete
  to authenticated
  using (
    is_system = false
    and organization_id = public.current_user_org()
    and public.current_user_role() in ('owner','admin')
  );

-- ---------------------------------------------------------------------
-- 7. RLS em template_zones
--    Regras espelham o template pai (join via subquery).
--    - SELECT: qualquer template visível ao usuário
--    - INSERT/UPDATE de LAYOUT em zona (posição/tamanho/z_index/zone_name)
--        só owner/admin sobre template custom da própria org
--    - UPDATE de CONTEÚDO (media/playlist/widget) permitido também a editor
--        (a distinção "layout vs conteúdo" é aplicada no client;
--         no RLS mantemos apenas o gate por papel; policies separadas
--         por coluna exigiriam column-level security e complicariam demais)
-- ---------------------------------------------------------------------
alter table public.template_zones enable row level security;

drop policy if exists template_zones_select        on public.template_zones;
drop policy if exists template_zones_insert_custom on public.template_zones;
drop policy if exists template_zones_update_custom on public.template_zones;
drop policy if exists template_zones_update_content on public.template_zones;
drop policy if exists template_zones_delete_custom on public.template_zones;

create policy template_zones_select
  on public.template_zones for select
  to authenticated
  using (
    exists (
      select 1 from public.templates t
       where t.id = template_zones.template_id
         and (t.is_system = true or t.organization_id = public.current_user_org())
    )
  );

create policy template_zones_insert_custom
  on public.template_zones for insert
  to authenticated
  with check (
    exists (
      select 1 from public.templates t
       where t.id = template_zones.template_id
         and t.is_system = false
         and t.organization_id = public.current_user_org()
         and public.current_user_role() in ('owner','admin')
    )
  );

-- UPDATE amplo (layout + conteúdo) — owner/admin em template custom
create policy template_zones_update_custom
  on public.template_zones for update
  to authenticated
  using (
    exists (
      select 1 from public.templates t
       where t.id = template_zones.template_id
         and t.is_system = false
         and t.organization_id = public.current_user_org()
         and public.current_user_role() in ('owner','admin')
    )
  )
  with check (
    exists (
      select 1 from public.templates t
       where t.id = template_zones.template_id
         and t.is_system = false
         and t.organization_id = public.current_user_org()
    )
  );

-- UPDATE de CONTEÚDO por editor — em template custom da própria org.
-- (Editor pode alterar a linha; o client é responsável por só mudar
--  media_file_id / playlist_id / widget_type / widget_config / content_type
--  e não campos de layout. Para bloqueio server-side estrito por coluna,
--  seria preciso column privileges + policy dedicada — fora do escopo.)
create policy template_zones_update_content
  on public.template_zones for update
  to authenticated
  using (
    exists (
      select 1 from public.templates t
       where t.id = template_zones.template_id
         and t.is_system = false
         and t.organization_id = public.current_user_org()
         and public.current_user_role() = 'editor'
    )
  );

create policy template_zones_delete_custom
  on public.template_zones for delete
  to authenticated
  using (
    exists (
      select 1 from public.templates t
       where t.id = template_zones.template_id
         and t.is_system = false
         and t.organization_id = public.current_user_org()
         and public.current_user_role() in ('owner','admin')
    )
  );

-- ---------------------------------------------------------------------
-- 8. Trigger para manter updated_at/updated_by em templates
-- ---------------------------------------------------------------------
create or replace function public.templates_touch_updated()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists templates_touch_updated_trg on public.templates;
create trigger templates_touch_updated_trg
  before update on public.templates
  for each row execute function public.templates_touch_updated();

commit;

-- =====================================================================
-- VALIDAÇÃO — rodar após o commit e conferir os resultados
-- =====================================================================
-- Colunas novas presentes:
-- select column_name from information_schema.columns
--  where table_schema='public' and table_name='templates'
--    and column_name in ('organization_id','is_system','aspect_ratio',
--                        'canvas_width','canvas_height','allow_overlap',
--                        'thumbnail_url','created_by','updated_at','updated_by');
--
-- select column_name from information_schema.columns
--  where table_schema='public' and table_name='template_zones'
--    and column_name in ('pos_x','pos_y','width_pct','height_pct','z_index');
--
-- Todos os 5 templates de sistema marcados:
-- select name, is_system, organization_id from public.templates order by name;
--
-- Backfill aplicado (nenhuma zona de sistema com pos_x nulo):
-- select t.name, count(*) filter (where z.pos_x is null) as sem_pos
--   from public.templates t
--   join public.template_zones z on z.template_id = t.id
--  where t.is_system = true
--  group by t.name;
--
-- Policies:
-- select policyname from pg_policies
--  where schemaname='public' and tablename in ('templates','template_zones')
--  order by tablename, policyname;