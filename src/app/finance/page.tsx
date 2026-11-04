'use client'

// Финансы — только администратор. Врач и техник до этой страницы
// не доходят по меню, а данные им всё равно не отдаст RLS.

import { useMemo } from 'react'
import { useStore } from '@/components/Store'
import { Heading, Metrics } from '@/components/UI'
import { money, total, formatDate } from '@/lib/model'
import { AlertTriangle } from 'lucide-react'

export default function FinancePage() {
  const { data, role } = useStore()

  const byTechnician = useMemo(() => {
    const map = new Map<string, { charged: number; orders: number; paid: number }>()
    for (const o of data.orders) {
      const key = o.technician || 'Денис'
      const row = map.get(key) ?? { charged: 0, orders: 0, paid: 0 }
      row.charged += o.salary
      row.orders++
      if (o.isPaid) row.paid += total(o)
      map.set(key, row)
    }
    return [...map.entries()].sort((a, b) => b[1].charged - a[1].charged)
  }, [data.orders])

  const byDoctor = useMemo(() => {
    const map = new Map<string, { sum: number; orders: number }>()
    for (const o of data.orders) {
      const key = o.doctor || 'Не указан'
      const row = map.get(key) ?? { sum: 0, orders: 0 }
      row.sum += total(o)
      row.orders++
      map.set(key, row)
    }
    return [...map.entries()].sort((a, b) => b[1].sum - a[1].sum)
  }, [data.orders])

  if (role !== 'admin') {
    return (
      <div className="panel empty">
        <AlertTriangle size={20} className="inline-icon" />
        Раздел доступен только администратору.
      </div>
    )
  }

  const salaryTotal = byTechnician.reduce((s, [, r]) => s + r.charged, 0)
  const revenueTotal = data.orders.reduce((s, o) => s + total(o), 0)
  const unpaidTotal = data.orders.filter((o) => !o.isPaid).reduce((s, o) => s + total(o), 0)
  const paidTotal = revenueTotal - unpaidTotal

  return (
    <>
      <Heading
        title="Финансы"
        sub="Зарплаты всех техников, суммы по врачам и состояние оплат. Видит только администратор."
      />

      <Metrics values={[
        { label: 'Сумма нарядов', value: revenueTotal, currency: true },
        { label: 'Оплачено', value: paidTotal, currency: true, color: '#82C6AE' },
        { label: 'Не оплачено', value: unpaidTotal, currency: true, color: '#E26C70' },
        { label: 'Начислено зарплат', value: salaryTotal, currency: true, color: '#BAA0EE' },
      ]} />

      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-heading"><h2>Зарплаты техников</h2></div>
          <table className="responsive">
            <thead>
              <tr><th>Техник</th><th>Нарядов</th><th>Оплачено клиентами</th><th>Начислено</th></tr>
            </thead>
            <tbody>
              {byTechnician.map(([name, r]) => (
                <tr key={name}>
                  <td data-label="Техник">{name}</td>
                  <td data-label="Нарядов">{r.orders}</td>
                  <td data-label="Оплачено" className="num green">{money(r.paid)}</td>
                  <td data-label="Начислено" className="num">{money(r.charged)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="panel">
          <div className="panel-heading"><h2>Суммы по врачам</h2></div>
          <table className="responsive">
            <thead>
              <tr><th>Врач</th><th>Нарядов</th><th>Сумма</th></tr>
            </thead>
            <tbody>
              {byDoctor.map(([name, r]) => (
                <tr key={name}>
                  <td data-label="Врач">{name}</td>
                  <td data-label="Нарядов">{r.orders}</td>
                  <td data-label="Сумма" className="num">{money(r.sum)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      <section className="panel">
        <div className="panel-heading"><h2>Не оплачено</h2></div>
        {data.orders.filter((o) => !o.isPaid).length === 0 ? (
          <div className="empty">Все наряды оплачены.</div>
        ) : (
          <table className="responsive">
            <thead>
              <tr><th>Наряд</th><th>Техник</th><th>Врач</th><th>Срок</th><th>Сумма</th></tr>
            </thead>
            <tbody>
              {data.orders.filter((o) => !o.isPaid).slice(0, 40).map((o) => (
                <tr key={o.id}>
                  <td data-label="Наряд">№{o.number}</td>
                  <td data-label="Техник">{o.technician || 'Денис'}</td>
                  <td data-label="Врач">{o.doctor || '—'}</td>
                  <td data-label="Срок">{formatDate(o.dueDate)}</td>
                  <td data-label="Сумма" className="num">{money(total(o))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  )
}
