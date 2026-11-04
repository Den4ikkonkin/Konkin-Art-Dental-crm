'use client'

// Панель «Сервер» в Настройках.
//
// Два независимых блока:
//   1. Память компьютера — ОЗУ машины, где работает приложение (локально ваш Mac).
//   2. Квоты Supabase — те же строки, что в панели Supabase → Usage.
//
// Что измеряем сами: размер базы (через функцию в Postgres), объём файлов,
// число пользователей. Выход и логи — внутренние счётчики платформы,
// обычный API их не отдаёт, поэтому там прочерк и ссылка в панель.

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { MemoryStick, Cloud, RefreshCw, Info, ExternalLink, Check, AlertTriangle } from 'lucide-react'

type Memory = {
  totalMb: number
  usedMb: number
  freeMb: number
  availableMb: number
  percentFree: number
  percentAvailable: number
  percentUsed: number
  processMb: number
  uptimeSec: number
  platform: string
  measuredBy: string
}

type QuotaRow = {
  key: string
  label: string
  used: number | null
  limit: number
  unit: 'gb' | 'mb' | 'count'
  source: 'live' | 'panel' | 'unknown'
  note?: string
}

type Payload = {
  ok: boolean
  memory: Memory
  quotas: QuotaRow[]
  projectRef: string
  dashboardUrl: string
  needsAuth: boolean
  dbError: string
  hint: string
  hasManagementToken: boolean
  checkedAt: string
}

function memTone(percentFree: number) {
  if (percentFree >= 40) return { color: 'var(--lime)', label: 'запас есть', hint: 'Памяти хватает' }
  if (percentFree >= 20) return { color: 'var(--orange)', label: 'тесновато', hint: 'Стоит закрыть лишние программы' }
  return { color: '#e38080', label: 'мало свободной', hint: 'Система держит память под кэш — это норма для macOS' }
}

/** Цвет по заполненности квоты: чем меньше процент, тем спокойнее. */
function fillTone(percent: number): string {
  if (percent < 60) return 'var(--lime)'
  if (percent < 85) return 'var(--orange)'
  return '#e38080'
}

function uptime(sec: number) {
  const d = Math.floor(sec / 86400)
  const h = Math.floor((sec % 86400) / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (d > 0) return `${d} д ${h} ч`
  if (h > 0) return `${h} ч ${m} мин`
  return `${m} мин`
}

/** 1.5 ГБ, 28 МБ или 6 — в зависимости от единицы измерения. */
function fmt(value: number, unit: QuotaRow['unit']): string {
  if (unit === 'count') return String(value)
  if (unit === 'mb') {
    if (value >= 1024) return (value / 1024).toFixed(2) + ' ГБ'
    return (value < 10 ? value.toFixed(2) : Math.round(value)) + ' МБ'
  }
  if (value === 0) return '0'
  if (value < 0.01) return value.toFixed(3) + ' ГБ'
  if (value < 1) return value.toFixed(2) + ' ГБ'
  return value.toFixed(1) + ' ГБ'
}

function Ring({ percent, color, size = 74 }: { percent: number; color: string; size?: number }) {
  const r = (size - 8) / 2
  const c = 2 * Math.PI * r
  return (
    <div className="mem-ring" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`}>
        <circle className="mem-track" cx={size / 2} cy={size / 2} r={r} />
        <circle
          className="mem-fill"
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeDasharray={`${(percent / 100) * c} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <b style={{ color }}>{percent}%</b>
    </div>
  )
}

export default function MemoryPanel() {
  const [data, setData] = useState<Payload | null>(null)
  const [failed, setFailed] = useState('')
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token ?? ''
      const res = await fetch('/api/health/memory', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        cache: 'no-store',
      })
      if (res.status === 404) {
        throw new Error(
          'Маршрут /api/health/memory не найден. Проверьте файл src/app/api/health/memory/route.ts и перезапустите сервер.',
        )
      }
      if (!res.ok) throw new Error('Сервер ответил ' + res.status)
      setData((await res.json()) as Payload)
      setFailed('')
    } catch (e) {
      setFailed(e instanceof Error ? e.message : 'Нет связи с сервером')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const mem = data?.memory
  const t = mem ? memTone(mem.percentAvailable) : null

  return (
    <>
      {/* ---------- 1. Память компьютера ---------- */}
      <section className="panel">
        <h2><MemoryStick size={17} className="inline-icon" /> Память компьютера</h2>
        <p className="muted small">
          Оперативная память машины, где сейчас работает приложение. Локально это ваш Mac,
          после публикации — сервер хостинга. К Supabase эта цифра не относится.
        </p>

        {failed && (
          <>
            <div className="alert" role="alert">{failed}</div>
            <button className="btn" onClick={() => void load()} disabled={loading}>
              <RefreshCw size={15} className={loading ? 'spin' : ''} /> Попробовать снова
            </button>
          </>
        )}

        {!failed && !mem && <p className="muted">Загружаем данные…</p>}

        {mem && t && (
          <>
            <div className="mem-head">
              <Ring percent={mem.percentAvailable} color={t.color} />
              <div>
                <strong style={{ color: t.color }}>{t.label}</strong>
                <small className="muted">{t.hint}</small>
              </div>
            </div>

            <div className="mem-bar" aria-hidden="true">
              <span style={{ width: `${mem.percentUsed}%`, background: t.color }} />
            </div>

            <dl className="mem-rows">
              <div><dt>Доступно для работы</dt><dd>{(mem.availableMb / 1024).toFixed(1)} ГБ</dd></div>
              <div><dt>Полностью свободно</dt><dd>{mem.freeMb} МБ</dd></div>
              <div><dt>Занято всего</dt><dd>{(mem.usedMb / 1024).toFixed(1)} ГБ</dd></div>
              <div><dt>Вся память</dt><dd>{(mem.totalMb / 1024).toFixed(1)} ГБ</dd></div>
              <div><dt>Занимает приложение</dt><dd>{mem.processMb} МБ</dd></div>
              <div><dt>Работает без перезапуска</dt><dd>{uptime(mem.uptimeSec)}</dd></div>
            </dl>

            <p className="mem-note">
              <Info size={13} />
              <span>
                «Доступно» — свободная память плюс кэш, который система отдаст программам
                по требованию. На macOS «полностью свободно» почти всегда небольшое:
                система держит память под кэш файлов. Ориентируйтесь на «Доступно».
              </span>
            </p>
          </>
        )}
      </section>

      {/* ---------- 2. Квоты Supabase ---------- */}
      <section className="panel">
        <h2><Cloud size={17} className="inline-icon" /> Квоты Supabase</h2>
        <p className="muted small">
          Те же строки, что в панели Supabase → Usage, на бесплатном тарифе. Размер базы,
          файлы и пользователи считаются прямо из вашего проекта. Выход и логи — внутренние
          счётчики платформы, их отдаёт только панель Supabase.
        </p>

        {data?.needsAuth && (
          <div className="alert" role="alert">Войдите в приложение, чтобы увидеть квоты Supabase.</div>
        )}

        {data?.dbError && (
          <div className="alert" role="alert">Не удалось прочитать данные: {data.dbError}</div>
        )}

        {data && !data.needsAuth && (
          <>
            <ul className="quota-list">
              {data.quotas.map((row) => {
                const known = row.used !== null
                const percent = known && row.limit > 0 ? Math.min(100, (row.used! / row.limit) * 100) : 0
                const color = fillTone(percent)
                return (
                  <li key={row.key} className="quota-row">
                    <div className="quota-head">
                      <span className="quota-label">
                        <i
                          className={
                            'quota-dot ' +
                            (row.source === 'live' ? 'live' : row.source === 'panel' ? 'panel' : 'unknown')
                          }
                          aria-hidden="true"
                        />
                        {row.label}
                      </span>
                      <span className="quota-value">
                        {known ? fmt(row.used!, row.unit) : '—'}
                        <small> / {fmt(row.limit, row.unit)}</small>
                        {known && row.limit > 0 && (
                          <em style={{ color }}>{percent < 1 ? '<1' : Math.round(percent)}%</em>
                        )}
                      </span>
                    </div>

                    <div className="quota-bar" aria-hidden="true">
                      <span
                        style={{
                          width: `${known ? Math.max(percent, percent > 0 ? 2 : 0) : 0}%`,
                          background: color,
                        }}
                      />
                    </div>

                    {row.note && <p className="quota-note">{row.note}</p>}
                  </li>
                )
              })}
            </ul>

            <div className="quota-legend">
              <span><Check size={12} className="ok" /> считается из проекта</span>
              <span><AlertTriangle size={12} className="warn" /> только в панели Supabase</span>
            </div>

            {data.hint && (
              <p className="mem-note warn"><Info size={13} /><span>{data.hint}</span></p>
            )}

            <a className="btn small" href={data.dashboardUrl} target="_blank" rel="noreferrer">
              <ExternalLink size={14} /> Открыть Usage в Supabase
            </a>
          </>
        )}

        <button className="btn small" onClick={() => void load()} disabled={loading}>
          <RefreshCw size={15} className={loading ? 'spin' : ''} /> Обновить
        </button>
      </section>
    </>
  )
}
