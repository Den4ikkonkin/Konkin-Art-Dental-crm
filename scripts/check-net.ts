// ============================================================
//  Проверка сети: доходит ли бот до Telegram
//  Запуск:  npm run net
//
//  Проверяет по очереди:
//    1. напрямую, без прокси
//    2. через прокси — свой или системный
//    3. принимает ли Telegram токен бота
//  В конце — что именно сделать.
// ============================================================

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// .env.local читаем до импорта сетевого слоя: он смотрит переменные на старте.
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

const TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? ''

const line = (s = '') => console.log(s)

// Динамический импорт: typecheck не требует пакета.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const load = new Function('m', 'return import(m)') as (m: string) => Promise<any>

async function probeDirect(): Promise<boolean> {
  const started = Date.now()
  try {
    const res = await fetch('https://api.telegram.org', { signal: AbortSignal.timeout(8000) })
    line(`  ✓ api.telegram.org — HTTP ${res.status}, ${Date.now() - started} мс`)
    return true
  } catch (e) {
    const c = (e as { cause?: { code?: string } })?.cause?.code
    const m = e instanceof Error ? e.message : String(e)
    line(`  ✗ api.telegram.org — ${c || m}`)
    return false
  }
}

async function probeProxy(proxy: string): Promise<boolean> {
  const started = Date.now()
  try {
    if (/^socks/i.test(proxy)) {
      const mod = await load('socks-proxy-agent')
      const res = await fetch('https://api.telegram.org', {
        signal: AbortSignal.timeout(8000),
        // @ts-expect-error — undici принимает dispatcher, типы DOM его не знают
        dispatcher: new mod.SocksProxyAgent(proxy),
      })
      line(`  ✓ прокси работает — HTTP ${res.status}, ${Date.now() - started} мс`)
      return true
    }
    const mod = await load('undici')
    const agent = new mod.ProxyAgent(proxy)
    const res = await mod.fetch('https://api.telegram.org', {
      dispatcher: agent,
      signal: AbortSignal.timeout(8000),
    })
    line(`  ✓ прокси работает — HTTP ${res.status}, ${Date.now() - started} мс`)
    return true
  } catch (e) {
    const c = (e as { cause?: { code?: string } })?.cause?.code
    const m = e instanceof Error ? e.message : String(e)
    if (/Cannot find|MODULE_NOT_FOUND|нужен пакет|Не установлен/i.test(m)) {
      line('  ✗ не установлен пакет для прокси — выполните: npm install')
    } else {
      line(`  ✗ прокси не отвечает — ${c || m}`)
    }
    return false
  }
}

async function probeToken(useProxy: boolean, proxy: string): Promise<void> {
  if (!TOKEN) {
    line('  ✗ TELEGRAM_BOT_TOKEN не задан в .env.local')
    return
  }
  const url = `https://api.telegram.org/bot${TOKEN}/getMe`
  try {
    let body: { ok: boolean; result?: { username: string }; description?: string }

    if (useProxy && proxy && !/^socks/i.test(proxy)) {
      const mod = await load('undici')
      const res = await mod.fetch(url, {
        dispatcher: new mod.ProxyAgent(proxy),
        signal: AbortSignal.timeout(8000),
      })
      body = await res.json()
    } else if (useProxy && proxy) {
      const mod = await load('socks-proxy-agent')
      const res = await fetch(url, {
        signal: AbortSignal.timeout(8000),
        // @ts-expect-error — dispatcher не входит в типы DOM fetch
        dispatcher: new mod.SocksProxyAgent(proxy),
      })
      body = await res.json()
    } else {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
      body = await res.json()
    }

    if (body.ok && body.result) {
      line(`  ✓ бот @${body.result.username} на связи`)
    } else {
      line(`  ✗ Telegram ответил: ${body.description ?? 'ошибка'}`)
      line('    Токен неверный или отозван. Возьмите новый у @BotFather.')
    }
  } catch (e) {
    const c = (e as { cause?: { code?: string } })?.cause?.code
    line(`  ✗ ${c || (e instanceof Error ? e.message : e)}`)
  }
}

async function main() {
  // Сетевой слой сам определяет прокси: ручной, системный или из окружения.
  const net = await import('./net')
  const proxy = net.proxyUrl
  const source =
    net.proxySource === 'manual'
      ? 'указан в .env.local (TELEGRAM_PROXY)'
      : net.proxySource === 'system'
        ? 'взят из системных настроек macOS'
        : net.proxySource === 'env'
          ? 'взят из HTTPS_PROXY'
          : ''

  line('')
  line('Проверка доступа к Telegram')
  line('─'.repeat(46))

  line('\n1. Напрямую, без прокси:')
  const direct = await probeDirect()

  line(proxy ? `\n2. Через прокси ${proxy}` : '\n2. Прокси не найден')
  if (proxy) line(`   (${source})`)
  const viaProxy = proxy ? await probeProxy(proxy) : false

  line('\n3. Токен бота:')
  if (!direct && !viaProxy) {
    line('  · пропущено — нет связи с Telegram')
  } else {
    await probeToken(!direct, proxy)
  }

  line('\n' + '─'.repeat(46))

  if (direct) {
    line('Итог: Telegram доступен напрямую. Бот заработает без настройки.')
    if (proxy) {
      line(`      Прокси (${proxy}) не нужен — можно убрать TELEGRAM_PROXY из .env.local.`)
    }
  } else if (viaProxy) {
    line('Итог: напрямую Telegram заблокирован, но через прокси проходит.')
    line('      Бот будет использовать этот прокси автоматически.')
    line(`      Адрес: ${proxy}`)
    line('')
    line('      Если хотите закрепить вручную — добавьте в .env.local:')
    line(`      TELEGRAM_PROXY=${proxy}`)
    line('      Затем: npm run bot')
  } else if (proxy) {
    line('Итог: прокси найден, но через него Telegram тоже не открывается.')
    line('')
    line('Что делать:')
    line('  1. Убедитесь, что VPN запущен и подключён.')
    line('  2. В приложении VPN включите режим Global / TUN / «Режим VPN»,')
    line('     затем снова: npm run net')
    line('  3. Если режим Global недоступен — включите в VPN локальный прокси')
    line('     (обычно в настройках есть «HTTP proxy» или «Локальный порт»),')
    line('     и укажите его в .env.local:')
    line('       TELEGRAM_PROXY=http://127.0.0.1:1087')
  } else {
    line('Итог: до Telegram не достучаться, прокси не найден.')
    line('')
    line('Причина: терминал не видит VPN. Само приложение Telegram работает,')
    line('потому что VPN его покрывает — а команды в терминале идут мимо.')
    line('')
    line('Два пути:')
    line('')
    line('  A) Включить в VPN режим Global / TUN / «Режим VPN».')
    line('     Тогда весь трафик Mac, включая терминал, пойдёт через туннель.')
    line('     Проверка: npm run net')
    line('')
    line('  B) Узнать адрес локального прокси VPN:')
    line('     Системные настройки → Сеть → ваше подключение → Подробнее → Прокси')
    line('     или в терминале:  scutil --proxy')
    line('     Затем в .env.local:  TELEGRAM_PROXY=http://127.0.0.1:1087')
  }
  line('')
}

void main()
