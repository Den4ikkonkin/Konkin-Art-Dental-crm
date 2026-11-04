'use client'
import { useParams } from 'next/navigation'
import { useStore } from '@/components/Store'
import { total, money, formatDate, workOf, STATUS } from '@/lib/model'
import Link from 'next/link'
export default function Page() {
  const { id } = useParams<{ id: string }>(),
    { data } = useStore(),
    o = data.orders.find((x) => x.id === id)
  if (!o) return <div className="empty">Наряд не найден</div>
  const p = data.patients.find((p) => p.id === o.patientId)
  return (
    <section className="panel print-sheet">
      <div className="row no-print">
        <button className="btn primary" onClick={() => window.print()}>
          Печать / сохранить PDF
        </button>
        <Link className="btn" href={'/orders/' + id}>
          К наряду
        </Link>
      </div>
      <h1>Заказ-наряд №{o.number}</h1>
      <p>
        <b>Пациент:</b> {p?.name}
      </p>
      <p>
        Дата заказа: {formatDate(o.createdAt)} · Готовность: {formatDate(o.dueDate)} ·{' '}
        {STATUS[o.status]}
        {o.doctor ? ` · Врач: ${o.doctor}` : ''}
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Зуб</th>
              <th>Работа</th>
              <th>Материал / опора</th>
              <th>Оттенок</th>
              <th className="num">Стоимость</th>
            </tr>
          </thead>
          <tbody>
            {o.items.map((i) => (
              <tr key={i.id}>
                <td>{i.tooth}</td>
                <td>{workOf(i.workId).name}</td>
                <td>
                  {i.material}
                  <br />
                  {i.support}
                </td>
                <td>{i.shade}</td>
                <td className="num">{money(i.price)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        <b>
          Итого: {money(total(o))} · Оплачено: {money(o.paid)} · Остаток: {money(total(o) - o.paid)}
        </b>
      </p>
      <p>Комментарий: {o.comment || '—'}</p>
    </section>
  )
}
