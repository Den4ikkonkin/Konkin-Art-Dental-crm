'use client'

// Пользовательские цвета интерфейса.
//
// Как работает:
//   1. Палитра хранится в таблице app_theme (одна строка на всё приложение).
//   2. При загрузке цвета применяются как CSS-переменные на <html>.
//   3. Переменные инлайновые, поэтому перебивают :root и html[data-theme].
//   4. Меняет цвета только администратор; остальные видят результат.
//
// Если таблицы ещё нет (миграция не выполнена) — молча работаем на
// заводских цветах. Ошибка сети не должна ломать интерфейс.

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { useTheme } from './Theme'
import {
  DARK_DEFAULT, LIGHT_DEFAULT, normalizePalette, type ThemePalette,
} from '@/lib/brand'

type BrandContext = {
  dark: ThemePalette
  light: ThemePalette
  loading: boolean
  saving: boolean
  error: string
  save: (next: { dark: ThemePalette; light: ThemePalette }) => Promise<void>
  reset: () => Promise<void>
  reload: () => Promise<void>
}

const Brand = createContext<BrandContext | null>(null)

const TABLE = 'app_theme'

function applyPalette(palette: ThemePalette, defaults: ThemePalette) {
  const root = document.documentElement
  for (const key of Object.keys(palette) as (keyof ThemePalette)[]) {
    const value = palette[key]
    const fallback = defaults[key]
    // Совпадает с заводским — снимаем инлайновое значение, чтобы
    // работали правила темы из CSS.
    if (value.toLowerCase() === fallback.toLowerCase()) {
      root.style.removeProperty(`--${key}`)
    } else {
      root.style.setProperty(`--${key}`, value)
    }
  }
}

export function BrandProvider({ children }: { children: ReactNode }) {
  const { theme } = useTheme()
  const [dark, setDark] = useState<ThemePalette>(DARK_DEFAULT)
  const [light, setLight] = useState<ThemePalette>(LIGHT_DEFAULT)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const reload = useCallback(async () => {
    try {
      const { data, error: dbError } = await supabase
        .from(TABLE)
        .select('dark,light')
        .eq('id', 1)
        .maybeSingle()

      // Таблицы нет или RLS не пускает — остаёмся на заводских цветах.
      if (dbError) return

      if (data) {
        setDark(normalizePalette((data as { dark?: unknown }).dark, DARK_DEFAULT))
        setLight(normalizePalette((data as { light?: unknown }).light, LIGHT_DEFAULT))
      }
    } catch {
      // Сеть недоступна — не показываем ошибку, интерфейс работает дальше.
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void reload() }, [reload])

  // Перекрашиваем при смене темы и при изменении палитры.
  useEffect(() => {
    applyPalette(theme === 'dark' ? dark : light, theme === 'dark' ? DARK_DEFAULT : LIGHT_DEFAULT)
  }, [theme, dark, light])

  const save = useCallback(async (next: { dark: ThemePalette; light: ThemePalette }) => {
    setSaving(true)
    setError('')
    try {
      const { error: dbError } = await supabase.from(TABLE).upsert(
        {
          id: 1,
          dark: next.dark,
          light: next.light,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' },
      )
      if (dbError) throw new Error(dbError.message)
      setDark(next.dark)
      setLight(next.light)
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Не удалось сохранить цвета'
      setError(
        /relation .* does not exist/i.test(message)
          ? 'Таблица app_theme не создана. Выполните миграцию 0013_theme.sql в Supabase.'
          : message,
      )
      throw e
    } finally {
      setSaving(false)
    }
  }, [])

  const reset = useCallback(async () => {
    await save({ dark: DARK_DEFAULT, light: LIGHT_DEFAULT })
  }, [save])

  return (
    <Brand.Provider value={{ dark, light, loading, saving, error, save, reset, reload }}>
      {children}
    </Brand.Provider>
  )
}

export function useBrand(): BrandContext {
  const context = useContext(Brand)
  if (!context) throw new Error('useBrand используется вне BrandProvider')
  return context
}
