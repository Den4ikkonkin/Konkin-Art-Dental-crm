// Роли, права и меню — одно место, где описано, кто что видит.
//
// Почему отдельным файлом: интерфейс и навигация не должны решать права
// сами. Они спрашивают у этого модуля, а настоящий запрет всё равно
// выполняет RLS в Postgres. Здесь — только отображение и UX.

export type Role = 'admin' | 'doctor' | 'technician'
export type ProfileStatus = 'active' | 'archived'

export type Profile = {
  userId: string
  login: string
  role: Role
  status: ProfileStatus
  displayName: string
  mustChangePassword: boolean
  /** Путь к фото: /team/<login>.png. Пусто — показываются инициалы. */
  avatarUrl: string
}

/** Кто может войти. Архивный пользователь не входит никогда. */
export function canSignIn(profile: Pick<Profile, 'status'> | null): boolean {
  return Boolean(profile && profile.status === 'active')
}

/* ---------------- Права ---------------- */

export type Permission =
  | 'order.create'
  | 'order.edit'
  | 'order.status.change'
  | 'order.archive'
  | 'order.restore'
  | 'order.cancel_done'
  | 'order.assign_technician'
  | 'order.change_doctor'
  | 'patient.create'
  | 'patient.archive'
  | 'patient.handoff'
  | 'patient.add_doctor'
  | 'file.upload'
  | 'file.delete'
  | 'portfolio.view_all'
  | 'portfolio.manage'
  | 'technician.card.view'
  | 'price.manage'
  | 'user.manage'
  | 'salary.view_all'
  | 'salary.view_own'
  | 'finance.view_doctor_totals'
  | 'report.export_all'
  | 'demo.toggle'
  | 'role.impersonate'

const ADMIN: Permission[] = [
  'order.create', 'order.edit', 'order.status.change', 'order.archive', 'order.restore',
  'order.cancel_done', 'order.assign_technician', 'order.change_doctor',
  'patient.create', 'patient.archive', 'patient.handoff', 'patient.add_doctor',
  'file.upload', 'file.delete',
  'portfolio.view_all', 'portfolio.manage',
  'technician.card.view',
  'price.manage', 'user.manage',
  'salary.view_all', 'salary.view_own', 'finance.view_doctor_totals',
  'report.export_all', 'demo.toggle', 'role.impersonate',
]

const DOCTOR: Permission[] = [
  'patient.create', 'patient.handoff', 'patient.add_doctor',
  'file.upload',
  'portfolio.view_all',
  'technician.card.view',
  'finance.view_doctor_totals',
]

const TECHNICIAN: Permission[] = [
  'order.create', 'order.edit', 'order.status.change', 'order.archive', 'order.restore',
  'order.cancel_done', 'order.change_doctor',
  'patient.create',
  'file.upload', 'file.delete',
  'portfolio.manage',
  'salary.view_own',
]

const MATRIX: Record<Role, Permission[]> = {
  admin: ADMIN,
  doctor: DOCTOR,
  technician: TECHNICIAN,
}

export function can(role: Role, permission: Permission): boolean {
  return MATRIX[role].includes(permission)
}

/** Врач наряд не редактирует и статус не меняет — это правило базы, не UX. */
export function canEditOrder(role: Role): boolean {
  return role === 'admin' || role === 'technician'
}

/**
 * Может ли роль править содержимое наряда в текущем статусе.
 * Техник не правит «Готов» — только отменяет готовность.
 */
export function canEditOrderContent(
  role: Role,
  order: { status: string },
): boolean {
  if (role === 'admin') return true
  if (role === 'doctor') return false
  return order.status !== 'done'
}

export function canDeleteFile(role: Role, isAuthor: boolean): boolean {
  return role === 'admin' || isAuthor
}

/* ---------------- Навигация ---------------- */

export type NavItem = { href: string; label: string; icon: string }

export const NAV: Record<Role, NavItem[]> = {
  technician: [
    { href: '/queue', label: 'Моя очередь', icon: 'layout' },
    { href: '/orders', label: 'Мои наряды', icon: 'clipboard' },
    { href: '/patients', label: 'Мои пациенты', icon: 'users' },
    { href: '/portfolio', label: 'Портфолио', icon: 'image' },
    { href: '/earnings', label: 'Зарплата', icon: 'chart' },
    { href: '/calendar', label: 'Календарь', icon: 'calendar' },
    { href: '/notifications', label: 'Уведомления', icon: 'bell' },
    { href: '/settings', label: 'Настройки', icon: 'settings' },
  ],
  doctor: [
    { href: '/', label: 'Моя сводка', icon: 'layout' },
    { href: '/patients', label: 'Мои пациенты', icon: 'users' },
    { href: '/materials', label: 'Мои материалы', icon: 'folder' },
    { href: '/technicians', label: 'Техники', icon: 'wrench' },
    { href: '/portfolio', label: 'Портфолио', icon: 'image' },
    { href: '/handoffs', label: 'Переданные пациенты', icon: 'send' },
    { href: '/notifications', label: 'Уведомления', icon: 'bell' },
    { href: '/settings', label: 'Настройки', icon: 'settings' },
  ],
  admin: [
    { href: '/', label: 'Сводка', icon: 'layout' },
    { href: '/orders', label: 'Все наряды', icon: 'clipboard' },
    { href: '/patients', label: 'Все пациенты', icon: 'users' },
    { href: '/technicians', label: 'Техники', icon: 'wrench' },
    { href: '/doctors', label: 'Врачи', icon: 'stethoscope' },
    { href: '/finance', label: 'Финансы', icon: 'chart' },
    { href: '/price', label: 'Прайс', icon: 'tag' },
    { href: '/users', label: 'Пользователи', icon: 'shield' },
    { href: '/demo', label: 'Демо', icon: 'flask' },
    { href: '/backups', label: 'Бэкапы', icon: 'archive' },
    { href: '/settings', label: 'Настройки', icon: 'settings' },
  ],
}

/** Заголовок рабочего пространства в боковой панели. */
export const WORKSPACE_TITLE: Record<Role, string> = {
  technician: 'Рабочее место техника',
  doctor: 'Кабинет врача',
  admin: 'Панель администратора',
}

/** Кнопка действия в верхней панели для каждой роли. */
export const PRIMARY_ACTION: Record<Role, { label: string; href: string } | null> = {
  technician: { label: 'Новый наряд', href: '/orders/new' },
  doctor: { label: 'Новая карточка пациента', href: '/patients/new' },
  admin: { label: 'Создать пользователя', href: '/users/new' },
}

/* ---------------- Очередь техника ---------------- */

export type QueueBuckets = {
  new: number
  inProgress: number
  awaitingFitting: number
  done: number
  overdue: number
  archived: number
}

/**
 * Считает очередь по уже отфильтрованным RLS нарядам техника.
 * Просрочка считается по сроку готовности, а не по дате примерки.
 */
export function queueBuckets(
  orders: { status: string; archived?: boolean; dueDate: string }[],
  now = new Date(),
): QueueBuckets {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const buckets: QueueBuckets = {
    new: 0, inProgress: 0, awaitingFitting: 0, done: 0, overdue: 0, archived: 0,
  }

  for (const o of orders) {
    if (o.archived) { buckets.archived++; continue }
    if (o.status === 'new') buckets.new++
    if (o.status === 'in_progress') buckets.inProgress++
    if (o.status === 'awaiting_fitting' || o.status === 'fitted') buckets.awaitingFitting++
    if (o.status === 'done') buckets.done++

    const due = new Date(o.dueDate + 'T12:00:00')
    const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate())
    if (o.status !== 'done' && dueDay.getTime() < startOfToday.getTime()) buckets.overdue++
  }

  return buckets
}
