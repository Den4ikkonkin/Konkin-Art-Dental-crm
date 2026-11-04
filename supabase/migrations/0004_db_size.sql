-- Размер базы данных для панели «Настройки».
--
-- Зачем: обычный REST-запрос Supabase не умеет вызывать системные функции
-- Postgres. Эта функция — тонкая обёртка над pg_database_size, она отдаёт
-- объём текущей базы в байтах. Вызывается из приложения через rpc('database_size_bytes').
--
-- Запуск: Supabase → SQL Editor → вставить целиком → Run.
-- Повторный запуск безопасен.

create or replace function public.database_size_bytes()
returns bigint
language sql
security definer
set search_path = public
as $$
  select pg_database_size(current_database());
$$;

-- Доступ только вошедшим пользователям: анонимным объём базы знать не нужно.
revoke all on function public.database_size_bytes() from public, anon;
grant execute on function public.database_size_bytes() to authenticated;

comment on function public.database_size_bytes() is
  'Объём текущей базы в байтах — для панели «Память сервера» в настройках';
