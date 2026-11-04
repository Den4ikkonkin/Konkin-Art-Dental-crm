-- Дата получения оплаты по наряду.
--
-- Зачем: в «Моём заработке» нужен календарь оплат — в какой день пришли деньги по наряду.
-- Дата ставится автоматически при отметке «Получено», её можно изменить вручную.
--
-- Запуск: Supabase → SQL Editor → вставить целиком → Run. Повторный запуск безопасен.

alter table public.orders
  add column if not exists paid_on date;

comment on column public.orders.paid_on is
  'Дата получения оплаты по наряду. Пусто — оплата не отмечена или дата не указана.';

create index if not exists orders_paid_on_idx
  on public.orders (paid_on);

-- Телефоны пациентов больше не используются в приложении.
update public.patients set phone = '' where phone <> '';
