'use client'

import { useMemo, useState } from 'react'
import { useStore } from './Store'
import DonutChart from './DonutChart'
import { Metrics, Heading } from './UI'
import SalaryPanel from './SalaryPanel'
import YearReportPanel from './YearReport'
import DoctorsByMonth from './DoctorsByMonth'
import UnpaidDashboard from './UnpaidDashboard'
import PaymentCalendar from './PaymentCalendar'
import { summarize, summarizeDoctors, total, money, monthKey, monthLabel, monthOptions, currentMonthKey, exportCsv } from '@/lib/model'
import { Download, CalendarCheck } from 'lucide-react'

export default function EarningsByWork() {
  const { data } = useStore()
  // По умолчанию открываем текущий месяц: так видно свежие суммы, а не всё подряд.
  const [month, setMonth] = useState(currentMonthKey)
  const [completed, setCompleted] = useState(false)
  const [showUnpaid, setShowUnpaid] = useState(false)
  const [showPayments, setShowPayments] = useState(false)

  // Список месяцев берём из данных: то, что реально есть, плюс текущий.
  const months = useMemo(
    () => monthOptions([
      ...data.orders.map((o) => o.createdAt),
      ...data.salary.map((s) => s.date),
    ]),
    [data.orders, data.salary],
  )

  const inSelectedMonth = (iso: string) => !month || monthKey(iso) === month

  const orders = data.orders.filter((o) => inSelectedMonth(o.createdAt) && (!completed || o.status === 'done'))
  const rows = summarize(orders)
  // Та же выборка, что и по видам работ: месяц и фильтр «только готовые».
  const doctorRows = summarizeDoctors(orders)
  const count = rows.reduce((s, r) => s + r.count, 0)
  const sum = orders.reduce((s, o) => s + total(o), 0)
  const paid = orders.reduce((s, o) => s + o.paid, 0)
  const salary = data.salary.filter((s) => inSelectedMonth(s.date)).reduce((s, p) => s + p.amount, 0)

  const scope = month ? monthLabel(month) : 'всё время'

  return (
    <>
      <Heading
        title="Мой заработок"
        sub="Единицы работ, оплаты нарядов и фактические выплаты оклада."
        action={
          <button className="btn" onClick={() => exportCsv(orders, data.patients)}>
            <Download size={17} /> Отчёт CSV
          </button>
        }
      />

      <div className="toolbar">
        <div className="toolbar-left">
          <label className="month-select">
            <span className="sr-only">Выбор месяца</span>
            <select value={month} onChange={(e) => setMonth(e.target.value)}>
              <option value="">Всё время</option>
              {months.map((m) => (
                <option key={m} value={m}>{monthLabel(m)}</option>
              ))}
            </select>
          </label>
          <button type="button" className="btn payment-cal-btn" onClick={() => setShowPayments(true)}>
            <CalendarCheck size={17} /> Календарь оплат
          </button>
        </div>
        <label className="checkbox">
          <input type="checkbox" checked={completed} onChange={(e) => setCompleted(e.target.checked)} /> Только готовые работы
        </label>
      </div>

      <Metrics
        values={[
          {
            label: 'Получено за работы',
            value: paid,
            currency: true,
            color: '#82C6AE',
            hint: `По нарядам за ${scope}`,
          },
          {
            label: 'Получено оклада',
            value: salary,
            currency: true,
            hint: `Только внесённые выплаты за ${scope}`,
          },
          {
            label: 'Всего получено',
            value: paid + salary,
            currency: true,
            hint: 'Работы + выплаты оклада',
          },
          {
            label: 'Остаток по нарядам',
            value: sum - paid,
            currency: true,
            hint: 'Нажмите, чтобы увидеть неоплаченные наряды',
            onClick: () => setShowUnpaid(true),
          },
        ]}
      />

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Распределение работ</h2>
            <p className="muted small">
              Считаем каждую назначенную работу на зубе, а не число нарядов. Период: {scope}.
            </p>
          </div>
          <span className="badge">{orders.length} нарядов</span>
        </div>

        <DonutChart data={rows.map((r) => ({ label: r.name, value: r.count, color: r.color }))} />

        <div className="divider" />

        <h2>Резюме по видам работ</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Вид работы</th><th className="num">Кол-во</th><th className="num">Готово</th>
                <th className="num">Сумма</th><th className="num">Оплачено</th><th className="num">Остаток</th><th className="num">Доля</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td><span className="dot" style={{ background: r.color }} /> {r.name}</td>
                  <td className="num"><b>{r.count}</b></td>
                  <td className="num muted">{r.done}</td>
                  <td className="num">{money(r.sum)}</td>
                  <td className="num green">{money(r.paid)}</td>
                  <td className="num">{money(r.rest)}</td>
                  <td className="num">{count ? (r.count / count * 100).toFixed(1) : '0.0'}%</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Итого</td>
                <td className="num">{count}</td>
                <td className="num">{rows.reduce((s, r) => s + r.done, 0)}</td>
                <td className="num">{money(sum)}</td>
                <td className="num green">{money(paid)}</td>
                <td className="num">{money(sum - paid)}</td>
                <td className="num">{count ? '100' : '0'}%</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="divider" />

        <h2>Резюме по врачам</h2>
        <p className="muted small">
          Сколько работ и на какую сумму пришло от каждого врача за {scope}.
          Наряды без указанного врача попадают в строку «Не указан».
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Врач</th>
                <th className="num">Нарядов</th>
                <th className="num">Ед. работ</th>
                <th className="num">Готово</th>
                <th className="num">Сумма</th>
                <th className="num">Оплачено</th>
                <th className="num">Доля</th>
              </tr>
            </thead>
            <tbody>
              {doctorRows.map((d) => (
                <tr key={d.name}>
                  <td><b>{d.name}</b></td>
                  <td className="num">{d.orders}</td>
                  <td className="num"><b>{d.count}</b></td>
                  <td className="num muted">{d.done}</td>
                  <td className="num">{money(d.sum)}</td>
                  <td className="num green">{money(d.paid)}</td>
                  <td className="num">{count ? (d.count / count * 100).toFixed(1) : '0.0'}%</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Итого</td>
                <td className="num">{doctorRows.reduce((s, d) => s + d.orders, 0)}</td>
                <td className="num">{doctorRows.reduce((s, d) => s + d.count, 0)}</td>
                <td className="num">{doctorRows.reduce((s, d) => s + d.done, 0)}</td>
                <td className="num">{money(doctorRows.reduce((s, d) => s + d.sum, 0))}</td>
                <td className="num green">{money(doctorRows.reduce((s, d) => s + d.paid, 0))}</td>
                <td className="num">{count ? '100' : '0'}%</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <p className="note">
          Оплата по видам распределяется пропорционально стоимости позиций наряда.
          Фильтр месяца — по дате заказа. Оклад — по дате фактической выплаты.
          Наряд и его оплата не являются автоматически личной зарплатой техника:
          здесь учитываются внесённые вами суммы.
        </p>
      </section>

      {/* Оклад и выплаты переехали из «Настроек»: деньги — в одном месте. */}
      {showUnpaid && (
        <UnpaidDashboard orders={orders} scope={scope} onClose={() => setShowUnpaid(false)} />
      )}
      {showPayments && <PaymentCalendar onClose={() => setShowPayments(false)} />}

      <SalaryPanel month={month} />

      <DoctorsByMonth />

      <YearReportPanel />
    </>
  )
}
