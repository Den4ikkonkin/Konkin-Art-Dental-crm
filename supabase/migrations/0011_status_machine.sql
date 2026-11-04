-- ============================================================
--  0011 — Машина статусов и начисление зарплаты на уровне базы
--  Проверки живут в Postgres, а не в интерфейсе: обойти
--  их через прямой запрос к API нельзя.
-- ============================================================

-- ---------- Допустимые переходы ----------
create or replace function public.order_status_allowed(from_status text, to_status text)
returns boolean
language sql
immutable
as $$
  select case
    when from_status is null then to_status in ('new','awaiting_fitting','fitted','in_progress','done')
    when from_status = to_status then true
    when from_status = 'new'            then to_status in ('awaiting_fitting','fitted','in_progress','done')
    when from_status = 'awaiting_fitting' then to_status in ('fitted','in_progress','done','new')
    when from_status = 'fitted'         then to_status in ('in_progress','done','awaiting_fitting')
    when from_status = 'in_progress'    then to_status in ('done','fitted')
    when from_status = 'done'           then to_status in ('in_progress','fitted','awaiting_fitting')
    else false
  end
$$;

comment on function public.order_status_allowed(text, text) is
  'Новый → Ожидает примерки → Примерка проведена → В работе → Готов. Возврат из «Готов» разрешён — это отмена готовности.';

-- ---------- Триггер статуса ----------
create or replace function public.orders_status_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor uuid := auth.uid();
  v_role text := public.current_role();
begin
  if new.status is distinct from old.status then
    if not public.order_status_allowed(old.status, new.status) then
      raise exception 'Переход статуса «%» → «%» запрещён', old.status, new.status
        using errcode = 'check_violation';
    end if;

    -- Врач статус не меняет, даже если роль дошла до обновления строки.
    if v_role = 'doctor' then
      raise exception 'Врач не изменяет статус наряда'
        using errcode = 'insufficient_privilege';
    end if;

    new.prev_status := old.status;

    insert into public.order_status_log (order_id, from_status, to_status, changed_by, is_demo)
    values (new.id, old.status, new.status, actor, coalesce(new.is_demo, false));
  end if;

  -- Начисление зарплаты: только на переходе в «Готов».
  if new.status = 'done' and old.status is distinct from 'done' then
    new.salary_total := coalesce(
      (select sum(oi.price) from public.order_items oi where oi.order_id = new.id),
      0
    );
    new.salary_charged := new.salary_total > 0;
  end if;

  -- Отмена готовности обнуляет начисление.
  if old.status = 'done' and new.status is distinct from 'done' then
    new.salary_total := 0;
    new.salary_charged := false;
  end if;

  return new;
end;
$$;

drop trigger if exists orders_status_guard on public.orders;
create trigger orders_status_guard
  before update on public.orders
  for each row execute function public.orders_status_guard();

-- ---------- Защита от правки наряда после «Готов» ----------
-- Врач не правит наряд никогда. Техник не правит содержимое
-- после «Готов», но статус вернуть может — это отдельная кнопка
-- «Отменить готовность», она меняет только status и prev_status.
create or replace function public.orders_locked_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text := public.current_role();
begin
  if v_role = 'admin' then
    return new;
  end if;

  if v_role = 'doctor' then
    raise exception 'Врач не редактирует наряд'
      using errcode = 'insufficient_privilege';
  end if;

  if old.status = 'done' and new.status = 'done' then
    if (new.items::text is distinct from old.items::text)
      or (new.patient_id is distinct from old.patient_id)
      or (new.doctor_id is distinct from old.doctor_id)
      or (new.comment is distinct from old.comment)
      or (new.due_on is distinct from old.due_on)
      or (new.appointment is distinct from old.appointment) then
      raise exception 'Наряд в статусе «Готов» редактировать нельзя. Сначала отмените готовность.'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists orders_locked_guard on public.orders;
create trigger orders_locked_guard
  before update on public.orders
  for each row execute function public.orders_locked_guard();

-- ---------- Запись в ленту пациента ----------
create or replace function public.timeline_write(
  p_patient uuid,
  p_order uuid,
  p_kind text,
  p_summary text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.patient_timeline (patient_id, order_id, kind, summary, actor_id)
  values (p_patient, p_order, p_kind, left(coalesce(p_summary, ''), 500), auth.uid());
end;
$$;

-- ---------- Лента: создание наряда и смена статуса ----------
create or replace function public.orders_timeline_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.timeline_write(new.patient_id, new.id, 'order_created', 'Создан наряд №' || new.number);
  return new;
end;
$$;

drop trigger if exists orders_timeline_after_insert on public.orders;
create trigger orders_timeline_after_insert
  after insert on public.orders
  for each row execute function public.orders_timeline_after_insert();

create or replace function public.orders_timeline_after_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status is distinct from old.status then
    perform public.timeline_write(
      new.patient_id, new.id, 'status_changed',
      'Статус наряда №' || new.number || ': ' || old.status || ' → ' || new.status
    );
  end if;

  if new.archived is distinct from old.archived then
    perform public.timeline_write(
      new.patient_id, new.id,
      case when new.archived then 'order_archived' else 'order_restored' end,
      case when new.archived
        then 'Наряд №' || new.number || ' перемещён в архив'
        else 'Наряд №' || new.number || ' восстановлен из архива'
      end
    );
  end if;

  return new;
end;
$$;

drop trigger if exists orders_timeline_after_update on public.orders;
create trigger orders_timeline_after_update
  after update on public.orders
  for each row execute function public.orders_timeline_after_update();

-- ---------- Уведомления: готовый наряд врачу ----------
create or replace function public.orders_notify_after_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid;
begin
  if new.status = 'done' and old.status is distinct from 'done' then
    select d.profile_id into v_user from public.doctors d where d.id = new.doctor_id;
    if v_user is not null then
      insert into public.notifications (user_id, kind, title, body, link, order_id, patient_id, is_demo)
      values (v_user, 'order_done', 'Наряд готов',
              'Наряд №' || new.number || ' готов к выдаче', '/orders/' || new.id, new.id, new.patient_id,
              coalesce(new.is_demo, false));
    end if;
  end if;

  if new.status is distinct from old.status then
    select t.profile_id into v_user from public.technicians t where t.id = new.technician_id;
    if v_user is not null and new.status = 'awaiting_fitting' then
      insert into public.notifications (user_id, kind, title, body, link, order_id, patient_id, is_demo)
      values (v_user, 'order_fitting', 'Наряд ожидает примерки',
              'Наряд №' || new.number || ' переведён в ожидание примерки', '/orders/' || new.id, new.id, new.patient_id,
              coalesce(new.is_demo, false));
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists orders_notify_after_update on public.orders;
create trigger orders_notify_after_update
  after update on public.orders
  for each row execute function public.orders_notify_after_update();

-- ---------- Уведомление технику о передаче пациента ----------
create or replace function public.handoffs_notify()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid;
  v_name text;
begin
  select t.profile_id into v_user from public.technicians t where t.id = new.technician_id;
  select p.name into v_name from public.patients p where p.id = new.patient_id;

  if v_user is not null and new.status = 'sent' then
    insert into public.notifications (user_id, kind, title, body, link, patient_id, is_demo)
    values (v_user, 'handoff_sent', 'Врач передал пациента',
            coalesce(v_name, 'Пациент') || ' передан для создания наряда',
            '/patients/' || new.patient_id, new.patient_id, coalesce(new.is_demo, false));
  end if;

  perform public.timeline_write(
    new.patient_id, null, 'handoff_created',
    'Пациент передан технику'
  );

  return new;
end;
$$;

drop trigger if exists handoffs_notify on public.patient_handoffs;
create trigger handoffs_notify
  after insert on public.patient_handoffs
  for each row execute function public.handoffs_notify();
