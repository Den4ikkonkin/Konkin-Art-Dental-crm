import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import './globals.css'
import '@/components/premium.css'
import './theme-glass.css'
import './fixes.css'
// Мобильный слой — последним: перекрывает базовые стили без !important.
import './mobile.css'
// Tailwind только для компонентов shadcn. Стоит последним, чтобы утилиты
// перебивали общие правила, но preflight (сброс браузера) не подключён —
// он бы поменял отступы и рамки по всему интерфейсу.
import '@/styles/tailwind.css'
import type { Theme } from '@/components/Theme'
import Root from '@/components/Root'
import Gate from '@/components/Gate'

export const metadata: Metadata = {
  title: 'Konkin Art Dental — CRM лаборатории',
  description: 'Наряды, пациенты, материалы и аналитика стоматологической лаборатории Konkin Art Dental',
  applicationName: 'Konkin Art Dental',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'Konkin Art Dental',
    statusBarStyle: 'black-translucent',
  },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/icon-192.png', sizes: '192x192' }],
  },
  robots: { index: false, follow: false },
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#0d1014',
}

// Тема берётся из куки уже на сервере: светлый режим не «мигает» тёмным фоном.
const THEME_KEY = 'dental-studio-theme'

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const store = await cookies()
  const initialTheme: Theme = store.get(THEME_KEY)?.value === 'light' ? 'light' : 'dark'

  return (
    <html lang="ru" data-theme={initialTheme} style={{ colorScheme: initialTheme }}>
      <body>
        <div className="app-bg" aria-hidden="true" />
        <Root initialTheme={initialTheme}>
          <Gate>{children}</Gate>
        </Root>
      </body>
    </html>
  )
}
