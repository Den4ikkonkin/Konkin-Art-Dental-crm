'use client'

// Всплывающее расписание дня: сетка с 8:00 до 20:00 по полчаса.
// В занятые слоты попадают пациенты из нарядов, у которых задано время приёма.
// Ниже — работы, которые в этот день сдаются.

import Link from 'next/link'
import { useEffect } from 'react'
import { X, Clock, PackageCheck, User } from 'lucide-react'

export type SlotEntry = {
  time: string
  patient: string
  number: number
  orderId: string
}

export type DueEntry = {
  patient: string
  number: number
  orderId: string
  units: number
  big: boolean
}

const START_HOUR = 8
const END_HOUR = 20

/** Все слоты суток с шагом в полчаса: 08:00, 08:30, … 20:00. */
function allSlots(): string[] {
  const out: string[] = []
  for (let m = START_HOUR * 60; m <= END_HOUR * 60; m += 30) {
    out.push(String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'))
  }
  return out
}

export default function DaySchedule({
  date,
  title,
  slots,
  dues,
  onClose,
}: {
  date: string
  title: string
  slots: SlotEntry[]
  dues: DueEntry[]
  onClose: () => void
}) {
  // Escape закрывает окно, прокрутка страницы под ним блокируется.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  const grid = allSlots()
  const byTime = new Map<string, SlotEntry[]>()
  for (const s of slots) {
    const list = byTime.get(s.time) ?? []
    list.push(s)
    byTime.set(s.time, list)
  }

  const busyCount = slots.length

  return (
    <div className="day-backdrop" onClick={onClose} role="presentation">
      <div
        className="day-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Расписание на ${title}`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="day-head">
          <div>
            <span className="eyebrow">РАСПИСАНИЕ ДНЯ</span>
            <h2>{title}</h2>
            <small>
              {busyCount
                ? `${busyCount} ${busyCount === 1 ? 'приём' : busyCount < 5 ? 'приёма' : 'приёмов'} с 8:00 до 20:00`
                : 'Приёмов нет · день свободен'}
            </small>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Закрыть расписание">
            <X size={17} />
          </button>
        </header>

        <div className="day-body">
          <ol className="day-slots">
            {grid.map((time) => {
              const entries = byTime.get(time)
              const busy = Boolean(entries?.length)
              return (
                <li key={time} className={busy ? 'day-slot busy' : 'day-slot'}>
                  <span className="day-time"><Clock size={11} /> {time}</span>
                  {busy ? (
                    <span className="day-who">
                      {entries!.map((e) => (
                        <Link key={e.orderId} href={'/orders/' + e.orderId} className="day-patient">
                          <User size={12} />
                          <b>{e.patient}</b>
                          <small>№{e.number}</small>
                        </Link>
                      ))}
                    </span>
                  ) : (
                    <span className="day-free">свободно</span>
                  )}
                </li>
              )
            })}
          </ol>

          {!!dues.length && (
            <aside className="day-due">
              <h3><PackageCheck size={14} /> Сдаётся в этот день</h3>
              {dues.map((d) => (
                <Link
                  key={d.orderId}
                  href={'/orders/' + d.orderId}
                  className={'day-due-row' + (d.big ? ' big' : '')}
                >
                  <b>{d.patient}</b>
                  <span>
                    №{d.number} · {d.units} {d.units === 1 ? 'единица' : d.units < 5 ? 'единицы' : 'единиц'}
                    {d.big && <em> · крупная работа</em>}
                  </span>
                </Link>
              ))}
            </aside>
          )}
        </div>
      </div>
    </div>
  )
}
