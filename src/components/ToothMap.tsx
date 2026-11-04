'use client'

// Зубная схема только для просмотра: те же векторы, что и в форме наряда,
// но без кликов. Выбранные (то есть назначенные в наряде) зубы подсвечены
// цветом работы; остальные — базовые, приглушённые, как на референсе.

import type { CSSProperties } from 'react'
import type { Item } from '@/lib/model'
import { workOf } from '@/lib/model'
import { TOOTH_VECTORS } from '@/lib/tooth-vectors'
import styles from './ToothMap.module.css'

export default function ToothMap({
  items,
  accent,
  compact,
}: {
  items: Item[]
  /** Цвет обводки для выделенных зубов — обычно оранжевый сайта. */
  accent?: string
  compact?: boolean
}) {
  const byTooth = new Map<number, Item>()
  items.forEach((item) => byTooth.set(item.tooth, item))

  return (
    <div className={styles.wrap + (compact ? ' ' + styles.compact : '')}>
      <svg
        className={styles.svg}
        viewBox="225 8 785 1420"
        role="img"
        aria-label={`Зубная схема. Выбрано зубов: ${byTooth.size}`}
      >
        {TOOTH_VECTORS.map((t) => {
          const item = byTooth.get(t.n)
          const work = item ? workOf(item.workId) : undefined
          const picked = Boolean(item)
          const style = {
            '--crown-color': picked ? work?.color ?? 'var(--orange)' : 'var(--tooth-base)',
            '--tooth-accent': accent ?? 'var(--orange)',
          } as CSSProperties
          const transform = `translate(${t.x} ${t.y}) rotate(${t.angle}) scale(${t.mirror ? -t.w / 100 : t.w / 100} ${t.h / 100}) translate(-50 -50)`

          return (
            <g key={t.n} className={`${styles.tooth} ${picked ? styles.picked : ''}`} style={style}>
              <title>{`Зуб ${t.n} — ${work?.name ?? 'без работы'}`}</title>
              <g transform={transform}>
                <path className={styles.crown} d={t.outline} />
                <g className={styles.detail} aria-hidden="true">
                  {t.grooves.map((d, i) => <path key={i} d={d} />)}
                </g>
              </g>
              <text className={styles.label} x={t.x} y={t.y + 2}
                textAnchor="middle" dominantBaseline="central" aria-hidden="true">{t.n}</text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
