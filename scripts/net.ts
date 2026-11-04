// Сетевой слой для Telegram.
//
// Задача: дотянуться до api.telegram.org, когда он заблокирован.
//
// Тонкость: встроенный в Node fetch НЕ читает системные настройки прокси
// macOS. Поэтому включённый VPN, который работает как системный прокси,
// для бота невидим — хотя Safari и само приложение Telegram через него ходят.
// Здесь мы читаем настройки сами (scutil --proxy) и передаём прокси явно.
//
// Порядок поиска прокси:
//   1. TELEGRAM_PROXY из .env.local — ручное указание, самый приоритет
//   2. системный прокси macOS (Системные настройки → Сеть → Прокси)
//   3. HTTPS_PROXY / HTTP_PROXY из окружения
// Если ничего не найдено — идём напрямую.
//
// undici грузится ЛЕНИВО и только когда прокси реально нужен.

import { execFileSync } from 'node:child_process'

/** Читает системный прокси macOS. Возвращает '' если его нет или мы не на macOS. */
function detectSystemProxy(): string {
  if (process.platform !== 'darwin') return ''
  try {
    const out = execFileSync('scutil', ['--proxy'], {
      encoding: 'utf8',
      timeout: 3000,
      stdio: ['ignore', 'pipe', 'ignore'],
    })

    // Ответ выглядит так:
    //   HTTPSEnable : 1
    //   HTTPSProxy : 127.0.0.1
    //   HTTPSPort : 1087
    //   HTTPSProxyAuthenticated : 0
    const pick = (key: string): string => {
      const m = new RegExp(`^\\s*${key}\\s*:\\s*(.+)$`, 'm').exec(out)
      return m ? m[1].trim() : ''
    }

    for (const scheme of ['HTTPS', 'HTTP']) {
      const enabled = pick(`${scheme}Enable`)
      const host = pick(`${scheme}Proxy`)
      const port = pick(`${scheme}Port`)
      if (enabled === '1' && host && port) return `http://${host}:${port}`
    }

    // SOCKS прокси тоже часто используется VPN-клиентами
    if (pick('SOCKSEnable') === '1') {
      const host = pick('SOCKSProxy')
      const port = pick('SOCKSPort')
      if (host && port) return `socks5://${host}:${port}`
    }
  } catch {
    /* scutil недоступен — не macOS или нет прав */
  }
  return ''
}

const manual = (process.env.TELEGRAM_PROXY ?? '').trim()
const fromSystem = detectSystemProxy()
const fromEnv = (process.env.HTTPS_PROXY || process.env.HTTP_PROXY || '').trim()

/** Итоговый адрес прокси. Пустая строка — идём напрямую. */
export const proxyUrl: string = manual || fromSystem || fromEnv

/** Откуда взят прокси: для понятных сообщений. */
export const proxySource: 'manual' | 'system' | 'env' | 'none' = manual
  ? 'manual'
  : fromSystem
    ? 'system'
    : fromEnv
      ? 'env'
      : 'none'

export const usingProxy = proxyUrl.length > 0

// Динамический импорт по строковому имени: TypeScript не пытается разрешить
// модуль на этапе сборки, поэтому отсутствие пакета не ломает typecheck.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const load = new Function('m', 'return import(m)') as (m: string) => Promise<any>

type Dispatcher = object

let dispatcherPromise: Promise<Dispatcher | null> | null = null
let setupError: string | null = null

async function getDispatcher(): Promise<Dispatcher | null> {
  if (!usingProxy) return null
  if (setupError) return null
  if (dispatcherPromise) return dispatcherPromise

  dispatcherPromise = (async () => {
    try {
      if (/^socks/i.test(proxyUrl)) {
        const mod = await load('socks-proxy-agent')
        return new mod.SocksProxyAgent(proxyUrl) as Dispatcher
      }
      const mod = await load('undici')
      return new mod.ProxyAgent(proxyUrl) as Dispatcher
    } catch {
      setupError =
        /^socks/i.test(proxyUrl)
          ? 'Прокси по схеме socks5 — нужен пакет socks-proxy-agent. Выполните: npm install'
          : 'Не установлен пакет для работы через прокси (undici). Выполните: npm install'
      return null
    }
  })()

  return dispatcherPromise
}

/** fetch для Telegram: через прокси, если он есть, иначе напрямую. */
export async function tgFetch(input: string, init?: RequestInit): Promise<Response> {
  const dispatcher = await getDispatcher()
  if (!dispatcher) {
    if (setupError) throw new Error(setupError)
    return fetch(input, init)
  }

  const mod = await load('undici')
  return (await mod.fetch(input, {
    ...(init as object),
    dispatcher,
  })) as unknown as Response
}

/** Понятное объяснение сетевой ошибки вместо голого «fetch failed». */
export function explainNetworkError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  const cause = (e as { cause?: { code?: string; message?: string } })?.cause
  const code = cause?.code ?? ''

  if (/Не установлен пакет|нужен пакет/.test(msg)) return msg
  if (/ENOTFOUND|EAI_AGAIN/.test(code)) {
    return `${msg} — домен api.telegram.org не разрешается. Похоже, VPN выключен.`
  }
  if (/ECONNREFUSED/.test(code)) {
    return `${msg} — прокси отклоняет соединение. Проверьте TELEGRAM_PROXY: возможно, он не запущен или порт другой.`
  }
  if (/ETIMEDOUT|ECONNRESET|UND_ERR_CONNECT_TIMEOUT|aborted due to timeout/i.test(`${code} ${msg}`)) {
    return usingProxy
      ? `${msg} — через прокси ${proxyUrl} не прошло. Возможно, прокси не пропускает Telegram или адрес устарел.`
      : `${msg} — соединение блокируется. Включите VPN в режиме Global/TUN или укажите TELEGRAM_PROXY.`
  }
  if (/fetch failed/i.test(msg)) {
    return `${msg} — нет доступа к api.telegram.org. Включите VPN (режим Global) или укажите TELEGRAM_PROXY в .env.local.`
  }
  return msg
}
