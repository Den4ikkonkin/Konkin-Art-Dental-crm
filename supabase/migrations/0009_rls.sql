-- ============================================================
--  0009 — RLS-политики для всех таблиц CRM
--  Правило простое: администратор видит всё, врач — только
--  связанное с ним, техник — только своё, архивный не видит ничего.
--  Файл идемпотентный: политики пересоздаются безопасно.
-- ============================================================

-- ---------- Профили ----------
alter table public.profiles enable row level security;

drop policy if exists profiles_self on public.profiles;
create policy profiles_self on public.profiles
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists profiles_admin_write on public.profiles;
create policy profiles_admin_write on public.profiles
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------- Врачи ----------
alter table public.doctors enable row level security;

drop policy if exists doctors_read on public.doctors;
create policy doctors_read on public.doctors
  for select to authenticated
  using (public.is_active_user());

drop policy if exists doctors_admin on public.doctors;
create policy doctors_admin on public.doctors
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------- Техники ----------
alter table public.technicians enable row level security;

-- Врач видит карточки всех техников, техник — свою,
-- администратор — все. Финансов в этой таблице нет.
drop policy if exists technicians_read on public.technicians;
create policy technicians_read on public.technicians
  for select to authenticated
  using (
    public.is_admin()
    or public.current_role() = 'doctor'
    or id = public.current_technician_id()
  );

drop policy if exists technicians_self_update on public.technicians;
create policy technicians_self_update on public.technicians
  for update to authenticated
  using (id = public.current_technician_id() or public.is_admin())
  with check (id = public.current_technician_id() or public.is_admin());

drop policy if exists technicians_admin on public.technicians;
create policy technicians_admin on public.technicians
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------- Пациенты ----------
alter table public.patients enable row level security;

drop policy if exists patients_read on public.patients;
create policy patients_read on public.patients
  for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.patient_doctors pd
      where pd.patient_id = patients.id
        and pd.doctor_id = public.current_doctor_id()
    )
    or exists (
      select 1 from public.orders o
      where o.patient_id = patients.id
        and o.technician_id = public.current_technician_id()
    )
    or exists (
      select 1 from public.patient_handoffs h
      where h.patient_id = patients.id
        and h.technician_id = public.current_technician_id()
    )
  );

drop policy if exists patients_insert on public.patients;
create policy patients_insert on public.patients
  for insert to authenticated
  with check (
    public.is_admin()
    or public.current_role() in ('doctor','technician')
  );

drop policy if exists patients_update on public.patients;
create policy patients_update on public.patients
  for update to authenticated
  using (
    public.is_admin()
    or (public.current_role() = 'doctor' and doctor_id = public.current_doctor_id())
    or (public.current_role() = 'technician' and user_id = auth.uid())
  )
  with check (
    public.is_admin()
    or (public.current_role() = 'doctor' and doctor_id = public.current_doctor_id())
    or (public.current_role() = 'technician' and user_id = auth.uid())
  );

-- Физического удаления пациентов нет: только мягкое архивирование.
drop policy if exists patients_delete on public.patients;
create policy patients_delete on public.patients
  for delete to authenticated
  using (false);

-- ---------- Пациент ↔ врачи ----------
alter table public.patient_doctors enable row level security;

drop policy if exists patient_doctors_read on public.patient_doctors;
create policy patient_doctors_read on public.patient_doctors
  for select to authenticated
  using (
    public.is_admin()
    or doctor_id = public.current_doctor_id()
    or exists (
      select 1 from public.patients p
      where p.id = patient_doctors.patient_id
        and (
          p.user_id = auth.uid()
          or exists (
            select 1 from public.orders o
            where o.patient_id = p.id
              and o.technician_id = public.current_technician_id()
          )
        )
    )
  );

drop policy if exists patient_doctors_write on public.patient_doctors;
create policy patient_doctors_write on public.patient_doctors
  for all to authenticated
  using (
    public.is_admin()
    or doctor_id = public.current_doctor_id()
  )
  with check (
    public.is_admin()
    or doctor_id = public.current_doctor_id()
  );

-- ---------- Передачи пациента ----------
alter table public.patient_handoffs enable row level security;

drop policy if exists handoffs_read on public.patient_handoffs;
create policy handoffs_read on public.patient_handoffs
  for select to authenticated
  using (
    public.is_admin()
    or doctor_id = public.current_doctor_id()
    or technician_id = public.current_technician_id()
  );

drop policy if exists handoffs_write on public.patient_handoffs;
create policy handoffs_write on public.patient_handoffs
  for all to authenticated
  using (
    public.is_admin()
    or doctor_id = public.current_doctor_id()
    or technician_id = public.current_technician_id()
  )
  with check (
    public.is_admin()
    or doctor_id = public.current_doctor_id()
    or technician_id = public.current_technician_id()
  );

-- ---------- Наряды ----------
alter table public.orders enable row level security;

-- Старые политики из 0001 построены на user_id и расширяют доступ мимо ролей.
drop policy if exists orders_own on public.orders;
drop policy if exists orders_read on public.orders;
create policy orders_read on public.orders
  for select to authenticated
  using (
    public.is_admin()
    or technician_id = public.current_technician_id()
    or (public.current_role() = 'doctor' and doctor_id = public.current_doctor_id())
  );

drop policy if exists orders_insert on public.orders;
create policy orders_insert on public.orders
  for insert to authenticated
  with check (
    public.is_admin()
    or (public.current_role() = 'technician' and technician_id = public.current_technician_id())
    or (public.current_role() = 'doctor' and doctor_id = public.current_doctor_id())
  );

-- Врач наряд не правит: обновление только техник-владелец и администратор.
drop policy if exists orders_update on public.orders;
create policy orders_update on public.orders
  for update to authenticated
  using (
    public.is_admin()
    or technician_id = public.current_technician_id()
  )
  with check (
    public.is_admin()
    or technician_id = public.current_technician_id()
  );

drop policy if exists orders_delete on public.orders;
create policy orders_delete on public.orders
  for delete to authenticated
  using (public.is_admin());

-- ---------- Позиции наряда ----------
alter table public.order_items enable row level security;

drop policy if exists order_items_read on public.order_items;
create policy order_items_read on public.order_items
  for select to authenticated
  using (
    exists (select 1 from public.orders o where o.id = order_items.order_id)
  );

drop policy if exists order_items_write on public.order_items;
create policy order_items_write on public.order_items
  for all to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
        and (public.is_admin() or o.technician_id = public.current_technician_id())
    )
  )
  with check (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
        and (public.is_admin() or o.technician_id = public.current_technician_id())
    )
  );

-- ---------- Журнал статусов ----------
alter table public.order_status_log enable row level security;

drop policy if exists status_log_read on public.order_status_log;
create policy status_log_read on public.order_status_log
  for select to authenticated
  using (
    exists (select 1 from public.orders o where o.id = order_status_log.order_id)
  );

drop policy if exists status_log_insert on public.order_status_log;
create policy status_log_insert on public.order_status_log
  for insert to authenticated
  with check (
    exists (
      select 1 from public.orders o
      where o.id = order_status_log.order_id
        and (public.is_admin() or o.technician_id = public.current_technician_id())
    )
  );

-- ---------- Файлы ----------
alter table public.files enable row level security;

drop policy if exists files_read on public.files;
create policy files_read on public.files
  for select to authenticated
  using (
    public.is_admin()
    or technician_id = public.current_technician_id()
    or author_id = auth.uid()
    or (
      public.current_role() = 'doctor' and (
        doctor_id = public.current_doctor_id()
        or exists (
          select 1 from public.patient_doctors pd
          where pd.patient_id = files.patient_id
            and pd.doctor_id = public.current_doctor_id()
        )
      )
    )
  );

drop policy if exists files_insert on public.files;
create policy files_insert on public.files
  for insert to authenticated
  with check (
    public.is_active_user()
    and author_id = auth.uid()
  );

drop policy if exists files_update on public.files;
create policy files_update on public.files
  for update to authenticated
  using (public.is_admin() or author_id = auth.uid())
  with check (public.is_admin() or author_id = auth.uid());

-- Удалять файл может администратор или автор загрузки.
drop policy if exists files_delete on public.files;
create policy files_delete on public.files
  for delete to authenticated
  using (public.is_admin() or author_id = auth.uid());

-- ---------- Портфолио ----------
alter table public.portfolio_items enable row level security;

drop policy if exists portfolio_read on public.portfolio_items;
create policy portfolio_read on public.portfolio_items
  for select to authenticated
  using (
    public.is_admin()
    or technician_id = public.current_technician_id()
    or public.current_role() = 'doctor'
  );

drop policy if exists portfolio_write on public.portfolio_items;
create policy portfolio_write on public.portfolio_items
  for all to authenticated
  using (public.is_admin() or technician_id = public.current_technician_id())
  with check (public.is_admin() or technician_id = public.current_technician_id());

-- ---------- Прайс ----------
alter table public.price_list enable row level security;

drop policy if exists price_read on public.price_list;
create policy price_read on public.price_list
  for select to authenticated
  using (public.is_active_user());

drop policy if exists price_admin on public.price_list;
create policy price_admin on public.price_list
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------- Настройки интерфейса ----------
alter table public.user_preferences enable row level security;

drop policy if exists prefs_own on public.user_preferences;
create policy prefs_own on public.user_preferences
  for all to authenticated
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

-- ---------- Уведомления ----------
alter table public.notifications enable row level security;

drop policy if exists notifications_own on public.notifications;
create policy notifications_own on public.notifications
  for all to authenticated
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

-- ---------- Рабочая лента ----------
alter table public.patient_timeline enable row level security;

drop policy if exists timeline_read on public.patient_timeline;
create policy timeline_read on public.patient_timeline
  for select to authenticated
  using (
    exists (select 1 from public.patients p where p.id = patient_timeline.patient_id)
  );

drop policy if exists timeline_insert on public.patient_timeline;
create policy timeline_insert on public.patient_timeline
  for insert to authenticated
  with check (
    public.is_active_user()
    and exists (select 1 from public.patients p where p.id = patient_timeline.patient_id)
  );

-- ---------- Папки Google Drive ----------
alter table public.google_drive_folders enable row level security;

drop policy if exists drive_read on public.google_drive_folders;
create policy drive_read on public.google_drive_folders
  for select to authenticated
  using (
    public.is_admin()
    or doctor_id = public.current_doctor_id()
    or technician_id = public.current_technician_id()
    or exists (
      select 1 from public.patient_handoffs h
      where h.patient_id = google_drive_folders.patient_id
        and h.technician_id = public.current_technician_id()
    )
  );

drop policy if exists drive_write on public.google_drive_folders;
create policy drive_write on public.google_drive_folders
  for all to authenticated
  using (public.is_active_user())
  with check (public.is_active_user());
