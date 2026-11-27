-- Aplicar antes da versão do painel que chama os RPCs de edição de playlists.
begin;

create or replace function public.reorder_playlist_items(
  p_playlist_id uuid,
  p_previous_ids uuid[],
  p_ordered_ids uuid[]
) returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_ids uuid[];
  changed integer;
begin
  if public.current_user_role() is null
     or public.current_user_role() not in ('owner', 'admin', 'editor') then
    raise exception 'Sem permissão para reordenar a playlist' using errcode = '42501';
  end if;

  perform 1 from public.playlists as p
    where p.id = p_playlist_id and p.organization_id = public.current_user_org()
    for update;
  if not found then
    raise exception 'Playlist indisponível' using errcode = '42501';
  end if;

  perform 1 from public.playlist_items as i
    where i.playlist_id = p_playlist_id order by i.id for update;
  select coalesce(array_agg(i.id order by i.position, i.id), '{}'::uuid[])
    into current_ids from public.playlist_items as i where i.playlist_id = p_playlist_id;

  if p_previous_ids is distinct from current_ids then
    raise exception 'A playlist mudou. Confira a ordem atual e tente novamente.' using errcode = 'PT409';
  end if;

  if p_ordered_ids is null or cardinality(p_ordered_ids) <> cardinality(current_ids)
     or not (p_ordered_ids @> current_ids and current_ids @> p_ordered_ids) then
    raise exception 'A ordem deve incluir todos os itens da playlist uma única vez' using errcode = '22023';
  end if;

  update public.playlist_items as i
    set position = (ordered.ordinality - 1)::integer
    from unnest(p_ordered_ids) with ordinality as ordered(id, ordinality)
    where i.playlist_id = p_playlist_id and i.id = ordered.id;
  get diagnostics changed = row_count;
  if changed <> cardinality(current_ids) then
    raise exception 'Não foi possível reordenar todos os itens' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.reorder_playlist_items(uuid, uuid[], uuid[]) from public, anon;
grant execute on function public.reorder_playlist_items(uuid, uuid[], uuid[]) to authenticated;

create or replace function public.save_playlist_settings(
  p_playlist_id uuid,
  p_name text,
  p_active boolean,
  p_start time,
  p_end time,
  p_days integer[],
  p_date_start date,
  p_date_end date,
  p_previous_players uuid[],
  p_selected_players uuid[]
) returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  org_id uuid;
  current_players uuid[];
  deleted_links integer;
begin
  if public.current_user_role() is null
     or public.current_user_role() not in ('owner', 'admin', 'editor') then
    raise exception 'Sem permissão para editar a playlist' using errcode = '42501';
  end if;

  select p.organization_id into org_id from public.playlists as p
    where p.id = p_playlist_id and p.organization_id = public.current_user_org()
    for update;
  if not found then
    raise exception 'Playlist indisponível' using errcode = '42501';
  end if;

  perform 1 from public.playlist_players as pp
    where pp.playlist_id = p_playlist_id order by pp.player_id for update;
  select coalesce(array_agg(pp.player_id), '{}'::uuid[])
    into current_players from public.playlist_players as pp where pp.playlist_id = p_playlist_id;
  if p_previous_players is null or cardinality(p_previous_players) <> cardinality(current_players)
     or not (p_previous_players @> current_players and current_players @> p_previous_players) then
    raise exception 'Os vínculos mudaram. Confira os players atuais e tente novamente.' using errcode = 'PT409';
  end if;
  if p_selected_players is null or array_position(p_selected_players, null) is not null then
    raise exception 'Seleção de players inválida' using errcode = '22023';
  end if;

  update public.playlists set name = p_name, is_active = p_active,
    schedule_start = p_start, schedule_end = p_end, schedule_days = p_days,
    schedule_date_start = p_date_start, schedule_date_end = p_date_end
    where id = p_playlist_id;
  if not found then
    raise exception 'Não foi possível atualizar a playlist' using errcode = '42501';
  end if;

  delete from public.playlist_players as pp where pp.playlist_id = p_playlist_id
    and not (pp.player_id = any(p_selected_players));
  get diagnostics deleted_links = row_count;
  if deleted_links <> (select count(*) from unnest(current_players) as previous(id)
                        where not (previous.id = any(p_selected_players))) then
    raise exception 'Não foi possível atualizar todos os vínculos' using errcode = '42501';
  end if;

  insert into public.playlist_players (playlist_id, player_id, organization_id)
    select distinct p_playlist_id, selected.id, org_id from unnest(p_selected_players) as selected(id)
      where not (selected.id = any(current_players));
end;
$$;

revoke all on function public.save_playlist_settings(uuid, text, boolean, time, time, integer[], date, date, uuid[], uuid[])
  from public, anon;
grant execute on function public.save_playlist_settings(uuid, text, boolean, time, time, integer[], date, date, uuid[], uuid[])
  to authenticated;

-- Restringe os vínculos de acordo com o proprietário dos dois registros referenciados.
drop policy if exists playlist_players_same_organization on public.playlist_players;
create policy playlist_players_same_organization on public.playlist_players
  as restrictive for all to authenticated
  using (true)
  with check (
    exists (select 1 from public.playlists p
            where p.id = playlist_id and p.organization_id = playlist_players.organization_id)
    and exists (select 1 from public.players p
                where p.id = player_id and p.organization_id = playlist_players.organization_id)
  );

drop policy if exists device_commands_same_organization on public.device_commands;
create policy device_commands_same_organization on public.device_commands
  as restrictive for insert to authenticated
  with check (
    exists (select 1 from public.players p
            where p.id = player_id and p.organization_id = device_commands.organization_id)
  );

notify pgrst, 'reload schema';

commit;
