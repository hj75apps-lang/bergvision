-- Corrige/cria o vínculo de hjdejesus75@gmail.com como owner da organização.
-- Seguro para rodar mais de uma vez.

do $$
declare
  v_email text := 'hjdejesus75@gmail.com';
  v_user_id uuid;
  v_full_name text;
  v_org_id uuid;
  v_slug_base text := 'minha-organizacao';
  v_slug text := 'minha-organizacao';
  v_attempt int := 0;
begin
  select
    au.id,
    nullif(coalesce(au.raw_user_meta_data->>'full_name', au.raw_user_meta_data->>'name', ''), '')
  into v_user_id, v_full_name
  from auth.users au
  where lower(au.email) = lower(v_email)
  limit 1;

  if v_user_id is null then
    raise exception 'Usuário % não encontrado em auth.users. Faça login/cadastro primeiro.', v_email;
  end if;

  -- Se já houver uma organização vinculada ao usuário, reaproveita.
  select u.organization_id
  into v_org_id
  from public.users u
  where u.id = v_user_id;

  -- Se não houver vínculo, tenta reaproveitar a organização pelo slug padrão.
  if v_org_id is null then
    select o.id
    into v_org_id
    from public.organizations o
    where o.slug = v_slug
    limit 1;
  end if;

  -- Se ainda não houver organização, cria com slug obrigatório e único.
  if v_org_id is null then
    loop
      begin
        insert into public.organizations (name, slug)
        values ('Minha Organização', v_slug)
        returning id into v_org_id;
        exit;
      exception when unique_violation then
        v_attempt := v_attempt + 1;
        v_slug := v_slug_base || '-' || v_attempt::text;
      end;
    end loop;
  end if;

  -- Cria o registro em public.users se ele não existir; se existir, promove para owner.
  insert into public.users (id, organization_id, role, full_name)
  values (v_user_id, v_org_id, 'owner', v_full_name)
  on conflict (id) do update
  set organization_id = excluded.organization_id,
      role = 'owner',
      full_name = coalesce(public.users.full_name, excluded.full_name);
end $$;

-- Validação: esta consulta DEVE retornar 1 linha com role = owner e organization_id preenchido.
select
  au.email,
  u.id as public_user_id,
  u.role,
  u.organization_id,
  o.name as organization_name,
  o.slug as organization_slug
from auth.users au
left join public.users u on u.id = au.id
left join public.organizations o on o.id = u.organization_id
where lower(au.email) = lower('hjdejesus75@gmail.com');

-- Validação extra: deve retornar pelo menos 1 membro na organização.
select
  count(*) as membros_na_organizacao
from public.users u
where u.organization_id = (
  select u2.organization_id
  from public.users u2
  join auth.users au2 on au2.id = u2.id
  where lower(au2.email) = lower('hjdejesus75@gmail.com')
);