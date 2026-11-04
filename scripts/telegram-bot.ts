// ============================================================
//  Локальный Telegram-бот для Dental Studio
//  Запуск:  npm run bot
//
//  Работает через long polling (getUpdates), поэтому публичный адрес и
//  webhook не нужны — можно держать на домашнем компьютере за роутером.
//
//  Что делает:
//    1. Привязывает чат по коду из страницы «Уведомления» (/start КОД).
//    2. Каждое утро отправляет сводку о приёмах на сегодня и завтра.
//    3. Понимает команды /today, /tomorrow, /status и кнопки под сводкой.
//
//  Нужны переменные в .env.local:
//    NEXT_PUBLIC_SUPABASE_URL
//    SUPABASE_SERVICE_ROLE_KEY   ← только на этом компьютере, не в браузере
//    TELEGRAM_BOT_TOKEN
// ============================================================

// Порядок импортов важен: ws-shim подменяет WebSocket, которого нет в Node 20.
// supabase-js читает globalThis.WebSocket при загрузке, поэтому заглушка идёт первой.
import './ws-shim'

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import {
  buildDigest, buildTomorrow, localDateString, localMinutes,
  type DigestOrder, type DigestOptions,
} from '../src/lib/digest'
import { tgFetch, usingProxy, proxyUrl, explainNetworkError } from './net'

/* ---------------- Переменные окружения ---------------- */

function loadEnv() {
  for (const name of ['.env.local', '.env']) {
    try {
      const text = readFileSync(resolve(process.cwd(), name), 'utf8')
      for (const raw of text.split('\n')) {
        const line = raw.trim()
        if (!line || line.startsWith('#')) continue
        const eq = line.indexOf('=')
        if (eq < 0) continue
        const key = line.slice(0, eq).trim()
        let value = line.slice(eq + 1).trim()
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) value = value.slice(1, -1)
        if (!(key in process.env)) process.env[key] = value
      }
    } catch {
      /* файла нет — не страшно */
    }
  }
}

loadEnv()

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? ''
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
const EMAIL = process.env.SUPABASE_EMAIL ?? ''
const PASSWORD = process.env.SUPABASE_PASSWORD ?? ''

if (!BOT_TOKEN) {
  console.error('✖ Не задан TELEGRAM_BOT_TOKEN в .env.local')
  process.exit(1)
}
// Заглушки из .env.local («ВСТАВЬТЕ_...») выглядят как ключ, но им не являются.
// Кириллица в HTTP-заголовке роняет запрос невнятной ошибкой — ловим заранее.
const stub = (v: string) => !v || /ВСТАВЬТЕ|ВАШ-|PLACEHOLDER/i.test(v)

if (stub(SUPABASE_URL) || stub(SUPABASE_ANON)) {
  console.error('✖ В .env.local не хватает ключей Supabase.')
  console.error('  Нужны NEXT_PUBLIC_SUPABASE_URL и NEXT_PUBLIC_SUPABASE_ANON_KEY.')
  process.exit(1)
}
if (stub(EMAIL) || stub(PASSWORD)) {
  console.error('✖ В .env.local не хватает данных входа.')
  console.error('  Нужны SUPABASE_EMAIL и SUPABASE_PASSWORD — почта и пароль,')
  console.error('  под которыми вы входите на сайт. Это та же учётная запись,')
  console.error('  поэтому RLS пускает воркер только к вашим пациентам.')
  process.exit(1)
}

// // Воркер ходит в базу от имени вашей учётной записи, а не от service_role:
// ключ service_role обходит все RLS-политики, и держать его на диске незачем.
// Права те же, что у браузера, — только свои пациенты и свои наряды.
const db = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: { persistSession: false, autoRefreshToken: false },
})

/* ---------------- Что загрузилось ---------------- */

// Печатаем при старте то, что реально прочиталось из .env.local.
// Секреты маскируются: видно только длину и края, по ним понятно,
// подставилось значение или строка осталась пустой.
function mask(v: string, keep = 4): string {
  if (!v) return '(ПУСТО)'
  if (v.length <= keep * 2) return '*'.repeat(v.length)
  return `${v.slice(0, keep)}…${v.slice(-keep)} (${v.length} симв.)`
}

function report(): void {
  const ok = (v: string) => (v ? '✓' : '✗')
  console.log('')
  console.log('  Загружено из .env.local:')
  console.log(`   ${ok(SUPABASE_URL)} NEXT_PUBLIC_SUPABASE_URL      ${SUPABASE_URL || '(ПУСТО)'}`)
  console.log(`   ${ok(SUPABASE_ANON)} NEXT_PUBLIC_SUPABASE_ANON_KEY ${mask(SUPABASE_ANON, 8)}`)
  console.log(`   ${ok(EMAIL)} SUPABASE_EMAIL                ${EMAIL || '(ПУСТО)'}`)
  console.log(`   ${ok(PASSWORD)} SUPABASE_PASSWORD             ${mask(PASSWORD, 2)}`)
  console.log(`   ${ok(BOT_TOKEN)} TELEGRAM_BOT_TOKEN            ${mask(BOT_TOKEN, 6)}`)
  console.log('')
}

let sessionExpiresAt = 0

/** Вход по логину и паролю. Вызывается один раз при старте. */
async function signIn(): Promise<void> {
  const { data, error } = await db.auth.signInWithPassword({ email: EMAIL, password: PASSWORD })
  if (error || !data.session) {
    console.error('✖ Не удалось войти в Supabase: ' + (error?.message ?? 'сессия не создана'))
    console.error('  Проверьте SUPABASE_EMAIL и SUPABASE_PASSWORD в .env.local.')
    process.exit(1)
  }
  sessionExpiresAt = data.session.expires_at ?? 0
}

/** Продлевает сессию за 10 минут до истечения — иначе сводка упадёт ночью. */
async function ensureSession(): Promise<void> {
  const now = Math.floor(Date.now() / 1000)
  if (sessionExpiresAt && sessionExpiresAt - now > 600) return

  const { data, error } = await db.auth.refreshSession()
  if (!error && data.session) {
    sessionExpiresAt = data.session.expires_at ?? 0
    return
  }
  console.log('· сессия истекла, вхожу заново')
  await signIn()
}

const API = `https://api.telegram.org/bot${BOT_TOKEN}`

/* ---------------- Telegram API ---------------- */

type TgUpdate = {
  update_id: number
  message?: {
    message_id: number
    chat: { id: number; username?: string; first_name?: string }
    text?: string
  }
  callback_query?: {
    id: string
    data?: string
    message?: { message_id: number; chat: { id: number } }
  }
}

type InlineButton = { text: string; callback_data: string }

async function call<T>(method: string, payload?: Record<string, unknown>): Promise<T | null> {
  try {
    const res = await tgFetch(`${API}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload ?? {}),
    })
    const body = (await res.json()) as { ok: boolean; result?: T; description?: string }
    if (!body.ok) {
      console.error(`✖ ${method}: ${body.description ?? 'unknown error'}`)
      return null
    }
    return body.result ?? null
  } catch (e) {
    console.error(`✖ ${method}: ${explainNetworkError(e)}`)
    return null
  }
}

async function sendMessage(
  chatId: string | number,
  text: string,
  buttons?: InlineButton[][],
): Promise<number | null> {
  const result = await call<{ message_id: number }>('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...(buttons?.length ? { reply_markup: { inline_keyboard: buttons } } : {}),
  })
  return result?.message_id ?? null
}

/* ---------------- Данные ---------------- */

type SettingsRow = {
  user_id: string
  telegram_chat_id: string
  link_code: string
  enabled: boolean
  morning_time: string
  utc_offset_minutes: number
  notify_tomorrow: boolean
  notify_due_today: boolean
  notify_overdue: boolean
  last_sent_on: string | null
}

type OrderRow = {
  id: string
  number: number
  patient_id: string
  due_on: string
  appointment: string
  status: string
  paid: number | string
  items: { price: number }[] | null
}

function toDigestOrder(r: OrderRow): DigestOrder {
  return {
    id: r.id,
    number: r.number,
    patientId: r.patient_id,
    appointment: r.appointment ?? '',
    dueDate: r.due_on,
    status: r.status as DigestOrder['status'],
    paid: Number(r.paid ?? 0),
    items: r.items ?? [],
  }
}

async function loadUserData(userId: string) {
  await ensureSession()
  const [orders, patients] = await Promise.all([
    db.from('orders').select('id,number,patient_id,due_on,appointment,status,paid,items').eq('user_id', userId),
    db.from('patients').select('id,name').eq('user_id', userId),
  ])
  if (orders.error) throw new Error('orders: ' + orders.error.message)
  if (patients.error) throw new Error('patients: ' + patients.error.message)
  return {
    orders: ((orders.data ?? []) as OrderRow[]).map(toDigestOrder),
    patients: (patients.data ?? []) as { id: string; name: string }[],
  }
}

function optionsOf(s: SettingsRow): DigestOptions {
  return {
    utcOffsetMinutes: s.utc_offset_minutes ?? 240,
    includeTomorrow: s.notify_tomorrow,
    includeDueToday: s.notify_due_today,
    includeOverdue: s.notify_overdue,
  }
}

async function logSend(
  userId: string,
  kind: 'morning' | 'test' | 'manual' | 'tomorrow',
  chatId: string,
  ok: boolean,
  preview: string,
  error = '',
  messageId: number | null = null,
) {
  const { error: logError } = await db.from('notification_log').insert({
    user_id: userId,
    kind,
    chat_id: chatId,
    ok,
    message_id: messageId,
    preview: preview.slice(0, 900),
    error: error.slice(0, 900),
  })
  if (logError) console.error('✖ журнал:', logError.message)
}

/* ---------------- Клавиатура ---------------- */

function digestButtons(todayOrders: DigestOrder[]): InlineButton[][] {
  const rows: InlineButton[][] = todayOrders.slice(0, 6).map((o) => [
    { text: `✓ Готово · №${o.number}`, callback_data: `done:${o.id}` },
  ])
  rows.push([{ text: '📅 Показать завтра', callback_data: 'tomorrow' }])
  return rows
}

/* ---------------- Команды ---------------- */

async function settingsByChat(chatId: string): Promise<SettingsRow | null> {
  await ensureSession()
  const { data, error } = await db
    .from('notification_settings')
    .select('user_id,telegram_chat_id,link_code,enabled,morning_time,utc_offset_minutes,notify_tomorrow,notify_due_today,notify_overdue,last_sent_on')
    .eq('telegram_chat_id', chatId)
    .maybeSingle()
  if (error) console.error('✖ настройки:', error.message)
  return (data as SettingsRow | null) ?? null
}

async function handleStart(chatId: string, username: string, code: string) {
  if (!code) {
    const existing = await settingsByChat(chatId)
    if (existing) {
      await sendMessage(chatId,
        'Вы уже привязаны — сводка придёт в назначенное время.\n\n' +
        'Команды: /today — приёмы на сегодня, /tomorrow — на завтра, /status — состояние.')
    } else {
      await sendMessage(chatId,
        'Чтобы получать сводки, откройте на сайте страницу «Уведомления»,\n' +
        'нажмите «Получить код» и отправьте боту:\n\n' +
        '<code>/start ваш-код</code>\n\n' +
        `Ваш chat_id на всякий случай: <code>${chatId}</code>`)
    }
    return
  }

  await ensureSession()
  const { data: foundRow, error } = await db
    .from('notification_settings')
    .select('user_id,telegram_chat_id,link_code')
    .ilike('link_code', code)
    .maybeSingle()

  const found = foundRow as
    | { user_id: string; telegram_chat_id: string; link_code: string }
    | null

  if (error) {
    await sendMessage(chatId, 'Не удалось проверить код: ' + error.message)
    return
  }
  if (!found) {
    await sendMessage(chatId,
      'Код не подошёл или уже использован. Сгенерируйте новый на странице «Уведомления».')
    return
  }

  const { error: updateError } = await db
    .from('notification_settings')
    .update({
      telegram_chat_id: chatId,
      telegram_username: username,
      link_code: '',
    })
    .eq('user_id', found.user_id)

  if (updateError) {
    await sendMessage(chatId, 'Не удалось сохранить привязку: ' + updateError.message)
    return
  }

  console.log(`✓ Чат ${chatId} привязан к пользователю ${found.user_id}`)
  await sendMessage(chatId,
    '✅ Готово, чат привязан.\n\n' +
    'Каждое утро сюда будет приходить сводка о назначенных пациентах. ' +
    'Время и состав сводки меняются на странице «Уведомления».\n\n' +
    'Команды: /today, /tomorrow, /status')
}

async function sendToday(chatId: string, s: SettingsRow, manual: boolean) {
  try {
    const { orders, patients } = await loadUserData(s.user_id)
    const digest = buildDigest({ now: new Date(), orders, patients, options: optionsOf(s) })
    const messageId = await sendMessage(chatId, digest.text, digestButtons(digest.todayOrders))
    await logSend(s.user_id, manual ? 'manual' : 'morning', chatId, messageId !== null,
      digest.text.replace(/<[^>]+>/g, ''), messageId === null ? 'Telegram не принял сообщение' : '', messageId)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'ошибка'
    await sendMessage(chatId, 'Не удалось собрать сводку: ' + message)
    await logSend(s.user_id, manual ? 'manual' : 'morning', chatId, false, '', message)
  }
}

async function sendTomorrow(chatId: string, s: SettingsRow) {
  try {
    const { orders, patients } = await loadUserData(s.user_id)
    const { text } = buildTomorrow({ now: new Date(), orders, patients, options: optionsOf(s) })
    const messageId = await sendMessage(chatId, text)
    await logSend(s.user_id, 'tomorrow', chatId, messageId !== null,
      text.replace(/<[^>]+>/g, ''), messageId === null ? 'Telegram не принял сообщение' : '', messageId)
  } catch (e) {
    await sendMessage(chatId, 'Не удалось собрать сводку: ' + (e instanceof Error ? e.message : e))
  }
}

async function handleCallback(cb: NonNullable<TgUpdate['callback_query']>) {
  await ensureSession()
  const chatId = String(cb.message?.chat.id ?? '')
  const data = cb.data ?? ''
  await call('answerCallbackQuery', { callback_query_id: cb.id })

  if (!chatId) return
  const s = await settingsByChat(chatId)
  if (!s) {
    await sendMessage(chatId, 'Чат не привязан. Возьмите код на странице «Уведомления».')
    return
  }

  if (data === 'tomorrow') {
    await sendTomorrow(chatId, s)
    return
  }

  if (data.startsWith('done:')) {
    const orderId = data.slice(5)
    const { data: orderRow, error } = await db
      .from('orders')
      .select('number,patient_id')
      .eq('id', orderId)
      .eq('user_id', s.user_id)
      .maybeSingle()

    const order = orderRow as { number: number; patient_id: string } | null

    if (error || !order) {
      await sendMessage(chatId, 'Наряд не найден — возможно, он уже удалён.')
      return
    }

    const { error: updateError } = await db
      .from('orders')
      .update({ status: 'done' })
      .eq('id', orderId)
      .eq('user_id', s.user_id)

    if (updateError) {
      await sendMessage(chatId, 'Не удалось отметить: ' + updateError.message)
      return
    }

    const { data: patientRow } = await db
      .from('patients').select('name').eq('id', order.patient_id).maybeSingle()
    const patient = patientRow as { name: string } | null

    await sendMessage(chatId,
      `✓ Наряд №${order.number} (${patient?.name ?? 'без пациента'}) отмечен готовым.\n` +
      'Сайт подхватит изменение при следующем обновлении страницы.')
  }
}

async function handleText(chatId: string, username: string, text: string) {
  const trimmed = text.trim()
  const startMatch = /^\/start(?:@\w+)?(?:\s+(\S+))?/i.exec(trimmed)
  if (startMatch) {
    await handleStart(chatId, username, (startMatch[1] ?? '').toUpperCase())
    return
  }

  const s = await settingsByChat(chatId)
  const command = trimmed.split(/\s|@/)[0].toLowerCase()

  if (!s) {
    await sendMessage(chatId,
      'Чат пока не привязан. Откройте на сайте страницу «Уведомления», ' +
      'получите код и отправьте <code>/start ваш-код</code>.')
    return
  }

  if (command === '/today' || command === '/сегодня') {
    await sendToday(chatId, s, true)
    return
  }
  if (command === '/tomorrow' || command === '/завтра') {
    await sendTomorrow(chatId, s)
    return
  }
  if (command === '/status' || command === '/статус') {
    const next = s.enabled ? `${s.morning_time} (UTC${s.utc_offset_minutes >= 0 ? '+' : ''}${s.utc_offset_minutes / 60})` : 'выключена'
    await sendMessage(chatId,
      `<b>Состояние</b>\n` +
      `Сводка: ${next}\n` +
      `Последняя отправка: ${s.last_sent_on ?? 'ещё не было'}\n` +
      `Завтра в сводке: ${s.notify_tomorrow ? 'да' : 'нет'}\n` +
      `Сроки готовности: ${s.notify_due_today ? 'да' : 'нет'}\n` +
      `Просроченные: ${s.notify_overdue ? 'да' : 'нет'}`)
    return
  }

  await sendMessage(chatId,
    'Команды:\n' +
    '/today — приёмы на сегодня\n' +
    '/tomorrow — приёмы на завтра\n' +
    '/status — состояние рассылки\n\n' +
    'Настройки меняются на сайте, страница «Уведомления».')
}

/* ---------------- Планировщик утренней сводки ---------------- */

// Сколько минут после назначенного времени ещё считаем сводку актуальной.
const GRACE_MINUTES = 4 * 60

let schedulerBusy = false

async function tickScheduler() {
  if (schedulerBusy) return
  schedulerBusy = true
  try {
    await ensureSession()
    const { data, error } = await db
      .from('notification_settings')
      .select('user_id,telegram_chat_id,link_code,enabled,morning_time,utc_offset_minutes,notify_tomorrow,notify_due_today,notify_overdue,last_sent_on')
      .eq('enabled', true)
      .neq('telegram_chat_id', '')

    if (error) {
      console.error('✖ планировщик:', error.message)
      return
    }

    const now = new Date()
    for (const s of (data ?? []) as SettingsRow[]) {
      const today = localDateString(now, s.utc_offset_minutes)
      if (s.last_sent_on === today) continue

      const [h, m] = s.morning_time.split(':').map(Number)
      const due = h * 60 + m
      const current = localMinutes(now, s.utc_offset_minutes)

      // Часовой пояс лаборатории может уйти вперёд — сравниваем в локальных минутах.
      if (current < due) continue

      // Если компьютер был выключен всё утро, не присылаем сводку поздно вечером:
      // окно — 4 часа после назначенного времени. Иначе просто ждём завтра.
      if (current > due + GRACE_MINUTES) {
        console.log(`· пропуск для ${s.telegram_chat_id}: ${current - due} мин после ${s.morning_time}, окно истекло`)
        continue
      }

      // Защита от двойной отправки: занимаем «сегодня» до отправки.
      const { error: claimError } = await db
        .from('notification_settings')
        .update({ last_sent_on: today })
        .eq('user_id', s.user_id)
        .or(`last_sent_on.is.null,last_sent_on.lt.${today}`)

      if (claimError) {
        console.error('✖ отметка отправки:', claimError.message)
        continue
      }

      console.log(`→ утренняя сводка для ${s.telegram_chat_id}`)
      await sendToday(s.telegram_chat_id, s, false)
    }
  } finally {
    schedulerBusy = false
  }
}

/* ---------------- Long polling ---------------- */

let offset = 0
let running = true

async function poll() {
  while (running) {
    try {
      const res = await tgFetch(`${API}/getUpdates?timeout=30&offset=${offset}`, {
        method: 'GET',
      })
      const body = (await res.json()) as { ok: boolean; result?: TgUpdate[]; description?: string }
      if (!body.ok) {
        console.error('✖ getUpdates:', body.description)
        await sleep(5000)
        continue
      }

      for (const update of body.result ?? []) {
        offset = Math.max(offset, update.update_id + 1)
        try {
          const chatId = update.message ? String(update.message.chat.id) : ''
          if (update.message?.text && chatId) {
            await handleText(chatId, update.message.chat.username ?? '', update.message.text)
          } else if (update.callback_query) {
            await handleCallback(update.callback_query)
          }
        } catch (e) {
          console.error('✖ обработка обновления:', e instanceof Error ? e.message : e)
        }
      }
    } catch (e) {
      console.error('✖ сеть:', e instanceof Error ? e.message : e)
      await sleep(5000)
    }
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

/* ---------------- Запуск ---------------- */

async function main() {
  report()
  await signIn()

  const me = await call<{ username: string }>('getMe')
  if (!me) {
    console.error('')
    console.error('✖ Не удалось связаться с Telegram.')
    console.error('  Токен тут ни при чём — до api.telegram.org нет доступа.')
    console.error('')
    if (usingProxy) {
      console.error(`  Прокси указан: ${proxyUrl}`)
      console.error('  Но соединение не прошло. Проверьте, что прокси запущен:')
      console.error('    npm run net')
    } else {
      console.error('  Прокси не указан. Два варианта:')
      console.error('    1) Включите VPN в режиме, пропускающем весь трафик')
      console.error('       (Global / TUN / Режим VPN), затем запустите заново.')
      console.error('    2) Укажите прокси явно в .env.local:')
      console.error('       TELEGRAM_PROXY=http://127.0.0.1:1087')
      console.error('       Порт смотрите: Системные настройки → Сеть → Подробнее → Прокси.')
    }
    console.error('')
    console.error('  Проверка сети: npm run net')
    process.exit(1)
  }

  // Если когда-то был установлен webhook, getUpdates вернёт 409 — снимаем его.
  await call('deleteWebhook', { drop_pending_updates: false })

  console.log(`✓ Бот @${me.username} запущен. Ctrl+C — остановить.`)
  console.log('  Планировщик проверяет расписание каждые 30 секунд.')

  void poll()
  const timer = setInterval(() => void tickScheduler(), 30000)
  void tickScheduler()

  const stop = () => {
    running = false
    clearInterval(timer)
    console.log('\nБот остановлен.')
    process.exit(0)
  }
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
}

void main()
