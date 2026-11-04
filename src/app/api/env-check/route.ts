// GET /api/env-check — диагностика окружения.
//
// Открыть в браузере: http://localhost:3001/api/env-check
// Маршрут выполняется на СЕРВЕРЕ, поэтому показывает именно то, что
// прочитал dev-сервер при старте. Если здесь пусто, а в файле значения есть —
// значит сервер запущен раньше, чем файл появился.
//
// Секретов не раскрывает: ключ не отдаётся, только длина и первые символы.

import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
  const bot = process.env.TELEGRAM_BOT_TOKEN ?? ''
  const email = process.env.SUPABASE_EMAIL ?? ''

  let projectRef = ''
  try {
    const payload = JSON.parse(Buffer.from(key.split('.')[1] ?? '', 'base64').toString())
    projectRef = String(payload.ref ?? '')
  } catch {
    projectRef = '(ключ не похож на JWT)'
  }

  const problems: string[] = []
  if (!url) problems.push('NEXT_PUBLIC_SUPABASE_URL не виден серверу')
  if (!key) problems.push('NEXT_PUBLIC_SUPABASE_ANON_KEY не виден серверу')
  if (url && !url.startsWith('https://')) problems.push('URL не начинается с https://')
  if (key && !key.startsWith('eyJ')) problems.push('ключ не начинается с eyJ')
  if (!bot) problems.push('TELEGRAM_BOT_TOKEN не виден серверу')
  if (!email) problems.push('SUPABASE_EMAIL не виден серверу')

  return NextResponse.json({
    ok: problems.length === 0,
    вывод: problems.length ? problems : 'ок — переменные загружены, можно открывать сайт',
    supabaseUrl: url || '(пусто)',
    anonKey: key ? `есть, длина ${key.length}, начало ${key.slice(0, 12)}…` : '(пусто)',
    projectRef: projectRef || '(не определён)',
    telegramBot: bot ? `есть, длина ${bot.length}` : '(пусто)',
    email: email || '(пусто)',
    node: process.version,
    // Подсказка, если файл не подхватился
    напоминание: problems.length
      ? 'Остановите сервер (Ctrl+C), удалите папку .next, запустите npm run dev заново.'
      : 'Ничего делать не нужно.',
  })
}
