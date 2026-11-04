-- ============================================================
--  0013 — палитра интерфейса
--
--  Зачем: администратор настраивает цвета CRM из интерфейса.
--  Палитра одна на всё приложение, поэтому таблица с одной
--  строкой (id = 1). Хранение в jsonb: набор цветов меняется
--  без миграции, а чтение — один запрос на старте.
--
--  Кто может менять: только администратор.
--  Кто читает: любой вошедший пользователь — цвета нужны всем,
--  чтобы интерфейс выглядел одинаково.
--
--  Запуск: Supabase → SQL Editor → целиком → Run.
--  Файл идемпотентный: повторный запуск ничего не ломает.
-- ============================================================

create table if not exists public.app_theme (
  id         integer primary key default 1,
  dark       jsonb   not null default '{}'::jsonb,
  light      jsonb   not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid    references auth.users(id) on delete set null,
  -- Одна строка на всё приложение: вторая вставка невозможна.
  constraint app_theme_single_row check (id = 1)
);

comment on table public.app_theme is
  'Палитра интерфейса. Одна строка на приложение; dark и light — наборы CSS-переменных.';

-- ---------- Триггер: кто и когда изменил ----------
create or replace function public.app_theme_touch()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

drop trigger if exists app_theme_touch_trg on public.app_theme;
create trigger app_theme_touch_trg
  before insert or update on public.app_theme
  for each row execute function public.app_theme_touch();

-- ---------- RLS ----------
alter table public.app_theme enable row level security;

grant select on public.app_theme to authenticated;
grant insert, update on public.app_theme to authenticated;

drop policy if exists app_theme_read on public.app_theme;
create policy app_theme_read on public.app_theme
  for select to authenticated
  using (public.is_active_user());

drop policy if exists app_theme_write on public.app_theme;
create policy app_theme_write on public.app_theme
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists app_theme_update on public.app_theme;
create policy app_theme_update on public.app_theme
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Удалять палитру нельзя: приложение должно всегда иметь тему.
-- Сброс делается перезаписью заводских значений, не удалением строки.

-- ---------- Начальная строка ----------
-- Пустые объекты: приложение подставит заводские цвета из brand.ts.
-- Так значения по умолчанию живут в одном месте — в коде.
insert into public.app_theme (id, dark, light)
values (1, '{}'::jsonb, '{}'::jsonb)
on conflict (id) do nothing;

-- ---------- Проверка ----------
select
  (select count(*) from public.app_theme)                    as "строк палитры",
  (select count(*) from pg_policies
   where schemaname = 'public' and tablename = 'app_theme')  as "политик RLS";
