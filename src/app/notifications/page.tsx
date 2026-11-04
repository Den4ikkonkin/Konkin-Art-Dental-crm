'use client'

// Страница «Уведомления»: журнал отправок сверху, настройки бота снизу.
// Данные читаются и пишутся напрямую в Supabase под RLS текущего пользователя;
// тестовая отправка идёт через серверный маршрут, потому что там лежит ключ бота.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useStore } from '@/components/Store'
import { Heading, Field } from '@/components/UI'
import {
  DEFAULT_SETTINGS, loadLog, loadSettings, makeLinkCode, saveSettings,
  sendTest, unlinkChat,
  type LogEntry, type NotificationSettings,
} from '@/lib/notifications'
import {
  buildDigest, buildTomorrow, localDateString,
} from '@/lib/digest'
import {
  BellRing, Bot, Check, Copy, Link2, Loader2, PlayCircle, RefreshCw,
  Save, Send, Trash2,
} from 'lucide-react'

const OFFSETS: [number, string][] = [
  [-180, 'UTC−3 · Калининград'],
  [180, 'UTC+3 · Москва'],
  [240, 'UTC+4 · Самара'],
  [300, 'UTC+5 · Екатеринбург'],
  [360, 'UTC+6 · Омск'],
  [420, 'UTC+7 · Красноярск'],
  [480, 'UTC+8 · Иркутск'],
  [540, 'UTC+9 · Якутск'],
  [600, 'UTC+10 · Владивосток'],
  [660, 'UTC+11 · Магадан'],
  [720, 'UTC+12 · Камчатка'],
]

const KIND_LABEL: Record<LogEntry['kind'], string> = {
  morning: 'Утренняя сводка',
  test: 'Проверка',
  manual: 'Вручную',
  tomorrow: 'На завтра',
}

export default function Page() {
  const { data, session } = useStore()
  const userId = session?.user.id ?? ''

  const [settings, setSettings] = useState<NotificationSettings>(DEFAULT_SETTINGS)
  const [log, setLog] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState('')
  const [copied, setCopied] = useState(false)
  const [preview, setPreview] = useState(false)

  const pull = useCallback(async () => {
    if (!userId) {
      setLoading(false)
      return
    }
    try {
      const [s, l] = await Promise.all([loadSettings(userId), loadLog(userId)])
      setSettings(s)
      setLog(l)
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Не удалось загрузить настройки'
      // Таблиц ещё нет — значит миграция 0002 не запущена.
      setNotice(
        /relation|does not exist|schema cache/i.test(message)
          ? 'В базе нет таблиц уведомлений. Запустите supabase/migrations/0002_notifications.sql в SQL Editor.'
          : message,
      )
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => { void pull() }, [pull])

  // Превью сводки строится тем же модулем, что и у бота, — расхождений не будет.
  const digest = useMemo(
    () => buildDigest({
      now: new Date(),
      orders: data.orders,
      patients: data.patients,
      options: {
        utcOffsetMinutes: settings.utcOffsetMinutes,
        includeTomorrow: settings.notifyTomorrow,
        includeDueToday: settings.notifyDueToday,
        includeOverdue: settings.notifyOverdue,
      },
    }),
    [data.orders, data.patients, settings],
  )

  const tomorrowText = useMemo(
    () => buildTomorrow({
      now: new Date(),
      orders: data.orders,
      patients: data.patients,
      options: {
        utcOffsetMinutes: settings.utcOffsetMinutes,
        includeTomorrow: true,
        includeDueToday: false,
        includeOverdue: false,
      },
    }).text,
    [data.orders, data.patients, settings.utcOffsetMinutes],
  )

  const today = localDateString(new Date(), settings.utcOffsetMinutes)

  async function save(next: NotificationSettings, message: string) {
    if (!userId) return
    setBusy('save')
    try {
      const saved = await saveSettings(userId, next)
      setSettings(saved)
      setNotice(message)
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Ошибка сохранения')
    } finally {
      setBusy('')
    }
  }

  async function regenerate() {
    const code = makeLinkCode()
    await save({ ...settings, linkCode: code, chatId: '', username: '' },
      'Новый код готов. Отправьте его боту — прежняя привязка сброшена.')
  }

  async function test() {
    if (!session) return
    setBusy('test')
    setNotice('')
    try {
      const msg = await sendTest(session.access_token)
      setNotice(msg)
      await pull()
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Не удалось отправить')
    } finally {
      setBusy('')
    }
  }

  async function unlink() {
    if (!confirm('Отвязать Telegram? Сводки перестанут приходить, пока не привяжете снова.')) return
    setBusy('unlink')
    try {
      const next = await unlinkChat(userId, settings)
      setSettings(next)
      setNotice('Telegram отвязан. Код привязки остался прежним.')
    } finally {
      setBusy('')
    }
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(settings.linkCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      setNotice('Браузер не дал скопировать. Выделите код вручную.')
    }
  }

  const linked = Boolean(settings.chatId)

  return (
    <>
      <Heading
        title="Уведомления"
        sub="Утренняя сводка о назначенных пациентах приходит в Telegram. Здесь — журнал отправок и настройки бота."
        action={
          <button type="button" className="btn" onClick={() => void pull()} disabled={loading}>
            <RefreshCw size={17} className={loading ? 'spin' : ''} /> Обновить
          </button>
        }
      />

      {notice && <div className="note" role="status">{notice}</div>}

      {/* ---------------- Журнал ---------------- */}
      <section className="panel">
        <div className="panel-heading">
          <h2><BellRing size={17} className="inline-icon" /> Журнал отправок</h2>
          <span className="badge">{log.length}</span>
        </div>

        {loading ? (
          <div className="empty">Загрузка журнала…</div>
        ) : log.length === 0 ? (
          <div className="empty">
            Отправок ещё не было. Настройте бота ниже и нажмите «Проверить отправку».
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Когда</th>
                  <th>Тип</th>
                  <th>Статус</th>
                  <th>Текст</th>
                </tr>
              </thead>
              <tbody>
                {log.map((e) => (
                  <tr key={e.id}>
                    <td className="nowrap">
                      {new Date(e.sentAt).toLocaleString('ru-RU', {
                        day: '2-digit', month: '2-digit', year: '2-digit',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </td>
                    <td>{KIND_LABEL[e.kind] ?? e.kind}</td>
                    <td>
                      <span className={'status ' + (e.ok ? 'done' : 'new')}>
                        {e.ok ? 'Доставлено' : 'Ошибка'}
                      </span>
                    </td>
                    <td>
                      <span className="muted small">
                        {(e.ok ? e.preview : e.error).slice(0, 140) || '—'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="notif-grid">
        {/* ---------------- Подключение бота ---------------- */}
        <section className="panel">
          <div className="panel-heading">
            <h2><Bot size={17} className="inline-icon" /> Telegram-бот</h2>
            <span className={`status ${linked ? 'done' : 'new'}`}>
              {linked ? 'Привязан' : 'Не привязан'}
            </span>
          </div>

          <p className="muted">
            Создайте бота у <b>@BotFather</b> и вставьте его токен в файл <code>.env.local</code>{' '}
            как <code>TELEGRAM_BOT_TOKEN</code>. Затем отправьте боту код ниже — он запомнит ваш чат.
          </p>

          <div className="link-box">
            <div>
              <span className="muted small">Код привязки</span>
              <strong className="link-code">{settings.linkCode || '—'}</strong>
            </div>
            <div className="row">
              <button type="button" className="btn small" onClick={() => void copyCode()}
                disabled={!settings.linkCode}>
                {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Скопирован' : 'Копировать'}
              </button>
              <button type="button" className="btn small" onClick={() => void regenerate()}
                disabled={busy === 'save'}>
                <Link2 size={14} /> {settings.linkCode ? 'Новый код' : 'Получить код'}
              </button>
            </div>
          </div>

          <p className="muted small">
            В Telegram: <code>/start {settings.linkCode || 'КОД'}</code>. Код одноразовый —
            после привязки он сбрасывается.
          </p>

          {linked && (
            <div className="field-row">
              <div>
                <span className="muted small">Чат</span>
                <div>{settings.username ? '@' + settings.username : settings.chatId}</div>
              </div>
              <button type="button" className="btn small danger" onClick={() => void unlink()}
                disabled={busy === 'unlink'}>
                <Trash2 size={14} /> Отвязать
              </button>
            </div>
          )}

          <button type="button" className="btn full" onClick={() => void test()}
            disabled={!linked || busy === 'test'}>
            {busy === 'test'
              ? <><Loader2 size={16} className="spin" /> Отправляю…</>
              : <><Send size={16} /> Проверить отправку</>}
          </button>
          {!linked && <p className="muted small">Кнопка станет активной после привязки чата.</p>}
        </section>

        {/* ---------------- Расписание ---------------- */}
        <section className="panel">
          <div className="panel-heading">
            <h2><PlayCircle size={17} className="inline-icon" /> Расписание</h2>
          </div>

          <div className="field-pair">
            <Field label="Время сводки">
              <input
                type="time"
                value={settings.morningTime}
                onChange={(e) => setSettings({ ...settings, morningTime: e.target.value })}
              />
            </Field>
            <Field label="Часовой пояс">
              <select
                value={settings.utcOffsetMinutes}
                onChange={(e) => setSettings({ ...settings, utcOffsetMinutes: Number(e.target.value) })}
              >
                {OFFSETS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
              </select>
            </Field>
          </div>

          <label className="checkbox">
            <input type="checkbox" checked={settings.enabled}
              onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })} />
            <span>Сводка включена</span>
          </label>
          <label className="checkbox">
            <input type="checkbox" checked={settings.notifyTomorrow}
              onChange={(e) => setSettings({ ...settings, notifyTomorrow: e.target.checked })} />
            <span>Показывать приёмы на завтра</span>
          </label>
          <label className="checkbox">
            <input type="checkbox" checked={settings.notifyDueToday}
              onChange={(e) => setSettings({ ...settings, notifyDueToday: e.target.checked })} />
            <span>Показывать наряды со сроком готовности сегодня</span>
          </label>
          <label className="checkbox">
            <input type="checkbox" checked={settings.notifyOverdue}
              onChange={(e) => setSettings({ ...settings, notifyOverdue: e.target.checked })} />
            <span>Показывать просроченные наряды</span>
          </label>

          <p className="muted small">
            Последняя отправка:{' '}
            {settings.lastSentOn ? settings.lastSentOn.split('-').reverse().join('.') : 'ещё не было'}
            {settings.lastSentOn === today && ' · сводка за сегодня уже ушла'}
          </p>

          <button type="button" className="btn primary full"
            onClick={() => void save(settings, 'Настройки сохранены.')}
            disabled={busy === 'save'}>
            {busy === 'save'
              ? <><Loader2 size={16} className="spin" /> Сохраняю…</>
              : <><Save size={16} /> Сохранить настройки</>}
          </button>
        </section>
      </div>

      {/* ---------------- Превью ---------------- */}
      <section className="panel">
        <div className="panel-heading">
          <h2>Как это придёт в Telegram</h2>
          <div className="pills">
            <button type="button" className={!preview ? 'active' : ''} onClick={() => setPreview(false)}>
              Сводка
            </button>
            <button type="button" className={preview ? 'active' : ''} onClick={() => setPreview(true)}>
              Завтра
            </button>
          </div>
        </div>
        <pre className="tg-preview">{stripTags(preview ? tomorrowText : digest.text)}</pre>
        <p className="muted small">
          Превью посчитано на {new Date().toLocaleDateString('ru-RU')} по текущим нарядам.
          В Telegram жирный текст и время оформляются моноширинным шрифтом.
        </p>
      </section>
    </>
  )
}

/** Убирает HTML-теги из текста для читаемого превью. */
function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, '')
}
