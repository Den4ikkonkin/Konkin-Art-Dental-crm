'use client'

// Индикатор места на Google Drive: серое кольцо, которое краснеет по мере заполнения.
import { useEffect, useState } from 'react'
import { driveQuota } from '@/lib/drive'
import { prettySize } from '@/lib/db'

const GREEN = [79, 165, 132]
const RED = [214, 69, 69]

function colorFor(percent: number): string {
  const t = Math.min(1, Math.max(0, percent / 100))
  const c = GREEN.map((g, i) => Math.round(g + (RED[i] - g) * t))
  return `rgb(${c.join(',')})`
}

export default function StorageCard() {
  const [q, setQ] = useState<{ usage: number; limit: number; drive: number } | null>(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    driveQuota()
      .then(setQ)
      .catch((e) => setErr(e instanceof Error ? e.message : 'Не удалось получить данные Диска'))
  }, [])

  const pct = q && q.limit ? Math.min(100, (q.usage / q.limit) * 100) : 0
  const R = 52
  const C = 2 * Math.PI * R

  return (
    <section className="panel storage-card">
      <h2>Google Диск</h2>
      <div className="storage-row">
        <svg width="132" height="132" viewBox="0 0 132 132" role="img" aria-label={`Занято ${pct.toFixed(1)}%`}>
          <circle cx="66" cy="66" r={R} fill="none" stroke="rgba(128,136,146,.28)" strokeWidth="12" />
          <circle
            cx="66" cy="66" r={R} fill="none" stroke={colorFor(pct)} strokeWidth="12" strokeLinecap="round"
            strokeDasharray={C} strokeDashoffset={C * (1 - pct / 100)} transform="rotate(-90 66 66)"
            style={{ transition: 'stroke-dashoffset .6s ease, stroke .6s ease' }}
          />
          <text x="66" y="66" textAnchor="middle" dominantBaseline="central" fill="currentColor" fontSize="20" fontWeight="700">
            {pct.toFixed(1)}%
          </text>
        </svg>
        <div className="storage-info">
          {err ? <div className="alert" role="alert">{err}</div>
            : !q ? <span className="muted">Загрузка…</span>
            : (
              <>
                <b>{prettySize(q.usage)} из {prettySize(q.limit)}</b>
                <small className="muted">На Диске файлы пациентов: {prettySize(q.drive)}</small>
                <small className="muted">Лимит общий для Gmail, Фото и Диска аккаунта konkinartdental@gmail.com</small>
              </>
            )}
        </div>
      </div>
    </section>
  )
}
