-- ============================================================
--  0010 — Перелив старых данных на техника Дениса
--         и бинарный флаг оплаты.
--  Выполняется один раз: повторный запуск ничего не дублирует,
--  потому что каждого наряда касаемся только если technician_id пуст.
-- ============================================================

-- ---------- 1. Денис получает учётку и профиль техника ----------
-- Если строки ещё нет — создаём. profile_id подставим отдельно,
-- когда администратор заведёт пользователя denis в Auth.
insert into public.technicians (name)
values ('Денис')
on conflict do nothing;

-- ---------- 2. Все старые наряды переходят к Денису ----------
update public.orders o
set technician_id = t.id
from public.technicians t
where lower(t.name) = 'денис'
  and o.technician_id is null;

-- ---------- 3. Старый врач строкой превращается в ссылку ----------
-- В orders.doctor лежит фамилия текстом. Сопоставляем с doctors.
update public.orders o
set doctor_id = d.id
from public.doctors d
where o.doctor_id is null
  and o.doctor <> ''
  and lower(d.surname) = lower(split_part(o.doctor, ' ', 1));

-- Новых нарядов без врача быть не должно, но старые могут остаться пустыми.
-- Ставим им Шарапова только если фамилия не распозналась.
update public.orders o
set doctor_id = (select id from public.doctors where lower(surname) = 'шарапов' limit 1)
where o.doctor_id is null;

-- ---------- 4. Старые пациенты привязываются к врачу наряда ----------
update public.patients p
set doctor_id = (
  select o.doctor_id
  from public.orders o
  where o.patient_id = p.id
    and o.doctor_id is not null
  order by o.created_on
  limit 1
)
where p.doctor_id is null;

-- ---------- 5. Связь многие-ко-многим из старого поля ----------
insert into public.patient_doctors (patient_id, doctor_id)
select p.id, p.doctor_id
from public.patients p
where p.doctor_id is not null
on conflict do nothing;

insert into public.patient_doctors (patient_id, doctor_id)
select distinct o.patient_id, o.doctor_id
from public.orders o
where o.doctor_id is not null
on conflict do nothing;

-- ---------- 6. Бинарная оплата ----------
-- Старое numeric paid заменяется флагом. Суммы не теряем:
-- они остаются в orders.paid как историческая справка.
update public.orders
set is_paid = (paid > 0)
where is_paid is distinct from (paid > 0);

-- ---------- 7. Старые позиции переезжают в order_items ----------
-- Цена берётся из jsonb как есть: прайс не пересчитываем.
insert into public.order_items (order_id, tooth, work_id, work_name, material, support, shade, price)
select
  o.id,
  (item->>'tooth')::int,
  item->>'workId',
  coalesce(item->>'workId', ''),
  coalesce(item->>'material', ''),
  coalesce(item->>'support', ''),
  coalesce(item->>'shade', ''),
  (item->>'price')::numeric
from public.orders o
cross join lateral jsonb_array_elements(o.items) as item
where jsonb_typeof(o.items) = 'array'
  and (item->>'tooth') ~ '^\d+$'
  and (item->>'price') ~ '^\d+(\.\d+)?$'
on conflict (order_id, tooth, work_id) do nothing;

-- ---------- 8. Цена наряда и зарплата ----------
update public.orders o
set salary_total = coalesce(
  (select sum(oi.price) from public.order_items oi where oi.order_id = o.id),
  0
)
where o.salary_total = 0;

update public.orders
set salary_charged = (status = 'done' and salary_total > 0)
where status = 'done' and salary_charged = false;

-- ---------- 9. Старые статусы не ломают новую машину ----------
-- 'new', 'in_progress', 'done' остаются допустимыми значениями.
update public.orders set status = 'new' where status is null;

-- ---------- 10. Файлы: автор и владелец ----------
alter table public.patient_files add column if not exists is_demo boolean not null default false;

-- ---------- 11. Хранилище: доступ по ролям вместо user_id ----------
drop policy if exists patient_files_read on storage.objects;
create policy patient_files_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'patient-files'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_admin()
      or public.current_role() = 'doctor'
    )
  );

drop policy if exists patient_files_write on storage.objects;
create policy patient_files_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'patient-files'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_admin()
    )
  );

drop policy if exists patient_files_delete on storage.objects;
create policy patient_files_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'patient-files'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_admin()
    )
  );
