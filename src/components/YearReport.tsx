'use client'

// Годовой отчёт: месяц за месяцем — работы, оплаты, оклад.
// Открывается отдельной кнопкой, чтобы не мешать обычному просмотру.

import { useMemo, useState } from 'react'
import { useStore } from './Store'
import { money, yearOptions, download } from '@/lib/model'
import { buildYearReport, yearReportCsv } from '@/lib/yearly'
import { Download, ChevronDown, ChevronUp } from 'lucide-react'

export default function YearReportPanel() {
  const { data } = useStore()

  const dates = useMemo(
    () => [...data.orders.map((o) => o.createdAt), ...data.salary.map((s) => s.date)],
    [data.orders, data.salary],
  )
  const years = useMemo(() => yearOptions(dates), [dates])

  const [open, setOpen] = useState(false)
  const [year, setYear] = useState(years[0])

  const report = useMemo(
    () => buildYearReport(data.orders, data.salary, year),
    [data.orders, data.salary, year],
  )

  const activeMonths = report.months.filter((m) => m.orders || m.salary)
  const bestMonth = activeMonths.reduce<(typeof activeMonths)[number] | null>(
    (best, m) => (!best || m.total > best.total ? m : best),
    null,
  )
  const avgPerMonth = activeMonths.length
    ? Math.round((report.totals.total / activeMonths.length) * 100) / 100
    : 0

  const worksWithData = report.works.filter((w) => w.count > 0)
  const doctorsWithData = report.doctors.filter((d) => d.orders > 0)

  return (
    <section className="panel year-report">
      <div className="panel-heading">
        <div>
          <h2>Годовой отчёт</h2>
          <p className="muted small">
            Все работы и выплаты за календарный год, сгруппированные по месяцам.
          </p>
        </div>
        <button
          type="button"
          className={'btn ' + (open ? '' : 'primary')}
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          {open ? 'Свернуть' : 'Показать годовой отчёт'}
        </button>
      </div>

      {!open && (
        <p className="note">
          Итоги за год: сколько работ по месяцам, сколько оплачено и получено оклада.
          Нажмите кнопку выше, чтобы открыть.
        </p>
      )}

      {open && (
        <>
          <div className="toolbar">
            <div className="pills">
              {years.map((y) => (
                <button
                  key={y}
                  type="button"
                  className={year === y ? 'active' : ''}
                  onClick={() => setYear(y)}
                >
                  {y}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="btn"
              onClick={() =>
                download(`godovoy-otchet-${year}.csv`, yearReportCsv(report), 'text/csv;charset=utf-8')
              }
            >
              <Download size={16} /> Скачать CSV
            </button>
          </div>

          <div className="metrics">
            <section className="metric">
              <span>Нарядов за год</span>
              <strong>{report.totals.orders}</strong>
              <small>{report.totals.count} единиц работ</small>
            </section>
            <section className="metric">
              <span>Оплачено по нарядам</span>
              <strong style={{ color: '#82C6AE' }}>{money(report.totals.paid)}</strong>
              <small>Из {money(report.totals.sum)} стоимости</small>
            </section>
            <section className="metric">
              <span>Получено оклада</span>
              <strong>{money(report.totals.salary)}</strong>
              <small>Подтверждённые выплаты</small>
            </section>
            <section className="metric">
              <span>Всего за год</span>
              <strong style={{ color: 'var(--orange)' }}>{money(report.totals.total)}</strong>
              <small>В среднем {money(avgPerMonth)} в месяц</small>
            </section>
          </div>

          <h3>По месяцам</h3>
          <div className="table-wrap">
            <table className="year-table">
              <thead>
                <tr>
                  <th>Месяц</th>
                  <th className="num">Нарядов</th>
                  <th className="num">Единиц</th>
                  <th className="num">Готово</th>
                  <th className="num">Стоимость</th>
                  <th className="num">Оплачено</th>
                  <th className="num">Оклад</th>
                  <th className="num">Всего</th>
                </tr>
              </thead>
              <tbody>
                {report.months.map((m) => {
                  const empty = !m.orders && !m.salary
                  const isBest = bestMonth?.month === m.month && m.total > 0
                  return (
                    <tr key={m.month} className={empty ? 'year-empty' : ''}>
                      <td>
                        {m.name}
                        {isBest && <span className="badge year-best">лучший</span>}
                      </td>
                      <td className="num">{m.orders || '—'}</td>
                      <td className="num">{m.count || '—'}</td>
                      <td className="num muted">{m.done || '—'}</td>
                      <td className="num">{m.sum ? money(m.sum) : '—'}</td>
                      <td className="num green">{m.paid ? money(m.paid) : '—'}</td>
                      <td className="num">{m.salary ? money(m.salary) : '—'}</td>
                      <td className="num"><b>{m.total ? money(m.total) : '—'}</b></td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td>За {year} год</td>
                  <td className="num">{report.totals.orders}</td>
                  <td className="num">{report.totals.count}</td>
                  <td className="num">{report.totals.done}</td>
                  <td className="num">{money(report.totals.sum)}</td>
                  <td className="num green">{money(report.totals.paid)}</td>
                  <td className="num">{money(report.totals.salary)}</td>
                  <td className="num"><b>{money(report.totals.total)}</b></td>
                </tr>
              </tfoot>
            </table>
          </div>

          {worksWithData.length > 0 && (
            <>
              <div className="divider" />
              <h3>Распределение работ по месяцам</h3>
              <p className="muted small">
                Сколько единиц каждого вида работы сделано в каждом месяце {year} года.
              </p>
              <div className="table-wrap">
                <table className="year-table works-by-month">
                  <thead>
                    <tr>
                      <th>Вид работы</th>
                      {report.months.map((m) => (
                        <th key={m.month} className="num month-col">{m.name.slice(0, 3)}</th>
                      ))}
                      <th className="num">Всего</th>
                    </tr>
                  </thead>
                  <tbody>
                    {worksWithData.map((w) => (
                      <tr key={w.id}>
                        <td><span className="dot" style={{ background: w.color }} /> {w.name}</td>
                        {w.byMonth.map((n, i) => (
                          <td key={i} className="num muted">{n || '·'}</td>
                        ))}
                        <td className="num"><b>{w.count}</b></td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td>Итого</td>
                      {report.months.map((m) => (
                        <td key={m.month} className="num">{m.count || '·'}</td>
                      ))}
                      <td className="num"><b>{report.totals.count}</b></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          )}

          {/* Разбивка по врачам за год и по месяцам */}
          <div className="divider" />
          <h3>Работы по врачам</h3>
          <p className="muted small">
            Сколько единиц работ пришло от каждого врача в {year} году. Наряды без врача —
            в строке «Не указан».
          </p>
          <div className="table-wrap">
            <table className="year-table works-by-month">
              <thead>
                <tr>
                  <th>Врач</th>
                  {report.months.map((m) => (
                    <th key={m.month} className="num month-col">{m.name.slice(0, 3)}</th>
                  ))}
                  <th className="num">Всего</th>
                </tr>
              </thead>
              <tbody>
                {doctorsWithData.map((d) => (
                  <tr key={d.name}>
                    <td><b>{d.name}</b></td>
                    {d.byMonth.map((n, i) => (
                      <td key={i} className="num muted">{n || '·'}</td>
                    ))}
                    <td className="num"><b>{d.count}</b></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>Итого</td>
                  {report.months.map((m) => (
                    <td key={m.month} className="num">{m.count || '·'}</td>
                  ))}
                  <td className="num"><b>{report.totals.count}</b></td>
                </tr>
              </tfoot>
            </table>
          </div>

          <h3>Деньги по врачам</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Врач</th>
                  <th className="num">Нарядов</th>
                  <th className="num">Ед. работ</th>
                  <th className="num">Готово</th>
                  <th className="num">Стоимость</th>
                  <th className="num">Оплачено</th>
                </tr>
              </thead>
              <tbody>
                {doctorsWithData.map((d) => (
                  <tr key={d.name}>
                    <td><b>{d.name}</b></td>
                    <td className="num">{d.orders}</td>
                    <td className="num">{d.count}</td>
                    <td className="num muted">{d.done}</td>
                    <td className="num">{money(d.sum)}</td>
                    <td className="num green">{money(d.paid)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>Итого</td>
                  <td className="num">{report.doctors.reduce((s, d) => s + d.orders, 0)}</td>
                  <td className="num">{report.totals.count}</td>
                  <td className="num">{report.totals.done}</td>
                  <td className="num">{money(report.doctors.reduce((s, d) => s + d.sum, 0))}</td>
                  <td className="num green">{money(report.doctors.reduce((s, d) => s + d.paid, 0))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </section>
  )
}
