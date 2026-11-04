-- !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
--  УСТАРЕЛО. НЕ ЗАПУСКАТЬ.
--
--  В вашей базе уже лежит другая схема: колонка user_id (а не owner),
--  таблица patient_files (а не files), orders.created_on/due_on.
--  Этот файл описывает ПЕРВУЮ редакцию и с ней не совместим:
--  его запуск создаст таблицы с чужими именами колонок.
--
--  Актуальные файлы:
--    migrations/0001_init.sql          — схема, на которой работает сайт
--    migrations/0002_notifications.sql — уведомления в Telegram
--    ../00_DIAGNOSTIC.sql              — проверка, что реально в базе
--
--  Оставлен только как история. Для работы не нужен.
-- !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

-- ============================================================
--  Dental Studio — схема базы для Supabase
--  Запуск: Supabase → SQL Editor → New query → вставить целиком → Run
--  Скрипт безопасно запускать повторно: объекты создаются только если их нет.
-- ============================================================

-- Пациенты -----------------------------------------------------
create table if not exists public.patients (
  id         uuid primary key default gen_random_uuid(),
  owner      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 200),
  phone      text not null default '' check (char_length(phone) <= 100),
  note       text not null default '' check (char_length(note) <= 3000),
  created_at timestamptz not null default now()
);

-- Наряды -------------------------------------------------------
-- items хранится как jsonb: одна позиция = один зуб + вид работы.
create table if not exists public.orders (
  id          uuid primary key default gen_random_uuid(),
  owner       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  number      integer not null check (number > 0),
  patient_id  uuid not null references public.patients(id) on delete restrict,
  order_date  date not null,
  due_date    date not null,
  appointment text not null default '' check (char_length(appointment) <= 32),
  status      text not null default 'new' check (status in ('new','in_progress','done')),
  comment     text not null default '' check (char_length(comment) <= 5000),
  paid        numeric(12,2) not null default 0 check (paid >= 0),
  items       jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (due_date >= order_date),
  unique (owner, number)
);

-- Выплаты оклада -----------------------------------------------
create table if not exists public.salary_payments (
  id         uuid primary key default gen_random_uuid(),
  owner      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  paid_on    date not null,
  amount     numeric(12,2) not null check (amount >= 0),
  note       text not null default '' check (char_length(note) <= 500),
  created_at timestamptz not null default now()
);

-- Настройки (одна строка на пользователя) ----------------------
create table if not exists public.settings (
  owner          uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  monthly_salary numeric(12,2) not null default 50000 check (monthly_salary >= 0),
  theme          text not null default 'dark' check (theme in ('dark','light')),
  updated_at     timestamptz not null default now()
);

-- Файлы пациентов: фото, сканы, слепки -------------------------
create table if not exists public.files (
  id         uuid primary key default gen_random_uuid(),
  owner      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  patient_id uuid references public.patients(id) on delete cascade,
  order_id   uuid references public.orders(id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 300),
  mime       text not null default '' check (char_length(mime) <= 120),
  size       integer not null default 0 check (size >= 0),
  path       text not null unique,
  created_at timestamptz not null default now()
);

-- Индексы ------------------------------------------------------
create index if not exists orders_owner_date_idx  on public.orders (owner, order_date desc);
create index if not exists orders_patient_idx     on public.orders (patient_id);
create index if not exists salary_owner_date_idx  on public.salary_payments (owner, paid_on desc);
create index if not exists files_patient_idx      on public.files (patient_id);
create index if not exists files_owner_idx        on public.files (owner);

-- Автообновление updated_at -----------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists orders_touch on public.orders;
create trigger orders_touch before update on public.orders
  for each row execute function public.touch_updated_at();

drop trigger if exists settings_touch on public.settings;
create trigger settings_touch before update on public.settings
  for each row execute function public.touch_updated_at();

-- ============================================================
--  Защита доступа (RLS). Без этих правил публичный ключ
--  открывает все данные — включать обязательно.
-- ============================================================
alter table public.patients        enable row level security;
alter table public.orders          enable row level security;
alter table public.salary_payments enable row level security;
alter table public.settings        enable row level security;
alter table public.files           enable row level security;

do $$
declare t text;
begin
  foreach t in array array['patients','orders','salary_payments','settings','files'] loop
    execute format('drop policy if exists %I_own on public.%I', t, t);
    execute format(
      'create policy %I_own on public.%I for all to authenticated
       using (owner = auth.uid()) with check (owner = auth.uid())', t, t);
  end loop;
end $$;

-- ============================================================
--  Хранилище файлов. Бакет закрытый, путь каждого файла
--  начинается с идентификатора владельца: <uid>/<папка>/<файл>
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('patient-files', 'patient-files', false, 52428800,
        array['image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf','model/stl','application/dicom'])
on conflict (id) do update
  set public = false,
      file_size_limit = 52428800;

do $$
declare op text;
begin
  foreach op in array array['select','insert','update','delete'] loop
    execute format('drop policy if exists patient_files_%s on storage.objects', op);
    execute format(
      'create policy patient_files_%s on storage.objects for %s to authenticated
       using (bucket_id = ''patient-files'' and (storage.foldername(name))[1] = auth.uid()::text)
       with check (bucket_id = ''patient-files'' and (storage.foldername(name))[1] = auth.uid()::text)',
      op, op);
  end loop;
end $$;
