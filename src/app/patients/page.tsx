 'use client'
import { uid } from '@/lib/uid'

import { useEffect, useState } from 'react'
import { useStore } from '@/components/Store'
import { Heading, Field } from '@/components/UI'
import PatientFiles from '@/components/PatientFiles'
import { Patient, total, money, formatDate } from '@/lib/model'
import { Save, Pencil, Trash2, FolderOpen, ChevronDown } from 'lucide-react'
import { driveSizes } from '@/lib/drive'
import { prettySize } from '@/lib/db'

export default function Page() {
  const { data, createPatient, updatePatient, deletePatient } = useStore()
  const [draft, setDraft] = useState<Patient>({ id: '', name: '', note: '' })
  const [openFiles, setOpenFiles] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [sizes, setSizes] = useState<Record<string, { files: number; bytes: number }>>({})
  const [heavyOnly, setHeavyOnly] = useState(false)

  useEffect(() => { driveSizes().then(setSizes).catch(() => {}) }, [])

  const bytesOf = (id: string) => sizes[id]?.bytes ?? 0
  const visiblePatients = heavyOnly
    ? [...data.patients].sort((a, b) => bytesOf(b.id) - bytesOf(a.id))
    : data.patients

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    try {
      if (draft.id) await updatePatient(draft)
      else await createPatient({ ...draft, id: uid() })
      setDraft({ id: '', name: '', note: '' })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось сохранить пациента')
    }
  }

  async function remove(p: Patient, ordersCount: number) {
    if (ordersCount) { setError('Сначала удалите или переназначьте наряды пациента.'); return }
    const files = data.patients.length ? undefined : undefined
    if (!confirm(`Удалить пациента «${p.name}»? Все его файлы тоже будут удалены.`)) return
    try { await deletePatient(p.id) } catch (e) { setError(e instanceof Error ? e.message : 'Ошибка') }
  }

  return (
    <>
      <Heading title="Пациенты" sub="Справочник с нарядами и файлами. Здесь же хранятся фото и сканы." />

      {error && <div className="alert" role="alert">{error}</div>}

      <form className="panel" onSubmit={save}>
        <h2>{draft.id ? 'Изменить пациента' : 'Добавить пациента'}</h2>
        <div className="form-meta">
          <Field label="ФИО *">
            <input required maxLength={200} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </Field>
          <Field label="Примечание">
            <input maxLength={3000} value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
          </Field>
          <button className="btn primary" type="submit"><Save size={16} /> Сохранить</button>
          {draft.id && (
            <button className="btn" type="button" onClick={() => setDraft({ id: '', name: '', note: '' })}>Отмена</button>
          )}
        </div>
      </form>

      <section className="panel">
        <div className="panel-heading"><h2>Список пациентов</h2><div className="row nowrap"><button type="button" className={'btn small' + (heavyOnly ? ' primary' : '')} onClick={() => setHeavyOnly((v) => !v)}>{heavyOnly ? 'Все пациенты' : 'Самые тяжёлые'}</button><span className="badge">{data.patients.length}</span></div></div>
        {!data.patients.length ? <div className="empty">Добавьте первого пациента.</div> : (
          <div className="patient-list">
            {visiblePatients.map((p) => {
              const orders = data.orders.filter((o) => o.patientId === p.id)
              const opened = openFiles === p.id
              return (
                <div className="patient-card" key={p.id}>
                  <div className="patient-head">
                    <div className="patient-main">
                      <b>{p.name}</b>
                      <small>{p.note || 'без примечания'}</small>
                    </div>
                    <div className="patient-stats">
                      <span className="size-pill" title="Файлов и занятое место на Диске">{sizes[p.id]?.files ?? 0} шт · {prettySize(bytesOf(p.id))}</span>
                      <span><small>Нарядов</small><b>{orders.length}</b></span>
                      <span><small>Сумма</small><b>{money(orders.reduce((s, o) => s + total(o), 0))}</b></span>
                      <span><small>Оплачено</small><b className="green">{money(orders.reduce((s, o) => s + o.paid, 0))}</b></span>
                    </div>
                    <div className="row nowrap">
                      <button type="button" className="btn small" onClick={() => setOpenFiles(opened ? null : p.id)}>
                        <FolderOpen size={15} /> Файлы <ChevronDown size={14} className={opened ? 'flip' : ''} />
                      </button>
                      <button className="icon-btn" aria-label={'Изменить ' + p.name} onClick={() => setDraft(p)}><Pencil size={16} /></button>
                      <button className="icon-btn danger" aria-label={'Удалить ' + p.name} onClick={() => void remove(p, orders.length)}><Trash2 size={16} /></button>
                    </div>
                  </div>

                  {!!orders.length && (
                    <div className="patient-orders">
                      {orders.map((o) => (
                        <div className="patient-order" key={o.id}>
                          <span className="dot" style={{ background: '#FFA052' }} />
                          <b>№{o.number}</b>
                          <span className="muted">{formatDate(o.createdAt)} · готовность {formatDate(o.dueDate)}</span>
                          <span className="muted">{o.items.length} ед.</span>
                          <span>{money(total(o))}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {opened && <PatientFiles patientId={p.id} patientName={p.name} />}
                </div>
              )
            })}
          </div>
        )}
      </section>
    </>
  )
}
