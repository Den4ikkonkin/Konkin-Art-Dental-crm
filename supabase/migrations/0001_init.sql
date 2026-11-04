-- ============================================================
--  Dental Studio — схема базы, политики доступа и хранилище файлов
--  Вставьте этот файл целиком в Supabase → SQL Editor → Run.
--  Файл можно запускать повторно: он не ломает существующие данные.
-- ============================================================

-- ---------- Таблицы ----------

create table if not exists public.patients (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name       text not null check (length(btrim(name)) between 1 and 200),
  phone      text not null default '' check (length(phone) <= 100),
  note       text not null default '' check (length(note) <= 3000),
  created_at timestamptz not null default now()
);

create table if not exists public.orders (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  number      integer not null check (number > 0),
  patient_id  uuid not null references public.patients(id) on delete restrict,
  created_on  date not null default current_date,
  due_on      date not null default current_date,
  appointment text not null default '' check (appointment = '' or appointment ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$'),
  status      text not null default 'new' check (status in ('new','in_progress','done')),
  comment     text not null default '' check (length(comment) <= 5000),
  paid        numeric(12,2) not null default 0 check (paid >= 0),
  items       jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
  updated_at  timestamptz not null default now(),
  constraint orders_due_after_created check (due_on >= created_on),
  constraint orders_number_per_user unique (user_id, number)
);

create table if not exists public.salary_payments (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  paid_on    date not null default current_date,
  amount     numeric(12,2) not null check (amount >= 0),
  note       text not null default '' check (length(note) <= 500),
  created_at timestamptz not null default now()
);

create table if not exists public.settings (
  user_id        uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  monthly_salary numeric(12,2) not null default 50000 check (monthly_salary >= 0),
  updated_at     timestamptz not null default now()
);

create table if not exists public.patient_files (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  path       text not null unique,          -- путь внутри хранилища
  name       text not null check (length(name) <= 300),
  mime       text not null default '',
  size       bigint not null default 0 check (size >= 0),
  kind       text not null default 'other' check (kind in ('photo','scan','document','other')),
  note       text not null default '' check (length(note) <= 1000),
  created_at timestamptz not null default now()
);

-- Индексы для быстрой выборки по владельцу
create index if not exists patients_user_idx       on public.patients(user_id);
create index if not exists orders_user_idx         on public.orders(user_id, created_on desc);
create index if not exists orders_patient_idx      on public.orders(patient_id);
create index if not exists salary_user_idx         on public.salary_payments(user_id, paid_on desc);
create index if not exists files_patient_idx       on public.patient_files(patient_id);

-- Автообновление отметки времени
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists orders_touch on public.orders;
create trigger orders_touch before update on public.orders
  for each row execute function public.touch_updated_at();

-- ---------- Политики доступа ----------
-- Ключ anon публичный, поэтому доступ ограничивает именно RLS.
-- Каждый пользователь видит и меняет только свои строки.

alter table public.patients        enable row level security;
alter table public.orders          enable row level security;
alter table public.salary_payments enable row level security;
alter table public.settings        enable row level security;
alter table public.patient_files   enable row level security;

do $$
declare t text;
begin
  foreach t in array array['patients','orders','salary_payments','settings','patient_files'] loop
    execute format('drop policy if exists %I_owner on public.%I', t, t);
    if t = 'settings' then
      -- Настройки: одна строка на пользователя, разрешаем insert и upsert
      execute format('create policy %I_owner on public.%I for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)', t, t);
    else
      execute format('create policy %I_owner on public.%I for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)', t, t);
    end if;
  end loop;
end $$;

-- ---------- Хранилище файлов ----------
-- Приватный bucket: файл нельзя открыть по прямой ссылке.
-- Доступ только по временной подписанной ссылке и только владельцу.

insert into storage.buckets (id, name, public, file_size_limit)
values ('patient-files','patient-files', false, 26214400)   -- 25 МБ на файл
on conflict (id) do update set public = false, file_size_limit = 26214400;

drop policy if exists patient_files_read on storage.objects;
drop policy if exists patient_files_write on storage.objects;
drop policy if exists patient_files_delete on storage.objects;

-- Первая папка пути = идентификатор пользователя. Так чужой файл не прочитать.
create policy patient_files_read on storage.objects
  for select to authenticated
  using (bucket_id = 'patient-files' and (storage.foldername(name))[1] = auth.uid()::text);

create policy patient_files_write on storage.objects
  for insert to authenticated
  with check (bucket_id = 'patient-files' and (storage.foldername(name))[1] = auth.uid()::text);

create policy patient_files_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'patient-files' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------- Перенос одного пациента из старой системы ----------
-- Подставьте свою фамилию и имя вместо многоточия.
-- Скрипт сработает только когда вы уже вошли в приложение хотя бы раз,
-- поэтому сначала создайте пользователя в Authentication → Users.

-- insert into public.patients (name, phone, note)
-- select 'Иванов Иван', '', 'Перенесён из старой версии'
-- where not exists (select 1 from public.patients where name = 'Иванов Иван');
