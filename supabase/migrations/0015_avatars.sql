-- ============================================================
--  0015 — Фотографии сотрудников (аватарки)
--  Запуск: Supabase → SQL Editor → целиком → Run.
--  Файл идемпотентный: повторный запуск ничего не ломает.
-- ============================================================

alter table public.profiles
  add column if not exists avatar_url text not null default '';

alter table public.doctors
  add column if not exists avatar_url text not null default '';

comment on column public.profiles.avatar_url is
  'Путь к фото: /team/<login>.png. Пусто — показываются инициалы.';

-- Список команды для главной страницы.
-- Политика profiles_self разрешает читать только свою строку (или всё,
-- если ты админ), поэтому техник увидел бы одну аватарку вместо команды.
-- Функция SECURITY DEFINER обходит RLS, но отдаёт только безопасные поля:
-- логин, имя, роль, фото. Почты и хэшей паролей в ней нет.
create or replace function public.team_directory()
returns table (
  user_id      uuid,
  login        text,
  display_name text,
  role         text,
  avatar_url   text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    p.user_id,
    p.login,
    p.display_name,
    p.role,
    -- Фото из профиля, иначе из карточки техника или врача:
    -- там колонка появилась раньше, часть фото может быть уже там.
    coalesce(
      nullif(p.avatar_url, ''),
      nullif(t.avatar_url, ''),
      nullif(d.avatar_url, ''),
      ''
    ) as avatar_url
  from public.profiles p
  left join public.technicians t on t.profile_id = p.user_id
  left join public.doctors     d on d.profile_id = p.user_id
  where p.status = 'active'
  order by
    case p.role when 'admin' then 0 when 'doctor' then 1 else 2 end,
    coalesce(nullif(p.display_name, ''), p.login);
$$;

revoke all on function public.team_directory() from public;
grant execute on function public.team_directory() to authenticated;

select * from public.team_directory();
