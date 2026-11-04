'use client'

// Демо-режим. Кнопка «Демо» есть только у администратора.
// Демо-данные помечены флагом is_demo и не попадают ни в статистику,
// ни в зарплаты, ни в отчёты, ни в Excel.

import { useStore } from '@/components/Store'
import { Heading } from '@/components/UI'
import { FlaskConical, Eye, UserCog, AlertTriangle, Trash2 } from 'lucide-react'
import Link from 'next/link'

export default function DemoPage() {
  const { role, viewAs, setViewAs, data } = useStore()

  if (role !== 'admin') {
    return (
      <div className="panel empty">
        <AlertTriangle size={20} className="inline-icon" />
        Кнопка «Демо» видна только администратору.
      </div>
    )
  }

  const demoOrders = data.orders.filter((o) => o.id.startsWith('demo-')).length

  return (
    <>
      <Heading
        title="Демо"
        sub="Проверка прав и внешнего вида без записи в рабочие данные. Всё помечено флагом is_demo."
      />

      <div className="alert" role="alert">
        <span>
          <strong>Демо не влияет на работу.</strong> Демо-записи не попадают в статистику,
          зарплаты, отчёты и выгрузки. Реальные данные не изменяются.
        </span>
      </div>

      <section className="panel">
        <div className="panel-heading"><h2><Eye size={16} className="inline-icon" /> Режим просмотра роли</h2></div>
        <p className="muted">
          Интерфейс глазами врача или техника. Права не повышаются: RLS по-прежнему видит
          вашу реальную учётку, поэтому запись в рабочие таблицы невозможна.
        </p>
        <div className="row">
          <button
            className={'btn' + (viewAs === 'doctor' ? ' primary' : '')}
            onClick={() => setViewAs('doctor')}
          >
            Просмотр как врач
          </button>
          <button
            className={'btn' + (viewAs === 'technician' ? ' primary' : '')}
            onClick={() => setViewAs('technician')}
          >
            Просмотр как техник
          </button>
          {viewAs && (
            <button className="btn" onClick={() => setViewAs(null)}>
              <UserCog size={15} /> Вернуться в режим администратора
            </button>
          )}
        </div>
        {viewAs && (
          <div className="note" role="status">
            Сейчас включён режим просмотра: {viewAs === 'doctor' ? 'врач' : 'техник'}.
            Плашка сверху всегда показывает это состояние.
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel-heading"><h2><FlaskConical size={16} className="inline-icon" /> Демо-данные</h2></div>
        {demoOrders > 0 ? (
          <>
            <p className="muted">В памяти загружено демо-нарядов: {demoOrders}.</p>
            <Link className="btn" href="/orders">Открыть демо-наряды</Link>
          </>
        ) : (
          <p className="muted">
            Демо-наряды не загружены. Демонстрационные записи создаются с флагом is_demo
            и в статистику не входят.
          </p>
        )}
        <p className="muted small">
          <Trash2 size={13} className="inline-icon" />
          Удаление демо-данных затрагивает только строки с is_demo = true.
        </p>
      </section>
    </>
  )
}
