'use client'

// Переданные пациенты: врач передаёт карточку технику, техник
// видит её даже до создания наряда. Передача не создаёт наряд.

import { useEffect, useState } from 'react'
import { useStore } from '@/components/Store'
import { Heading } from '@/components/UI'
import { loadHandoffs, setHandoffStatus, type Handoff } from '@/lib/db'
import { Send, Check, Eye, AlertCircle } from 'lucide-react'

const STATUS_RU: Record<Handoff['status'], string> = {
  sent: 'Передан',
  viewed: 'Просмотрен',
  accepted: 'Принят',
  needs_clarification: 'Ожидает уточнения',
  order_created: 'Наряд создан',
  cancelled: 'Отменён',
}

const STATUS_TONE: Record<Handoff['status'], string> = {
  sent: '#9ABBE5',
  viewed: '#82C6AE',
  accepted: '#ABD988',
  needs_clarification: '#FFA052',
  order_created: '#BAA0EE',
  cancelled: '#9BA7B5',
}

export default function HandoffsPage() {
  const { role } = useStore()
  const [rows, setRows] = useState<Handoff[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function reload() {
    setRows(await loadHandoffs())
  }

  useEffect(() => { reload().catch(() => setError('Не удалось загрузить передачи')).finally(() => setLoading(false)) }, [])

  async function mark(h: Handoff, status: Handoff['status']) {
    try {
      await setHandoffStatus(h.id, status)
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка')
    }
  }

  return (
    <>
      <Heading
        title="Переданные пациенты"
        sub="Передача материалов технику. Наряд из передачи не создаётся автоматически — его открывает техник."
      />

      {error && <div className="alert" role="alert">{error}</div>}

      <section className="panel">
        <div className="panel-heading"><h2><Send size={16} className="inline-icon" /> Передачи</h2></div>

        {loading ? (
          <div className="empty">Загрузка…</div>
        ) : rows.length === 0 ? (
          <div className="empty">
            Передач нет. Откройте карточку пациента и нажмите «Передать технику».
          </div>
        ) : (
          <table className="responsive">
            <thead>
              <tr><th>Пациент</th><th>Техник</th><th>Работа</th><th>Файлов</th><th>Статус</th><th>Дата</th><th>Действия</th></tr>
            </thead>
            <tbody>
              {rows.map((h) => (
                <tr key={h.id}>
                  <td data-label="Пациент">{h.patientName}</td>
                  <td data-label="Техник">{h.technicianName || '—'}</td>
                  <td data-label="Работа">{h.suggestedWork || '—'}</td>
                  <td data-label="Файлов" className="num">{h.fileCount}</td>
                  <td data-label="Статус">
                    <span className="due-chip" style={{ ['--tone' as string]: STATUS_TONE[h.status] }}>
                      {STATUS_RU[h.status]}
                    </span>
                  </td>
                  <td data-label="Дата">{h.createdAt.slice(0, 10)}</td>
                  <td data-label="Действия">
                    <div className="row">
                      {role === 'technician' && h.status === 'sent' && (
                        <button className="btn small" onClick={() => void mark(h, 'viewed')}>
                          <Eye size={13} /> Просмотрено
                        </button>
                      )}
                      {role === 'technician' && (h.status === 'viewed' || h.status === 'sent') && (
                        <button className="btn small" onClick={() => void mark(h, 'accepted')}>
                          <Check size={13} /> Принять
                        </button>
                      )}
                      {role === 'technician' && h.status === 'accepted' && (
                        <button className="btn small" onClick={() => void mark(h, 'needs_clarification')}>
                          <AlertCircle size={13} /> Нужно уточнение
                        </button>
                      )}
                      {(role === 'doctor' || role === 'admin') && h.status !== 'cancelled' && (
                        <button className="btn small" onClick={() => void mark(h, 'cancelled')}>
                          Отменить
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  )
}
