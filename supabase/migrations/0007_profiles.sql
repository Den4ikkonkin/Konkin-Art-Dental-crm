-- ============================================================
--  0007 — Профили, роли, врачи, техники
--  Запуск: Supabase → SQL Editor → New query → целиком → Run.
--  Файл идемпотентный: повторный запуск ничего не ломает
--  и не дублирует строки.
-- ============================================================

-- ---------- Профили пользователей ----------
-- Одна строка на пользователя Supabase Auth. Роль и статус живут здесь,
-- а не в JWT: администратор может архивировать учётку, и это сработает
-- без перевыпуска токена.
create table if not exists public.profiles (
  user_id              uuid primary key references auth.users(id) on delete cascade,
  login                text not null unique check (login ~ '^[a-z0-9_.-]{2,32}$'),
  role                 text not null default 'technician'
                       check (role in ('admin', 'doctor', 'technician')),
  status               text not null default 'active'
                       check (status in ('active', 'archived')),
  display_name         text not null default '' check (char_length(display_name) <= 120),
  must_change_password boolean not null default true,
  is_demo              boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

comment on column public.profiles.login is
  'Логин для входа (denis, vlad, sharapov). Технический email в Supabase пользователю не показывается.';
comment on column public.profiles.status is
  'archived — вход запрещён, данные и файлы остаются доступны администратору.';

create index if not exists profiles_role_idx   on public.profiles (role, status);
create index if not exists profiles_login_idx  on public.profiles (lower(login));

-- ---------- Врачи ----------
create table if not exists public.doctors (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid unique references public.profiles(user_id) on delete set null,
  surname    text not null check (char_length(btrim(surname)) between 1 and 120),
  full_name  text not null default '' check (char_length(full_name) <= 200),
  is_active  boolean not null default true,
  is_demo    boolean not null default false,
  created_at timestamptz not null default now()
);

comment on column public.doctors.surname is
  'Фамилия без инициалов: используется в имени папки Google Drive и в нарядах.';

create unique index if not exists doctors_surname_key on public.doctors (lower(surname));

-- ---------- Техники ----------
create table if not exists public.technicians (
  id               uuid primary key default gen_random_uuid(),
  profile_id       uuid unique references public.profiles(user_id) on delete set null,
  name             text not null check (char_length(btrim(name)) between 1 and 120),
  avatar_url       text not null default '',
  specializations  text[] not null default '{}',
  availability     text not null default 'available'
                   check (availability in ('available','partial','busy','closed','vacation','inactive')),
  contact          text not null default '' check (char_length(contact) <= 200),
  is_active        boolean not null default true,
  is_demo          boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create unique index if not exists technicians_name_key on public.technicians (lower(name));

comment on column public.technicians.availability is
  'available — доступен, partial — частично загружен, busy — загружен, closed — не принимает, vacation — отпуск, inactive — неактивен.';

-- ---------- Сид: три врача и пять техников ----------
insert into public.doctors (surname)
values ('Шарапов'), ('Архипов'), ('Ижерский')
on conflict do nothing;

insert into public.technicians (name)
values ('Денис'), ('Влад'), ('Артур'), ('Дмитрий'), ('Александр')
on conflict do nothing;

-- ---------- Служебные функции ----------
-- security definer: политики RLS обращаются к profiles, но не должны
-- упираться в собственные политики profiles. search_path зафиксирован,
-- иначе функцию можно перехватить подменой схемы.

create or replace function public.current_role()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.role
  from public.profiles p
  where p.user_id = auth.uid()
    and p.status = 'active'
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid()
      and p.role = 'admin'
      and p.status = 'active'
  )
$$;

-- Активный пользователь: архивный не проходит ни одну политику.
create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid()
      and p.status = 'active'
  )
$$;

create or replace function public.current_technician_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select t.id
  from public.technicians t
  join public.profiles p on p.user_id = t.profile_id
  where p.user_id = auth.uid()
    and p.status = 'active'
  limit 1
$$;

create or replace function public.current_doctor_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select d.id
  from public.doctors d
  join public.profiles p on p.user_id = d.profile_id
  where p.user_id = auth.uid()
    and p.status = 'active'
  limit 1
$$;

-- ---------- Автообновление updated_at ----------
create or replace function public.profiles_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch
  before update on public.profiles
  for each row execute function public.profiles_touch();

drop trigger if exists technicians_touch on public.technicians;
create trigger technicians_touch
  before update on public.technicians
  for each row execute function public.profiles_touch();

-- ---------- Профиль создаётся автоматически ----------
-- Регистрация в приложении отключена, пользователей создаёт администратор
-- через service_role. Триггер гарантирует, что профиль существует сразу.
create or replace function public.profiles_autocreate()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (user_id, login, role, display_name)
  values (
    new.id,
    coalesce(nullif(split_part(new.email, '@', 1), ''), 'user-' || left(new.id::text, 8)),
    'technician',
    coalesce(new.raw_user_meta_data->>'display_name', '')
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists profiles_autocreate on auth.users;
create trigger profiles_autocreate
  after insert on auth.users
  for each row execute function public.profiles_autocreate();
