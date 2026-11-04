// Доступ к настройкам уведомлений и журналу отправок со страницы /notifications.
// Как и db.ts, это единственное место, где страница говорит с Supabase напрямую.
// Доступ к строкам ограничивают RLS-политики из миграции 0002.

import { supabase } from './supabase'

export type NotificationSettings = {
  chatId: string
  username: string
  linkCode: string
  enabled: boolean
  morningTime: string // 'HH:MM'
  utcOffsetMinutes: number
  notifyTomorrow: boolean
  notifyDueToday: boolean
  notifyOverdue: boolean
  lastSentOn: string | null
}

export type LogEntry = {
  id: string
  kind: 'morning' | 'test' | 'manual' | 'tomorrow'
  chatId: string
  ok: boolean
  preview: string
  error: string
  sentAt: string
}

type SettingsRow = {
  telegram_chat_id: string
  telegram_username: string
  link_code: string
  enabled: boolean
  morning_time: string
  utc_offset_minutes: number
  notify_tomorrow: boolean
  notify_due_today: boolean
  notify_overdue: boolean
  last_sent_on: string | null
}

const SETTINGS_COLUMNS =
  'telegram_chat_id,telegram_username,link_code,enabled,morning_time,' +
  'utc_offset_minutes,notify_tomorrow,notify_due_today,notify_overdue,last_sent_on'

export const DEFAULT_SETTINGS: NotificationSettings = {
  chatId: '',
  username: '',
  linkCode: '',
  enabled: true,
  morningTime: '08:00',
  utcOffsetMinutes: 240, // Самара, UTC+4
  notifyTomorrow: true,
  notifyDueToday: false,
  notifyOverdue: false,
  lastSentOn: null,
}

function toSettings(r: SettingsRow): NotificationSettings {
  return {
    chatId: r.telegram_chat_id ?? '',
    username: r.telegram_username ?? '',
    linkCode: r.link_code ?? '',
    enabled: r.enabled,
    // Postgres отдаёт time как '08:00:00' — обрезаем секунды
    morningTime: (r.morning_time ?? '08:00').slice(0, 5),
    utcOffsetMinutes: r.utc_offset_minutes ?? 240,
    notifyTomorrow: r.notify_tomorrow,
    notifyDueToday: r.notify_due_today,
    notifyOverdue: r.notify_overdue,
    lastSentOn: r.last_sent_on,
  }
}

/** Код привязки: 6 символов без похожих друг на друга (0/O, 1/I/L). */
export function makeLinkCode(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
  let out = ''
  const bytes = new Uint8Array(6)
  crypto.getRandomValues(bytes)
  for (const b of bytes) out += alphabet[b % alphabet.length]
  return out
}

export async function loadSettings(userId: string): Promise<NotificationSettings> {
  const { data, error } = await supabase
    .from('notification_settings')
    .select(SETTINGS_COLUMNS)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw new Error('Не удалось загрузить настройки уведомлений: ' + error.message)
  if (!data) return DEFAULT_SETTINGS
  return toSettings(data as unknown as SettingsRow)
}

/** Сохраняет настройки целиком через upsert (строка одна на пользователя). */
export async function saveSettings(
  userId: string,
  s: NotificationSettings,
): Promise<NotificationSettings> {
  const { data, error } = await supabase
    .from('notification_settings')
    .upsert(
      {
        user_id: userId,
        telegram_chat_id: s.chatId,
        telegram_username: s.username,
        link_code: s.linkCode,
        enabled: s.enabled,
        morning_time: s.morningTime.length === 5 ? `${s.morningTime}:00` : s.morningTime,
        utc_offset_minutes: s.utcOffsetMinutes,
        notify_tomorrow: s.notifyTomorrow,
        notify_due_today: s.notifyDueToday,
        notify_overdue: s.notifyOverdue,
      },
      { onConflict: 'user_id' },
    )
    .select(SETTINGS_COLUMNS)
    .single()

  if (error) throw new Error('Не удалось сохранить настройки: ' + error.message)
  return toSettings(data as unknown as SettingsRow)
}

/** Отвязывает Telegram: чат сбрасывается, новый код выдаётся отдельно. */
export async function unlinkChat(userId: string, s: NotificationSettings) {
  return saveSettings(userId, { ...s, chatId: '', username: '' })
}

export async function loadLog(userId: string, limit = 30): Promise<LogEntry[]> {
  const { data, error } = await supabase
    .from('notification_log')
    .select('id,kind,chat_id,ok,preview,error,sent_at')
    .eq('user_id', userId)
    .order('sent_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error('Не удалось загрузить журнал: ' + error.message)
  return (data as unknown as {
    id: string
    kind: LogEntry['kind']
    chat_id: string
    ok: boolean
    preview: string
    error: string
    sent_at: string
  }[]).map((r) => ({
    id: r.id,
    kind: r.kind,
    chatId: r.chat_id,
    ok: r.ok,
    preview: r.preview,
    error: r.error,
    sentAt: r.sent_at,
  }))
}

/**
 * Тестовая отправка. Ключ бота живёт только на сервере, поэтому идём через
 * /api/telegram/test и передаём access token пользователя — маршрут проверит его
 * и прочитает настройки под теми же RLS-правилами.
 */
export async function sendTest(accessToken: string): Promise<string> {
  const res = await fetch('/api/telegram/test', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
  if (!res.ok || !body.ok) throw new Error(body.error || 'Не удалось отправить сообщение')
  return 'Отправлено — проверьте Telegram.'
}
