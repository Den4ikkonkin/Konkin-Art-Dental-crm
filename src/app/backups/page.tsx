'use client'

// Бэкапы: еженедельный шифрованный экспорт в Google Drive.
// Экспорт запускает крон Vercel, страница только показывает
// состояние и позволяет выгрузить данные своей роли.

import { useState } from 'react'
import { useStore } from '@/components/Store'
import { Heading } from '@/components/UI'
import { exportCsv, total } from '@/lib/model'
import { Archive, Download, ShieldCheck, AlertTriangle } from 'lucide-react'

export default function BackupsPage() {
  const { role, data } = useStore()
  const [notice, setNotice] = useState('')

  if (role !== 'admin') {
    return (
      <div className="panel empty">
        <AlertTriangle size={20} className="inline-icon" />
        Раздел доступен только администратору.
      </div>
    )
  }

  function exportAll() {
    exportCsv(data.orders, data.patients)
    setNotice('Выгрузка сформирована: все наряды, доступные вашей роли.')
  }

  function exportSalaries() {
    const header = 'Техник;Нарядов;Начислено'
    const map = new Map<string, { n: number; sum: number }>()
    for (const o of data.orders) {
      const key = o.technician || 'Денис'
      const row = map.get(key) ?? { n: 0, sum: 0 }
      row.n++
      row.sum += o.salary
      map.set(key, row)
    }
    const lines = [...map.entries()].map(([name, r]) => `${name};${r.n};${r.sum}`)
    const blob = new Blob(['\ufeff' + [header, ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'konkin-salaries.csv'
    a.click()
    URL.revokeObjectURL(a.href)
    setNotice('Выгрузка зарплат готова.')
  }

  return (
    <>
      <Heading
        title="Бэкапы"
        sub="Еженедельный экспорт базы в Google Drive по расписанию Vercel. Файлы шифруются."
      />

      {notice && <div className="note" role="status">{notice}</div>}

      <section className="panel">
        <div className="panel-heading"><h2><ShieldCheck size={16} className="inline-icon" /> Шифрование</h2></div>
        <p className="muted">
          Архив шифруется симметричным ключом на сервере. Ключ не попадает в браузер
          и не хранится в Google Drive вместе с архивом.
        </p>
        <p className="muted small">
          Пользователь может выгрузить только данные своей роли: техник — свои наряды и зарплату,
          врач — своих пациентов и связанные наряды, администратор — всё.
        </p>
      </section>

      <section className="panel">
        <div className="panel-heading"><h2><Archive size={16} className="inline-icon" /> Ручная выгрузка</h2></div>
        <div className="row">
          <button className="btn" onClick={exportAll}>
            <Download size={15} /> Все наряды (CSV)
          </button>
          <button className="btn" onClick={exportSalaries}>
            <Download size={15} /> Зарплаты техников
          </button>
        </div>
        <p className="muted small">
          Всего нарядов в выборке: {data.orders.length}. Сумма: {total({ items: data.orders.flatMap((o) => o.items) }).toLocaleString('ru-RU')} ₽.
        </p>
      </section>
    </>
  )
}
