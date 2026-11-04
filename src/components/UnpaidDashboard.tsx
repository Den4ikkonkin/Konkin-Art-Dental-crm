'use client'

// Дашборд «Остаток по нарядам»: какие наряды не оплачены, по каким пациентам и на какую сумму.
// Телефоны пациентов здесь не показываются — только имя.

import { useEffect, useMemo } from 'react'
import Link from 'next/link'
import { X, Wallet, Users, FileText } from 'lucide-react'
import { useStore } from './Store'
import { Order, total, money, formatDate, STATUS, workOf } from '@/lib/model'

export default function UnpaidDashboard({
  orders,
  scope,
  onClose,
}: {
  orders: Order[]
  scope: string
  onClose: () => void
}) {
  const { data } = useStore()

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

  const nameOf = (id: string) => data.patients.find((p) => p.id === id)?.name ?? 'Без пациента'

  const unpaid = useMemo(
    () =>
      orders
        .map((o) => {
          const sum = total(o)
          return { o, sum, rest: Math.max(0, sum - o.paid) }
        })
        .filter((x) => x.sum > 0 && x.rest > 0)
        .sort((a, b) => b.rest - a.rest),
    [orders],
  )

  const totalRest = unpaid.reduce((s, x) => s + x.rest, 0)

  const byPatient = useMemo(() => {
    const map = new Map<string, { name: string; count: number; rest: number }>()
    for (const x of unpaid) {
      const key = x.o.patientId
      const row = map.get(key) ?? { name: nameOf(key), count: 0, rest: 0 }
      row.count += 1
      row.rest += x.rest
      map.set(key, row)
    }
    return [...map.values()].sort((a, b) => b.rest - a.rest)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unpaid, data.patients])

  return (
    <div className="day-backdrop" onClick={onClose} role="presentation">
      <div
        className="day-modal wide-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Остаток по нарядам"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="day-head">
          <div>
            <span className="eyebrow">ОСТАТОК ПО НАРЯДАМ</span>
            <h2>Не оплачено</h2>
            <small>{scope}</small>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Закрыть">
            <X size={17} />
          </button>
        </header>

        <div className="day-body wide-body">
          <div className="unpaid-stats">
            <div className="unpaid-stat">
              <FileText size={16} />
              <span>Нарядов без оплаты</span>
              <b>{unpaid.length}</b>
            </div>
            <div className="unpaid-stat">
              <Users size={16} />
              <span>Пациентов</span>
              <b>{byPatient.length}</b>
            </div>
            <div className="unpaid-stat accent">
              <Wallet size={16} />
              <span>Сумма остатка</span>
              <b>{money(totalRest)}</b>
            </div>
          </div>

          {byPatient.length > 0 && (
            <div className="unpaid-patients">
              {byPatient.map((p) => (
                <span key={p.name} className="unpaid-chip">
                  <b>{p.name}</b>
                  <small>{p.count} {p.count === 1 ? 'наряд' : p.count < 5 ? 'наряда' : 'нарядов'}</small>
                  <em>{money(p.rest)}</em>
                </span>
              ))}
            </div>
          )}

          {unpaid.length ? (
            <div className="unpaid-grid">
              {unpaid.map(({ o, sum, rest }) => {
                const paidPct = sum ? Math.min(100, Math.round((o.paid / sum) * 100)) : 0
                const byWork = o.items.reduce<Record<string, number>>((acc, i) => {
                  acc[i.workId] = (acc[i.workId] ?? 0) + 1
                  return acc
                }, {})
                return (
                  <article key={o.id} className={'unpaid-card status-' + o.status}>
                    <header className="unpaid-card-head">
                      <span className="unpaid-num">№{o.number}</span>
                      <span className={'unpaid-status ' + o.status}>{STATUS[o.status]}</span>
                    </header>
                    <h3>{nameOf(o.patientId)}</h3>
                    <p className="unpaid-doctor">{o.doctor || 'Врач не указан'}</p>

                    <div className="unpaid-works">
                      {Object.entries(byWork).map(([id, n]) => (
                        <span key={id} className="unpaid-work" style={{ ['--w' as string]: workOf(id).color }}>
                          {n} × {workOf(id).short}
                        </span>
                      ))}
                    </div>

                    <div className="unpaid-bar" aria-label={`Оплачено ${paidPct}%`}>
                      <span style={{ width: paidPct + '%' }} />
                    </div>

                    <dl className="unpaid-money">
                      <div>
                        <dt>Сумма</dt>
                        <dd>{money(sum)}</dd>
                      </div>
                      <div>
                        <dt>Оплачено</dt>
                        <dd className="green">{money(o.paid)}</dd>
                      </div>
                      <div className="rest">
                        <dt>Остаток</dt>
                        <dd>{money(rest)}</dd>
                      </div>
                    </dl>

                    <footer className="unpaid-card-foot">
                      <span>Готовность {formatDate(o.dueDate)}</span>
                      <Link href={'/orders/' + o.id}>Открыть</Link>
                    </footer>
                  </article>
                )
              })}
            </div>
          ) : (
            <div className="empty">За выбранный период все наряды оплачены.</div>
          )}
        </div>
      </div>
    </div>
  )
}
