-- ============================================================
--  Dental Studio — уведомления в Telegram
--  Вторая миграция. Запуск: Supabase → SQL Editor → New query → вставить целиком → Run
--  Файл безопасно запускать повторно.
--
--  Схема соответствует supabase/schema.sql (таблицы patients / orders / settings,
--  колонка user_id, orders.created_on, orders.due_on, orders.appointment).
-- ============================================================

-- ---------- Настройки уведомлений (одна строка на пользователя) ----------
create table if not exists public.notification_settings (
  user_id            uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  telegram_chat_id   text not null default '' check (length(telegram_chat_id) <= 40),
  telegram_username  text not null default '' check (length(telegram_username) <= 100),
  -- одноразовый код привязки: пользователь отправляет боту "/start КОД"
  link_code          text not null default '' check (length(link_code) <= 16),
  enabled            boolean not null default true,
  morning_time       time not null default '08:00',
  -- смещение часового пояса в минутах относительно UTC. Самара = UTC+4 = 240.
  utc_offset_minutes integer not null default 240
                     check (utc_offset_minutes between -720 and 840),
  notify_tomorrow    boolean not null default true,
  notify_due_today   boolean not null default false,
  notify_overdue     boolean not null default false,
  -- чтобы воркер не отправил утреннюю сводку дважды за день
  last_sent_on       date,
  updated_at         timestamptz not null default now()
);

-- ---------- Журнал отправок ----------
create table if not exists public.notification_log (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind       text not null default 'morning'
             check (kind in ('morning', 'test', 'manual', 'tomorrow')),
  chat_id    text not null default '',
  ok         boolean not null default true,
  message_id bigint,
  preview    text not null default '' check (length(preview) <= 2000),
  error      text not null default '' check (length(error) <= 1000),
  sent_at    timestamptz not null default now()
);

-- ---------- Индексы ----------
create index if not exists notification_log_user_idx
  on public.notification_log (user_id, sent_at desc);

-- Код привязки ищется ботом глобально, поэтому он должен быть уникальным.
-- Пустые коды в индекс не попадают.
create unique index if not exists notification_settings_link_code_idx
  on public.notification_settings (lower(link_code))
  where link_code <> '';

create index if not exists notification_settings_chat_idx
  on public.notification_settings (telegram_chat_id)
  where telegram_chat_id <> '';

-- ---------- Автообновление отметки времени ----------
create or replace function public.touch_notification_settings() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists notification_settings_touch on public.notification_settings;
create trigger notification_settings_touch before update on public.notification_settings
  for each row execute function public.touch_notification_settings();

-- ---------- Защита доступа (RLS) ----------
alter table public.notification_settings enable row level security;
alter table public.notification_log      enable row level security;

do $$
declare t text;
begin
  foreach t in array array['notification_settings', 'notification_log'] loop
    execute format('drop policy if exists %I_own on public.%I', t, t);
    execute format(
      'create policy %I_own on public.%I for all to authenticated
       using (user_id = auth.uid()) with check (user_id = auth.uid())', t, t);
  end loop;
end $$;

-- ============================================================
--  Готово. Проверка:
--    select * from public.notification_settings;
--    select * from public.notification_log order by sent_at desc limit 20;
-- ============================================================
