'use client'

// Светлая и тёмная тема. Выбор хранится в localStorage и в куке,
// поэтому страница не «мигает» тёмным фоном при загрузке.

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { Moon, Sun } from 'lucide-react'

export type Theme = 'dark' | 'light'
const KEY = 'dental-studio-theme'
let switchTimer: number | undefined

const ThemeContext = createContext<{ theme: Theme; toggle: () => void; setTheme: (t: Theme) => void }>({
  theme: 'dark', toggle: () => {}, setTheme: () => {},
})

function apply(theme: Theme) {
  const root = document.documentElement
  root.dataset.theme = theme
  root.style.colorScheme = theme
  // Кука нужна, чтобы серверная отрисовка сразу знала тему.
  document.cookie = `${KEY}=${theme}; path=/; max-age=31536000; samesite=lax`
}

export function ThemeProvider({ children, initial }: { children: ReactNode; initial: Theme }) {
  const [theme, setThemeState] = useState<Theme>(initial)

  useEffect(() => {
    let stored: Theme | null = null
    try { stored = localStorage.getItem(KEY) as Theme | null } catch { /* приватный режим */ }
    const next = stored ?? initial
    setThemeState(next)
    apply(next)
  }, [initial])

  function setTheme(t: Theme) {
    // Переключение мгновенное: на время смены темы гасим все CSS-переходы,
    // чтобы цвета не переливались. Класс снимается почти сразу.
    const root = document.documentElement
    root.classList.add('theme-switching')
    if (switchTimer) window.clearTimeout(switchTimer)
    switchTimer = window.setTimeout(() => root.classList.remove('theme-switching'), 60)
    setThemeState(t)
    apply(t)
    try { localStorage.setItem(KEY, t) } catch { /* приватный режим */ }
  }

  function toggle() { setTheme(theme === 'dark' ? 'light' : 'dark') }

  return <ThemeContext.Provider value={{ theme, toggle, setTheme }}>{children}</ThemeContext.Provider>
}

export function useTheme() { return useContext(ThemeContext) }

/** Кнопка переключения темы для верхней панели. */
export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { theme, toggle } = useTheme()
  const next = theme === 'dark' ? 'светлую' : 'тёмную'
  return (
    <button
      type="button"
      className={compact ? 'icon-btn' : 'btn'}
      onClick={toggle}
      title={`Включить ${next} тему`}
      aria-label={`Включить ${next} тему`}
    >
      {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
      {!compact && (theme === 'dark' ? 'Светлая тема' : 'Тёмная тема')}
    </button>
  )
}
