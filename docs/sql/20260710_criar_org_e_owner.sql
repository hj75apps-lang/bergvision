-- Cria organização e promove hjdejesus75@gmail.com a owner
do $$
declare
  v_user_id uuid;
  v_org_id uuid;
begin
  select id into v_user_id
  from auth.users
  where lower(email) = lower('hjdejesus75@gmail.com')
  limit 1;

  if v_user_id is null then
    raise exception 'Usuário hjdejesus75@gmail.com não encontrado em auth.users';
  end if;

  -- Reaproveita organização já vinculada, se houver
  select organization_id into v_org_id
  from public.users
  where id = v_user_id;

  if v_org_id is null then
    insert into public.organizations (name)
    values ('Minha Organização')
    returning id into v_org_id;
  end if;

  update public.users
  set role = 'owner',
      organization_id = v_org_id
  where id = v_user_id;
end $$;

-- Confirmação
select au.email, u.role, u.organization_id, o.name as org_name
from public.users u
join auth.users au on au.id = u.id
left join public.organizations o on o.id = u.organization_id
where lower(au.email) = lower('hjdejesus75@gmail.com');