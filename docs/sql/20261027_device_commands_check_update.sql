-- Permite o comando CHECK_UPDATE ("Buscar atualização") em device_commands.
do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.device_commands'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%action%'
  loop
    execute format('alter table public.device_commands drop constraint %I', c);
  end loop;
end $$;

alter table public.device_commands
  add constraint device_commands_action_check
  check (action in ('PAUSE','RESUME','SKIP','RELOAD_MANIFEST','IDENTIFY','RESTART_APP','CLEAR_CACHE','CHECK_UPDATE'));

-- Validação: deve listar CHECK_UPDATE
select pg_get_constraintdef(oid) from pg_constraint where conname = 'device_commands_action_check';
