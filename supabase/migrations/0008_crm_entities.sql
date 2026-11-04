-- ============================================================
--  0008 — Сущности CRM: пациенты, связи, передачи, наряды,
--         позиции, статусы, файлы, портфолио, прайс,
--         настройки, уведомления, лента, папки Drive.
--  Файл идемпотентный. Существующие таблицы только расширяются,
--  данные не удаляются и не пересоздаются.
-- ============================================================

-- ---------- Пациенты: расширение ----------
alter table public.patients add column if not exists doctor_id   uuid references public.doctors(id) on delete set null;
alter table public.patients add column if not exists archived    boolean not null default false;
alter table public.patients add column if not exists archived_at timestamptz;
alter table public.patients add column if not exists is_demo     boolean not null default false;
alter table public.patients add column if not exists updated_at  timestamptz not null default now();

create index if not exists patients_archived_idx on public.patients (archived);
create index if not exists patients_doctor_idx   on public.patients (doctor_id);

-- ---------- Пациент ↔ врачи (многие ко многим) ----------
create table if not exists public.patient_doctors (
  patient_id uuid not null references public.patients(id) on delete cascade,
  doctor_id  uuid not null references public.doctors(id)  on delete cascade,
  is_demo    boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (patient_id, doctor_id)
);

create index if not exists patient_doctors_doctor_idx on public.patient_doctors (doctor_id);

-- ---------- Передача пациента технику ----------
create table if not exists public.patient_handoffs (
  id             uuid primary key default gen_random_uuid(),
  patient_id     uuid not null references public.patients(id) on delete cascade,
  doctor_id      uuid not null references public.doctors(id) on delete cascade,
  technician_id  uuid not null references public.technicians(id) on delete cascade,
  suggested_work text not null default '' check (char_length(suggested_work) <= 200),
  comment        text not null default '' check (char_length(comment) <= 3000),
  file_count     integer not null default 0 check (file_count >= 0),
  has_scans      boolean not null default false,
  status         text not null default 'sent'
                 check (status in ('sent','viewed','accepted','needs_clarification','order_created','cancelled')),
  read_at        timestamptz,
  is_demo        boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists handoffs_technician_idx on public.patient_handoffs (technician_id, status);
create index if not exists handoffs_patient_idx    on public.patient_handoffs (patient_id);

-- ---------- Наряды: расширение ----------
alter table public.orders add column if not exists technician_id uuid references public.technicians(id) on delete set null;
alter table public.orders add column if not exists doctor_id     uuid references public.doctors(id) on delete set null;
alter table public.orders add column if not exists fitting_at    timestamptz;
alter table public.orders add column if not exists is_paid       boolean not null default false;
alter table public.orders add column if not exists salary_total  numeric(12,2) not null default 0;
alter table public.orders add column if not exists salary_charged boolean not null default false;
alter table public.orders add column if not exists prev_status   text;
alter table public.orders add column if not exists is_demo       boolean not null default false;
alter table public.orders add column if not exists needs_clarification boolean not null default false;

-- Новые статусы поверх старых. Значения 'new', 'in_progress', 'done'
-- остаются рабочими: старые наряды не надо переписывать.
alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check
  check (status in ('new','awaiting_fitting','fitted','in_progress','done'));

create index if not exists orders_technician_idx on public.orders (technician_id, created_on desc);
create index if not exists orders_doctor_id_idx  on public.orders (doctor_id);
create index if not exists orders_status_idx     on public.orders (status);

-- ---------- Позиции наряда с зафиксированной ценой ----------
create table if not exists public.order_items (
  id        uuid primary key default gen_random_uuid(),
  order_id  uuid not null references public.orders(id) on delete cascade,
  tooth     integer not null check (tooth between 11 and 48),
  work_id   text not null,
  work_name text not null default '',
  material  text not null default '',
  support   text not null default '',
  shade     text not null default '',
  price     numeric(12,2) not null check (price >= 0),
  is_demo   boolean not null default false,
  created_at timestamptz not null default now(),
  unique (order_id, tooth, work_id)
);

create index if not exists order_items_order_idx on public.order_items (order_id);

comment on column public.order_items.price is
  'Цена фиксируется при создании наряда. Правка прайса её не меняет.';

-- ---------- Журнал статусов (технический, не журнал изменений) ----------
create table if not exists public.order_status_log (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references public.orders(id) on delete cascade,
  from_status  text,
  to_status    text not null,
  changed_by   uuid references auth.users(id) on delete set null,
  is_demo      boolean not null default false,
  created_at   timestamptz not null default now()
);

create index if not exists status_log_order_idx on public.order_status_log (order_id, created_at desc);

-- ---------- Файлы ----------
create table if not exists public.files (
  id            uuid primary key default gen_random_uuid(),
  patient_id    uuid references public.patients(id) on delete cascade,
  order_id      uuid references public.orders(id)   on delete set null,
  doctor_id     uuid references public.doctors(id)  on delete set null,
  technician_id uuid references public.technicians(id) on delete set null,
  author_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  category      text not null default 'other'
                check (category in ('before','after','scan','process','document','portfolio','other')),
  name          text not null check (char_length(name) between 1 and 300),
  mime          text not null default '' check (char_length(mime) <= 120),
  size          bigint not null default 0 check (size >= 0),
  drive_file_id text not null default '' check (char_length(drive_file_id) <= 200),
  drive_path    text not null default '' check (char_length(drive_path) <= 1000),
  storage_path  text not null default '',
  note          text not null default '' check (char_length(note) <= 1000),
  is_demo       boolean not null default false,
  created_at    timestamptz not null default now()
);

create index if not exists files_patient_idx    on public.files (patient_id, created_at desc);
create index if not exists files_order_idx      on public.files (order_id);
create index if not exists files_author_idx     on public.files (author_id);
create index if not exists files_technician_idx on public.files (technician_id);
create index if not exists files_category_idx   on public.files (category);

-- ---------- Портфолио ----------
create table if not exists public.portfolio_items (
  id            uuid primary key default gen_random_uuid(),
  technician_id uuid not null references public.technicians(id) on delete cascade,
  order_id      uuid not null references public.orders(id) on delete cascade,
  file_id       uuid references public.files(id) on delete set null,
  work_id       text not null default '',
  work_name     text not null default '',
  material      text not null default '',
  description   text not null default '' check (char_length(description) <= 2000),
  tags          text[] not null default '{}',
  shot_on       date,
  is_demo       boolean not null default false,
  created_at    timestamptz not null default now()
);

create index if not exists portfolio_technician_idx on public.portfolio_items (technician_id, created_at desc);
create index if not exists portfolio_order_idx      on public.portfolio_items (order_id);

comment on table public.portfolio_items is
  'Каждая работа портфолио привязана к наряду. Публичного доступа нет, только внутри CRM.';

-- ---------- Прайс ----------
create table if not exists public.price_list (
  id         uuid primary key default gen_random_uuid(),
  work_id    text not null unique,
  name       text not null check (char_length(name) between 1 and 200),
  short_name text not null default '',
  material   text not null default '',
  support    text not null default '',
  color      text not null default '',
  price      numeric(12,2) not null check (price >= 0),
  is_active  boolean not null default true,
  is_demo    boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.price_list is
  'Одна цена за работу для всех техников. Изменять может только администратор.';

insert into public.price_list (work_id, name, short_name, material, support, color, price)
values
  ('zirconia-implant', 'Винтовая фиксация',                'Винтовая фиксация',            'Диоксид циркония', 'Имплант · винтовая фиксация', '#BAA0EE', 6000),
  ('zirconia-stump',   'Коронка из циркония',              'Коронка из циркония',          'Диоксид циркония', 'На культе',                  '#ABD988', 4500),
  ('wax-up',           'Восковая моделировка (wax-up)',    'Wax-up',                       'Воск / цифровое моделирование', 'На культе', '#82C6AE', 1500),
  ('pmma',             'Временная коронка PMMA',           'Временная · PMMA',             'PMMA',             'На культе',                  '#9ABBE5', 2000),
  ('inlay-veneer',     'Вкладка / винир',                  'Вкладка / винир',              'Диоксид циркония', 'На культе',                  '#E3A8C3', 4000)
on conflict (work_id) do nothing;

-- ---------- Зарплаты ----------
-- Начисление считается на лету из нарядов со статусом «Готов»,
-- поэтому отдельная таблица не нужна. Флаг salary_charged
-- защищает от двойного начисления.
comment on column public.orders.salary_total is
  'Равна полной стоимости наряда. Начисляется при переходе в «Готов» и обнуляется при отмене готовности.';

-- ---------- Настройки интерфейса ----------
create table if not exists public.user_preferences (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  view_mode     text not null default 'cards' check (view_mode in ('cards','table')),
  page_size     integer not null default 20 check (page_size between 5 and 200),
  sort_mode     text not null default 'due' check (sort_mode in ('due','created','status','patient')),
  last_route    text not null default '' check (char_length(last_route) <= 200),
  show_archive  boolean not null default false,
  density       text not null default 'normal' check (density in ('compact','normal','comfortable')),
  theme         text not null default 'dark' check (theme in ('dark','light')),
  extra_columns text[] not null default '{}',
  sidebar_state text not null default 'expanded' check (sidebar_state in ('expanded','collapsed')),
  calendar_view text not null default 'week' check (calendar_view in ('week','month')),
  updated_at    timestamptz not null default now()
);

-- ---------- Уведомления ----------
create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  kind       text not null check (char_length(kind) <= 60),
  title      text not null default '' check (char_length(title) <= 200),
  body       text not null default '' check (char_length(body) <= 2000),
  link       text not null default '' check (char_length(link) <= 300),
  order_id   uuid references public.orders(id) on delete cascade,
  patient_id uuid references public.patients(id) on delete cascade,
  read_at    timestamptz,
  is_demo    boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_idx on public.notifications (user_id, read_at);

-- ---------- Рабочая лента пациента ----------
create table if not exists public.patient_timeline (
  id         uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  order_id   uuid references public.orders(id) on delete set null,
  kind       text not null check (char_length(kind) <= 60),
  summary    text not null default '' check (char_length(summary) <= 500),
  actor_id   uuid references auth.users(id) on delete set null,
  is_demo    boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists timeline_patient_idx on public.patient_timeline (patient_id, created_at desc);

-- ---------- Папки Google Drive ----------
create table if not exists public.google_drive_folders (
  id            uuid primary key default gen_random_uuid(),
  patient_id    uuid references public.patients(id) on delete cascade,
  doctor_id     uuid references public.doctors(id) on delete cascade,
  technician_id uuid references public.technicians(id) on delete set null,
  kind          text not null check (kind in ('root','doctor','patient','scans','photos','documents','portfolio','orders')),
  drive_id      text not null check (char_length(drive_id) <= 200),
  path          text not null default '' check (char_length(path) <= 1000),
  is_demo       boolean not null default false,
  created_at    timestamptz not null default now()
);

create unique index if not exists drive_folders_key
  on public.google_drive_folders (kind, coalesce(patient_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(doctor_id, '00000000-0000-0000-0000-000000000000'::uuid));
