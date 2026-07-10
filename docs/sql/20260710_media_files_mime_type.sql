-- =====================================================================
-- BERG VISION — adicionar coluna mime_type em public.media_files
-- Rodar no SQL Editor:
--   https://supabase.com/dashboard/project/yplclxvrstdkyauxazgb/sql/new
-- Idempotente.
-- =====================================================================

alter table public.media_files
  add column if not exists mime_type text;

-- Forçar reload do schema cache do PostgREST (senão o erro
-- "Could not find the 'mime_type' column ... in the schema cache" persiste
-- até o próximo restart automático).
notify pgrst, 'reload schema';

-- Validação
select column_name, data_type
  from information_schema.columns
 where table_schema = 'public'
   and table_name   = 'media_files'
   and column_name  = 'mime_type';