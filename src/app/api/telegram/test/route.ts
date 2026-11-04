// POST /api/telegram/test — отправляет сводку в Telegram прямо сейчас.
//
// Ключ бота (TELEGRAM_BOT_TOKEN) живёт только на сервере: он не начинается с
// NEXT_PUBLIC_ и в браузер не попадает. Пользователь передаёт свой access token,
// мы проверяем его через Supabase Auth и дальше читаем настройки и наряды
// под его правами — то есть RLS работает так же, как в браузере.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { buildDigest } from '@/lib/digest'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type SettingsRow = {
  telegram_chat_id: string
  morning_time: string
  utc_offset_minutes: number
  notify_tomorrow: boolean
  notify_due_today: boolean
  notify_overdue: boolean
}

export async function POST(request: Request) {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!token) {
    return NextResponse.json(
      { ok: false, error: 'В .env.local не задан TELEGRAM_BOT_TOKEN. Перезапустите npm run dev после правки.' },
      { status: 500 },
    )
  }
  if (!url || !anon) {
    return NextResponse.json({ ok: false, error: 'Не настроено подключение к Supabase' }, { status: 500 })
  }

  const header = request.headers.get('authorization') ?? ''
  const accessToken = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!accessToken) {
    return NextResponse.json({ ok: false, error: 'Нужен вход в приложение' }, { status: 401 })
  }

  // Клиент с токеном пользователя: все запросы идут от его имени, RLS включён.
  const db = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: userData, error: userError } = await db.auth.getUser(accessToken)
  if (userError || !userData.user) {
    return NextResponse.json({ ok: false, error: 'Сессия истекла, войдите заново' }, { status: 401 })
  }

  const { data: settings, error: settingsError } = await db
    .from('notification_settings')
    .select('telegram_chat_id,morning_time,utc_offset_minutes,notify_tomorrow,notify_due_today,notify_overdue')
    .eq('user_id', userData.user.id)
    .maybeSingle()

  if (settingsError) {
    return NextResponse.json(
      { ok: false, error: 'Не удалось прочитать настройки: ' + settingsError.message },
      { status: 500 },
    )
  }
  const row = settings as SettingsRow | null
  if (!row?.telegram_chat_id) {
    return NextResponse.json(
      { ok: false, error: 'Сначала привяжите чат: отправьте боту код привязки' },
      { status: 400 },
    )
  }

  const [orders, patients] = await Promise.all([
    db.from('orders').select('id,number,patient_id,created_on,due_on,appointment,status,paid,items')
      .eq('user_id', userData.user.id),
    db.from('patients').select('id,name').eq('user_id', userData.user.id),
  ])

  if (orders.error || patients.error) {
    return NextResponse.json(
      { ok: false, error: 'Не удалось прочитать наряды: ' + (orders.error ?? patients.error)!.message },
      { status: 500 },
    )
  }

  const digest = buildDigest({
    now: new Date(),
    orders: (orders.data ?? []).map((o) => ({
      id: o.id as string,
      number: o.number as number,
      patientId: o.patient_id as string,
      appointment: (o.appointment as string) ?? '',
      dueDate: o.due_on as string,
      status: o.status as 'new' | 'in_progress' | 'done',
      paid: Number(o.paid ?? 0),
      items: (o.items as { price: number }[]) ?? [],
    })),
    patients: (patients.data ?? []).map((p) => ({ id: p.id as string, name: p.name as string })),
    options: {
      utcOffsetMinutes: row.utc_offset_minutes ?? 240,
      includeTomorrow: row.notify_tomorrow,
      includeDueToday: row.notify_due_today,
      includeOverdue: row.notify_overdue,
    },
  })

  const text = '🧪 <i>Проверка связи</i>\n\n' + digest.text

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: row.telegram_chat_id,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    })
    const body = (await res.json()) as { ok: boolean; result?: { message_id: number }; description?: string }
    if (!body.ok) throw new Error(body.description ?? 'Telegram отклонил сообщение')

    await db.from('notification_log').insert({
      user_id: userData.user.id,
      kind: 'test',
      chat_id: row.telegram_chat_id,
      ok: true,
      message_id: body.result?.message_id ?? null,
      preview: text.replace(/<[^>]+>/g, '').slice(0, 400),
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Ошибка отправки'
    await db.from('notification_log').insert({
      user_id: userData.user.id,
      kind: 'test',
      chat_id: row.telegram_chat_id,
      ok: false,
      error: message.slice(0, 900),
    })
    return NextResponse.json({ ok: false, error: message }, { status: 502 })
  }
}
