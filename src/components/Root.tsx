'use client'

// Корневая оболочка. Тема и сессия живут на клиенте,
// потому что сервер не знает о входе пользователя.
// Страницы сами решают, показывать данные или экран входа.

import type { ReactNode } from 'react'
import { ThemeProvider, type Theme } from './Theme'
import { StoreProvider } from './Store'
import Parallax from './Parallax'

export default function Root({ children, initialTheme }: { children: ReactNode; initialTheme: Theme }) {
  return (
    <ThemeProvider initial={initialTheme}>
      <StoreProvider>
        <Parallax />
        {children}
      </StoreProvider>
    </ThemeProvider>
  )
}
