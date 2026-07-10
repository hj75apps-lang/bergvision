-- =====================================================================
-- BERG VISION — garantir file_size em public.media_files + reload cache
-- Classificação: Assistida — rodar manualmente no Supabase externo.
-- SQL Editor:
--   https://supabase.com/dashboard/project/kaouzjmqgrsnmivbdayk/sql/new
-- Idempotente.
-- =====================================================================

alter table public.media_files
  add column if not exists file_size bigint;

do $$
begin
  if exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'media_files'
       and column_name = 'size'
  ) then
    update public.media_files
       set file_size = coalesce(file_size, size, 0)
     where file_size is null;
  else
    update public.media_files
       set file_size = coalesce(file_size, 0)
     where file_size is null;
  end if;
end $$;

alter table public.media_files
  alter column file_size set default 0,
  alter column file_size set not null;

-- Forçar reload do schema cache do PostgREST.
notify pgrst, 'reload schema';

-- Validação
select column_name, data_type, is_nullable, column_default
  from information_schema.columns
 where table_schema = 'public'
   and table_name = 'media_files'
   and column_name = 'file_size';