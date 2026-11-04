'use client'

// Создание карточки пациента врачом — отдельной страницей.
//
// ПОЧЕМУ ОТДЕЛЬНАЯ СТРАНИЦА: кнопка «Новая карточка пациента» в шапке
// вела на /patients/new, а такого маршрута не было — Next.js отдавал
// 404 «Страница не найдена». Маршрут добавлен, чтобы кнопка работала.
//
// Пациент создаётся через createPatient из Store: он же обновляет
// локальное состояние, поэтому список на /patients обновится сразу.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useStore } from '@/components/Store'
import { Heading, Field } from '@/components/UI'
import { uid } from '@/lib/uid'
import { Save, ArrowLeft } from 'lucide-react'
import Link from 'next/link'

export default function NewPatientPage() {
  const router = useRouter()
  const { createPatient } = useStore()
  const [name, setName] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!name.trim()) {
      setError('Укажите ФИО пациента.')
      return
    }
    setBusy(true)
    try {
      await createPatient({ id: uid(), name: name.trim(), note: note.trim() })
      router.push('/patients')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось создать пациента')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Heading
        title="Новая карточка пациента"
        sub="Карточка создаётся отдельно от наряда. Материалы и сканы можно добавить сразу после сохранения."
      />

      {error && <div className="alert" role="alert">{error}</div>}

      <form className="panel" onSubmit={save}>
        <div className="panel-heading">
          <h2>Данные пациента</h2>
          <Link href="/patients" className="btn small">
            <ArrowLeft size={14} /> К списку
          </Link>
        </div>

        <div className="form-meta">
          <Field label="ФИО *">
            <input
              required
              maxLength={200}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Фамилия Имя Отчество"
            />
          </Field>

          <Field label="Примечание">
            <input
              maxLength={3000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Клинические особенности, пожелания"
            />
          </Field>

          <button className="btn primary" type="submit" disabled={busy}>
            <Save size={16} /> {busy ? 'Сохранение…' : 'Сохранить'}
          </button>

          <button className="btn" type="button" onClick={() => router.back()}>
            Отмена
          </button>
        </div>
      </form>
    </>
  )
}
