'use client'

// Карточка наряда для режима доски.
//
// Раскладка в две колонки, чтобы высота была минимальной:
//   слева  — зубная дуга, прижата к левому краю
//   справа — галочка оплаты, селект статуса, суммы и четыре кнопки
// Под дугой лежит только мелкая легенда работ и список зубов.

import Link from 'next/link'
import { useState } from 'react'
import { useStore } from './Store'
import ToothMap from './ToothMap'
import { Order, total, money, formatDate, STATUS, workOf, today } from '@/lib/model'
import { errorText, confirmDeleteOrder } from '@/lib/errors'
import { Pencil, Printer, Trash2, Check, CalendarDays, Wallet, Archive, ArchiveRestore, Stethoscope } from 'lucide-react'

export default function OrderCard({
  order,
  patientName,
}: {
  order: Order
  /** Имя передаётся страницей, чтобы не искать пациента дважды. */
  patientName?: string
}) {
  const { data, changeOrderStatus, setOrderPaid, setOrderArchived, deleteOrder } = useStore()
  const [error, setError] = useState('')

  const sum = total(order)
  const fullyPaid = sum > 0 && order.paid >= sum
  const rest = Math.max(0, sum - order.paid)
  const patient = data.patients.find((p) => p.id === order.patientId)
  const patientLabel = patientName || patient?.name || 'Без пациента'

  const teeth = Array.from(new Set(order.items.map((i) => i.tooth))).sort((a, b) => a - b)
  const byWork = order.items.reduce<Record<string, number>>((acc, i) => {
    acc[i.workId] = (acc[i.workId] ?? 0) + 1
    return acc
  }, {})

  async function togglePaid() {
    if (sum <= 0) return
    try {
      // Дата получения ставится автоматически при отметке, снимается вместе с оплатой.
      await setOrderPaid(order.id, fullyPaid ? 0 : sum, fullyPaid ? '' : today())
    } catch (e) {
      setError(errorText(e))
    }
  }

  async function change(status: Order['status']) {
    try {
      await changeOrderStatus(order.id, status)
    } catch (e) {
      setError(errorText(e))
    }
  }

  async function toggleArchive() {
    try {
      await setOrderArchived(order.id, !order.archived)
    } catch (e) {
      setError(errorText(e))
    }
  }

  async function remove() {
    if (!confirmDeleteOrder(order.number)) return
    try {
      await deleteOrder(order.id)
    } catch (e) {
      setError(errorText(e))
    }
  }

  return (
    <article className={'order-card status-' + order.status}>
      <header className="order-card-head">
        <span className="order-card-num">№{order.number}</span>
        <h3>{patientLabel}</h3>
      </header>

      {error && <div className="alert" role="alert">{error}</div>}

      <div className="order-card-body">
        {/* Слева: зубная дуга, смещена к левому краю */}
        <div className="order-card-teeth">
          <ToothMap items={order.items} compact />
        </div>

        {/* Центр: получено, статус, дата, сумма */}
        <div className="order-card-side">
          <button
            type="button"
            className={'paid-toggle compact' + (fullyPaid ? ' on' : '')}
            role="checkbox"
            aria-checked={fullyPaid}
            aria-label={`Деньги по наряду ${order.number} получены`}
            disabled={sum <= 0}
            onClick={() => void togglePaid()}
            title={fullyPaid ? 'Получено — нажмите, чтобы снять' : 'Отметить как получено'}
          >
            <span className="paid-toggle-box"><Check size={9} strokeWidth={3} /></span>
            <span>{fullyPaid ? 'Получено' : 'Не получено'}</span>
          </button>

          <select
            className={'status compact ' + order.status}
            aria-label={`Статус наряда ${order.number}`}
            value={order.status}
            onChange={(e) => void change(e.target.value as Order['status'])}
          >
            {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>

          <dl className="order-card-mini">
            <div title="Дата готовности">
              <dt><CalendarDays size={9} /></dt>
              <dd>{formatDate(order.dueDate)}</dd>
            </div>
            <div title="Сумма наряда">
              <dt><Wallet size={9} /></dt>
              <dd>{money(sum)}</dd>
            </div>
            {rest > 0 && (
              <div title="Остаток к оплате">
                <dt>ост.</dt>
                <dd className="warn">{money(rest)}</dd>
              </div>
            )}
          </dl>

          {/* Врач вместо списка зубов: кто ведёт наряд */}
          <p
            className={'order-card-doctor' + (order.doctor ? '' : ' empty')}
            title={order.doctor || 'Врач не указан'}
          >
            <Stethoscope size={10} />
            <b>{order.doctor || 'Врач не указан'}</b>
          </p>
        </div>

        {/* Справа: вертикальный ряд кнопок */}
        <div className="order-card-rail">
          <button
            type="button"
            className={'icon-btn tiny archive-btn' + (order.archived ? ' on' : '')}
            title={order.archived ? 'Вернуть из архива' : 'Убрать в архив'}
            aria-label={order.archived ? `Вернуть наряд ${order.number} из архива` : `Убрать наряд ${order.number} в архив`}
            onClick={() => void toggleArchive()}
          >
            {order.archived ? <ArchiveRestore size={12} /> : <Archive size={12} />}
          </button>
          <Link className="icon-btn tiny" title="Изменить" aria-label={`Изменить наряд ${order.number}`} href={'/orders/' + order.id}>
            <Pencil size={12} />
          </Link>
          <Link className="icon-btn tiny" title="Печать" aria-label={`Печать наряда ${order.number}`} href={`/orders/${order.id}/print`}>
            <Printer size={12} />
          </Link>
          <button
            type="button"
            className="icon-btn tiny danger"
            aria-label={`Удалить наряд ${order.number}`}
            title="Удалить"
            onClick={() => void remove()}
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {/* Работы: отдельный блок фиксированной высоты, строки выровнены */}
      <div className="order-card-legend">
        {Object.entries(byWork).map(([id, count]) => (
          <span key={id} className="legend-chip" title={workOf(id).name}>
            <span className="dot" style={{ background: workOf(id).color }} />
            <span className="legend-name">{workOf(id).short}</span>
            <b>{count}</b>
          </span>
        ))}
      </div>
    </article>
  )
}
