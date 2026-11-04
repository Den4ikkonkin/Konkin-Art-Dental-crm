'use client'

// Очередь техника: шесть блоков, ровно как требует промпт.
// Здесь только свои наряды — RLS отдаёт технику исключительно их.

import Link from 'next/link'
import { useMemo } from 'react'
import {
  ClipboardList, Wrench, CalendarClock, CheckCircle2, AlarmClock, Archive,
} from 'lucide-react'
import { useStore } from '@/components/Store'
import { Heading } from '@/components/UI'
import { queueBuckets } from '@/lib/roles'
import { dueTone, dueLabel, total, money, formatDate, statusLabel } from '@/lib/model'

const BLOCKS = [
  { key: 'new', name: 'Новые', icon: ClipboardList, href: '/orders?status=new', tone: '#82C6AE' },
  { key: 'inProgress', name: 'В работе', icon: Wrench, href: '/orders?status=in_progress', tone: '#9ABBE5' },
  { key: 'awaitingFitting', name: 'Ожидают примерки', icon: CalendarClock, href: '/orders?status=awaiting_fitting', tone: '#BAA0EE' },
  { key: 'done', name: 'Готовы', icon: CheckCircle2, href: '/orders?status=done', tone: '#ABD988' },
  { key: 'overdue', name: 'Просрочены', icon: AlarmClock, href: '/orders?overdue=1', tone: '#E26C70' },
  { key: 'archived', name: 'Архив', icon: Archive, href: '/orders?archive=1', tone: '#9BA7B5' },
] as const

export default function QueuePage() {
  const { data } = useStore()

  const buckets = useMemo(() => queueBuckets(data.orders), [data.orders])

  // Ближайшие сроки: только незакрытые наряды, сортировка по дате.
  const upcoming = useMemo(
    () =>
      data.orders
        .filter((o) => !o.archived && o.status !== 'done')
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
        .slice(0, 6),
    [data.orders],
  )

  const nameOf = (id: string) => data.patients.find((p) => p.id === id)?.name ?? 'Пациент'

  return (
    <>
      <Heading
        title="Моя очередь"
        sub="Ваши наряды по статусам. Просрочка считается по сроку готовности, а не по дате примерки."
      />

      <div className="queue-grid">
        {BLOCKS.map(({ key, name, icon: Icon, href, tone }) => (
          <section className="queue-card" key={key}>
            <span className="queue-name">
              <Icon size={16} className="inline-icon" />
              {name}
            </span>
            <strong className="queue-count" style={{ color: tone }}>
              {buckets[key]}
            </strong>
            <div className="queue-foot">
              <Link className="btn small" href={href}>Открыть</Link>
            </div>
          </section>
        ))}
      </div>

      <section className="panel">
        <div className="panel-heading">
          <h2>Ближайшие сроки</h2>
          <Link href="/calendar" className="text-link">Календарь</Link>
        </div>

        {upcoming.length === 0 ? (
          <div className="empty">
            Активных нарядов нет. <Link href="/orders/new">Создать наряд</Link>
          </div>
        ) : (
          <div className="deadline-list">
            {upcoming.map((o) => {
              const tone = dueTone(o)
              return (
                <Link href={'/orders/' + o.id} className={'deadline tone-' + tone} key={o.id}>
                  <span className="date-chip">
                    {o.dueDate.slice(8)}
                    <small>{o.dueDate.slice(5, 7)}</small>
                  </span>
                  <span className="deadline-main">
                    <strong>№{o.number} · {nameOf(o.patientId)}</strong>
                    <small>
                      {statusLabel(o.status, o.archived)} · {formatDate(o.dueDate)} · {money(total(o))}
                    </small>
                  </span>
                  <span className="due-chip">{dueLabel(tone)}</span>
                </Link>
              )
            })}
          </div>
        )}
      </section>
    </>
  )
}
