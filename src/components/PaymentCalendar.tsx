'use client'

// Календарь оплат: в какие дни пришли деньги по нарядам.
// День подсвечивается, если по нарядам отмечено «Получено» с датой этого дня.
// Дата ставится автоматически при отметке, её можно изменить здесь.
// Телефоны пациентов не показываются.

import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, X, Wallet } from 'lucide-react'
import { useStore } from './Store'
import { money, formatDate, total, today } from '@/lib/model'

export default function PaymentCalendar({ onClose }: { onClose: () => void }) {
  const { data, setOrderPaid } = useStore()
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const [open, setOpen] = useState('')
  const [error, setError] = useState('')

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

  const prefix = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  const offset = (month.getDay() + 6) % 7

  const nameOf = (id: string) => data.patients.find((p) => p.id === id)?.name ?? 'Без пациента'

  // Оплаченные наряды, сгруппированные по дню получения денег.
  const byDay = useMemo(() => {
    const map = new Map<string, { orders: typeof data.orders; sum: number }>()
    for (const o of data.orders) {
      if (o.paid <= 0 || !o.paidOn || !o.paidOn.startsWith(prefix)) continue
      const row = map.get(o.paidOn) ?? { orders: [], sum: 0 }
      row.orders.push(o)
      row.sum += o.paid
      map.set(o.paidOn, row)
    }
    return map
  }, [data.orders, prefix])

  // Оплаченные без даты — их видно отдельно, чтобы поставить дату.
  const undated = useMemo(() => data.orders.filter((o) => o.paid > 0 && !o.paidOn), [data.orders])

  const monthSum = useMemo(() => {
    let s = 0
    for (const row of byDay.values()) s += row.sum
    return s
  }, [byDay])

  const openRow = open ? byDay.get(open) : undefined

  async function changeDate(orderId: string, paidOn: string, paid: number) {
    setError('')
    try {
      await setOrderPaid(orderId, paid, paidOn)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось сохранить дату')
    }
  }

  return (
    <div className="day-backdrop" onClick={onClose} role="presentation">
      <div
        className="day-modal wide-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Календарь оплат"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="day-head">
          <div>
            <span className="eyebrow">КАЛЕНДАРЬ ОПЛАТ</span>
            <h2>{month.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}</h2>
            <small>Получено за месяц: {money(monthSum)}</small>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Закрыть">
            <X size={17} />
          </button>
        </header>

        <div className="day-body wide-body">
          <div className="payment-nav">
            <button className="icon-btn" aria-label="Предыдущий месяц" onClick={() => { setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1)); setOpen('') }}><ChevronLeft /></button>
            <button className="icon-btn" aria-label="Следующий месяц" onClick={() => { setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1)); setOpen('') }}><ChevronRight /></button>
          </div>

          <div className="calendar-grid payment-grid">
            {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((d) => <div className="weekday" key={d}>{d}</div>)}
            {Array.from({ length: offset }, (_, i) => <div key={'blank' + i} />)}
            {Array.from({ length: days }, (_, i) => {
              const date = `${prefix}-${String(i + 1).padStart(2, '0')}`
              const row = byDay.get(date)
              const count = row?.orders.length ?? 0
              const isToday = date === today()
              return (
                <button
                  key={date}
                  type="button"
                  className={`calendar-day payment-day${count ? ' tone-paid' : ' tone-empty'}${open === date ? ' selected' : ''}${isToday ? ' is-today' : ''}`}
                  onClick={() => setOpen(date)}
                  aria-label={count ? `${i + 1} число, получено ${money(row!.sum)} за ${count} ${count === 1 ? 'наряд' : 'наряда'}` : `${i + 1} число, оплат нет`}
                >
                  <b className="calendar-num">{i + 1}</b>
                  {!!count && (
                    <span className="payment-sum">{money(row!.sum)}</span>
                  )}
                </button>
              )
            })}
          </div>

          {openRow && (
            <section className="payment-detail">
              <h3>{formatDate(open)} — получено {money(openRow.sum)}</h3>
              <ul>
                {openRow.orders.map((o) => (
                  <li key={o.id}>
                    <span><b>№{o.number}</b> {nameOf(o.patientId)}</span>
                    <span className="row nowrap">
                      <span className="green">{money(o.paid)}</span>
                      <input
                        type="date"
                        aria-label={`Дата оплаты наряда ${o.number}`}
                        value={o.paidOn}
                        max={today()}
                        onChange={(e) => e.target.value && void changeDate(o.id, e.target.value, o.paid)}
                      />
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {!!undated.length && (
            <section className="payment-detail undated">
              <h3><Wallet size={15} /> Оплачено без даты</h3>
              <p className="muted small">Укажите день получения, чтобы наряд появился в календаре.</p>
              <ul>
                {undated.map((o) => (
                  <li key={o.id}>
                    <span><b>№{o.number}</b> {nameOf(o.patientId)} · {money(o.paid)}</span>
                    <input
                      type="date"
                      aria-label={`Дата оплаты наряда ${o.number}`}
                      value=""
                      max={today()}
                      onChange={(e) => e.target.value && void changeDate(o.id, e.target.value, o.paid)}
                    />
                  </li>
                ))}
              </ul>
            </section>
          )}

          {error && <div className="alert" role="alert">{error}</div>}
          <p className="note">
            Дата ставится автоматически, когда вы отмечаете наряд «Получено». Изменить её можно в этом календаре
            или в самом наряде. Снятие отметки «Получено» убирает дату.
          </p>
        </div>
      </div>
    </div>
  )
}
