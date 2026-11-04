'use client'

// Календарь приёмов и сдачи работ.
//
// Плитка дня показывает только фамилии назначенных пациентов — крупно и полностью.
// Цвет рамки и свечения говорит сам за себя, без подписей:
//   оранжевый — день пустой
//   синий     — назначен один пациент
//   зелёный   — несколько пациентов
//   красный   — в этот день сдаётся крупная работа (от 12 единиц)
//
// Клик по плитке открывает расписание дня по получасам с 8:00 до 20:00.

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useStore } from '@/components/Store'
import { Heading } from '@/components/UI'
import DaySchedule, { type SlotEntry, type DueEntry } from '@/components/DaySchedule'
import { total, formatDate, money } from '@/lib/model'
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react'

/** С какого числа единиц работа считается крупной и подсвечивается красным. */
const BIG_WORK_UNITS = 12

export default function Page() {
  const { data } = useStore()
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const [open, setOpen] = useState('')

  const prefix = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  const offset = (month.getDay() + 6) % 7

  const nameOf = (id: string) => data.patients.find((p) => p.id === id)?.name ?? 'Без пациента'

  // Всё, что относится к календарю, считаем один раз на месяц.
  const byDay = useMemo(() => {
    const map = new Map<string, {
      appointments: SlotEntry[]
      dues: DueEntry[]
      names: string[]
      bigDue: boolean
    }>()

    for (const o of data.orders) {
      const apptDay = o.appointment && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(o.appointment)
        ? o.appointment.slice(0, 10)
        : ''

      // Приём: время и пациент, чтобы построить сетку по получасам.
      if (apptDay.startsWith(prefix)) {
        const row = map.get(apptDay) ?? { appointments: [], dues: [], names: [], bigDue: false }
        row.appointments.push({
          time: o.appointment.slice(11, 16),
          patient: nameOf(o.patientId),
          number: o.number,
          orderId: o.id,
        })
        map.set(apptDay, row)
      }

      // Сдача: сколько единиц и насколько работа крупная.
      if (o.dueDate.startsWith(prefix)) {
        const row = map.get(o.dueDate) ?? { appointments: [], dues: [], names: [], bigDue: false }
        const units = o.items.length
        row.dues.push({
          patient: nameOf(o.patientId),
          number: o.number,
          orderId: o.id,
          units,
          big: units >= BIG_WORK_UNITS,
        })
        if (units >= BIG_WORK_UNITS) row.bigDue = true
        map.set(o.dueDate, row)
      }
    }

    // Фамилии для плитки: сначала приёмы, затем сдачи, без повторов.
    for (const [, row] of map) {
      const seen = new Set<string>()
      const names: string[] = []
      for (const a of row.appointments) {
        if (!seen.has(a.patient)) { seen.add(a.patient); names.push(a.patient) }
      }
      for (const d of row.dues) {
        if (!seen.has(d.patient)) { seen.add(d.patient); names.push(d.patient) }
      }
      row.names = names
      row.appointments.sort((a, b) => a.time.localeCompare(b.time))
    }

    return map
  }, [data.orders, data.patients, prefix])

  function move(n: number) {
    setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1))
    setOpen('')
  }

  const openRow = open ? byDay.get(open) : undefined

  return (
    <>
      <Heading
        title="Календарь"
        sub="Приёмы пациентов и сроки сдачи работ. Нажмите на день, чтобы увидеть расписание по времени."
      />

      <section className="panel">
        <div className="panel-heading">
          <button className="icon-btn" aria-label="Предыдущий месяц" onClick={() => move(-1)}><ChevronLeft /></button>
          <h2>{month.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}</h2>
          <button className="icon-btn" aria-label="Следующий месяц" onClick={() => move(1)}><ChevronRight /></button>
        </div>

        <div className="calendar-grid">
          {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((d) => <div className="weekday" key={d}>{d}</div>)}
          {Array.from({ length: offset }, (_, i) => <div key={'blank' + i} />)}
          {Array.from({ length: days }, (_, i) => {
            const date = `${prefix}-${String(i + 1).padStart(2, '0')}`
            const row = byDay.get(date)
            const count = row?.names.length ?? 0

            // Цвет плитки: крупная сдача важнее всего, затем число пациентов.
            const tone = row?.bigDue ? 'big'
              : count > 1 ? 'many'
              : count === 1 ? 'one'
              : 'empty'

            return (
              <button
                key={date}
                type="button"
                className={`calendar-day tone-${tone}${open === date ? ' selected' : ''}`}
                onClick={() => setOpen(date)}
                aria-label={
                  count
                    ? `${i + 1} число, ${count} ${count === 1 ? 'пациент' : count < 5 ? 'пациента' : 'пациентов'}: ${row!.names.join(', ')}`
                    : `${i + 1} число, приёмов нет`
                }
              >
                <b className="calendar-num">{i + 1}</b>
                {!!count && (
                  <span className="calendar-names">
                    {row!.names.map((n) => <em key={n}>{n}</em>)}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        <div className="calendar-legend">
          <span><i className="lg-empty" /> пусто</span>
          <span><i className="lg-one" /> один пациент</span>
          <span><i className="lg-many" /> несколько</span>
          <span><i className="lg-big" /> сдача от {BIG_WORK_UNITS} единиц</span>
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <h2><CalendarDays size={17} className="inline-icon" /> {open ? formatDate(open) : 'Ближайшие дни с приёмами'}</h2>
        </div>

        {open ? (
          openRow?.appointments.length || openRow?.dues.length ? (
            <div className="day-inline">
              {openRow.appointments.map((a) => (
                <Link className="deadline" key={a.orderId} href={'/orders/' + a.orderId}>
                  <span className="date-chip">{a.time}</span>
                  <span>
                    <b>{a.patient}</b>
                    <small>№{a.number} · приём</small>
                  </span>
                </Link>
              ))}
              {openRow.dues.map((d) => (
                <Link className={'deadline' + (d.big ? ' big' : '')} key={'due' + d.orderId} href={'/orders/' + d.orderId}>
                  <span className="date-chip">сдача</span>
                  <span>
                    <b>{d.patient}</b>
                    <small>№{d.number} · {d.units} {d.units === 1 ? 'единица' : d.units < 5 ? 'единицы' : 'единиц'}</small>
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="empty">В этот день приёмов нет.</div>
          )
        ) : (
          (() => {
            const upcoming = Array.from(byDay.entries())
              .filter(([, r]) => r.appointments.length || r.dues.length)
              .sort((a, b) => a[0].localeCompare(b[0]))
              .slice(0, 6)
            return upcoming.length ? (
              <div className="day-inline">
                {upcoming.map(([date, r]) => (
                  <button key={date} type="button" className="deadline as-button" onClick={() => setOpen(date)}>
                    <span className="date-chip">{date.slice(8)}<small>{date.slice(5, 7)}</small></span>
                    <span>
                      <b>{r.names.join(', ')}</b>
                      <small>
                        {r.appointments.length ? `${r.appointments.length} приёмов` : 'без приёма'}
                        {r.dues.length ? ` · ${r.dues.length} к сдаче` : ''}
                      </small>
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="empty">В этом месяце пока нет ни приёмов, ни сдач.</div>
            )
          })()
        )}
      </section>

      {open && openRow && (
        <DaySchedule
          date={open}
          title={formatDate(open)}
          slots={openRow.appointments}
          dues={openRow.dues}
          onClose={() => setOpen('')}
        />
      )}
    </>
  )
}
