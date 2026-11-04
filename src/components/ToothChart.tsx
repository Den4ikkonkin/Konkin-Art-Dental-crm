"use client"

import type { CSSProperties } from 'react'
import type { Item } from '@/lib/model'
import { workOf } from '@/lib/model'
import { TOOTH_VECTORS } from '@/lib/tooth-vectors'
import styles from './ToothChart.module.css'

type Props = {
  selected: number[]
  items: Item[]
  /** shift = true, если клик был с зажатым Shift: выделить диапазон. */
  onToggle: (tooth: number, shift: boolean) => void
}

export default function ToothChart({ selected, items, onToggle }: Props) {
  const byTooth = new Map<number, Item>()
  items.forEach((item) => byTooth.set(item.tooth, item))

  return (
    <div className={styles.chart}>
      <svg className={styles.svg} viewBox="225 8 785 1420"
        width="785" height="1420" role="group" aria-label="Зубная схема FDI: 32 зуба">
        {TOOTH_VECTORS.map((t) => {
          const item = byTooth.get(t.n)
          const work = item ? workOf(item.workId) : undefined
          const picked = selected.includes(t.n)
          const style = { '--crown-color': work?.color ?? 'var(--crown-base)' } as CSSProperties
          const transform = `translate(${t.x} ${t.y}) rotate(${t.angle}) scale(${t.mirror ? -t.w / 100 : t.w / 100} ${t.h / 100}) translate(-50 -50)`
          return (
            <g key={t.n} className={`${styles.tooth} ${picked ? styles.picked : ''}`}
              style={style} role="button" tabIndex={0} aria-pressed={picked}
              aria-label={`Зуб ${t.n}${work ? `: ${work.name}` : ': без работы'}`}
              onClick={(e) => onToggle(t.n, e.shiftKey)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  if (!e.repeat) onToggle(t.n, e.shiftKey)
                }
              }}>
              <title>{`Зуб ${t.n} — ${work?.name ?? 'без работы'}`}</title>
              <g transform={transform}>
                <path className={styles.crown} d={t.outline} />
                <g className={styles.detail} aria-hidden="true">
                  {t.grooves.map((d, i) => <path key={i} d={d} />)}
                </g>
                <path className={styles.selection} d={t.outline} aria-hidden="true" />
              </g>
              <text className={styles.label} x={t.x} y={t.y + 2}
                textAnchor="middle" dominantBaseline="central" aria-hidden="true">{t.n}</text>
            </g>
          )
        })}
      </svg>
      <p className={styles.hint}>
        Клик — выбрать зуб, <b>Shift + клик</b> — выделить весь диапазон между двумя зубами.
        Оранжевая рамка — выбор, заливка — назначенная работа.
      </p>
    </div>
  )
}
