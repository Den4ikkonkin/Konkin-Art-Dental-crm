// Сборка текста утренней сводки. Модуль намеренно без зависимостей:
// его импортируют и страница /notifications (браузер), и воркер scripts/telegram-bot.ts (Node).
//
// Важно про время: в orders.appointment лежит «настенное» локальное время вида
// 2026-10-20T09:30 — без часового пояса. Поэтому «сегодня» тоже считаем
// в локальном поясе лаборатории (по умолчанию UTC+4, Самара),
// а не в поясе сервера.

export type DigestOrder = {
  id: string
  number: number
  patientId: string
  appointment: string // '' | 'YYYY-MM-DDTHH:MM'
  dueDate: string // 'YYYY-MM-DD'
  status: 'new' | 'awaiting_fitting' | 'fitted' | 'in_progress' | 'done'
  paid: number
  items: { price: number }[]
}

export type DigestPatient = { id: string; name: string }

export type DigestOptions = {
  utcOffsetMinutes: number
  includeTomorrow: boolean
  includeDueToday: boolean
  includeOverdue: boolean
}

const WEEKDAYS = [
  'воскресенье',
  'понедельник',
  'вторник',
  'среда',
  'четверг',
  'пятница',
  'суббота',
]

/* ---------- Работа с датами ---------- */

/** Сдвиг даты 'YYYY-MM-DD' на days дней. Считаем в UTC, чтобы не зависеть от пояса машины. */
export function shiftDate(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Текущий момент, сдвинутый в локальный пояс лаборатории. */
export function localNow(now: Date, utcOffsetMinutes: number): Date {
  return new Date(now.getTime() + utcOffsetMinutes * 60000)
}

/** Сегодняшняя дата в поясе лаборатории: 'YYYY-MM-DD'. */
export function localDateString(now: Date, utcOffsetMinutes: number): string {
  return localNow(now, utcOffsetMinutes).toISOString().slice(0, 10)
}

/** Минуты от начала суток в поясе лаборатории. */
export function localMinutes(now: Date, utcOffsetMinutes: number): number {
  const d = localNow(now, utcOffsetMinutes)
  return d.getUTCHours() * 60 + d.getUTCMinutes()
}

/** '2026-10-20' → '20.10' */
export function shortDate(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${d}.${m}`
}

/** '2026-10-20' → 'вторник' */
export function weekdayName(iso: string): string {
  return WEEKDAYS[new Date(iso + 'T00:00:00Z').getUTCDay()]
}

/* ---------- Мелочи ---------- */

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function orderTotal(o: DigestOrder): number {
  return Math.round(o.items.reduce((s, i) => s + Number(i.price || 0), 0) * 100) / 100
}

/* ---------- Сборка сводки ---------- */

export type DigestResult = {
  text: string
  /** Записи, у которых приём сегодня — по ним воркер рисует кнопки «Готово». */
  todayOrders: DigestOrder[]
  today: string
  tomorrow: string
}

export function buildDigest(input: {
  now: Date
  orders: DigestOrder[]
  patients: DigestPatient[]
  options: DigestOptions
}): DigestResult {
  const { now, orders, patients, options } = input
  const today = localDateString(now, options.utcOffsetMinutes)
  const tomorrow = shiftDate(today, 1)

  const nameOf = (id: string) =>
    escapeHtml(patients.find((p) => p.id === id)?.name ?? 'Без пациента')

  // Приёмы: appointment — единственный источник назначенного времени.
  const withAppointment = orders.filter((o) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(o.appointment))
  const todayAppointments = withAppointment
    .filter((o) => o.appointment.slice(0, 10) === today)
    .sort((a, b) => a.appointment.localeCompare(b.appointment))
  const tomorrowAppointments = withAppointment
    .filter((o) => o.appointment.slice(0, 10) === tomorrow)
    .sort((a, b) => a.appointment.localeCompare(b.appointment))

  const dueToday = orders
    .filter((o) => o.dueDate === today && o.status !== 'done')
    .sort((a, b) => a.number - b.number)

  const overdue = orders
    .filter((o) => o.dueDate < today && o.status !== 'done')
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.number - b.number)

  const lines: string[] = []
  lines.push(`🔔 <b>Сводка на ${weekdayName(today)}, ${shortDate(today)}</b>`)

  const time = (o: DigestOrder) => `<code>${o.appointment.slice(11)}</code>`

  if (todayAppointments.length) {
    lines.push('')
    lines.push(`<b>Приёмы сегодня</b> · ${todayAppointments.length}`)
    for (const o of todayAppointments) {
      const mark = o.status === 'done' ? ' · готов' : ''
      lines.push(`${time(o)} — ${nameOf(o.patientId)} <i>(№${o.number}${mark})</i>`)
    }
  }

  if (options.includeDueToday) {
    if (dueToday.length) {
      lines.push('')
      lines.push(`<b>Срок готовности сегодня</b> · ${dueToday.length}`)
      for (const o of dueToday) {
        lines.push(`№${o.number} · ${nameOf(o.patientId)} · ${orderTotal(o).toFixed(0)} ₽`)
      }
    }
  }

  if (options.includeOverdue) {
    if (overdue.length) {
      lines.push('')
      lines.push(`<b>Просрочено</b> · ${overdue.length}`)
      for (const o of overdue.slice(0, 10)) {
        lines.push(`№${o.number} · ${nameOf(o.patientId)} — срок ${shortDate(o.dueDate)}`)
      }
      if (overdue.length > 10) lines.push(`… и ещё ${overdue.length - 10}`)
    }
  }

  if (options.includeTomorrow) {
    lines.push('')
    if (tomorrowAppointments.length) {
      lines.push(`<b>Завтра, ${weekdayName(tomorrow)} ${shortDate(tomorrow)}</b> · ${tomorrowAppointments.length}`)
      for (const o of tomorrowAppointments) {
        lines.push(`${time(o)} — ${nameOf(o.patientId)} <i>(№${o.number})</i>`)
      }
    } else {
      lines.push(`<b>Завтра, ${shortDate(tomorrow)}</b> — приёмов нет`)
    }
  }

  const hasAnything =
    todayAppointments.length ||
    (options.includeDueToday && dueToday.length) ||
    (options.includeOverdue && overdue.length) ||
    (options.includeTomorrow && tomorrowAppointments.length)

  if (!hasAnything) {
    lines.push('')
    lines.push('На сегодня и завтра приёмов нет.')
  }

  return {
    text: lines.join('\n'),
    todayOrders: todayAppointments.filter((o) => o.status !== 'done'),
    today,
    tomorrow,
  }
}

/** Сводка только на завтра — для кнопки «Показать завтра» и одноимённой команды. */
export function buildTomorrow(input: {
  now: Date
  orders: DigestOrder[]
  patients: DigestPatient[]
  options: DigestOptions
}): { text: string; tomorrow: string } {
  const { now, orders, patients, options } = input
  const today = localDateString(now, options.utcOffsetMinutes)
  const tomorrow = shiftDate(today, 1)

  const nameOf = (id: string) =>
    escapeHtml(patients.find((p) => p.id === id)?.name ?? 'Без пациента')

  const list = orders
    .filter(
      (o) =>
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(o.appointment) &&
        o.appointment.slice(0, 10) === tomorrow,
    )
    .sort((a, b) => a.appointment.localeCompare(b.appointment))

  const due = orders
    .filter((o) => o.dueDate === tomorrow && o.status !== 'done')
    .sort((a, b) => a.number - b.number)

  const lines: string[] = [
    `📅 <b>Завтра, ${weekdayName(tomorrow)} ${shortDate(tomorrow)}</b>`,
  ]

  if (list.length) {
    lines.push('')
    lines.push(`<b>Приёмы</b> · ${list.length}`)
    for (const o of list) {
      lines.push(`<code>${o.appointment.slice(11)}</code> — ${nameOf(o.patientId)} <i>(№${o.number})</i>`)
    }
  } else {
    lines.push('')
    lines.push('Приёмов нет.')
  }

  if (due.length) {
    lines.push('')
    lines.push(`<b>Срок готовности завтра</b> · ${due.length}`)
    for (const o of due) lines.push(`№${o.number} · ${nameOf(o.patientId)}`)
  }

  return { text: lines.join('\n'), tomorrow }
}
