'use client'

// Карточка наряда. Геометрия фиксирована (см. oc-card.css):
// шапка → дуга + кнопки → оплата/статус → дата/сумма/остаток (красный) → врачи галочками.
// Конструкции и номера зубов на карточке не показываются.
// Смена врача пишет в базу и обновляет data.orders — статистика пересчитывается автоматически.

import Link from 'next/link'
import { useState } from 'react'
import { useStore } from './Store'
import ToothMap from './ToothMap'
import { Order, DOCTORS, total, money, formatDate, STATUS, today } from '@/lib/model'
import { errorText, confirmDeleteOrder } from '@/lib/errors'
import { Pencil, Printer, Trash2, Check, CalendarDays, Wallet, Archive, ArchiveRestore, Stethoscope } from 'lucide-react'

export default function OrderCardV2({
  order,
  patientName,
}: {
  order: Order
  patientName?: string
}) {
  const { data, changeOrderStatus, setOrderPaid, setOrderArchived, setOrderDoctor, deleteOrder } = useStore()
  const [error, setError] = useState('')
  const [busyDoctor, setBusyDoctor] = useState(false)

  const sum = total(order)
  const fullyPaid = sum > 0 && order.paid >= sum
  const rest = Math.max(0, sum - order.paid)
  const patient = data.patients.find((p) => p.id === order.patientId)
  const patientLabel = patientName || patient?.name || 'Без пациента'

  // Врачи: только из справочника. Старый врач из наряда, которого нет в списке, тоже виден, чтобы не потерять данные.
  const doctorOptions = Array.from(new Set<string>([...DOCTORS, ...(order.doctor ? [order.doctor] : [])]))

  async function run(fn: () => Promise<void>) {
    try {
      await fn()
    } catch (e) {
      setError(errorText(e))
    }
  }

  async function togglePaid() {
    if (sum <= 0) return
    await run(() => setOrderPaid(order.id, fullyPaid ? 0 : sum, fullyPaid ? '' : today()))
  }

  async function pickDoctor(name: string) {
    const next = order.doctor === name ? '' : name
    setBusyDoctor(true)
    await run(() => setOrderDoctor(order.id, next))
    setBusyDoctor(false)
  }

  async function remove() {
    if (!confirmDeleteOrder(order.number)) return
    await run(() => deleteOrder(order.id))
  }

  return (
    <article className={'oc-card status-' + order.status + (order.archived ? ' is-archived' : '')}>
      <header className="oc-head">
        <span className="oc-num">№{order.number}</span>
        <h3 title={patientLabel}>{patientLabel}</h3>
      </header>

      {error && <div className="alert oc-alert" role="alert">{error}</div>}

      <div className="oc-top">
        <div className="oc-teeth">
          <ToothMap items={order.items} compact />
        </div>

        <div className="oc-rail">
          <button
            type="button"
            className={'oc-btn' + (order.archived ? ' on' : '')}
            title={order.archived ? 'Вернуть из архива' : 'Убрать в архив'}
            aria-label={order.archived ? `Вернуть наряд ${order.number} из архива` : `Убрать наряд ${order.number} в архив`}
            onClick={() => void run(() => setOrderArchived(order.id, !order.archived))}
          >
            {order.archived ? <ArchiveRestore /> : <Archive />}
          </button>
          <Link className="oc-btn" title="Изменить" aria-label={`Изменить наряд ${order.number}`} href={'/orders/' + order.id}>
            <Pencil />
          </Link>
          <Link className="oc-btn" title="Печать" aria-label={`Печать наряда ${order.number}`} href={`/orders/${order.id}/print`}>
            <Printer />
          </Link>
          <button type="button" className="oc-btn danger" title="Удалить" aria-label={`Удалить наряд ${order.number}`} onClick={() => void remove()}>
            <Trash2 />
          </button>
        </div>
      </div>

      <div className="oc-info">
        <div className="oc-row">
          <button
            type="button"
            className={'paid-toggle compact' + (fullyPaid ? ' on' : '')}
            role="checkbox"
            aria-checked={fullyPaid}
            aria-label={`Деньги по наряду ${order.number} получены`}
            disabled={sum <= 0}
            onClick={() => void togglePaid()}
          >
            <span className="paid-toggle-box"><Check size={9} strokeWidth={3} /></span>
            <span>{fullyPaid ? 'Получено' : 'Не получено'}</span>
          </button>

          <select
            className={'status compact ' + order.status}
            aria-label={`Статус наряда ${order.number}`}
            value={order.status}
            onChange={(e) => void run(() => changeOrderStatus(order.id, e.target.value as Order['status']))}
          >
            {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>

        <dl className="oc-mini">
          <div title="Дата готовности">
            <dt><CalendarDays size={12} /></dt>
            <dd>{formatDate(order.dueDate)}</dd>
          </div>
          <div title="Сумма наряда">
            <dt><Wallet size={12} /></dt>
            <dd>{money(sum)}</dd>
          </div>
          <div title="Остаток к оплате">
            <dt>ост.</dt>
            <dd className={rest > 0 ? 'warn' : ''}>{money(rest)}</dd>
          </div>
        </dl>

        <div className="oc-doctors" role="group" aria-label={`Врач по наряду ${order.number}`}>
          <span className="oc-doctors-label"><Stethoscope size={12} /> Врач</span>
          {doctorOptions.map((name) => {
            const on = order.doctor === name
            return (
              <button
                key={name}
                type="button"
                className={'oc-doctor' + (on ? ' on' : '')}
                aria-pressed={on}
                disabled={busyDoctor}
                title={on ? 'Снять врача' : 'Назначить врача'}
                onClick={() => void pickDoctor(name)}
              >
                <span className="oc-doctor-check">{on && <Check size={11} strokeWidth={3} />}</span>
                <span className="oc-doctor-name">{name}</span>
              </button>
            )
          })}
        </div>
      </div>
    </article>
  )
}
