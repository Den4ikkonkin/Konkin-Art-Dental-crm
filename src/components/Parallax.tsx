'use client'

// Параллакс для плиток: блик и лёгкий наклон следуют за курсором.
//
// Как работает: один слушатель на весь документ, а не по одному на карточку.
// Находим ближайшую плитку под курсором и записываем в неё две переменные:
//   --px, --py — положение курсора внутри плитки, от 0 до 1.
// Стили читают эти переменные и сдвигают блик, а также наклоняют плитку
// на пару градусов. Отсюда ощущение глубины: свет и перспектива меняются
// так, будто плитка объёмная.
//
// Отключается само при системной настройке «меньше движения» и на сенсорных
// экранах, где курсора нет.

import { useEffect } from 'react'

const SELECTOR = '.order-card, .oc-card, .calendar-day'

export default function Parallax() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    if (window.matchMedia('(hover: none)').matches) return

    let active: HTMLElement | null = null

    const clear = (el: HTMLElement | null) => {
      if (!el) return
      el.classList.remove('tilt')
      el.style.removeProperty('--px')
      el.style.removeProperty('--py')
    }

    const onMove = (event: PointerEvent) => {
      const target = event.target as Element | null
      const tile = (target?.closest?.(SELECTOR) as HTMLElement | null) ?? null

      if (tile !== active) {
        clear(active)
        active = tile
      }
      if (!tile) return

      const rect = tile.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return

      // Координаты внутри самой карточки: блик и наклон принадлежат ей, а не курсору.
      const px = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
      const py = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height))
      tile.style.setProperty('--px', px.toFixed(3))
      tile.style.setProperty('--py', py.toFixed(3))
      tile.classList.add('tilt')
    }

    const onLeave = () => {
      clear(active)
      active = null
    }

    document.addEventListener('pointermove', onMove, { passive: true })
    document.addEventListener('pointerdown', onMove, { passive: true })
    window.addEventListener('blur', onLeave)

    return () => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerdown', onMove)
      window.removeEventListener('blur', onLeave)
      clear(active)
    }
  }, [])

  return null
}
