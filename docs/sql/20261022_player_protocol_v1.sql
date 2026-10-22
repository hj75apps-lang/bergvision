-- Protocolo Admin <-> Player v1: revisões, comandos, estado e eventos.
-- Só cria tabelas novas (não altera nem apaga nada existente). Pode rodar mais de uma vez.

create table if not exists public.playlist_revisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  playlist_id uuid not null references public.playlists(id) on delete cascade,
  revision integer not null,
  content_hash text not null,
  manifest jsonb not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (playlist_id, revision)
);

create table if not exists public.device_commands (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  player_id uuid not null references public.players(id) on delete cascade,
  action text not null check (action in ('PAUSE','RESUME','SKIP','RELOAD_MANIFEST','IDENTIFY','RESTART_APP','CLEAR_CACHE')),
  args jsonb not null default '{}'::jsonb,
  expected_revision integer,
  expires_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending','received','executed','failed','expired')),
  detail text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists device_commands_player_pending on public.device_commands (player_id, status, created_at);

create table if not exists public.device_status (
  player_id uuid primary key references public.players(id) on delete cascade,
  organization_id uuid not null,
  desired_revision integer,
  active_revision integer,
  manifest_state text,
  playback text,
  current_item_id text,
  items jsonb not null default '[]'::jsonb,
  player_version text,
  android_version text,
  webview_version text,
  free_storage_bytes bigint,
  unavailable jsonb not null default '{}'::jsonb,
  last_error text,
  reported_at timestamptz not null default now()
);

create table if not exists public.playback_events (
  event_id uuid primary key,
  organization_id uuid not null,
  player_id uuid not null references public.players(id) on delete cascade,
  item_id text not null,
  provider text not null,
  kind text not null,
  at timestamptz not null,
  time_to_start_ms integer,
  buffering_ms integer,
  received_at timestamptz not null default now()
);
create index if not exists playback_events_player_at on public.playback_events (player_id, at desc);

grant select, insert, update, delete on public.playlist_revisions, public.device_commands, public.device_status, public.playback_events to authenticated;
grant all on public.playlist_revisions, public.device_commands, public.device_status, public.playback_events to service_role;

alter table public.playlist_revisions enable row level security;
alter table public.device_commands enable row level security;
alter table public.device_status enable row level security;
alter table public.playback_events enable row level security;

-- Leitura: qualquer membro da organização.
drop policy if exists pr_select on public.playlist_revisions;
create policy pr_select on public.playlist_revisions for select to authenticated
  using (organization_id = public.current_user_org());
drop policy if exists dc_select on public.device_commands;
create policy dc_select on public.device_commands for select to authenticated
  using (organization_id = public.current_user_org());
drop policy if exists ds_select on public.device_status;
create policy ds_select on public.device_status for select to authenticated
  using (organization_id = public.current_user_org());
drop policy if exists pe_select on public.playback_events;
create policy pe_select on public.playback_events for select to authenticated
  using (organization_id = public.current_user_org());

-- Escrita pelo painel: revisões (owner/admin/editor) e comandos (owner/admin).
-- Estado e eventos só são gravados pela Edge Function player-sync (service_role).
drop policy if exists pr_insert on public.playlist_revisions;
create policy pr_insert on public.playlist_revisions for insert to authenticated
  with check (organization_id = public.current_user_org()
              and public.current_user_role() in ('owner','admin','editor'));
drop policy if exists dc_insert on public.device_commands;
create policy dc_insert on public.device_commands for insert to authenticated
  with check (organization_id = public.current_user_org()
              and public.current_user_role() in ('owner','admin')
              and status = 'pending');

-- Avisos em tempo real para o painel.
do $$ begin
  begin alter publication supabase_realtime add table public.device_status; exception when others then null; end;
  begin alter publication supabase_realtime add table public.device_commands; exception when others then null; end;
end $$;
