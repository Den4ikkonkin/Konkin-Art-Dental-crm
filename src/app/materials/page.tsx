'use client'

// Материалы врача: файлы, загруженные без наряда.
// Это ключевое отличие врача от техника — можно отдать сканы
// и фото до того, как наряд вообще создан.

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useStore } from '@/components/Store'
import { Heading } from '@/components/UI'
import { loadFiles, type CrmFile } from '@/lib/db'
import { FolderOpen, Search, AlertTriangle } from 'lucide-react'

const CATEGORY_RU: Record<string, string> = {
  before: 'До лечения',
  after: 'После лечения',
  scan: 'Сканы',
  photos: 'Фотографии',
  process: 'Фото процесса',
  document: 'Документы',
  portfolio: 'Портфолио',
  other: 'Другое',
}

export default function MaterialsPage() {
  const { role } = useStore()
  const [files, setFiles] = useState<CrmFile[]>([])
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadFiles().then(setFiles).catch(() => {}).finally(() => setLoading(false))
  }, [])

  // Поиск по метаданным: содержимое изображений и PDF не анализируется.
  const visible = useMemo(() => files.filter((f) => {
    if (category !== 'all' && f.category !== category) return false
    const hay = `${f.name} ${f.note} ${f.drivePath}`.toLowerCase()
    return hay.includes(query.toLowerCase())
  }), [files, query, category])

  if (role === 'technician') {
    return (
      <div className="panel empty">
        <AlertTriangle size={20} className="inline-icon" />
        Раздел врача. Ваши файлы — в карточках нарядов и пациентов.
      </div>
    )
  }

  const categories = ['all', ...new Set(files.map((f) => f.category))]

  return (
    <>
      <Heading
        title="Мои материалы"
        sub="Сканы, фотографии и документы без привязки к наряду. Поиск идёт по метаданным, а не по содержимому файлов."
      />

      <section className="panel">
        <div className="panel-heading">
          <h2><FolderOpen size={16} className="inline-icon" /> Файлы</h2>
          <div className="row">
            <div className="search-inline">
              <Search size={15} />
              <input
                placeholder="Имя файла, пациент, путь"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              {categories.map((c) => (
                <option key={c} value={c}>{c === 'all' ? 'Все категории' : CATEGORY_RU[c] ?? c}</option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <div className="empty">Загрузка…</div>
        ) : visible.length === 0 ? (
          <div className="empty">
            Файлов пока нет. Загрузите сканы из карточки пациента — они появятся здесь.
          </div>
        ) : (
          <table className="responsive">
            <thead>
              <tr><th>Файл</th><th>Категория</th><th>Размер</th><th>Загружен</th><th>Пациент</th></tr>
            </thead>
            <tbody>
              {visible.map((f) => (
                <tr key={f.id}>
                  <td data-label="Файл">{f.name}</td>
                  <td data-label="Категория">{CATEGORY_RU[f.category] ?? f.category}</td>
                  <td data-label="Размер" className="num">{Math.round(f.size / 1024)} КБ</td>
                  <td data-label="Загружен">{f.createdAt.slice(0, 10)}</td>
                  <td data-label="Пациент">
                    {f.patientId ? <Link href="/patients">карточка</Link> : '—'}
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
