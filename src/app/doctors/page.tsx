'use client'

// Справочник врачей. Только для администратора.

import { useStore } from '@/components/Store'
import { Heading } from '@/components/UI'
import { Stethoscope, AlertTriangle } from 'lucide-react'
import { DOCTORS, total, money } from '@/lib/model'

export default function DoctorsPage() {
  const { role, data } = useStore()

  if (role !== 'admin') {
    return (
      <div className="panel empty">
        <AlertTriangle size={20} className="inline-icon" />
        Раздел доступен только администратору.
      </div>
    )
  }

  const rows = DOCTORS.map((name) => {
    const orders = data.orders.filter((o) => o.doctor === name)
    return {
      name,
      orders: orders.length,
      sum: orders.reduce((s, o) => s + total(o), 0),
      done: orders.filter((o) => o.status === 'done').length,
    }
  })

  return (
    <>
      <Heading
        title="Врачи"
        sub="Три врача лаборатории. Врач видит связанных пациентов и не создаёт наряды."
      />

      <section className="panel">
        <div className="panel-heading">
          <h2><Stethoscope size={16} className="inline-icon" /> Состав</h2>
        </div>
        <table className="responsive">
          <thead>
            <tr><th>Врач</th><th>Нарядов</th><th>Готово</th><th>Сумма</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name}>
                <td data-label="Врач">{r.name}</td>
                <td data-label="Нарядов" className="num">{r.orders}</td>
                <td data-label="Готово" className="num">{r.done}</td>
                <td data-label="Сумма" className="num">{money(r.sum)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  )
}
