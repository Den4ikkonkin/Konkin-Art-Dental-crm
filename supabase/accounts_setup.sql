-- ============================================================
--  Konkin Art Dental — создание учётных записей
--
--  Запуск: Supabase → SQL Editor → вставить целиком → Run.
--  Файл можно запускать повторно: он не падает на существующих
--  учётках, а обновляет пароль и профиль.
--
--  ЧТО ДЕЛАЕТ
--   1. Создаёт 9 учёток: 1 админ, 3 врача, 5 техников.
--   2. Создаёт записи в auth.identities — без них вход
--      по email/паролю в Supabase не работает.
--   3. Заполняет profiles, doctors, technicians.
--   4. Переносит все старые наряды и пациентов на Дениса.
--   5. Заполняет doctor_id из старого текстового поля doctor.
--   6. Начисляет зарплату по уже готовым нарядам.
--   7. В конце печатает таблицу проверки.
--
--  ЛОГИНЫ И ПАРОЛЬ
--   admin                          — администратор
--   sharapov, arhipov, izhersky    — врачи
--   denis, vlad, artur, dmitry, alexander — техники
--
--   Пароль у всех один: см. переменную v_password ниже.
-- ============================================================

do $$
declare
  v_password     text := 'konkin2026';   -- минимум 8 символов, поменяйте на свой
  v_must_change  boolean := false;       -- true = требовать смену при первом входе
  v_domain       text := 'konkin.local'; -- домен технического email

  r record;
  v_uid uuid;
  v_denis uuid;
  v_denis_tech uuid;
  v_next integer;
begin
  -- ==========================================================
  --  1. Учётные записи
  --  Почему select, а не слепой insert: если пользователь с
  --  таким email уже есть (например, вы создавали вручную),
  --  повторный insert упадёт с 23505 users_email_partial_key.
  --  Здесь существующая запись подхватывается и используется.
  -- ==========================================================
  for r in
    select * from (values
      ('admin',     'admin@konkin.local',     'Администратор',        'admin'),
      ('sharapov',  'sharapov@konkin.local',  'Шарапов',              'doctor'),
      ('arhipov',   'arhipov@konkin.local',   'Архипов',              'doctor'),
      ('izhersky',  'izhersky@konkin.local',  'Ижерский',             'doctor'),
      ('denis',     'denis@konkin.local',     'Денис',                'technician'),
      ('vlad',      'vlad@konkin.local',      'Влад',                 'technician'),
      ('artur',     'artur@konkin.local',     'Артур',                'technician'),
      ('dmitry',    'dmitry@konkin.local',    'Дмитрий',              'technician'),
      ('alexander', 'alexander@konkin.local', 'Александр',            'technician')
    ) as t(login, email, display_name, role)
  loop
    v_uid := null;

    -- уже есть такая почта?
    select id into v_uid from auth.users
    where lower(email) = lower(r.email) and is_sso_user = false
    limit 1;

    if v_uid is null then
      -- детерминированный id: повторный запуск попадёт в ту же строку
      v_uid := md5('konkin-art-dental:' || r.login)::uuid;

      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, created_at, updated_at,
        raw_app_meta_data, raw_user_meta_data,
        confirmation_token, recovery_token,
        email_change_token_new, email_change,
        is_sso_user
      )
      values (
        '00000000-0000-0000-0000-000000000000', v_uid,
        'authenticated', 'authenticated', r.email,
        crypt(v_password, gen_salt('bf')),
        now(), now(), now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        json_build_object('display_name', r.display_name)::jsonb,
        '', '', '', '',
        false
      );
    else
      -- учётка существует: обновляем пароль и метаданные
      update auth.users
      set encrypted_password = crypt(v_password, gen_salt('bf')),
          email_confirmed_at = coalesce(email_confirmed_at, now()),
          updated_at         = now(),
          aud                = 'authenticated',
          role               = 'authenticated',
          raw_app_meta_data  = '{"provider":"email","providers":["email"]}'::jsonb,
          is_sso_user        = false,
          deleted_at         = null,
          confirmation_token     = coalesce(confirmation_token, ''),
          recovery_token         = coalesce(recovery_token, ''),
          email_change_token_new = coalesce(email_change_token_new, ''),
          email_change           = coalesce(email_change, '')
      where id = v_uid;
    end if;

    -- ========================================================
    --  2. Identity
    --  Supabase ищет пользователя для входа по таблице
    --  auth.identities, а не по users.email. Без этой строки
    --  пароль верный, но вход отвечает «Invalid login».
    -- ========================================================
    insert into auth.identities (
      id, user_id, identity_data, provider, provider_id,
      last_sign_in_at, created_at, updated_at
    )
    values (
      md5('identity:' || r.login)::uuid,
      v_uid,
      json_build_object('sub', v_uid::text, 'email', r.email, 'email_verified', true)::jsonb,
      'email', v_uid::text,
      now(), now(), now()
    )
    on conflict (provider_id, provider) do update
      set identity_data = excluded.identity_data,
          updated_at    = now();

    -- ========================================================
    --  3. Профиль
    -- ========================================================
    insert into public.profiles (
      user_id, login, role, status, display_name, must_change_password
    )
    values (v_uid, r.login, r.role, 'active', r.display_name, v_must_change)
    on conflict (user_id) do update
      set login                = excluded.login,
          role                 = excluded.role,
          status               = 'active',
          display_name         = excluded.display_name,
          must_change_password = excluded.must_change_password;

    -- ========================================================
    --  4. Справочники
    -- ========================================================
    -- ВНИМАНИЕ: на doctors.surname и technicians.name нет уникального
    -- ограничения, поэтому «on conflict do nothing» здесь не работает
    -- и каждый прогон добавлял бы по новой строке. Проверяем явно.
    if r.role = 'doctor' then
      if not exists (select 1 from public.doctors where lower(surname) = lower(r.display_name)) then
        insert into public.doctors (profile_id, surname)
        values (v_uid, r.display_name);
      end if;

      update public.doctors
      set profile_id = v_uid
      where lower(surname) = lower(r.display_name);

    elsif r.role = 'technician' then
      if not exists (select 1 from public.technicians where lower(name) = lower(r.display_name)) then
        insert into public.technicians (profile_id, name)
        values (v_uid, r.display_name);
      end if;

      update public.technicians
      set profile_id = v_uid
      where lower(name) = lower(r.display_name);

      if r.login = 'denis' then
        v_denis := v_uid;
      end if;
    end if;
  end loop;

  -- ==========================================================
  --  5. Денис становится владельцем старых данных
  -- ==========================================================
  select id into v_denis_tech from public.technicians
  where profile_id = v_denis limit 1;

  if v_denis_tech is null then
    raise exception 'Не найден справочник техника «Денис» — проверьте таблицу technicians';
  end if;

  -- 5.0 Разрешение конфликтов номеров.
  -- На orders висит unique (user_id, number) от однопользовательской
  -- версии. Если в старой базе было несколько владельцев, у них могли
  -- совпасть номера (1001 у одного и 1001 у другого). После переноса
  -- оба окажутся у Дениса и вставка упадёт на этом ограничении.
  -- Поэтому конфликтующие номера переводим в хвост нумерации.
  -- Номера, которые никому не мешают, остаются прежними.
  select coalesce(max(number), 1000) into v_next from public.orders;

  for r in
    select o.id
    from public.orders o
    where o.user_id is distinct from v_denis
      and (
        -- номер уже занят нарядом Дениса
        exists (select 1 from public.orders d
                where d.user_id = v_denis and d.number = o.number)
        -- или это повтор среди переносимых
        or exists (select 1 from public.orders o2
                   where o2.id <> o.id
                     and o2.user_id is distinct from v_denis
                     and o2.number = o.number
                     and (o2.created_on, o2.id) < (o.created_on, o.id))
      )
    order by o.created_on, o.id
  loop
    v_next := v_next + 1;
    update public.orders set number = v_next where id = r.id;
  end loop;

  -- 5.1 Старые наряды -> Денис.
  -- user_id тоже обновляем: у старых строк он указывает на прежнюю
  -- учётку, а политики доступа к orders проверяют technician_id
  -- и унаследованное условие auth.uid() = user_id.
  update public.orders
  set technician_id = v_denis_tech,
      user_id       = v_denis
  where technician_id is null
     or technician_id <> v_denis_tech;

  -- 5.2 Старые пациенты -> Денис
  update public.patients
  set user_id = v_denis
  where user_id is distinct from v_denis;

  -- ==========================================================
  --  6. Врач из старого текстового поля
  -- ==========================================================
  update public.orders o
  set doctor_id = d.id
  from public.doctors d
  where o.doctor_id is null
    and o.doctor <> ''
    and lower(split_part(o.doctor, ' ', 1)) = lower(d.surname);

  -- ==========================================================
  --  7. Бинарная оплата из старого числового поля
  -- ==========================================================
  update public.orders
  set is_paid = (coalesce(paid, 0) > 0);

  -- ==========================================================
  --  8. Зарплата по уже готовым нарядам
  --  Триггер начисляет её только в момент перехода в «Готов»,
  --  а исторические наряды пришли в этом статусе сразу.
  -- ==========================================================
  update public.orders o
  set salary_total = coalesce(
        (select sum(oi.price) from public.order_items oi where oi.order_id = o.id),
        (select coalesce(sum((i->>'price')::numeric), 0)
           from jsonb_array_elements(case when jsonb_typeof(o.items) = 'array'
                                          then o.items else '[]'::jsonb end) i),
        0
      )
  where o.status = 'done'
    and coalesce(o.salary_total, 0) = 0;

  update public.orders
  set salary_charged = (salary_total > 0)
  where status = 'done';

  -- ==========================================================
  --  9. Связь пациент — врач (многие ко многим)
  -- ==========================================================
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

  raise notice '=== Учётные записи созданы, старые данные закреплены за Денисом ===';
end $$;

-- ============================================================
--  ПРОВЕРКА — таблица должна показать 9 учёток
-- ============================================================
select
  p.login                              as "логин",
  p.display_name                       as "имя",
  case p.role when 'admin'      then 'Администратор'
              when 'doctor'     then 'Врач'
              when 'technician' then 'Техник' end as "роль",
  p.status                             as "статус",
  u.email                              as "email (внутренний)",
  (select count(*) from auth.identities i where i.user_id = u.id) as "вход",
  coalesce((select count(*) from public.orders o
            join public.technicians t on t.id = o.technician_id
            where t.profile_id = u.id), 0)                       as "нарядов"
from public.profiles p
join auth.users u on u.id = p.user_id
where p.login in ('admin','sharapov','arhipov','izhersky',
                  'denis','vlad','artur','dmitry','alexander')
order by case p.role when 'admin' then 1 when 'doctor' then 2 else 3 end, p.login;

-- ============================================================
--  ПРОВЕРКА — сколько старых данных ушло Денису
-- ============================================================
select
  (select count(*) from public.orders)                        as "всего нарядов",
  (select count(*) from public.orders where technician_id is null) as "без техника",
  (select count(*) from public.patients)                      as "всего пациентов",
  (select count(*) from public.orders where status = 'done')    as "готовых",
  (select count(*) from public.orders where salary_total > 0)   as "с зарплатой";
