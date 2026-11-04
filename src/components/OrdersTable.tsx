'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useStore } from './Store'
import { Order, total, money, formatDate, STATUS, workOf, today } from '@/lib/model'
import { errorText, confirmDeleteOrder } from '@/lib/errors'
import { Pencil, Trash2, Printer, Check, Archive, ArchiveRestore } from 'lucide-react'

export default function OrdersTable({ orders }: { orders: Order[] }) {
  const { data, changeOrderStatus, setOrderPaid, setOrderArchived, deleteOrder } = useStore()
  const [error, setError] = useState('')

  if (!orders.length) return <div className="empty">Нарядов пока нет в этом списке.</div>

  async function change(id: string, status: Order['status']) {
    try { await changeOrderStatus(id, status) } catch (e) { setError(errorText(e)) }
  }

  // Галочка «Получено»: отмечаем — сумма наряда уходит в «Оплачено»,
  // снимаем — обнуляется. Частичные оплаты сохраняются как есть,
  // поэтому галочка горит только при полной сумме.
  async function togglePaid(o: Order) {
    const sum = total(o)
    if (sum <= 0) return
    const fullyPaid = o.paid >= sum
    try {
      await setOrderPaid(o.id, fullyPaid ? 0 : sum, fullyPaid ? '' : today())
    } catch (e) {
      setError(errorText(e))
    }
  }

  async function toggleArchive(o: Order) {
    try {
      await setOrderArchived(o.id, !o.archived)
    } catch (e) {
      setError(errorText(e))
    }
  }

  async function remove(id: string) {
    if (!confirmDeleteOrder()) return
    try { await deleteOrder(id) } catch (e) { setError(errorText(e)) }
  }

  return (
    <>
      {error && <div className="alert" role="alert">{error}</div>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Наряд / пациент</th><th>Работы / зубы</th><th>Готовность</th>
              <th>Врач</th>
              <th className="num">Сумма</th><th className="num">Оплачено</th>
              <th className="paid-col">Получено</th><th>Статус</th><th />
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => {
              const sum = total(o)
              const fullyPaid = sum > 0 && o.paid >= sum
              return (
                <tr key={o.id}>
                  <td>
                    <Link href={'/orders/' + o.id}><b>№{o.number}</b></Link>
                    <br /><span>{data.patients.find((p) => p.id === o.patientId)?.name || '—'}</span>
                  </td>
                  <td>
                    <div className="dots">
                      {Array.from(new Set(o.items.map((i) => i.workId))).map((id) => (
                        <span key={id} className="dot" style={{ background: workOf(id).color }} title={workOf(id).name} />
                      ))}
                    </div>
                    <small>{o.items.length} ед. · зубы {Array.from(new Set(o.items.map((i) => i.tooth))).join(', ')}</small>
                  </td>
                  <td>{formatDate(o.dueDate)}</td>
                  <td className={o.doctor ? '' : 'muted'}>{o.doctor || '—'}</td>
                  <td className="num">{money(sum)}</td>
                  <td className="num green">{money(o.paid)}</td>
                  <td className="paid-col">
                    <button
                      type="button"
                      className={'paid-check' + (fullyPaid ? ' on' : '')}
                      role="checkbox"
                      aria-checked={fullyPaid}
                      aria-label={`Оплата получена по наряду ${o.number}`}
                      title={
                        fullyPaid
                          ? 'Деньги получены — нажмите, чтобы снять отметку'
                          : `Отметить, что получено ${money(sum)}`
                      }
                      disabled={sum <= 0}
                      onClick={() => void togglePaid(o)}
                    >
                      <Check size={14} strokeWidth={3} />
                    </button>
                  </td>
                  <td>
                    <select aria-label={`Статус наряда ${o.number}`} className={'status ' + o.status}
                      value={o.status} onChange={(e) => void change(o.id, e.target.value as Order['status'])}>
                      {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </td>
                  <td>
                    <div className="row nowrap">
                      <button
                        type="button"
                        className={'icon-btn archive-btn' + (o.archived ? ' on' : '')}
                        title={o.archived ? 'Вернуть из архива' : 'Убрать в архив'}
                        aria-label={o.archived ? `Вернуть наряд ${o.number} из архива` : `Убрать наряд ${o.number} в архив`}
                        onClick={() => void toggleArchive(o)}
                      >
                        {o.archived ? <ArchiveRestore size={16} /> : <Archive size={16} />}
                      </button>
                      <Link className="icon-btn" title="Изменить" href={'/orders/' + o.id}><Pencil size={16} /></Link>
                      <Link className="icon-btn" title="Печать / сохранить PDF" href={`/orders/${o.id}/print`}><Printer size={16} /></Link>
                      <button type="button" className="icon-btn danger" aria-label={`Удалить наряд ${o.number}`}
                        onClick={() => void remove(o.id)}><Trash2 size={16} /></button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}
