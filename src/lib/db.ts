import { uid } from './uid'
import { normalizeDoctor } from './model'
// Слой доступа к данным. Единственное место, где приложение
// разговаривает с Supabase. Страницы работают только с моделью из model.ts.
import { supabase, FILES_BUCKET } from './supabase'
import type { Profile, Role } from './roles'
import { demoState } from './demo'
import {
  Patient, Order, Salary, State, emptyState,
  orderSchema, patientSchema, salarySchema, stateSchema,
} from './model'

function fail(context: string, error: { message?: string } | null): never {
  throw new Error(`${context}: ${error?.message ?? 'неизвестная ошибка'}`)
}

/* ---------- Строка базы → модель ---------- */

type PatientRow = { id: string; name: string; note: string }
type OrderRow = {
  id: string; number: number; patient_id: string; created_on: string; due_on: string
  appointment: string; status: string; comment: string; paid: number | string; items: unknown
  archived?: boolean | null
  doctor?: string | null
  paid_on?: string | null
  // Появились вместе с ролями. У старых нарядов могут отсутствовать.
  is_paid?: boolean | null
  salary_total?: number | string | null
  needs_clarification?: boolean | null
  fitting_at?: string | null
  technician_id?: string | null
  doctor_id?: string | null
  technicians?: { name: string } | { name: string }[] | null
  doctors?: { surname: string } | { surname: string }[] | null
}
type SalaryRow = { id: string; paid_on: string; amount: number | string; note: string }

function toPatient(r: PatientRow): Patient {
  return patientSchema.parse({ id: r.id, name: r.name, note: r.note ?? '' })
}

function toOrder(r: OrderRow): Order {
  return orderSchema.parse({
    id: r.id,
    number: r.number,
    patientId: r.patient_id,
    createdAt: r.created_on,
    dueDate: r.due_on,
    appointment: r.appointment ?? '',
    status: r.status,
    comment: r.comment ?? '',
    paid: Number(r.paid),
    paidOn: r.paid_on ? String(r.paid_on).slice(0, 10) : '',
    archived: r.archived ?? false,
    doctor: normalizeDoctor(
      r.doctor ?? (Array.isArray(r.doctors) ? r.doctors[0]?.surname : r.doctors?.surname) ?? '',
    ),
    technician: (Array.isArray(r.technicians) ? r.technicians[0]?.name : r.technicians?.name) ?? '',
    fittingAt: r.fitting_at ? String(r.fitting_at).slice(0, 16) : '',
    // Флаг is_paid — источник истины. Старое numeric paid остаётся
    // подстраховкой для баз, куда миграция ещё не доехала.
    isPaid: r.is_paid ?? Number(r.paid) > 0,
    salary: Number(r.salary_total ?? 0),
    needsClarification: r.needs_clarification ?? false,
    items: r.items,
  })
}

function toSalary(r: SalaryRow): Salary {
  return salarySchema.parse({ id: r.id, date: r.paid_on, amount: Number(r.amount), note: r.note ?? '' })
}

/* ---------- Чтение ---------- */

/**
 * Список нарядов. Поле archived появилось позже, поэтому при ошибке
 * читаем без него — архив просто будет пустым, а остальное работает.
 * После добавления колонки в Supabase фолбэк перестанет срабатывать сам.
 */
const ORDER_FIELDS = 'id,number,patient_id,created_on,due_on,appointment,status,comment,paid,items'

/**
 * Все колонки CRM плюс имена врача и техника одним запросом.
 * Если миграции ещё не применены, чтение откатывается к более узкому
 * набору полей — приложение не падает от отсутствующей колонки.
 */
const ORDER_FIELDS_FULL =
  ORDER_FIELDS +
  ',doctor,paid_on,archived,is_paid,salary_total,needs_clarification,fitting_at,technician_id,doctor_id' +
  ',technicians(name),doctors(surname)'

/** Поля с врачом. Если колонки в базе ещё нет — читаем без неё, врач будет пустым. */
const ORDER_FIELDS_DOCTOR = ORDER_FIELDS + ',doctor,paid_on'

async function selectOrders() {
  // Порядок попыток: все колонки → без врача → без архива → только базовые.
  // Так приложение работает и до выполнения SQL-миграции.
  const modern = await supabase
    .from('orders')
    .select(ORDER_FIELDS_FULL)
    .order('created_on', { ascending: false })
    .order('number', { ascending: false })

  if (!modern.error) return modern

  const full = await supabase
    .from('orders')
    .select(ORDER_FIELDS_DOCTOR + ',archived')
    .order('created_on', { ascending: false })
    .order('number', { ascending: false })

  if (!full.error) return full

  const noDoctor = await supabase
    .from('orders')
    .select(ORDER_FIELDS + ',archived')
    .order('created_on', { ascending: false })
    .order('number', { ascending: false })

  if (!noDoctor.error) return noDoctor

  return supabase
    .from('orders')
    .select(ORDER_FIELDS)
    .order('created_on', { ascending: false })
    .order('number', { ascending: false })
}

export async function loadState(): Promise<State> {
  const [patients, orders, salary, settings] = await Promise.all([
    supabase.from('patients').select('id,name,note').order('name'),
    selectOrders(),
    supabase.from('salary_payments').select('id,paid_on,amount,note').order('paid_on', { ascending: false }),
    supabase.from('settings').select('monthly_salary').maybeSingle(),
  ])

  if (patients.error) fail('Не удалось загрузить пациентов', patients.error)
  if (orders.error) fail('Не удалось загрузить наряды', orders.error)
  if (salary.error) fail('Не удалось загрузить выплаты', salary.error)
  if (settings.error) fail('Не удалось загрузить настройки', settings.error)

  return {
    version: 1,
    patients: (patients.data as PatientRow[]).map(toPatient),
    orders: (orders.data as OrderRow[]).map(toOrder),
    salary: (salary.data as SalaryRow[]).map(toSalary),
    monthlySalary: Number((settings.data as { monthly_salary: number } | null)?.monthly_salary ?? 50000),
  }
}

export async function nextOrderNumber(): Promise<number> {
  const { data, error } = await supabase.from('orders').select('number').order('number', { ascending: false }).limit(1).maybeSingle()
  if (error) fail('Не удалось получить номер наряда', error)
  return Math.max(1000, Number((data as { number: number } | null)?.number ?? 1000)) + 1
}

/* ---------- Пациенты ---------- */

export async function insertPatient(p: Patient): Promise<Patient> {
  const { data, error } = await supabase.from('patients').insert({ name: p.name, note: p.note }).select('id,name,note').single()
  if (error) fail('Не удалось создать пациента', error)
  return toPatient(data as PatientRow)
}

export async function updatePatient(p: Patient): Promise<void> {
  const { error } = await supabase.from('patients').update({ name: p.name, note: p.note }).eq('id', p.id)
  if (error) fail('Не удалось сохранить пациента', error)
}

export async function removePatient(id: string): Promise<void> {
  const { error } = await supabase.from('patients').delete().eq('id', id)
  if (error) fail('Не удалось удалить пациента', error)
}

/* ---------- Наряды ---------- */

export async function upsertOrder(o: Order): Promise<Order> {
  const payload = {
    id: o.id, number: o.number, patient_id: o.patientId,
    created_on: o.createdAt, due_on: o.dueDate, appointment: o.appointment,
    status: o.status, comment: o.comment, paid: o.paid, paid_on: o.paidOn || null, archived: o.archived, doctor: o.doctor, items: o.items,
  }
  const { data, error } = await supabase.from('orders').upsert(payload, { onConflict: 'id' })
    .select('id,number,patient_id,created_on,due_on,appointment,status,comment,paid,paid_on,archived,doctor,items').single()
  if (error) {
    if (/paid_on/i.test(error.message ?? ''))
      throw new Error('В базе нет колонки paid_on. Выполните SQL из файла supabase/migrations/0006_paid_on.sql — после этого дата оплаты начнёт сохраняться.')
    if (/doctor/i.test(error.message ?? ''))
      throw new Error(
        'В базе нет колонки doctor. Выполните SQL из файла supabase/migrations/0005_doctor.sql — после этого врач сохранится.',
      )
    if (error.code === '23505') throw new Error('Номер наряда уже занят. Откройте наряд заново, номер будет выдан следующий.')
    fail('Не удалось сохранить наряд', error)
  }
  return toOrder(data as OrderRow)
}

export async function setOrderStatus(id: string, status: Order['status']): Promise<void> {
  const { error } = await supabase.from('orders').update({ status }).eq('id', id)
  if (error) fail('Не удалось изменить статус', error)
}

/**
 * Выставляет сумму оплаты наряда целиком или обнуляет её.
 * Отдельная функция, чтобы галочка в списке не перезаписывала весь наряд.
 */
export async function setOrderPaid(id: string, paid: number, paidOn: string): Promise<void> {
  const { error } = await supabase.from('orders').update({ paid, paid_on: paidOn || null }).eq('id', id)
  if (error && /paid_on/i.test(error.message ?? ''))
    throw new Error('В базе нет колонки paid_on. Выполните SQL из файла supabase/migrations/0006_paid_on.sql.')
  if (error) fail('Не удалось изменить оплату', error)
}

/**
 * Перемещает наряд в архив или возвращает обратно.
 * Отдельное поле, чтобы не перезаписывать весь наряд.
 */
/** Смена врача прямо с карточки наряда. */
export async function setOrderDoctor(id: string, doctor: string): Promise<void> {
  const { error } = await supabase.from('orders').update({ doctor }).eq('id', id)
  if (error) {
    if (/doctor/i.test(error.message ?? ''))
      throw new Error('В базе нет колонки doctor. Выполните SQL из файла supabase/migrations/0005_doctor.sql')
    fail('Не удалось сменить врача', error)
  }
}

export async function setOrderArchived(id: string, archived: boolean): Promise<void> {
  const { error } = await supabase.from('orders').update({ archived }).eq('id', id)
  if (error) {
    if (/archived/i.test(error.message ?? ''))
      throw new Error(
        'В базе нет колонки archived. Выполните SQL из файла supabase/migrations/0003_archive.sql',
      )
    fail('Не удалось изменить архив', error)
  }
}

export async function removeOrder(id: string): Promise<void> {
  const { error } = await supabase.from('orders').delete().eq('id', id)
  if (error) fail('Не удалось удалить наряд', error)
}

/* ---------- Выплаты оклада ---------- */

export async function insertSalary(s: Salary): Promise<void> {
  const { error } = await supabase.from('salary_payments').insert({ paid_on: s.date, amount: s.amount, note: s.note })
  if (error) fail('Не удалось добавить выплату', error)
}

export async function removeSalary(id: string): Promise<void> {
  const { error } = await supabase.from('salary_payments').delete().eq('id', id)
  if (error) fail('Не удалось удалить выплату', error)
}

export async function saveMonthlySalary(amount: number): Promise<void> {
  const { error } = await supabase.from('settings').upsert({ monthly_salary: amount }, { onConflict: 'user_id' })
  if (error) fail('Не удалось сохранить оклад', error)
}

/* ---------- Файлы пациентов ---------- */

export type PatientFile = {
  id: string; patientId: string; path: string; name: string
  mime: string; size: number; kind: string; note: string; createdAt: string
}

type FileRow = {
  id: string; patient_id: string; path: string; name: string
  mime: string; size: number; kind: string; note: string; created_at: string
}

export function prettySize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} КБ`
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`
}

export function fileKind(file: File): 'photo' | 'scan' | 'document' | 'other' {
  if (file.type.startsWith('image/')) return 'photo'
  if (file.type === 'application/pdf') return 'scan'
  if (file.type.startsWith('text/')) return 'document'
  return 'other'
}

export async function listFiles(patientId: string): Promise<PatientFile[]> {
  const { data, error } = await supabase.from('patient_files')
    .select('id,patient_id,path,name,mime,size,kind,note,created_at')
    .eq('patient_id', patientId).order('created_at', { ascending: false })
  if (error) fail('Не удалось загрузить список файлов', error)
  return (data as FileRow[]).map((r) => ({
    id: r.id, patientId: r.patient_id, path: r.path, name: r.name,
    mime: r.mime, size: Number(r.size), kind: r.kind, note: r.note, createdAt: r.created_at,
  }))
}

export async function uploadFile(patientId: string, file: File, note = ''): Promise<void> {
  const { data: auth } = await supabase.auth.getUser()
  const userId = auth.user?.id
  if (!userId) throw new Error('Нужно войти в приложение заново.')

  // Первая папка пути — идентификатор пользователя: так работает политика доступа.
  const safe = file.name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-120)
  const path = `${userId}/${patientId}/${uid()}-${safe}`

  const up = await supabase.storage.from(FILES_BUCKET).upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false })
  if (up.error) throw new Error(`Не удалось загрузить файл: ${up.error.message}`)

  const ins = await supabase.from('patient_files').insert({
    patient_id: patientId, path, name: file.name, mime: file.type || '',
    size: file.size, kind: fileKind(file), note,
  })
  if (ins.error) {
    // Если запись не создалась, убираем осиротевший файл из хранилища.
    await supabase.storage.from(FILES_BUCKET).remove([path])
    fail('Файл загружен, но запись не создалась', ins.error)
  }
}

export async function fileLink(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(FILES_BUCKET).createSignedUrl(path, 3600)
  if (error || !data?.signedUrl) fail('Не удалось получить ссылку на файл', error)
  return data.signedUrl
}

export async function removeFile(f: PatientFile): Promise<void> {
  const st = await supabase.storage.from(FILES_BUCKET).remove([f.path])
  if (st.error) fail('Не удалось удалить файл из хранилища', st.error)
  const { error } = await supabase.from('patient_files').delete().eq('id', f.id)
  if (error) fail('Не удалось удалить запись о файле', error)
}

/* ---------- Резервная копия ---------- */

export async function replaceAll(state: State): Promise<void> {
  const { error: e1 } = await supabase.from('orders').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  if (e1) fail('Не удалось очистить наряды', e1)
  const { error: e2 } = await supabase.from('patients').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  if (e2) fail('Не удалось очистить пациентов', e2)
  const { error: e3 } = await supabase.from('salary_payments').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  if (e3) fail('Не удалось очистить выплаты', e3)

  if (state.patients.length) {
    const { error } = await supabase.from('patients').insert(state.patients.map((p) => ({ id: p.id, name: p.name, note: p.note })))
    if (error) fail('Не удалось восстановить пациентов', error)
  }
  if (state.orders.length) {
    const { error } = await supabase.from('orders').insert(state.orders.map((o) => ({
      id: o.id, number: o.number, patient_id: o.patientId, created_on: o.createdAt,
      due_on: o.dueDate, appointment: o.appointment, status: o.status,
      comment: o.comment, paid: o.paid, paid_on: o.paidOn || null, archived: o.archived, doctor: o.doctor, items: o.items,
    })))
    if (error) fail('Не удалось восстановить наряды', error)
  }
  if (state.salary.length) {
    const { error } = await supabase.from('salary_payments').insert(state.salary.map((s) => ({ id: s.id, paid_on: s.date, amount: s.amount, note: s.note })))
    if (error) fail('Не удалось восстановить выплаты', error)
  }
  await saveMonthlySalary(state.monthlySalary)
}

export async function clearEverything(): Promise<void> {
  await replaceAll({ ...emptyState })
}

/* ---------- Вспомогательное ---------- */

/** Демонстрационные данные с предсказуемыми идентификаторами. */
export function loadDemoState(): State {
  return stateSchema.parse(demoState())
}

/** Номера нарядов, идущие после последнего в базе. */
export function followingNumbers(from: number, count: number): number[] {
  return Array.from({ length: count }, (_, i) => from + i)
}


/* ---------- Профиль и роли ---------- */

type ProfileRow = {
  user_id: string
  login: string
  role: Role
  status: 'active' | 'archived'
  display_name: string | null
  must_change_password: boolean
}

/**
 * Профиль текущего пользователя. Возвращает null, если профиля ещё нет
 * (например, аккаунт создан вручную в Supabase до миграции 0007).
 * Отсутствие профиля не ошибка: приложение покажет ограниченный доступ.
 */
export async function loadProfile(): Promise<Profile | null> {
  const { data: auth } = await supabase.auth.getUser()
  const uid = auth.user?.id
  if (!uid) return null

  const { data, error } = await supabase
    .from('profiles')
    .select('user_id,login,role,status,display_name,must_change_password')
    .eq('user_id', uid)
    .maybeSingle()

  if (error) return null
  if (!data) {
    // Таблица есть, строки нет — считаем пользователя техником только для
    // чтения. Запись заблокирует RLS, пока администратор не заведёт профиль.
    return {
      userId: uid,
      login: auth.user?.email?.split('@')[0] ?? 'user',
      role: 'technician',
      status: 'active',
      displayName: '',
      mustChangePassword: false,
    }
  }

  const row = data as ProfileRow
  return {
    userId: row.user_id,
    login: row.login,
    role: row.role,
    status: row.status,
    displayName: row.display_name ?? '',
    mustChangePassword: row.must_change_password,
  }
}

/** Логин превращается в технический email: пользователь его не видит. */
export function loginToEmail(login: string): string {
  const v = login.trim().toLowerCase()
  if (v.includes('@')) return v
  return `${v}@konkin.local`
}

/** Отметка «пароль сменён» после принудительной смены при первом входе. */
export async function clearMustChangePassword(): Promise<void> {
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user?.id) return
  await supabase.from('profiles').update({ must_change_password: false }).eq('user_id', auth.user.id)
}


/* ---------- Передачи пациентов ---------- */

export type Handoff = {
  id: string
  patientId: string
  patientName: string
  doctorId: string
  technicianId: string
  technicianName: string
  suggestedWork: string
  comment: string
  fileCount: number
  hasScans: boolean
  status: 'sent' | 'viewed' | 'accepted' | 'needs_clarification' | 'order_created' | 'cancelled'
  createdAt: string
  readAt: string
}

type HandoffRow = {
  id: string
  patient_id: string
  doctor_id: string
  technician_id: string
  suggested_work: string
  comment: string
  file_count: number
  has_scans: boolean
  status: Handoff['status']
  created_at: string
  read_at: string | null
  patients?: { name: string } | { name: string }[] | null
  technicians?: { name: string } | { name: string }[] | null
}

const one = <T,>(v: T | T[] | null | undefined): T | undefined =>
  Array.isArray(v) ? v[0] : v ?? undefined

export async function loadHandoffs(): Promise<Handoff[]> {
  const { data, error } = await supabase
    .from('patient_handoffs')
    .select('id,patient_id,doctor_id,technician_id,suggested_work,comment,file_count,has_scans,status,created_at,read_at,patients(name),technicians(name)')
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) return []

  return (data as HandoffRow[]).map((r) => ({
    id: r.id,
    patientId: r.patient_id,
    patientName: one(r.patients)?.name ?? 'Пациент',
    doctorId: r.doctor_id,
    technicianId: r.technician_id,
    technicianName: one(r.technicians)?.name ?? '',
    suggestedWork: r.suggested_work ?? '',
    comment: r.comment ?? '',
    fileCount: Number(r.file_count ?? 0),
    hasScans: Boolean(r.has_scans),
    status: r.status,
    createdAt: r.created_at,
    readAt: r.read_at ?? '',
  }))
}

export async function createHandoff(input: {
  patientId: string
  doctorId: string
  technicianId: string
  suggestedWork: string
  comment: string
  fileCount: number
  hasScans: boolean
}): Promise<void> {
  const { error } = await supabase.from('patient_handoffs').insert({
    patient_id: input.patientId,
    doctor_id: input.doctorId,
    technician_id: input.technicianId,
    suggested_work: input.suggestedWork,
    comment: input.comment,
    file_count: input.fileCount,
    has_scans: input.hasScans,
    status: 'sent',
  })
  if (error) fail('Не удалось передать пациента технику', error)
}

export async function setHandoffStatus(id: string, status: Handoff['status']): Promise<void> {
  const patch: Record<string, unknown> = { status }
  if (status === 'viewed') patch.read_at = new Date().toISOString()
  const { error } = await supabase.from('patient_handoffs').update(patch).eq('id', id)
  if (error) fail('Не удалось изменить статус передачи', error)
}

/* ---------- Прайс ---------- */

export type PriceRow = {
  id: string
  workId: string
  name: string
  shortName: string
  material: string
  support: string
  color: string
  price: number
  isActive: boolean
}

export async function loadPriceList(): Promise<PriceRow[]> {
  const { data, error } = await supabase
    .from('price_list')
    .select('id,work_id,name,short_name,material,support,color,price,is_active')
    .order('price', { ascending: false })

  if (error) return []

  return (data as {
    id: string; work_id: string; name: string; short_name: string
    material: string; support: string; color: string; price: number | string; is_active: boolean
  }[]).map((r) => ({
    id: r.id,
    workId: r.work_id,
    name: r.name,
    shortName: r.short_name ?? '',
    material: r.material ?? '',
    support: r.support ?? '',
    color: r.color ?? '',
    price: Number(r.price),
    isActive: r.is_active,
  }))
}

export async function upsertPrice(input: {
  workId: string
  name: string
  price: number
  material?: string
  support?: string
  color?: string
}): Promise<void> {
  const { error } = await supabase.from('price_list').upsert({
    work_id: input.workId,
    name: input.name,
    price: input.price,
    material: input.material ?? '',
    support: input.support ?? '',
    color: input.color ?? '',
    is_active: true,
  }, { onConflict: 'work_id' })
  if (error) fail('Прайс: не удалось сохранить позицию', error)
}

/* ---------- Файлы ---------- */

export type CrmFile = {
  id: string
  patientId: string | null
  orderId: string | null
  authorId: string
  category: string
  name: string
  mime: string
  size: number
  drivePath: string
  note: string
  createdAt: string
}

export async function loadFiles(): Promise<CrmFile[]> {
  const { data, error } = await supabase
    .from('files')
    .select('id,patient_id,order_id,author_id,category,name,mime,size,drive_path,note,created_at')
    .order('created_at', { ascending: false })
    .limit(500)

  if (error) return []

  return (data as {
    id: string; patient_id: string | null; order_id: string | null; author_id: string
    category: string; name: string; mime: string; size: number
    drive_path: string; note: string; created_at: string
  }[]).map((r) => ({
    id: r.id,
    patientId: r.patient_id,
    orderId: r.order_id,
    authorId: r.author_id,
    category: r.category,
    name: r.name,
    mime: r.mime ?? '',
    size: Number(r.size ?? 0),
    drivePath: r.drive_path ?? '',
    note: r.note ?? '',
    createdAt: r.created_at,
  }))
}

/* ---------- Уведомления ---------- */

export async function unreadCount(): Promise<number> {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .is('read_at', null)
  if (error) return 0
  return count ?? 0
}

/* ---------- Статус наряда ---------- */

export async function setOrderStatusByDate(id: string, status: string): Promise<void> {
  const { error } = await supabase.from('orders').update({ status }).eq('id', id)
  if (error) fail('Не удалось изменить статус наряда', error)
}
