-- =====================================================================
-- BERG VISION — promover usuário proprietário
-- Projeto conectado no app: yplclxvrstdkyauxazgb
-- Idempotente: pode rodar mais de uma vez sem efeitos colaterais.
-- =====================================================================

begin;

-- Promove o usuário autenticado pelo e-mail para owner na tabela pública.
-- O e-mail fica em auth.users; public.users guarda o papel e a organização.
update public.users as u
   set role = 'owner'
  from auth.users as au
 where au.id = u.id
   and lower(au.email) = lower('hjdejesus75@gmail.com');

commit;

-- Validação: deve retornar role = owner.
select
  au.id,
  au.email,
  u.role,
  u.organization_id
from auth.users as au
left join public.users as u on u.id = au.id
where lower(au.email) = lower('hjdejesus75@gmail.com');