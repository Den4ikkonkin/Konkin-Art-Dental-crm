'use client'

// Карточки техников. Врач видит здесь всех: специализации, загрузку,
// портфолио. Зарплат и начислений в этом экране нет ни в одном виде.

import { useMemo } from 'react'
import Link from 'next/link'
import { Wrench, Clock, CheckCircle2, AlarmClock, CalendarClock } from 'lucide-react'
import { useStore } from '@/components/Store'
import { Heading } from '@/components/UI'
import { dueTone } from '@/lib/model'

const AVAILABILITY: Record<string, { label: string; color: string }> = {
  available: { label: 'Доступен', color: '#ABD988' },
  partial: { label: 'Частично загружен', color: '#9ABBE5' },
  busy: { label: 'Загружен', color: '#BAA0EE' },
  closed: { label: 'Не принимает новые работы', color: '#E3A8C3' },
  vacation: { label: 'В отпуске', color: '#9BA7B5' },
  inactive: { label: 'Неактивен', color: '#9BA7B5' },
}

export default function TechniciansPage() {
  const { data, role } = useStore()

  // Загрузка считается из нарядов. У техника в data только его наряды,
  // у врача и админа — всё, что разрешил RLS.
  const stats = useMemo(() => {
    const map = new Map<string, {
      active: number; done: number; overdue: number; fitting: number; lastWork: string
    }>()

    for (const o of data.orders) {
      const key = o.technician || 'Денис'
      const row = map.get(key) ?? { active: 0, done: 0, overdue: 0, fitting: 0, lastWork: '' }
      if (!o.archived) {
        if (o.status === 'done') row.done++
        else row.active++
        if (o.status === 'awaiting_fitting' || o.status === 'fitted') row.fitting++
        if (dueTone(o) === 'overdue') row.overdue++
      }
      if (o.createdAt > row.lastWork) row.lastWork = o.createdAt
      map.set(key, row)
    }
    return map
  }, [data.orders])

  const technicians = useMemo(() => {
    const names = new Set<string>(['Денис', 'Влад', 'Артур', 'Дмитрий', 'Александр'])
    data.orders.forEach((o) => { if (o.technician) names.add(o.technician) })
    return [...names].sort((a, b) => a.localeCompare(b, 'ru'))
  }, [data.orders])

  return (
    <>
      <Heading
        title="Техники"
        sub="Кто чем занят и какие работы выполняет. Зарплаты техников врачу не показываются."
      />

      <div className="queue-grid">
        {technicians.map((name) => {
          const s = stats.get(name) ?? { active: 0, done: 0, overdue: 0, fitting: 0, lastWork: '' }
          const avail = AVAILABILITY[s.active > 4 ? 'busy' : s.active > 1 ? 'partial' : 'available']
          return (
            <section className="queue-card tech-card" key={name}>
              <div className="tech-card-head">
                <span className="tech-avatar" aria-hidden="true">{name.slice(0, 1)}</span>
                <div>
                  <strong>{name}</strong>
                  <div className="tech-avail" style={{ color: avail.color }}>
                    <Wrench size={13} /> {avail.label}
                  </div>
                </div>
              </div>

              <dl className="tech-stats">
                <div><dt><Clock size={13} /> Активных</dt><dd>{s.active}</dd></div>
                <div><dt><CheckCircle2 size={13} /> Готовых</dt><dd>{s.done}</dd></div>
                <div><dt><CalendarClock size={13} /> Ждут примерки</dt><dd>{s.fitting}</dd></div>
                <div><dt><AlarmClock size={13} /> Просрочено</dt><dd>{s.overdue}</dd></div>
              </dl>

              <div className="queue-foot">
                <Link className="btn small" href={'/portfolio?technician=' + encodeURIComponent(name)}>
                  Портфолио
                </Link>
              </div>
            </section>
          )
        })}
      </div>

      {role === 'technician' && (
        <div className="note" role="status">
          Это общая карточка раздела. Ваши собственные показатели — в «Моей очереди».
        </div>
      )}
    </>
  )
}
