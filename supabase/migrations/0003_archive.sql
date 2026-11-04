-- Архив нарядов: колонка archived.
-- Выполните этот файл в Supabase → SQL Editor, если архив не работает.
-- Повторный запуск безопасен: колонка добавляется только если её нет.

alter table public.orders
  add column if not exists archived boolean not null default false;

-- Индекс ускоряет фильтр «только активные» на странице нарядов.
create index if not exists orders_archived_idx
  on public.orders (archived);

comment on column public.orders.archived is
  'Наряд в архиве: убран с рабочей доски, но учитывается в аналитике';
