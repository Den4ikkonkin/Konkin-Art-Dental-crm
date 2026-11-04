-- ============================================================
--  RLS-проверки на тестовых учётках
--  Запускать в Supabase → SQL Editor ПОСЛЕ миграций 0007–0012.
--
--  ЧТО ИСПРАВЛЕНО ОТНОСИТЕЛЬНО ПРЕЖНЕЙ ВЕРСИИ ФАЙЛА
--
--  1. Ошибка 23503 «profiles_user_id_fkey».
--     profiles.user_id ссылается на auth.users(id). Тест вставлял
--     профили со случайными UUID, которых нет в auth.users.
--     Теперь сначала создаются пользователи auth.users.
--
--  2. Ошибка 23502 «null value in column user_id of relation
--     patients violates not-null constraint».
--     Колонки patients.user_id и orders.user_id унаследованы от
--     однопользовательской версии (0001) и объявлены как
--     not null default auth.uid(). В SQL Editor токена нет,
--     auth.uid() = null, default подставляет null, вставка падает.
--     Решение: в начале задаются request.jwt.claims, и auth.uid()
--     возвращает тестового админа.
--
--  3. RLS не проверялся вообще.
--     В SQL Editor вы работаете как postgres — владелец таблиц,
--     а владелец обходит RLS. Теперь перед каждой проверкой
--     выполняется SET LOCAL ROLE authenticated.
--
--  4. Кэш плана в PL/pgSQL.
--     Обычный SELECT ... INTO внутри DO-блока кэширует план
--     вместе с подставленным auth.uid() с первого выполнения,
--     и результат отставал на шаг. Все проверки идут через
--     динамический EXECUTE ... USING — свежий план каждый раз.
--
--  Рабочие данные не затрагиваются: тестовые строки помечены
--  is_demo = true и удаляются в конце. При падении любой проверки
--  DO-блок откатывается целиком, мусор не остаётся.
-- ============================================================

do $$
declare
  v_doctor_a   uuid := gen_random_uuid();
  v_doctor_b   uuid := gen_random_uuid();
  v_tech_a     uuid := gen_random_uuid();
  v_tech_b     uuid := gen_random_uuid();
  v_archived   uuid := gen_random_uuid();
  v_admin      uuid := gen_random_uuid();

  v_doc_a_id   uuid;
  v_doc_b_id   uuid;
  v_tech_a_id  uuid;
  v_tech_b_id  uuid;

  v_patient    uuid;
  v_order      uuid;
  v_patient_b  uuid;
  v_order_b    uuid;
  v_count      int;
  v_sum        numeric;
  v_blocked    boolean;
begin
  -- ==========================================================
  --  0. Тестовые пользователи в auth.users
  -- ==========================================================
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data
  )
  values
    (v_doctor_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'rls-doctor-a@konkin.local', 'x', now(), now(), now(),
     '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb),
    (v_doctor_b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'rls-doctor-b@konkin.local', 'x', now(), now(), now(),
     '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb),
    (v_tech_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'rls-tech-a@konkin.local', 'x', now(), now(), now(),
     '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb),
    (v_tech_b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'rls-tech-b@konkin.local', 'x', now(), now(), now(),
     '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb),
    (v_archived, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'rls-archived@konkin.local', 'x', now(), now(), now(),
     '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb),
    (v_admin, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'rls-admin@konkin.local', 'x', now(), now(), now(),
     '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb)
  on conflict (id) do nothing;

  -- ==========================================================
  --  0b. JWT-контекст админа на время подготовки
  --  claim.sub сбрасывается в пусто: auth.uid() читает его первым,
  --  и унаследованное значение перебило бы подпись пользователя.
  -- ==========================================================
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  -- ==========================================================
  --  1. Профили
  -- ==========================================================
  insert into public.profiles (user_id, login, role, status, display_name, is_demo)
  values
    (v_doctor_a, 'rls-doctor-a', 'doctor',     'active',   'Тестовый врач А',   true),
    (v_doctor_b, 'rls-doctor-b', 'doctor',     'active',   'Тестовый врач Б',   true),
    (v_tech_a,   'rls-tech-a',   'technician', 'active',   'Тестовый техник А', true),
    (v_tech_b,   'rls-tech-b',   'technician', 'active',   'Тестовый техник Б', true),
    (v_archived, 'rls-archived', 'technician', 'archived', 'Архивный техник',   true),
    (v_admin,    'rls-admin',    'admin',      'active',   'Тестовый админ',    true)
  on conflict (user_id) do update
    set login        = excluded.login,
        role         = excluded.role,
        status       = excluded.status,
        display_name = excluded.display_name,
        is_demo      = true;

  -- ==========================================================
  --  2. Справочники
  -- ==========================================================
  if not exists (select 1 from public.doctors where lower(surname) = lower('ТестА')) then
    insert into public.doctors (profile_id, surname, is_demo) values (v_doctor_a, 'ТестА', true);
  end if;
  if not exists (select 1 from public.doctors where lower(surname) = lower('ТестБ')) then
    insert into public.doctors (profile_id, surname, is_demo) values (v_doctor_b, 'ТестБ', true);
  end if;
  if not exists (select 1 from public.technicians where lower(name) = lower('Тестовый техник А')) then
    insert into public.technicians (profile_id, name, is_demo) values (v_tech_a, 'Тестовый техник А', true);
  end if;
  if not exists (select 1 from public.technicians where lower(name) = lower('Тестовый техник Б')) then
    insert into public.technicians (profile_id, name, is_demo) values (v_tech_b, 'Тестовый техник Б', true);
  end if;

  update public.doctors set profile_id = v_doctor_a where lower(surname) = lower('ТестА');
  update public.doctors set profile_id = v_doctor_b where lower(surname) = lower('ТестБ');
  update public.technicians set profile_id = v_tech_a where lower(name) = lower('Тестовый техник А');
  update public.technicians set profile_id = v_tech_b where lower(name) = lower('Тестовый техник Б');

  select id into v_doc_a_id  from public.doctors     where lower(surname) = lower('ТестА') limit 1;
  select id into v_doc_b_id  from public.doctors     where lower(surname) = lower('ТестБ') limit 1;
  select id into v_tech_a_id from public.technicians where lower(name) = lower('Тестовый техник А') limit 1;
  select id into v_tech_b_id from public.technicians where lower(name) = lower('Тестовый техник Б') limit 1;

  if v_doc_a_id is null or v_doc_b_id is null
     or v_tech_a_id is null or v_tech_b_id is null then
    raise exception 'Подготовка не удалась: не созданы справочные записи врачей или техников';
  end if;

  -- ==========================================================
  --  3. Пациент А + наряд А (техник А, врач А)
  -- ==========================================================
  insert into public.patients (name, note, doctor_id, is_demo)
  values ('RLS тестовый пациент А', 'Проверка политик', v_doc_a_id, true)
  returning id into v_patient;

  insert into public.patient_doctors (patient_id, doctor_id, is_demo)
  values (v_patient, v_doc_a_id, true)
  on conflict do nothing;

  insert into public.orders (
    number, patient_id, created_on, due_on, status, comment,
    doctor_id, technician_id, is_demo
  )
  values (
    900001, v_patient, current_date, current_date + 7, 'in_progress',
    'Тестовый наряд для RLS', v_doc_a_id, v_tech_a_id, true
  )
  returning id into v_order;

  insert into public.order_items (order_id, tooth, work_id, price, is_demo)
  values (v_order, 11, 'zirconia-stump', 4500, true);

  -- ==========================================================
  --  4. Пациент Б + наряд Б (техник Б), доведён до «Готов»
  -- ==========================================================
  insert into public.patients (name, note, doctor_id, is_demo)
  values ('RLS тестовый пациент Б', 'Проверка зарплат', v_doc_a_id, true)
  returning id into v_patient_b;

  insert into public.orders (
    number, patient_id, created_on, due_on, status, comment,
    doctor_id, technician_id, is_demo
  )
  values (
    900002, v_patient_b, current_date, current_date + 7, 'in_progress',
    'Наряд второго техника', v_doc_a_id, v_tech_b_id, true
  )
  returning id into v_order_b;

  insert into public.order_items (order_id, tooth, work_id, price, is_demo)
  values (v_order_b, 12, 'zirconia-implant', 5000, true);

  update public.orders set status = 'done' where id = v_order_b;

  -- ==========================================================
  --  ТЕСТ 1. Чужой врач не видит пациента и наряд
  -- ==========================================================
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_doctor_b, 'role', 'authenticated')::text, true);

  execute 'select count(*) from public.patients where id = $1' into v_count using v_patient;
  if v_count <> 0 then
    execute 'reset role';
    raise exception 'RLS.1 ПРОВАЛ: чужой врач видит пациента (% строк)', v_count;
  end if;

  execute 'select count(*) from public.orders where id = $1' into v_count using v_order;
  if v_count <> 0 then
    execute 'reset role';
    raise exception 'RLS.2 ПРОВАЛ: чужой врач видит чужой наряд (% строк)', v_count;
  end if;

  execute 'reset role';
  raise notice 'RLS.1-2 OK — чужой врач не видит ни пациента, ни наряд';

  -- ==========================================================
  --  ТЕСТ 2. Свой врач видит пациента и наряд
  -- ==========================================================
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_doctor_a, 'role', 'authenticated')::text, true);

  execute 'select count(*) from public.patients where id = $1' into v_count using v_patient;
  if v_count <> 1 then
    execute 'reset role';
    raise exception 'RLS.3 ПРОВАЛ: свой врач не видит пациента (% строк)', v_count;
  end if;

  execute 'select count(*) from public.orders where id = $1' into v_count using v_order;
  if v_count <> 1 then
    execute 'reset role';
    raise exception 'RLS.3b ПРОВАЛ: свой врач не видит наряд (% строк)', v_count;
  end if;

  execute 'reset role';
  raise notice 'RLS.3 OK — свой врач видит пациента и наряд';

  -- ==========================================================
  --  ТЕСТ 3. Врач не создаёт наряд
  -- ==========================================================
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_doctor_a, 'role', 'authenticated')::text, true);

  v_blocked := false;
  begin
    execute 'insert into public.orders (number, patient_id, created_on, due_on, doctor_id, is_demo)
             values (900003, $1, current_date, current_date, $2, true)'
      using v_patient, v_doc_a_id;
  exception
    when insufficient_privilege or check_violation or not_null_violation then
      v_blocked := true;
  end;

  execute 'reset role';
  if not v_blocked then
    raise exception 'RLS.4 ПРОВАЛ: врач смог создать наряд';
  end if;
  raise notice 'RLS.4 OK — врач не создаёт наряд';

  -- ==========================================================
  --  ТЕСТ 4. Техник видит свой наряд
  -- ==========================================================
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_tech_a, 'role', 'authenticated')::text, true);

  execute 'select count(*) from public.orders where id = $1' into v_count using v_order;
  execute 'reset role';
  if v_count <> 1 then
    raise exception 'RLS.5 ПРОВАЛ: техник не видит свой наряд (% строк)', v_count;
  end if;
  raise notice 'RLS.5 OK — техник видит свой наряд';

  -- ==========================================================
  --  ТЕСТ 5. Техник не видит чужой наряд и чужую зарплату
  -- ==========================================================
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_tech_a, 'role', 'authenticated')::text, true);

  execute 'select count(*) from public.orders where id = $1' into v_count using v_order_b;
  execute 'reset role';
  if v_count <> 0 then
    raise exception 'RLS.6 ПРОВАЛ: техник видит чужой наряд (% строк)', v_count;
  end if;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_tech_a, 'role', 'authenticated')::text, true);
  execute 'select coalesce(sum(salary_total), 0) from public.orders where id = $1'
    into v_sum using v_order_b;
  execute 'reset role';
  if v_sum <> 0 then
    raise exception 'RLS.7 ПРОВАЛ: техник видит чужую зарплату (% ₽)', v_sum;
  end if;

  raise notice 'RLS.6-7 OK — техник не видит чужой наряд и чужую зарплату';

  -- ==========================================================
  --  ТЕСТ 6. Свою зарплату техник видит
  -- ==========================================================
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_tech_b, 'role', 'authenticated')::text, true);
  execute 'select coalesce(sum(salary_total), 0) from public.orders where id = $1'
    into v_sum using v_order_b;
  execute 'reset role';
  if v_sum <= 0 then
    raise exception 'RLS.7b ПРОВАЛ: техник не видит свою зарплату (% ₽)', v_sum;
  end if;
  raise notice 'RLS.7b OK — техник видит свою зарплату (%)', v_sum;

  -- ==========================================================
  --  ТЕСТ 7. Архивный пользователь не видит данные
  -- ==========================================================
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_archived, 'role', 'authenticated')::text, true);
  execute 'select count(*) from public.orders where id = $1' into v_count using v_order;
  execute 'reset role';
  if v_count <> 0 then
    raise exception 'RLS.8 ПРОВАЛ: архивный пользователь видит наряды (% строк)', v_count;
  end if;
  raise notice 'RLS.8 OK — архивный пользователь не видит данные';

  -- ==========================================================
  --  ТЕСТ 8. Администратор видит всё и все зарплаты
  -- ==========================================================
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  execute 'select count(*) from public.orders where id = any($1)'
    into v_count using array[v_order, v_order_b];
  execute 'select coalesce(sum(salary_total), 0) from public.orders where id = $1'
    into v_sum using v_order_b;
  execute 'reset role';
  if v_count <> 2 then
    raise exception 'RLS.9 ПРОВАЛ: админ видит не все наряды (% из 2)', v_count;
  end if;
  if v_sum <= 0 then
    raise exception 'RLS.9 ПРОВАЛ: админ не видит зарплату техника (% ₽)', v_sum;
  end if;
  raise notice 'RLS.9 OK — администратор видит все наряды и зарплаты';

  -- ==========================================================
  --  5. Уборка. Порядок обратный зависимостям.
  -- ==========================================================
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  delete from public.order_status_log where order_id in (v_order, v_order_b);
  delete from public.order_items      where order_id in (v_order, v_order_b);
  delete from public.orders           where id in (v_order, v_order_b);
  delete from public.patient_doctors  where patient_id = v_patient;
  delete from public.patients         where id in (v_patient, v_patient_b);
  delete from public.doctors          where id in (v_doc_a_id, v_doc_b_id);
  delete from public.technicians      where id in (v_tech_a_id, v_tech_b_id);
  delete from public.profiles         where user_id in
    (v_doctor_a, v_doctor_b, v_tech_a, v_tech_b, v_archived, v_admin);
  delete from auth.users              where id in
    (v_doctor_a, v_doctor_b, v_tech_a, v_tech_b, v_archived, v_admin);

  raise notice '=== Все проверки RLS пройдены, тестовые данные удалены ===';
end $$;
