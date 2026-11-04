-- ============================================================
--  0012 — исправление бесконечной рекурсии в политиках RLS
--
--  ОШИБКА, КОТОРУЮ ЭТО ЛЕЧИТ
--    infinite recursion detected in policy for relation "patients"
--
--  ПРИЧИНА
--    patients_read читает patient_doctors, а patient_doctors_read
--    читает patients. Postgres раскрывает политику, натыкается на
--    обратную ссылку и зацикливается. Такой цикл ломает доступ
--    ко всем пациентам сразу — и технику, и врачу.
--
--    Второй цикл того же рода: orders_read вызывает current_role()
--    через profiles, а если profiles когда-нибудь начнёт зависеть
--    от orders, повторится то же самое.
--
--  РЕШЕНИЕ
--    Проверки «кто этот пользователь и кого он видит» вынесены в
--    функции SECURITY DEFINER. Внутри такой функции RLS не
--    применяется, поэтому политика patients может спросить
--    «видит ли этот техник этого пациента» без обращения к
--    patient_doctors через политику.
--
--  Запускать: Supabase → SQL Editor → целиком → Run.
--  Файл идемпотентный, повторный запуск безопасен.
-- ============================================================

-- ============================================================
--  1. Вспомогательные функции обхода
--  Все помечены SECURITY DEFINER: они выполняются от владельца
--  таблиц и не проходят через политики вызывающей стороны.
--  search_path зафиксирован — иначе функцию можно подменить
--  через схему и обойти защиту.
-- ============================================================

-- Пациенты, доступные текущему технику: через его наряды
-- и через передачи пациентов.
create or replace function public.tech_patient_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  -- созданные самим техником
  select p.id from public.patients p where p.user_id = auth.uid()
  union
  -- через его наряды
  select o.patient_id
  from public.orders o
  join public.technicians t on t.id = o.technician_id
  where t.profile_id = auth.uid()
  union
  -- переданные ему врачом
  select h.patient_id
  from public.patient_handoffs h
  join public.technicians t on t.id = h.technician_id
  where t.profile_id = auth.uid()
$$;

-- Пациенты, доступные текущему врачу: через связь пациент–врач
-- и через наряды, где он указан.
create or replace function public.doctor_patient_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select pd.patient_id
  from public.patient_doctors pd
  join public.doctors d on d.id = pd.doctor_id
  where d.profile_id = auth.uid()
  union
  select o.patient_id
  from public.orders o
  join public.doctors d on d.id = o.doctor_id
  where d.profile_id = auth.uid()
$$;

comment on function public.tech_patient_ids() is
  'Пациенты, доступные текущему технику. SECURITY DEFINER — разрывает цикл patients ↔ patient_doctors.';
comment on function public.doctor_patient_ids() is
  'Пациенты, доступные текущему врачу. SECURITY DEFINER — разрывает цикл patients ↔ patient_doctors.';

-- ============================================================
--  2. patients — главный цикл
-- ============================================================
drop policy if exists patients_read on public.patients;

create policy patients_read on public.patients
for select to authenticated
using (
  public.is_admin()
  or (public."current_role"() = 'doctor'
      and id in (select public.doctor_patient_ids()))
  or (public."current_role"() = 'technician'
      and id in (select public.tech_patient_ids()))
);

-- ============================================================
--  3. patient_doctors — обратная сторона цикла
--  Здесь больше нет обращения к patients: связи врача видны по
--  doctor_id, а технику они не нужны вовсе.
-- ============================================================
drop policy if exists patient_doctors_read on public.patient_doctors;

create policy patient_doctors_read on public.patient_doctors
for select to authenticated
using (
  public.is_admin()
  or (public."current_role"() = 'doctor' and doctor_id = public.current_doctor_id())
  or (public."current_role"() = 'technician'
      and patient_id in (select public.tech_patient_ids()))
);

-- ============================================================
--  4. files — здесь тоже был подзапрос к patients
--  Через patient_doctors политика снова могла уйти в цикл.
--  Заменяем на функцию.
-- ============================================================
drop policy if exists files_read on public.files;

create policy files_read on public.files
for select to authenticated
using (
  public.is_admin()
  or technician_id = public.current_technician_id()
  or author_id = auth.uid()
  or (public."current_role"() = 'doctor'
      and (
        doctor_id = public.current_doctor_id()
        or patient_id in (select public.doctor_patient_ids())
      ))
);

-- ============================================================
--  5. patient_timeline — читает patients, тот же риск
-- ============================================================
drop policy if exists timeline_read on public.patient_timeline;

create policy timeline_read on public.patient_timeline
for select to authenticated
using (
  public.is_admin()
  or patient_id in (select public.doctor_patient_ids())
  or patient_id in (select public.tech_patient_ids())
);

-- ============================================================
--  6. Проверка после установки
--  Эти запросы должны вернуть по одной строке без ошибок.
-- ============================================================
select
  (select count(*) from public.tech_patient_ids())   as "пациентов у техника",
  (select count(*) from public.doctor_patient_ids()) as "пациентов у врача",
  (select count(*) from pg_policies
   where schemaname = 'public' and tablename = 'patients') as "политик на patients";
