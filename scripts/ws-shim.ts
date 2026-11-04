// Заглушка WebSocket для Node 20.
//
// supabase-js при создании клиента поднимает realtime-соединение и падает с
// «Node.js 20 detected without native WebSocket support». Realtime воркеру не нужен:
// сводки ходят обычными REST-запросами. Модуль подключается первым импортом
// в scripts/telegram-bot.ts, поэтому заглушка успевает появиться до загрузки
// supabase-js. На Node 21+ нативный WebSocket уже есть и ничего не подменяется.

if (!('WebSocket' in globalThis)) {
  class NoopWebSocket {
    static readonly CONNECTING = 0
    static readonly OPEN = 1
    static readonly CLOSING = 2
    static readonly CLOSED = 3
    readyState = 3
    onopen: unknown = null
    onclose: unknown = null
    onerror: unknown = null
    onmessage: unknown = null
    addEventListener() {}
    removeEventListener() {}
    close() {}
    send() {
      throw new Error('Realtime в воркере не используется')
    }
  }

  ;(globalThis as unknown as { WebSocket: unknown }).WebSocket = NoopWebSocket
}

export {}
