'use client'

// Круглая аватарка сотрудника.
//
// Почему картинка из public/team, а не из Supabase Storage: фото меняются
// раз в год, а не каждый день. Статика грузится мгновенно, работает без
// сети до Supabase и не требует ещё одной RLS-политики. Если файла нет —
// рисуем инициалы на фоне, цвет которого зависит от имени. Пользователь
// никогда не увидит «битую картинку».

import { useState } from 'react'
import styles from './Avatar.module.css'

type Props = {
  /** Путь вида /team/denis.png. Пусто — сразу инициалы. */
  src?: string
  /** Имя для инициалов и подсказки при наведении. */
  name: string
  /**
   * Диаметр в пикселях. Если не указан, размер задаёт родитель через
   * className (width + aspect-ratio): так аватарка подстраивается под
   * ширину экрана, а не торчит из неё фиксированным квадратом.
   */
  size?: number
  className?: string
}

/** Первые буквы слов: «Владислав Ижерский» → «ВИ». */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

/** Стабильный оттенок по имени: у одного человека он не меняется. */
function hue(name: string): number {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360
  return h
}

export default function Avatar({ src, name, size, className }: Props) {
  const [broken, setBroken] = useState(false)
  const showImage = Boolean(src) && !broken
  const label = initials(name)

  return (
    <span
      className={[styles.avatar, className].filter(Boolean).join(' ')}
      style={{
        // Фиксированный размер — только если родитель его попросил.
        ...(size ? { width: size, height: size } : null),
        ...(size
          ? { fontSize: Math.max(10, Math.round(size * 0.34)) }
          : null),
        // Фон нужен только инициалам; картинка перекрывает его собой.
        background: showImage ? undefined : `hsl(${hue(name || '?')} 42% 38%)`,
      }}
      title={name}
      role="img"
      aria-label={name}
    >
      {showImage ? (
        <img
          src={src}
          alt=""
          onError={() => setBroken(true)}
          loading="lazy"
          decoding="async"
        />
      ) : (
        label
      )}
    </span>
  )
}
