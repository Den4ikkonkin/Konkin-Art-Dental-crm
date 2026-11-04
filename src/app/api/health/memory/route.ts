// GET /api/health/memory — квоты Supabase и память машины для страницы «Настройки».
//
// ЧТО ОТКУДА БЕРЁТСЯ (важно понимать разницу):
//
//   A. Измеряем сами, прямо сейчас — размер базы (pg_database_size),
//      объём файлов в bucket patient-files, число строк в таблицах,
//      число пользователей (если есть service_role).
//
//   B. Только через Management API Supabase — выход (egress), загрузка логов,
//      запросы журнала. Это внутренние счётчики платформы, обычный REST-ключ
//      их не видит. Нужен персональный токен: Supabase → Account → Access Tokens.
//      Если токена нет, эти строки показываются с прочерком и ссылкой в панель.
//
//   C. Память машины (os.totalmem / vm_stat) — это ОЗУ компьютера,
//      где запущен Next.js. К Supabase отношения не имеет.

import { NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { execSync } from 'node:child_process'
import os from 'node:os'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MB = 1024 * 1024
const GB = 1024 * MB

/** Лимиты бесплатного тарифа — те же числа, что Supabase показывает в Usage. */
const LIMITS = {
  egressGb: 5,
  databaseMb: 500,
  mau: 50_000,
  storageGb: 1,
  logIngestGb: 1,
  logQueryGb: 100,
}

export type QuotaRow = {
  key: string
  label: string
  /** Значение в единицах unit. null — измерить не удалось. */
  used: number | null
  limit: number
  unit: 'gb' | 'mb' | 'count'
  /** live — посчитали сами; panel — только в панели Supabase; unknown — нет токена */
  source: 'live' | 'panel' | 'unknown'
  note?: string
}

function availableBytes(): { available: number; method: string } {
  if (process.platform === 'linux') {
    try {
      const info = require('node:fs').readFileSync('/proc/meminfo', 'utf8') as string
      const kb = Number(/MemAvailable:\s+(\d+)/.exec(info)?.[1] ?? 0)
      if (kb > 0) return { available: kb * 1024, method: 'MemAvailable' }
    } catch {
      /* ниже запасной вариант */
    }
  }

  if (process.platform === 'darwin') {
    try {
      const out = execSync('vm_stat', { encoding: 'utf8', timeout: 1500 })
      const pageSize = Number(/page size of (\d+) bytes/.exec(out)?.[1] ?? 4096)
      const pages = (label: string) => {
        const m = new RegExp(label + ':\\s+(\\d+)').exec(out)
        return m ? Number(m[1]) : 0
      }
      const reclaimable = pages('Pages free') + pages('Pages inactive') + pages('Pages speculative')
      if (reclaimable > 0) return { available: reclaimable * pageSize, method: 'vm_stat' }
    } catch {
      /* ниже запасной вариант */
    }
  }

  return { available: os.freemem(), method: 'freemem' }
}

/** Обходим bucket рекурсивно: у папок нет metadata.size. */
async function storageUsage(
  db: SupabaseClient,
  bucket: string,
): Promise<{ bytes: number; files: number }> {
  let bytes = 0
  let files = 0

  async function walk(prefix: string, depth: number) {
    if (depth > 4) return
    const { data, error } = await db.storage.from(bucket).list(prefix, { limit: 1000 })
    if (error || !data) return
    for (const item of data) {
      const size = (item.metadata as { size?: number } | null)?.size
      if (typeof size === 'number') {
        bytes += size
        files += 1
      } else {
        await walk(prefix ? `${prefix}/${item.name}` : item.name, depth + 1)
      }
    }
  }

  await walk('', 0)
  return { bytes, files }
}

export async function GET(request: Request) {
  // ---------- Память машины ----------
  const total = os.totalmem()
  const free = os.freemem()
  const { available, method } = availableBytes()
  const proc = process.memoryUsage()
  const pct = (part: number) => (total > 0 ? Math.round((part / total) * 100) : 0)

  const memory = {
    totalMb: Math.round(total / MB),
    usedMb: Math.round((total - available) / MB),
    freeMb: Math.round(free / MB),
    availableMb: Math.round(available / MB),
    percentFree: pct(free),
    percentAvailable: pct(available),
    percentUsed: 100 - pct(available),
    processMb: Math.round(proc.rss / MB),
    uptimeSec: Math.round(process.uptime()),
    platform: process.platform,
    measuredBy: method,
  }

  // ---------- Квоты Supabase ----------
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const mgmtToken = process.env.SUPABASE_ACCESS_TOKEN

  const rows: QuotaRow[] = [
    { key: 'egress', label: 'Выход (трафик)', used: null, limit: LIMITS.egressGb, unit: 'gb', source: 'unknown',
      note: 'Внутренний счётчик платформы. Точное значение — в панели Supabase → Usage.' },
    { key: 'database', label: 'Размер базы данных', used: null, limit: LIMITS.databaseMb, unit: 'mb', source: 'live' },
    { key: 'mau', label: 'Активные пользователи за месяц', used: null, limit: LIMITS.mau, unit: 'count', source: 'live' },
    { key: 'storage', label: 'Хранилище файлов', used: null, limit: LIMITS.storageGb, unit: 'gb', source: 'live' },
    { key: 'logIngest', label: 'Загрузка логов', used: null, limit: LIMITS.logIngestGb, unit: 'gb', source: 'unknown',
      note: 'Счётчик платформы, наружу не отдаётся.' },
    { key: 'logQuery', label: 'Запрос журнала', used: null, limit: LIMITS.logQueryGb, unit: 'gb', source: 'unknown',
      note: 'Счётчик платформы, наружу не отдаётся.' },
  ]

  const byKey = (k: string) => rows.find((r) => r.key === k)!
  let needsAuth = false
  let dbError = ''
  let ref = ''
  let hint = ''

  try {
    ref = (JSON.parse(Buffer.from((anon ?? '').split('.')[1] ?? '', 'base64').toString()).ref as string) ?? ''
  } catch {
    ref = ''
  }

  if (url && anon) {
    const header = request.headers.get('authorization') ?? ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : ''

    if (!token) {
      needsAuth = true
    } else {
      const db = createClient(url, anon, {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      })

      const { data: userData, error: userError } = await db.auth.getUser(token)
      if (userError || !userData.user) {
        needsAuth = true
      } else {
        try {
          // Размер базы: обычный REST не умеет системные функции, нужен RPC.
          const { data: sizeData, error: sizeErr } = await db.rpc('database_size_bytes')
          if (!sizeErr && typeof sizeData === 'number') {
            byKey('database').used = Math.round((sizeData / MB) * 100) / 100
          }

          const files = await storageUsage(db, 'patient-files')
          byKey('storage').used = Math.round((files.bytes / GB) * 1000) / 1000

          // Активные пользователи: точное число требует service_role.
          if (serviceKey) {
            const admin = createClient(url, serviceKey, {
              auth: { persistSession: false, autoRefreshToken: false },
            })
            const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
            byKey('mau').used = list?.users?.length ?? null
          } else {
            // Без service_role точное число пользователей не получить:
            // RLS показывает только собственные строки, поэтому владельцев
            // будет ровно один — вы сами. Честнее показать прочерк.
            byKey('mau').used = null
            byKey('mau').source = 'panel'
            byKey('mau').note =
              'Точное число требует ключа service_role в .env.local. Без него RLS показывает только ваши записи.'
          }

          // Management API умеет отдавать только счётчики запросов (usage.api-counts).
          // Выход (egress) и загрузку логов он не отдаёт ни с каким токеном —
          // это внутренние счётчики платформы. Поэтому строки остаются с прочерком
          // и подписью «только в панели Supabase».
          if (mgmtToken && ref) {
            byKey('egress').note =
              'Management API не отдаёт выход. Точное значение — в панели Supabase → Usage.'
          }
        } catch (e) {
          dbError = e instanceof Error ? e.message : 'Не удалось прочитать данные Supabase'
        }
      }
    }
  }

  const dbRow = byKey('database')
  if (dbRow.used === 0 || dbRow.used === null) {
    hint =
      'Размер базы показывает 0, пока в Supabase не создана функция database_size_bytes. ' +
      'Выполните SQL из файла supabase/migrations/0004_db_size.sql в SQL Editor.'
  }

  return NextResponse.json(
    {
      ok: true,
      memory,
      quotas: rows,
      projectRef: ref,
      dashboardUrl: ref ? `https://supabase.com/dashboard/project/${ref}/usage` : 'https://supabase.com/dashboard',
      needsAuth,
      dbError,
      hint,
      hasManagementToken: Boolean(mgmtToken),
      checkedAt: new Date().toISOString(),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
