'use client'

import { useMemo, useState, type ReactNode } from 'react'
import styles from './EarningsRings.module.css'
import {
  CrownToothIcon,
  PatientIcon,
  ImplantCrownIcon,
  StumpCrownIcon,
} from './RingIcons'

/* ВИЗУАЛЬНЫЙ ПРОТОТИП. Данные статичные, в механику не подключены. */

type Seg = { id: string; label: string; value: number; color: string }

/* Палитры: тёмные и контрастные */
const RING_A: Seg[] = [
  { id: 'crown', label: 'Коронка (циркон)', value: 7, color: '#4C1D95' },
  { id: 'waxup', label: 'Wax-up', value: 3, color: '#7C3AED' },
  { id: 'pmma', label: 'PMMA временная', value: 4, color: '#A78BFA' },
]

const RING_B: Seg[] = [
  { id: 'p1', label: 'Иванов И.', value: 5, color: '#0F766E' },
  { id: 'p2', label: 'Петрова А.', value: 4, color: '#B45309' },
  { id: 'p3', label: 'Сидоров П.', value: 3, color: '#BE185D' },
  { id: 'p4', label: 'Кузнецова Е.', value: 2, color: '#1D4ED8' },
]

const RING_C: Seg[] = [
  { id: 'screw', label: 'Винтовая на импланте', value: 9, color: '#4F46E5' },
  { id: 'stump', label: 'На культе', value: 5, color: '#65A30D' },
]

const RING_D_COLOR = '#475569'

/* Период: по умолчанию месяц, 7 месяцев вокруг текущего, плюс год */
const MONTH_NAMES = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
]

function sevenMonths(base: Date) {
  const out: { key: string; label: string }[] = []
  for (let k = -3; k <= 3; k++) {
    const d = new Date(base.getFullYear(), base.getMonth() + k, 1)
    out.push({
      key: `${d.getFullYear()}-${d.getMonth()}`,
      label: `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`,
    })
  }
  return out
}

/* ── геометрия кольца ── */
const CX = 100
const CY = 100
const R = 78
const STROKE = 16
const GAP_DEG = 2

function polar(angle: number) {
  const a = ((angle - 90) * Math.PI) / 180
  return { x: CX + R * Math.cos(a), y: CY + R * Math.sin(a) }
}

function arcPath(start: number, end: number) {
  const s = polar(end)
  const e = polar(start)
  const large = end - start > 180 ? 1 : 0
  return `M ${s.x} ${s.y} A ${R} ${R} 0 ${large} 0 ${e.x} ${e.y}`
}

function Ring({
  segments,
  center,
  centerValue,
}: {
  segments: Seg[]
  center: ReactNode
  centerValue?: number
}) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1
  let acc = 0
  const arcs = segments.map((seg) => {
    const span = (seg.value / total) * 360
    const start = acc + GAP_DEG / 2
    const end = acc + span - GAP_DEG / 2
    acc += span
    return { seg, start, end }
  })

  return (
    <svg viewBox="0 0 200 200" role="img" aria-label="Кольцо">
      <circle cx={CX} cy={CY} r={R} fill="none" stroke="rgba(148,163,184,0.18)" strokeWidth={STROKE} />
      {arcs.map(({ seg, start, end }) => (
        <path
          key={seg.id}
          d={arcPath(start, end)}
          fill="none"
          stroke={seg.color}
          strokeWidth={STROKE}
          strokeLinecap="butt"
        />
      ))}
      <g>{center}</g>
      {centerValue !== undefined && (
        <text x={CX} y={CY + 12} textAnchor="middle" fontSize="34" fontWeight="700" fill="currentColor">
          {centerValue}
        </text>
      )}
    </svg>
  )
}

function Legend({ segments }: { segments: Seg[] }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1
  return (
    <div className={styles.legend}>
      {segments.map((s) => (
        <div key={s.id} className={styles.legendRow}>
          <span className={styles.legendDot} style={{ background: s.color }} />
          <span className={styles.legendLabel}>{s.label}</span>
          <span className={styles.legendNum}>{s.value}</span>
          <span className={styles.legendPct}>{Math.round((s.value / total) * 100)}%</span>
        </div>
      ))}
    </div>
  )
}

export default function EarningsRings() {
  const [mode, setMode] = useState<'month' | 'year'>('month')
  const months = useMemo(() => sevenMonths(new Date()), [])
  const [monthKey, setMonthKey] = useState(months[3].key)

  const totalUnits = RING_D_COLOR && RING_A.reduce((s, x) => s + x.value, 0)
  const periodLabel =
    mode === 'year'
      ? `Год ${new Date().getFullYear()}`
      : months.find((m) => m.key === monthKey)?.label ?? ''

  return (
    <div className={styles.wrap}>
      <div className={styles.periodBar}>
        <div className={styles.periodControls}>
          <div className={styles.toggle} role="group" aria-label="Режим периода">
            <button
              type="button"
              className={mode === 'month' ? styles.active : ''}
              onClick={() => setMode('month')}
            >
              Месяц
            </button>
            <button
              type="button"
              className={mode === 'year' ? styles.active : ''}
              onClick={() => setMode('year')}
            >
              Год
            </button>
          </div>
          {mode === 'month' && (
            <select
              className={styles.select}
              value={monthKey}
              onChange={(e) => setMonthKey(e.target.value)}
              aria-label="Выбор месяца"
            >
              {months.map((m) => (
                <option key={m.key} value={m.key}>{m.label}</option>
              ))}
            </select>
          )}
        </div>
        <button type="button" className={styles.exportBtn} disabled title="Экспорт подключим на следующем шаге">
          Экспорт
        </button>
      </div>

      <div className={styles.smallRow}>
        <section className={styles.card}>
          <div className={styles.cardTitle}>Виды конструкций</div>
          <div className={styles.cardSub}>{periodLabel}</div>
          <div className={styles.ringBox}>
            <Ring segments={RING_A} center={<g transform="translate(72,72)"><CrownToothIcon size={56} color="#A78BFA" /></g>} />
          </div>
          <Legend segments={RING_A} />
        </section>

        <section className={styles.card}>
          <div className={styles.cardTitle}>Пациенты</div>
          <div className={styles.cardSub}>{periodLabel}</div>
          <div className={styles.ringBox}>
            <Ring segments={RING_B} center={<g transform="translate(72,72)"><PatientIcon size={56} color="#94A3B8" /></g>} />
          </div>
          <Legend segments={RING_B} />
        </section>

        <section className={styles.card}>
          <div className={styles.cardTitle}>Фиксация</div>
          <div className={styles.cardSub}>{periodLabel}</div>
          <div className={styles.ringBox}>
            <Ring segments={RING_C} center={<g transform="translate(72,72)"><ImplantCrownIcon size={56} color="#818CF8" /></g>} />
          </div>
          <Legend segments={RING_C} />
          <div className={styles.legendRow} style={{ marginTop: 8, opacity: 0.8 }}>
            <StumpCrownIcon size={22} color="#65A30D" />
            <span className={styles.legendLabel}>Культя: коронка над обточенным зубом</span>
            <span />
            <span />
          </div>
        </section>
      </div>

      <section className={styles.card}>
        <div className={styles.bigCard}>
          <div className={styles.ringBox} style={{ maxWidth: 300 }}>
            <Ring
              segments={[{ id: 'all', label: 'Всего единиц', value: 1, color: RING_D_COLOR }]}
              center={null}
              centerValue={totalUnits}
            />
          </div>
          <div>
            <div className={styles.cardTitle}>Итого за период</div>
            <div className={styles.cardSub}>{periodLabel}</div>
            <p className={styles.bigTotal}>
              Число в центре — общее количество единиц (работ) за выбранный период.
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}
