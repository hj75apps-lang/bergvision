-- Editor de Vídeo do Studio — Fase 1 (biblioteca de mídia)
-- Colar em: https://supabase.com/dashboard/project/yplclxvrstdkyauxazgb/sql/new
-- Cria apenas tabelas novas; não altera nenhuma tabela existente.
-- Arquivos ficam no bucket "media" já existente, na pasta da organização.

create table if not exists public.video_editor_folders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_user_org()
    references public.organizations(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  created_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table if not exists public.video_editor_assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_user_org()
    references public.organizations(id) on delete cascade,
  folder_id uuid references public.video_editor_folders(id) on delete set null,
  name text not null check (char_length(name) between 1 and 200),
  kind text not null check (kind in ('video','audio','image','graphic','text','other')),
  mime_type text,
  size_bytes bigint not null default 0,
  duration_ms integer,
  width integer,
  height integer,
  storage_path text not null,
  thumbnail_path text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists video_editor_assets_org_idx
  on public.video_editor_assets (organization_id, kind, name);

grant select, insert, update, delete on public.video_editor_folders to authenticated;
grant select, insert, update, delete on public.video_editor_assets to authenticated;
grant all on public.video_editor_folders to service_role;
grant all on public.video_editor_assets to service_role;

alter table public.video_editor_folders enable row level security;
alter table public.video_editor_assets enable row level security;

do $$
declare t text;
begin
  foreach t in array array['video_editor_folders','video_editor_assets'] loop
    execute format('drop policy if exists ve_select on public.%I', t);
    execute format('create policy ve_select on public.%I for select to authenticated using (organization_id = public.current_user_org())', t);
    execute format('drop policy if exists ve_insert on public.%I', t);
    execute format('create policy ve_insert on public.%I for insert to authenticated with check (organization_id = public.current_user_org() and public.current_user_role() in (''owner'',''admin'',''editor''))', t);
    execute format('drop policy if exists ve_update on public.%I', t);
    execute format('create policy ve_update on public.%I for update to authenticated using (organization_id = public.current_user_org() and public.current_user_role() in (''owner'',''admin'',''editor'')) with check (organization_id = public.current_user_org())', t);
    execute format('drop policy if exists ve_delete on public.%I', t);
    execute format('create policy ve_delete on public.%I for delete to authenticated using (organization_id = public.current_user_org() and public.current_user_role() in (''owner'',''admin'',''editor''))', t);
  end loop;
end $$;

-- Validação: deve retornar 2
select count(*) from pg_tables where schemaname = 'public'
  and tablename in ('video_editor_folders','video_editor_assets');
