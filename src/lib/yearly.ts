// Годовой отчёт: распределение работ по месяцам.
//
// Считаем не «сколько нарядов», а сколько назначенных работ на зубах —
// так же, как на странице «Мой заработок». Каждая позиция наряда
// учитывается отдельно: 16 коронок — это 16 единиц, а не 1 наряд.

import { MONTHS, WORKS, DOCTORS, allocatedPaid, total, yearOf, type Order, type Salary } from './model'

export type MonthRow = {
  month: number // 1–12
  name: string
  orders: number
  count: number // единиц работ
  done: number // из них готово
  sum: number // стоимость работ
  paid: number // оплачено по нарядам
  salary: number // выплаты оклада в этом месяце
  total: number // paid + salary — фактически получено
}

export type WorkRow = {
  id: string
  name: string
  color: string
  count: number
  sum: number
  paid: number
  /** Количество по месяцам, индекс 0 = январь. */
  byMonth: number[]
}

/** Один врач: сколько работ за год и по месяцам. */
export type DoctorRow = {
  name: string
  orders: number
  count: number
  done: number
  sum: number
  paid: number
  /** Количество работ по месяцам, индекс 0 = январь. */
  byMonth: number[]
}

export type YearReport = {
  year: number
  months: MonthRow[]
  works: WorkRow[]
  doctors: DoctorRow[]
  totals: {
    orders: number
    count: number
    done: number
    sum: number
    paid: number
    salary: number
    total: number
  }
}

/** Полный отчёт по году. Месяцы без движения остаются в списке с нулями. */
export function buildYearReport(orders: Order[], salary: Salary[], year: number): YearReport {
  const months: MonthRow[] = MONTHS.map((name, index) => ({
    month: index + 1,
    name,
    orders: 0,
    count: 0,
    done: 0,
    sum: 0,
    paid: 0,
    salary: 0,
    total: 0,
  }))

  // Врачи: заводим всех известных заранее, чтобы в таблице были и нули.
  const doctors: DoctorRow[] = DOCTORS.map((name) => ({
    name, orders: 0, count: 0, done: 0, sum: 0, paid: 0, byMonth: Array(12).fill(0),
  }))
  const doctorRow = (raw: string) => {
    const name = raw || 'Не указан'
    let row = doctors.find((d) => d.name === name)
    if (!row) {
      row = { name, orders: 0, count: 0, done: 0, sum: 0, paid: 0, byMonth: Array(12).fill(0) }
      doctors.push(row)
    }
    return row
  }

  const works: WorkRow[] = WORKS.map((w) => ({
    id: w.id,
    name: w.name,
    color: w.color,
    count: 0,
    sum: 0,
    paid: 0,
    byMonth: Array(12).fill(0),
  }))

  for (const o of orders) {
    if (yearOf(o.createdAt) !== year) continue
    const m = Number(o.createdAt.slice(5, 7)) - 1
    if (m < 0 || m > 11) continue

    const row = months[m]
    row.orders++
    row.sum += total(o)
    row.paid += o.paid

    const doc = doctorRow(o.doctor)
    doc.orders++
    doc.sum += total(o)

    const allocated = allocatedPaid(o)
    o.items.forEach((item, index) => {
      row.count++
      if (o.status === 'done') row.done++

      doc.count++
      if (o.status === 'done') doc.done++
      doc.paid += allocated[index]
      doc.byMonth[m]++

      const work = works.find((w) => w.id === item.workId)
      if (work) {
        work.count++
        work.sum += item.price
        work.paid += allocated[index]
        work.byMonth[m]++
      }
    })
  }

  for (const p of salary) {
    if (yearOf(p.date) !== year) continue
    const m = Number(p.date.slice(5, 7)) - 1
    if (m < 0 || m > 11) continue
    months[m].salary += p.amount
  }

  const round = (n: number) => Math.round(n * 100) / 100
  for (const row of months) {
    row.sum = round(row.sum)
    row.paid = round(row.paid)
    row.salary = round(row.salary)
    row.total = round(row.paid + row.salary)
  }
  for (const w of works) {
    w.sum = round(w.sum)
    w.paid = round(w.paid)
  }
  for (const d of doctors) {
    d.sum = round(d.sum)
    d.paid = round(d.paid)
  }

  const totals = months.reduce(
    (acc, m) => ({
      orders: acc.orders + m.orders,
      count: acc.count + m.count,
      done: acc.done + m.done,
      sum: round(acc.sum + m.sum),
      paid: round(acc.paid + m.paid),
      salary: round(acc.salary + m.salary),
      total: round(acc.total + m.total),
    }),
    { orders: 0, count: 0, done: 0, sum: 0, paid: 0, salary: 0, total: 0 },
  )

  return { year, months, works, doctors, totals }
}

/** CSV годового отчёта: по строке на месяц плюс итог и разбивка по работам. */
export function yearReportCsv(report: YearReport): string {
  const quote = (v: unknown) => '"' + String(v).replace(/"/g, '""') + '"'
  const rows: unknown[][] = [
    ['Месяц', 'Нарядов', 'Единиц работ', 'Готово', 'Стоимость', 'Оплачено по нарядам', 'Оклад', 'Всего получено'],
  ]

  for (const m of report.months) {
    if (!m.orders && !m.salary) continue
    rows.push([m.name, m.orders, m.count, m.done, m.sum, m.paid, m.salary, m.total])
  }

  rows.push([
    'Итого',
    report.totals.orders,
    report.totals.count,
    report.totals.done,
    report.totals.sum,
    report.totals.paid,
    report.totals.salary,
    report.totals.total,
  ])
  rows.push([])
  rows.push(['Вид работы', 'Единиц', 'Стоимость', 'Оплачено'])
  for (const w of report.works) {
    if (w.count) rows.push([w.name, w.count, w.sum, w.paid])
  }

  rows.push([])
  rows.push(['Врач', 'Нарядов', 'Единиц работ', 'Готово', 'Стоимость', 'Оплачено'])
  for (const d of report.doctors) {
    if (d.orders) rows.push([d.name, d.orders, d.count, d.done, d.sum, d.paid])
  }

  return '\ufeff' + rows.map((r) => r.map(quote).join(';')).join('\r\n')
}
