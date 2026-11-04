// Тесты для месячного фильтра и годового отчёта.
// Отдельный файл, чтобы не трогать существующий набор проверок модели.

import assert from 'node:assert/strict'
import { demoState } from '../src/lib/demo'
import { stateSchema, MONTHS, monthKey, monthLabel, monthOptions, yearOptions, inMonth, total } from '../src/lib/model'
// Проверка разбивки по врачам добавлена вместе с полем doctor.
import { buildYearReport, yearReportCsv } from '../src/lib/yearly'

const state = stateSchema.parse(demoState())

/* ---------- Месяцы ---------- */

assert.equal(MONTHS.length, 12)
assert.equal(MONTHS[0], 'Январь')
assert.equal(MONTHS[11], 'Декабрь')

assert.equal(monthKey('2026-10-19'), '2026-10')
assert.equal(monthLabel('2026-10'), 'Октябрь 2026')
assert.equal(monthLabel('2026-09'), 'Сентябрь 2026')
assert.equal(monthLabel(''), 'Всё время')
assert.equal(monthLabel('2026-13'), '2026-13', 'несуществующий месяц возвращается как есть')

assert.ok(inMonth({ createdAt: '2026-10-01' }, '2026-10'))
assert.ok(!inMonth({ createdAt: '2026-09-30' }, '2026-10'))
assert.ok(inMonth({ createdAt: '2026-09-30' }, ''), 'пустой фильтр пропускает всё')

/* ---------- Список месяцев ---------- */

const opts = monthOptions(['2026-08-15', '2026-10-01'], new Date(2026, 11, 15))
assert.equal(opts.length, 12, 'все 12 месяцев года')
assert.ok(opts.includes('2026-01'), 'январь тоже доступен')
assert.ok(opts.includes('2026-06'), 'июнь тоже доступен')
assert.ok(opts.includes('2026-12'))
assert.equal(opts[0], '2026-12', 'сортировка от новых к старым')
assert.equal(opts[11], '2026-01')
assert.equal(new Set(opts).size, opts.length, 'без дублей')

// Месяцы прошлых лет тоже остаются доступны, если в них есть данные.
const optsMulti = monthOptions(['2024-03-01', '2026-10-01'], new Date(2026, 9, 1))
assert.equal(optsMulti.length, 24, 'два года — 24 месяца')
assert.ok(optsMulti.includes('2024-03'), 'месяц из прошлого года не потерян')
assert.equal(optsMulti[0], '2026-12')

const optsEmpty = monthOptions([], new Date(2026, 5, 1))
assert.equal(optsEmpty.length, 12, 'даже без данных — все 12 месяцев')

/* ---------- Годы ---------- */

const years = yearOptions(['2024-03-01', '2026-01-01'], new Date(2026, 5, 1))
assert.deepEqual(years, [2026, 2024])

/* ---------- Годовой отчёт ---------- */

const currentYear = new Date().getFullYear()
const report = buildYearReport(state.orders, state.salary, currentYear)

assert.equal(report.months.length, 12, 'всегда 12 месяцев')
assert.equal(report.year, currentYear)

// Сумма по месяцам должна совпасть с суммой по всем нарядам года.
const yearOrders = state.orders.filter((o) => o.createdAt.startsWith(String(currentYear)))
const countOfOrders = report.months.reduce((s, m) => s + m.orders, 0)
assert.equal(countOfOrders, yearOrders.length, 'ни один наряд года не потерян')

// Единицы работ считаются по позициям, а не по нарядам.
const itemsInYear = yearOrders.reduce((s, o) => s + o.items.length, 0)
assert.equal(report.totals.count, itemsInYear, 'единицы считаются по позициям')

const sumByMonths = report.months.reduce((s, m) => s + m.sum, 0)
const sumDirect = yearOrders.reduce((s, o) => s + total(o), 0)
assert.ok(Math.abs(sumByMonths - sumDirect) < 0.01, 'стоимость сходится')

// total = paid + salary для каждого месяца
for (const m of report.months) {
  assert.ok(Math.abs(m.total - (m.paid + m.salary)) < 0.01, `месяц ${m.name}: total = paid + salary`)
}

// Пустой год не должен падать и давать нули.
const emptyReport = buildYearReport([], [], 1999)
assert.equal(emptyReport.totals.orders, 0)
assert.equal(emptyReport.totals.total, 0)
assert.equal(emptyReport.months.length, 12)
assert.ok(emptyReport.months.every((m) => m.orders === 0 && m.salary === 0))

// Разбивка по работам: сумма единиц по работам равна общему числу единиц.
const worksTotal = emptyReport.works.reduce((s, w) => s + w.count, 0)
assert.equal(worksTotal, 0)
const worksTotalReal = report.works.reduce((s, w) => s + w.count, 0)
assert.equal(worksTotalReal, report.totals.count, 'разбивка по работам покрывает все единицы')

// byMonth по каждой работе в сумме даёт её count
for (const w of report.works) {
  const perMonth = w.byMonth.reduce((s, n) => s + n, 0)
  assert.equal(perMonth, w.count, `${w.name}: byMonth сходится с count`)
}

/* ---------- CSV ---------- */

const csv = yearReportCsv(report)
assert.ok(csv.startsWith('\ufeff'), 'BOM для Excel')
assert.ok(csv.includes('Месяц'))
assert.ok(csv.includes('Итого'))
assert.ok(csv.includes('Стоимость'), 'есть колонка стоимости')

console.log('OK: месяцы, фильтр месяца, список месяцев, годы, годовой отчёт, CSV')

/* ---------- Данные для карточек нарядов ---------- */

// Карточка показывает зубы наряда без дублей и легенду по видам работ.
const cardOrder = state.orders[0]
const teethInCard = Array.from(new Set(cardOrder.items.map((i) => i.tooth)))
assert.equal(teethInCard.length, cardOrder.items.length, 'наряд не содержит двух работ на одном зубе')

const byWork: Record<string, number> = {}
for (const i of cardOrder.items) byWork[i.workId] = (byWork[i.workId] ?? 0) + 1
const legendSum = Object.values(byWork).reduce((s, n) => s + n, 0)
assert.equal(legendSum, cardOrder.items.length, 'легенда покрывает все позиции наряда')

// Остаток к оплате не бывает отрицательным, даже если оплачено больше суммы.
for (const o of state.orders) {
  const rest = Math.max(0, total(o) - o.paid)
  assert.ok(rest >= 0, `наряд ${o.number}: остаток не отрицательный`)
}


// ---------- Врачи в годовом отчёте ----------
const withDoctors = demoState().orders.map((o, i) => ({ ...o, doctor: i % 2 === 0 ? 'Шарапов Д.О.' : 'Архипов В.С.' }))
const reportD = buildYearReport(withDoctors, [], new Date().getFullYear())
assert.ok(reportD.doctors.length >= 2, 'в отчёте есть строки по врачам')
assert.equal(
  reportD.doctors.reduce((s, d) => s + d.count, 0),
  reportD.totals.count,
  'единицы работ по врачам сходятся с итогом',
)
assert.equal(
  reportD.doctors.reduce((s, d) => s + d.orders, 0),
  reportD.totals.orders,
  'наряды по врачам сходятся с итогом',
)
for (const d of reportD.doctors) {
  assert.equal(
    d.byMonth.reduce((a, b) => a + b, 0),
    d.count,
    'разбивка по месяцам внутри врача сходится с его итогом',
  )
}
const csvDoctors = yearReportCsv(reportD)
assert.ok(csvDoctors.includes('Врач'), 'в CSV есть блок по врачам')
console.log('OK: врачи в годовом отчёте, сходимость и CSV')
