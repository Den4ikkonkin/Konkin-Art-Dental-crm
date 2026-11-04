-- ============================================================
--  ПРОВЕРКА СХЕМЫ — один запуск, один ответ
--  Supabase → SQL Editor → New query → вставить целиком → Run
--
--  Только читает. Ничего не меняет, данные не трогает.
-- ============================================================

-- ---------- 1. ВЕРДИКТ ----------
with cols as (
  select table_name, column_name
  from information_schema.columns
  where table_schema = 'public'
)
select
  case
    when exists (select 1 from cols where table_name = 'orders'        and column_name = 'created_on')
     and exists (select 1 from cols where table_name = 'orders'        and column_name = 'due_on')
     and exists (select 1 from cols where table_name = 'patient_files')
      then 'OK — схема совпадает с кодом сайта. Ничего делать не нужно.'
    when exists (select 1 from cols where table_name = 'orders'        and column_name = 'order_date')
      then 'ВНИМАНИЕ — залит schema.sql. Код сайта ждёт created_on/due_on.'
    else 'НЕЯСНО — смотрите список колонок во втором запросе ниже.'
  end as verdict;


-- ---------- 2. СКОЛЬКО ДАННЫХ ЛЕЖИТ ----------
-- Пациенты и наряды уже есть — после проверки они остаются на месте.
select 'пациенты' as что, count(*) as записей from public.patients
union all
select 'наряды',            count(*) from public.orders
union all
select 'выплаты',           count(*) from public.salary_payments
union all
select 'файлы пациентов',   count(*) from public.patient_files
union all
select 'настройки бота',    count(*) from public.notification_settings
union all
select 'журнал отправок',   count(*) from public.notification_log
order by 1;


-- ---------- 3. ВСЕ КОЛОНКИ (если вердикт «НЕЯСНО») ----------
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name in ('orders', 'patients', 'settings', 'patient_files', 'files')
order by table_name, ordinal_position;
