'use client'

// Врачи по месяцам: сколько работ сделал каждый врач в каждом месяце выбранного года.
// Используется в «Мой заработок». Считает единицы работ (зубы × работы), как и весь отчёт.

import { useMemo, useState } from 'react'
import { useStore } from './Store'
import { DOCTORS, MONTHS, yearOptions, allocatedPaid, money, type Order } from '@/lib/model'

/** Единицы работ по врачам и месяцам. Месяц — по дате создания наряда. */
function doctorMonthGrid(orders: Order[], year: number) {
  const names: string[] = [...DOCTORS]
  const grid = new Map<string, { byMonth: number[]; count: number; sum: number; paid: number }>()
  const rowOf = (raw: string) => {
    const name = raw || 'Не указан'
    if (!grid.has(name)) {
      grid.set(name, { byMonth: Array(12).fill(0), count: 0, sum: 0, paid: 0 })
      if (!names.includes(name)) names.push(name)
    }
    return grid.get(name)!
  }

  for (const o of orders) {
    if (Number(o.createdAt.slice(0, 4)) !== year) continue
    const month = Number(o.createdAt.slice(5, 7)) - 1
    const row = rowOf(o.doctor)
    const paid = allocatedPaid(o)
    o.items.forEach((item, index) => {
      row.byMonth[month] += 1
      row.count += 1
      row.sum += item.price
      row.paid += paid[index]
    })
  }

  return names.map((name) => ({
    name,
    ...(grid.get(name) ?? { byMonth: Array(12).fill(0), count: 0, sum: 0, paid: 0 }),
  }))
}

export default function DoctorsByMonth() {
  const { data } = useStore()
  const years = useMemo(
    () => yearOptions([...data.orders.map((o) => o.createdAt)]),
    [data.orders],
  )
  const [year, setYear] = useState<number | undefined>(undefined)
  const activeYear = year ?? years[0]

  const rows = useMemo(() => doctorMonthGrid(data.orders, activeYear), [data.orders, activeYear])
  const shown = rows.filter((r) => r.count > 0 || DOCTORS.includes(r.name as (typeof DOCTORS)[number]))
  const monthTotals = Array.from({ length: 12 }, (_, i) => shown.reduce((s, r) => s + r.byMonth[i], 0))
  const grandTotal = monthTotals.reduce((s, n) => s + n, 0)

  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>Работы врачей по месяцам</h2>
          <p className="muted small">
            Единицы работ каждого врача в каждом месяце за выбранный год.
            Месяц — по дате создания наряда.
          </p>
        </div>
        <div className="pills">
          {years.map((y) => (
            <button key={y} type="button" className={activeYear === y ? 'active' : ''} onClick={() => setYear(y)}>
              {y}
            </button>
          ))}
        </div>
      </div>

      <div className="table-wrap">
        <table className="doctor-month-table">
          <thead>
            <tr>
              <th>Врач</th>
              {MONTHS.map((m) => (
                <th key={m} className="num month-col">{m.slice(0, 3)}</th>
              ))}
              <th className="num">Всего</th>
              <th className="num">Сумма</th>
              <th className="num">Оплачено</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.name}>
                <td><b>{r.name}</b></td>
                {r.byMonth.map((n, i) => (
                  <td key={i} className={'num ' + (n ? '' : 'muted')}>{n || '·'}</td>
                ))}
                <td className="num"><b>{r.count}</b></td>
                <td className="num">{money(r.sum)}</td>
                <td className="num green">{money(r.paid)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>Итого</td>
              {monthTotals.map((n, i) => (
                <td key={i} className="num">{n || '·'}</td>
              ))}
              <td className="num">{grandTotal}</td>
              <td className="num">{money(shown.reduce((s, r) => s + r.sum, 0))}</td>
              <td className="num green">{money(shown.reduce((s, r) => s + r.paid, 0))}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {grandTotal === 0 && (
        <p className="note">За {activeYear} год работ с указанным врачом пока нет.</p>
      )}
    </section>
  )
}
