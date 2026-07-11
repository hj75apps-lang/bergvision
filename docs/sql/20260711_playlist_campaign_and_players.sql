-- =====================================================================
-- BERG VISION — Campanha (intervalo de datas) + targeting de players
-- Idempotente. Rodar no SQL Editor:
--   https://supabase.com/dashboard/project/kaouzjmqgrsnmivbdayk/sql/new
-- =====================================================================

begin;

-- 1) Intervalo de datas da campanha em public.playlists
alter table public.playlists
  add column if not exists schedule_date_start date,
  add column if not exists schedule_date_end   date;

alter table public.playlists drop constraint if exists playlists_schedule_date_range_check;
alter table public.playlists
  add constraint playlists_schedule_date_range_check
  check (
    schedule_date_start is null
    or schedule_date_end is null
    or schedule_date_end >= schedule_date_start
  );

-- 2) Vínculo playlist ↔ players (targeting)
create table if not exists public.playlist_players (
  playlist_id     uuid not null references public.playlists(id) on delete cascade,
  player_id       uuid not null references public.players(id)   on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_at      timestamptz not null default now(),
  primary key (playlist_id, player_id)
);

create index if not exists playlist_players_player_idx on public.playlist_players(player_id);
create index if not exists playlist_players_org_idx    on public.playlist_players(organization_id);

-- 3) GRANTs (Data API)
grant select, insert, update, delete on public.playlist_players to authenticated;
grant all on public.playlist_players to service_role;

-- 4) RLS (mesmo padrão de public.users.organization_id + role usado no projeto)
alter table public.playlist_players enable row level security;

drop policy if exists "playlist_players_select_own_org" on public.playlist_players;
create policy "playlist_players_select_own_org"
  on public.playlist_players for select
  to authenticated
  using (
    exists (
      select 1 from public.users u
       where u.id = auth.uid()
         and u.organization_id = playlist_players.organization_id
    )
  );

drop policy if exists "playlist_players_write_owner_admin_editor" on public.playlist_players;
create policy "playlist_players_write_owner_admin_editor"
  on public.playlist_players for all
  to authenticated
  using (
    exists (
      select 1 from public.users u
       where u.id = auth.uid()
         and u.organization_id = playlist_players.organization_id
         and u.role in ('owner','admin','editor')
    )
  )
  with check (
    exists (
      select 1 from public.users u
       where u.id = auth.uid()
         and u.organization_id = playlist_players.organization_id
         and u.role in ('owner','admin','editor')
    )
  );

commit;

-- Validação
-- select column_name from information_schema.columns
--   where table_schema='public' and table_name='playlists'
--     and column_name in ('schedule_date_start','schedule_date_end');
-- select policyname from pg_policies where tablename='playlist_players';