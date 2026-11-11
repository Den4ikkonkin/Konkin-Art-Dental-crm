import { z } from 'zod'

/**
 * Врачи лаборатории. Список задаёт кнопки-галочки в форме наряда.
 * В базе хранится строкой, поэтому старые наряды без врача читаются как ''.
 */
export const DOCTORS = ['Шарапов', 'Архипов', 'Ижерский'] as const

/** Приводит старые записи с инициалами ("Шарапов Д.О.") к имени из списка. */
export function normalizeDoctor(raw: string): string {
  const v = (raw ?? '').trim()
  if (!v) return ''
  const hit = DOCTORS.find((d) => v.toLowerCase().startsWith(d.toLowerCase()))
  return hit ?? v
}
export type DoctorName = (typeof DOCTORS)[number]

/**
 * Техники лаборатории. Это стартовый список для сида: рабочий перечень
 * живёт в таблице technicians, поэтому администратор может добавить
 * нового техника без правки кода.
 */
export const TECHNICIANS = ['Денис', 'Влад', 'Артур', 'Дмитрий', 'Александр'] as const
export type TechnicianName = (typeof TECHNICIANS)[number]

/** Техник, на которого перенесены все старые наряды лаборатории. */
export const LEGACY_TECHNICIAN = 'Денис'

export const WORKS = [
  {
    id: 'zirconia-implant',
    name: 'Винтовая фиксация',
    short: 'Винтовая фиксация',
    color: '#BAA0EE',
    material: 'Диоксид циркония',
    support: 'Имплант · винтовая фиксация',
    price: 6000,
  },
  {
    id: 'zirconia-stump',
    name: 'Коронка из циркония',
    short: 'Коронка из циркония',
    color: '#ABD988',
    material: 'Диоксид циркония',
    support: 'На культе',
    price: 4500,
  },
  {
    id: 'wax-up',
    name: 'Восковая моделировка (wax-up)',
    short: 'Wax-up',
    color: '#82C6AE',
    material: 'Воск / цифровое моделирование',
    support: 'На культе',
    price: 1500,
  },
  {
    id: 'pmma',
    name: 'Временная коронка PMMA',
    short: 'Временная · PMMA',
    color: '#9ABBE5',
    material: 'PMMA',
    support: 'На культе',
    price: 2000,
  },
  {
    id: 'inlay-veneer',
    name: 'Вкладка / винир',
    short: 'Вкладка / винир',
    color: '#E3A8C3',
    material: 'Диоксид циркония',
    support: 'На культе',
    price: 4000,
  },
] as const
export const SHADES = [
  'A1',
  'A2',
  'A3',
  'A3.5',
  'A4',
  'B1',
  'B2',
  'B3',
  'B4',
  'C1',
  'C2',
  'C3',
  'C4',
  'D2',
  'D3',
  'D4',
  'BL1',
  'BL2',
  'BL3',
  'BL4',
]
export const MATERIALS = [
  'Диоксид циркония',
  'PMMA',
  'Металлокерамика',
  'Металлический каркас',
  'Воск / цифровое моделирование',
  'Стеклокерамика',
]
export const SUPPORTS = ['На культе', 'Имплант · винтовая фиксация', 'Имплант · цементная фиксация']
/**
 * Статусы наряда. Порядок в OBJECT_STATUS_ORDER — это рабочая цепочка:
 * Новый → Ожидает примерки → Примерка проведена → В работе → Готов.
 * «Архив» — не статус строки, а флаг archived, чтобы история не терялась.
 */
export const STATUS = {
  new: 'Новый',
  awaiting_fitting: 'Ожидает примерки',
  fitted: 'Примерка проведена',
  in_progress: 'В работе',
  done: 'Готов',
} as const
export type OrderStatus = keyof typeof STATUS

/** Все статусы в порядке рабочей цепочки — для фильтров и селектов. */
export const STATUS_ORDER = [
  'new', 'awaiting_fitting', 'fitted', 'in_progress', 'done',
] as const satisfies readonly OrderStatus[]

/** Заголовок статуса с учётом архива: архивный наряд показывается как «Архив». */
export function statusLabel(status: string, archived = false): string {
  if (archived) return 'Архив'
  return STATUS[status as OrderStatus] ?? status
}
export const FDI = [
  18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28, 48, 47, 46, 45, 44, 43, 42, 41,
  31, 32, 33, 34, 35, 36, 37, 38,
]
export function workOf(id: string) {
  return WORKS.find((w) => w.id === id)!
}
const date = z
  .string()
  .refine(
    (v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(new Date(v + 'T12:00:00').getTime()),
    'Неверная дата',
  )
const amount = z.number().finite().min(0).max(1e9)
export const itemSchema = z.object({
  id: z.string().min(1),
  tooth: z.number().refine((v) => FDI.includes(v)),
  workId: z.enum(['zirconia-implant', 'zirconia-stump', 'wax-up', 'pmma', 'inlay-veneer']),
  material: z.enum(MATERIALS as [string, ...string[]]),
  support: z.enum(SUPPORTS as [string, ...string[]]),
  shade: z.enum(SHADES as [string, ...string[]]),
  price: amount,
})
export const patientSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(200),
  note: z.string().max(3000),
})
export const orderSchema = z
  .object({
    id: z.string().min(1),
    number: z.number().int().positive(),
    patientId: z.string().min(1),
    createdAt: date,
    dueDate: date,
    appointment: z.string().refine((v) => v === '' || /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)),
    status: z.enum(['new', 'awaiting_fitting', 'fitted', 'in_progress', 'done']),
    comment: z.string().max(5000),
    paid: amount,
    /** Дата получения оплаты. Ставится при отметке «Получено», можно изменить. Пусто — не оплачено. */
    paidOn: z.string().refine((v) => v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v), 'Неверная дата оплаты').default(''),
    /** Наряд в архиве: убран из основного списка, но остаётся в базе и в аналитике. */
    archived: z.boolean().default(false),
    /** Врач, который ведёт наряд. Пустая строка — не указан (старые наряды). */
    doctor: z.string().max(120).default(''),
    /** Техник-исполнитель. Пусто у нарядов, созданных до разделения ролей. */
    technician: z.string().max(120).default(''),
    /** Дата и время примерки в формате ISO без секунд: 2026-03-04T14:30. */
    fittingAt: z
      .string()
      .refine((v) => v === '' || /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v), 'Неверная дата примерки')
      .default(''),
    /** Бинарный флаг оплаты. Частичных оплат в первой версии нет. */
    isPaid: z.boolean().default(false),
    /** Начисленная зарплата техника: равна сумме позиций в момент статуса «Готов». */
    salary: amount.default(0),
    /** Запрос уточнения от врача: подсвечивает наряд в очереди. */
    needsClarification: z.boolean().default(false),
    items: z.array(itemSchema).min(1),
  })
  .superRefine((o, ctx) => {
    if (o.paid > total(o))
      ctx.addIssue({
        code: 'custom',
        message: 'Оплачено не может превышать сумму наряда',
        path: ['paid'],
      })
    if (new Set(o.items.map((i) => i.tooth + '|' + i.workId)).size !== o.items.length)
      ctx.addIssue({
        code: 'custom',
        message: 'Один вид работы на одном зубе не должен дублироваться',
        path: ['items'],
      })
    if (o.dueDate < o.createdAt)
      ctx.addIssue({
        code: 'custom',
        message: 'Готовность не может быть раньше даты заказа',
        path: ['dueDate'],
      })
  })
export const salarySchema = z.object({
  id: z.string().min(1),
  date,
  amount,
  note: z.string().max(500),
})
export const stateSchema = z
  .object({
    version: z.literal(1),
    patients: z.array(patientSchema),
    orders: z.array(orderSchema),
    salary: z.array(salarySchema),
    monthlySalary: amount,
  })
  .superRefine((s, ctx) => {
    for (const key of ['patients', 'orders', 'salary'] as const)
      if (new Set(s[key].map((x) => x.id)).size !== s[key].length)
        ctx.addIssue({ code: 'custom', message: 'Повторяющиеся идентификаторы: ' + key })
    if (new Set(s.orders.map((o) => o.number)).size !== s.orders.length)
      ctx.addIssue({ code: 'custom', message: 'Повторяющиеся номера нарядов' })
    if (s.orders.some((o) => !s.patients.some((p) => p.id === o.patientId)))
      ctx.addIssue({ code: 'custom', message: 'Пациент наряда отсутствует в справочнике' })
  })
export type Item = z.infer<typeof itemSchema>
export type Order = z.infer<typeof orderSchema>
export type Patient = z.infer<typeof patientSchema>
export type State = z.infer<typeof stateSchema>
export type Salary = z.infer<typeof salarySchema>
export const emptyState: State = {
  version: 1,
  patients: [],
  orders: [],
  salary: [],
  monthlySalary: 50000,
}
export function today() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
export function total(o: { items: { price: number }[] }) {
  return Math.round(o.items.reduce((s, i) => s + i.price, 0) * 100) / 100
}
/**
 * Сумма в рублях для интерфейса.
 *
 * Копейки показываются только если они реально есть: цены в прайсе целые,
 * поэтому «6 000,00 ₽» несло ноль информации и не влезало в колонку
 * карточки наряда — браузер обрезал его многоточием.
 */
export const money = (n: number) => {
  const kopecks = !Number.isInteger(n)
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    minimumFractionDigits: kopecks ? 2 : 0,
    maximumFractionDigits: kopecks ? 2 : 0,
  }).format(n)
}
export const formatDate = (s: string) =>
  s ? new Date(s.length === 10 ? s + 'T12:00:00' : s).toLocaleDateString('ru-RU') : '—'
/* ---------------- Сроки и цвет срочности ---------------- */

export type DueTone = 'calm' | 'soon' | 'overdue' | 'archived' | 'done'

/**
 * Цвет срочности наряда. Единственное место, где решается, красить ли
 * карточку в зелёный, жёлтый или красный — чтобы список, таблица,
 * календарь и уведомления не расходились.
 *
 * «Скоро» — срок сегодня или завтра. Просрочка — дата уже прошла.
 */
export function dueTone(
  order: { dueDate: string; status: string; archived?: boolean },
  now = new Date(),
): DueTone {
  if (order.archived) return 'archived'
  if (order.status === 'done') return 'done'
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const due = new Date(order.dueDate + 'T12:00:00')
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate())
  const diff = Math.round((dueDay.getTime() - today.getTime()) / 86400000)
  if (diff < 0) return 'overdue'
  if (diff <= 1) return 'soon'
  return 'calm'
}

const DUE_LABEL: Record<DueTone, string> = {
  calm: 'Срок не близко',
  soon: 'Срок приближается',
  overdue: 'Просрочен',
  archived: 'Архив',
  done: 'Готов',
}

/** Подпись к цвету. Цвет без текста не используется — так требует доступность. */
export function dueLabel(tone: DueTone): string {
  return DUE_LABEL[tone]
}

/** Сколько дней осталось до срока: отрицательное число — просрочка. */
export function daysLeft(dueDate: string, now = new Date()): number {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const due = new Date(dueDate + 'T12:00:00')
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate())
  return Math.round((dueDay.getTime() - today.getTime()) / 86400000)
}

/** Предупреждение для наряда без даты примерки. */
export function fittingWarning(order: { fittingAt?: string; status: string }): string {
  if (order.fittingAt) return ''
  if (order.status === 'awaiting_fitting' || order.status === 'new') {
    return 'Дата примерки не назначена — срок работы не считается от примерки'
  }
  return ''
}

export function inPeriod(o: { createdAt: string }, period: string, now = new Date()) {
  if (period === 'all') return true
  const offset = period === 'prev' ? -1 : 0
  const month = new Date(now.getFullYear(), now.getMonth() + offset, 1)
  return (
    o.createdAt.slice(0, 7) ===
    `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`
  )
}

/* ---------------- Месяцы ---------------- */

export const MONTHS = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
] as const

/** '2026-10' → 'Октябрь 2026'. Пустая строка — «Всё время». */
export function monthLabel(key: string): string {
  if (!key) return 'Всё время'
  const [y, m] = key.split('-')
  const name = MONTHS[Number(m) - 1]
  return name ? `${name} ${y}` : key
}

/** Ключ месяца из даты: '2026-10-19' → '2026-10'. */
export const monthKey = (isoDate: string) => isoDate.slice(0, 7)

/** Совпадает ли дата с выбранным месяцем. Пустой ключ — без фильтра. */
export function inMonth(o: { createdAt: string }, month: string): boolean {
  return !month || monthKey(o.createdAt) === month
}

/** Год из даты: '2026-10-19' → 2026. */
export const yearOf = (isoDate: string) => Number(isoDate.slice(0, 4))

/**
 * Все месяцы для выпадающего списка: 12 штук на каждый год.
 * Берём текущий год и годы, которые есть в данных, чтобы ни один
 * месяц не был скрыт. Сортировка — от новых к старым.
 */
export function monthOptions(dates: string[], now = new Date()): string[] {
  const years = new Set<number>([now.getFullYear()])
  for (const d of dates) if (d) years.add(yearOf(d))

  const keys: string[] = []
  for (const year of years) {
    for (let month = 1; month <= 12; month++) {
      keys.push(`${year}-${String(month).padStart(2, '0')}`)
    }
  }
  return keys.sort().reverse()
}

/** Текущий месяц в виде '2026-10'. */
export function currentMonthKey(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export function yearOptions(dates: string[], now = new Date()): number[] {
  const years = new Set<number>([now.getFullYear()])
  for (const d of dates) if (d) years.add(yearOf(d))
  return [...years].sort((a, b) => b - a)
}
// Количество считается по единицам/зубам, не по числу нарядов.
// Общая оплата наряда распределяется пропорционально стоимости его позиций,
// в копейках; остаток округления получает последняя позиция.
export function allocatedPaid(o: Order): number[] {
  const cost = total(o),
    paidCents = Math.round(o.paid * 100)
  if (!cost || !paidCents) return o.items.map(() => 0)
  const raw = o.items.map((i) => (i.price / cost) * paidCents),
    cents = raw.map(Math.floor)
  let remaining = paidCents - cents.reduce((s, n) => s + n, 0)
  const ranked = raw
    .map((n, i) => ({ i, fraction: n - cents[i] }))
    .sort((a, b) => b.fraction - a.fraction)
  for (const r of ranked) {
    if (remaining <= 0) break
    cents[r.i]++
    remaining--
  }
  return cents.map((n) => n / 100)
}
export function summarize(orders: Order[]) {
  const rows = WORKS.map((w) => ({ ...w, count: 0, done: 0, sum: 0, paid: 0, rest: 0 }))
  orders.forEach((o) => {
    const paid = allocatedPaid(o)
    o.items.forEach((i, index) => {
      const row = rows.find((r) => r.id === i.workId)!
      row.count++
      if (o.status === 'done') row.done++
      row.sum += i.price
      row.paid += paid[index]
    })
  })
  rows.forEach((r) => {
    r.sum = Math.round(r.sum * 100) / 100
    r.paid = Math.round(r.paid * 100) / 100
    r.rest = Math.round((r.sum - r.paid) * 100) / 100
  })
  return rows
}
/** Сводка по врачам: сколько нарядов, работ, на какую сумму. */
export function summarizeDoctors(orders: Order[]) {
  type Row = { name: string; orders: number; count: number; done: number; sum: number; paid: number }
  const map = new Map<string, Row>()
  const rowOf = (raw: string) => {
    const name = raw || 'Не указан'
    let row = map.get(name)
    if (!row) {
      row = { name, orders: 0, count: 0, done: 0, sum: 0, paid: 0 }
      map.set(name, row)
    }
    return row
  }
  // Известных врачей заводим заранее, чтобы в таблице были и нули.
  DOCTORS.forEach((d) => rowOf(d))

  orders.forEach((o) => {
    const row = rowOf(o.doctor)
    row.orders++
    const paid = allocatedPaid(o)
    o.items.forEach((item, index) => {
      row.count++
      if (o.status === 'done') row.done++
      row.sum += item.price
      row.paid += paid[index]
    })
  })

  const round = (n: number) => Math.round(n * 100) / 100
  return [...map.values()]
    .map((r) => ({ ...r, sum: round(r.sum), paid: round(r.paid) }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}
export function download(name: string, text: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export function exportCsv(orders: Order[], patients: Patient[]) {
  const quote = (v: unknown) => '"' + String(v).replace(/"/g, '""') + '"'
  const rows = [
    [
      'Наряд',
      'Пациент',
      'Зуб',
      'Вид работы',
      'Материал',
      'Опора',
      'Оттенок',
      'Цена',
      'Оплачено (распределено)',
      'Статус',
    ],
  ]
  orders.forEach((o) => {
    const paid = allocatedPaid(o)
    o.items.forEach((i, index) =>
      rows.push([
        String(o.number),
        patients.find((p) => p.id === o.patientId)?.name ?? '',
        o.doctor || '',
        String(i.tooth),
        workOf(i.workId).name,
        i.material,
        i.support,
        i.shade,
        String(i.price),
        String(paid[index]),
        STATUS[o.status],
      ]),
    )
  })
  download(
    'dental-orders.csv',
    '\ufeff' + rows.map((r) => r.map(quote).join(';')).join('\r\n'),
    'text/csv;charset=utf-8',
  )
}
