'use client'
import { useState } from 'react'
export type DonutSlice = { label: string; value: number; color: string }
export default function DonutChart({ data }: { data: DonutSlice[] }) {
  const [active, setActive] = useState<number | null>(null)
  const total = data.reduce((s, d) => s + d.value, 0)
  let offset = 0
  return (
    <div className="donut-layout">
      <div className="donut-wrap">
        <svg
          viewBox="0 0 320 320"
          role="img"
          aria-label={`Всего ${total} работ. Распределение по видам.`}
        >
          <circle cx="160" cy="160" r="124" fill="none" stroke="#28342D" strokeWidth="32" />
          {data.map((d, index) => {
            const length = total ? (d.value / total) * 100 : 0,
              start = offset
            offset += length
            if (!length) return null
            return (
              <circle
                key={d.label}
                cx="160"
                cy="160"
                r="124"
                pathLength="100"
                fill="none"
                stroke={d.color}
                strokeWidth={active === index ? 38 : 32}
                strokeDasharray={`${length} ${100 - length}`}
                strokeDashoffset={-start}
                transform="rotate(-90 160 160)"
                opacity={active === null || active === index ? 1 : 0.3}
                className="ring-segment"
                onMouseEnter={() => setActive(index)}
                onMouseLeave={() => setActive(null)}
              >
                <title>
                  {d.label}: {d.value} шт · {length.toFixed(1)}%
                </title>
              </circle>
            )
          })}
        </svg>
        <div className="donut-center">
          <strong>{total}</strong>
          <span>ЕДИНИЦ РАБОТ</span>
        </div>
      </div>
      <div className="legend">
        {data.map((d, i) => (
          <button
            type="button"
            key={d.label}
            className={'legend-row ' + (active === i ? 'highlight' : '')}
            onMouseEnter={() => setActive(i)}
            onMouseLeave={() => setActive(null)}
            onFocus={() => setActive(i)}
            onBlur={() => setActive(null)}
            onClick={() => setActive(active === i ? null : i)}
          >
            <span className="dot" style={{ background: d.color }} />
            <span>{d.label}</span>
            <b>{d.value} шт</b>
            <small>{total ? ((d.value / total) * 100).toFixed(1) : '0.0'}%</small>
          </button>
        ))}
      </div>
    </div>
  )
}
