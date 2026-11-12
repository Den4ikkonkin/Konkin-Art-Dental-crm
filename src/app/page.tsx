"use client"

import Link from 'next/link'
import { ArrowUpRight, Plus } from 'lucide-react'
import { useStore } from '@/components/Store'
import { Heading, Metrics } from '@/components/UI'
import OrdersTable from '@/components/OrdersTable'
import DonutChart from '@/components/DonutChart'
import TeamPanel from '@/components/TeamPanel'
import { summarize, total, today } from '@/lib/model'
import styles from './Home.module.css'

export default function Page() {
  const { data } = useStore()
  const rows = summarize(data.orders)
  const paid = data.orders.reduce((s, o) => s + o.paid, 0)
  const rest = data.orders.reduce((s, o) => s + total(o) - o.paid, 0)
  const active = data.orders.filter((o) => o.status !== 'done')

  return (
    <div className={styles.home}>
      <Heading title="Всё под контролем" sub="Ваша лаборатория. Ваши работы. Понятная картина каждого дня." />
      <TeamPanel />

      <section className={styles.hero}>
        <div className={styles.copy}>
          <span className="eyebrow">ТОЧНОСТЬ В КАЖДОЙ ДЕТАЛИ</span>
          <h2>От назначения зуба<br />до готовой работы.</h2>
          <p>Создавайте наряды на интерактивной схеме.<br />Стоимость и аналитика обновятся автоматически.</p>
          <Link className="btn primary" href="/orders/new"><Plus size={17} /> Создать наряд</Link>
        </div>
        <div className={styles.art} aria-hidden="true">
          <div className={styles.orbit} />
          <img className={styles.darkTooth} src="/brand/circuit-tooth-dark.svg" alt="" width={320} height={320} />
          <img className={styles.lightTooth} src="/brand/circuit-tooth-light.svg" alt="" width={320} height={320} />
          <span>DESIGN / CREATE / TRACK</span>
        </div>
      </section>
      <Metrics values={[
        { label: 'В работе и новые', value: active.length, hint: 'Наряды, которые ещё не готовы' },
        { label: 'Выполнено единиц', value: rows.reduce((s, r) => s + r.done, 0), color: '#ABD988', hint: 'В нарядах со статусом «Готов»' },
        { label: 'Получено за работы', value: paid, currency: true, color: '#82C6AE', hint: 'Внесённые оплаты' },
        { label: 'К получению', value: rest, currency: true, hint: 'Остатки по нарядам' },
      ]} />
      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-heading"><h2>Виды работ</h2><Link href="/earnings" className="text-link">Аналитика <ArrowUpRight size={15} /></Link></div>
          <DonutChart data={rows.map((r) => ({ label: r.short, value: r.count, color: r.color }))} />
        </section>
        <section className="panel">
          <div className="panel-heading"><h2>Ближайшие сроки</h2><Link className="text-link" href="/calendar">Календарь</Link></div>
          {active.sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 5).map((o) => (
            <Link href={'/orders/' + o.id} className="deadline" key={o.id}>
              <span className="date-chip">{o.dueDate.slice(8)}<small>{o.dueDate.slice(5, 7)}</small></span>
              <span><b>{data.patients.find((p) => p.id === o.patientId)?.name}</b><small>№{o.number} · {o.items.length} единиц</small></span>
              <span className={'badge ' + (o.dueDate < today() ? 'late' : '')}>{o.dueDate < today() ? 'Просрочено' : 'В плане'}</span>
            </Link>
          ))}
          {!active.length && <div className="empty">Новых сроков пока нет</div>}
        </section>
      </div>
      <section className="panel">
        <div className="panel-heading"><h2>Последние наряды</h2><Link href="/orders" className="text-link">Все наряды <ArrowUpRight size={16} /></Link></div>
        <OrdersTable orders={data.orders.slice(0, 5)} />
      </section>
    </div>
  )
}
