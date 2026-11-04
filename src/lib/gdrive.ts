// Серверный клиент Google Drive. Работает ТОЛЬКО на сервере (маршруты /api/drive/*).
// Авторизация: OAuth-токен аккаунта konkinartdental@gmail.com (refresh token из переменных окружения).
// Область доступа drive.file: приложение видит только папки и файлы, которые создало само.
//
// Структура на Диске:
//   Konkin Art Dental — пациенты/          (корневая папка, appProperties role=root)
//     Иванов Иван/                          (папка пациента, appProperties patientId=<id>)
//       файл1.jpg, скан.pdf ...
//
// ВАЖНО про дубли папок.
// Поиск в Google Drive обновляется с задержкой: только что созданная папка может не найтись
// в выдаче files.list. Из-за этого два одновременных запроса (список файлов + загрузка)
// не находили папку и создавали две одинаковые. Поэтому:
//   1. id папки кэшируется в памяти процесса (folderCache);
//   2. создание папки для одного пациента идёт строго по очереди (locks);
//   3. поиск повторяется несколько раз с паузой, прежде чем создавать новую папку;
//   4. функция dedupeFolders() сливает уже созданные дубли.

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const DRIVE = 'https://www.googleapis.com/drive/v3'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3'
export const FOLDER_MIME = 'application/vnd.google-apps.folder'
const ROOT_NAME = 'Konkin Art Dental — пациенты'

let cached: { token: string; exp: number } | null = null

export async function accessToken(): Promise<string> {
  if (cached && cached.exp > Date.now() + 60_000) return cached.token
  const client_id = process.env.GOOGLE_CLIENT_ID ?? ''
  const client_secret = process.env.GOOGLE_CLIENT_SECRET ?? ''
  const refresh_token = process.env.GOOGLE_REFRESH_TOKEN ?? ''
  if (!client_id || !client_secret || !refresh_token) {
    throw new Error('Google Drive не настроен: нет GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET или GOOGLE_REFRESH_TOKEN в .env.local')
  }
  const r = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id, client_secret, refresh_token, grant_type: 'refresh_token' }),
  })
  const j = await r.json()
  if (!r.ok || !j.access_token) {
    throw new Error('Google не выдал токен: ' + (j.error_description ?? j.error ?? r.status))
  }
  cached = { token: j.access_token, exp: Date.now() + Number(j.expires_in ?? 3600) * 1000 }
  return cached.token
}

async function gfetch(url: string, init: RequestInit = {}): Promise<Response> {
  const token = await accessToken()
  const headers = { ...(init.headers as Record<string, string> | undefined), authorization: `Bearer ${token}` }
  const r = await fetch(url, { ...init, headers })
  if (!r.ok) {
    const text = await r.text()
    throw new Error(`Google Drive ответил ${r.status}: ${text.slice(0, 300)}`)
  }
  return r
}

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms))

/** Какие папки уже созданы: patientId → folderId. Живёт, пока работает сервер. */
const folderCache = new Map<string, string>()
/** Очередь создания папки: один пациент — одна задача за раз. */
const locks = new Map<string, Promise<string>>()
let rootCache: string | undefined

type DriveFileMeta = {
  id: string
  name: string
  mimeType?: string
  size?: string
  createdTime?: string
  webViewLink?: string
  appProperties?: Record<string, string>
}

async function findFolderOnce(key: string, value: string, parent?: string, limit = 10): Promise<DriveFileMeta[]> {
  const parts = [
    `mimeType='${FOLDER_MIME}'`,
    'trashed=false',
    `appProperties has { key='${esc(key)}' and value='${esc(value)}' }`,
  ]
  if (parent) parts.push(`'${esc(parent)}' in parents`)
  const r = await gfetch(`${DRIVE}/files?` + new URLSearchParams({
    q: parts.join(' and '),
    fields: 'files(id,name,createdTime)',
    pageSize: String(limit),
    spaces: 'drive',
  }))
  const j = await r.json()
  return j.files ?? []
}

/** Поиск с повторами: выдача Drive обновляется не мгновенно. */
async function findFolder(key: string, value: string, parent?: string): Promise<string | undefined> {
  const delays = [0, 250, 600, 1200]
  for (const d of delays) {
    if (d) await sleep(d)
    const found = await findFolderOnce(key, value, parent, 1)
    if (found[0]) return found[0].id
  }
  return undefined
}

async function createFolder(name: string, props: Record<string, string>, parent?: string): Promise<string> {
  const r = await gfetch(`${DRIVE}/files?fields=id`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name,
      mimeType: FOLDER_MIME,
      parents: parent ? [parent] : undefined,
      appProperties: props,
    }),
  })
  return (await r.json()).id as string
}

/** Корневая папка «пациенты». Можно задать вручную через GOOGLE_DRIVE_ROOT_ID. */
export async function ensureRoot(): Promise<string> {
  const fixed = process.env.GOOGLE_DRIVE_ROOT_ID
  if (fixed) return fixed
  if (rootCache) return rootCache
  const found = await findFolder('role', 'root')
  rootCache = found ?? (await createFolder(ROOT_NAME, { role: 'root' }))
  return rootCache
}

const safeName = (name: string) =>
  (name || 'Пациент').replace(/[\\/]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 200) || 'Пациент'

/**
 * Папка пациента: одна на пациента.
 * Создаётся строго в одном экземпляре даже при одновременных запросах.
 */
export async function ensurePatientFolder(patientId: string, patientName: string): Promise<string> {
  const known = folderCache.get(patientId)
  if (known) return known

  const running = locks.get(patientId)
  if (running) return running

  const task = (async () => {
    const root = await ensureRoot()

    // 1. Уже создана раньше — находим и запоминаем.
    const existing = await findFolder('patientId', patientId, root)
    if (existing) {
      folderCache.set(patientId, existing)
      return existing
    }

    // 2. Создаём и проверяем, не успел ли кто-то создать такую же параллельно.
    const created = await createFolder(safeName(patientName), { patientId }, root)
    folderCache.set(patientId, created)

    const after = await findFolderOnce('patientId', patientId, root, 10)
    if (after.length > 1) {
      // Оставляем самую старую папку, лишние сливаем.
      const sorted = [...after].sort((a, b) => String(a.createdTime).localeCompare(String(b.createdTime)))
      const keeper = sorted[0].id
      folderCache.set(patientId, keeper)
      for (const extra of sorted.slice(1)) await mergeFolder(extra.id, keeper)
      return keeper
    }
    return created
  })()

  locks.set(patientId, task)
  try {
    return await task
  } finally {
    locks.delete(patientId)
  }
}

/** Забыть запомненную папку (например, если её удалили на Диске вручную). */
export function forgetPatientFolder(patientId: string): void {
  folderCache.delete(patientId)
}

export type DriveFile = {
  id: string
  name: string
  mimeType: string
  size?: string
  createdTime: string
  webViewLink?: string
}

const FILE_FIELDS = 'id,name,mimeType,size,createdTime,webViewLink'

export async function listFolder(folderId: string): Promise<DriveFile[]> {
  const r = await gfetch(`${DRIVE}/files?` + new URLSearchParams({
    q: `'${esc(folderId)}' in parents and trashed=false and mimeType!='${FOLDER_MIME}'`,
    fields: `files(${FILE_FIELDS})`,
    orderBy: 'createdTime desc',
    pageSize: '500',
    spaces: 'drive',
  }))
  return (await r.json()).files ?? []
}

export async function uploadToFolder(folderId: string, name: string, mime: string, data: Uint8Array): Promise<DriveFile> {
  const boundary = 'dental' + Math.random().toString(36).slice(2) + Date.now().toString(36)
  const meta = JSON.stringify({ name, parents: [folderId] })
  const head = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n` +
    `--${boundary}\r\nContent-Type: ${mime || 'application/octet-stream'}\r\n\r\n`
  const tail = `\r\n--${boundary}--`
  const body = Buffer.concat([Buffer.from(head, 'utf8'), Buffer.from(data), Buffer.from(tail, 'utf8')])
  const r = await gfetch(`${UPLOAD}/files?uploadType=multipart&fields=${FILE_FIELDS}`, {
    method: 'POST',
    headers: { 'content-type': `multipart/related; boundary=${boundary}` },
    body: new Uint8Array(body),
  })
  return r.json()
}

export async function getParents(fileId: string): Promise<string[]> {
  const r = await gfetch(`${DRIVE}/files/${encodeURIComponent(fileId)}?fields=parents`)
  return (await r.json()).parents ?? []
}

export async function deleteFile(fileId: string): Promise<void> {
  await gfetch(`${DRIVE}/files/${encodeURIComponent(fileId)}`, { method: 'DELETE' })
}

/* ---------- Слияние одинаковых папок ---------- */

async function listChildren(folderId: string): Promise<DriveFileMeta[]> {
  const r = await gfetch(`${DRIVE}/files?` + new URLSearchParams({
    q: `'${esc(folderId)}' in parents and trashed=false`,
    fields: 'files(id,name,mimeType,size,createdTime)',
    pageSize: '1000',
    spaces: 'drive',
  }))
  return (await r.json()).files ?? []
}

async function moveFile(fileId: string, from: string, to: string): Promise<void> {
  await gfetch(`${DRIVE}/files/${encodeURIComponent(fileId)}?addParents=${encodeURIComponent(to)}&removeParents=${encodeURIComponent(from)}&fields=id`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  })
}

/** Отправляет папку в корзину Диска: её можно восстановить, если что-то пошло не так. */
async function trashFolder(folderId: string): Promise<void> {
  await gfetch(`${DRIVE}/files/${encodeURIComponent(folderId)}?fields=id`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ trashed: true }),
  })
}

/**
 * Переносит содержимое папки extra в keeper и убирает пустую папку в корзину.
 * Файлы не удаляются: они просто переезжают в папку-получатель.
 */
async function mergeFolder(extra: string, keeper: string): Promise<void> {
  if (extra === keeper) return
  const children = await listChildren(extra)
  for (const c of children) {
    try { await moveFile(c.id, extra, keeper) } catch { /* файл мог исчезнуть */ }
  }
  const left = await listChildren(extra)
  // Если что-то не переехало, папку не трогаем, чтобы не потерять файлы.
  if (left.length === 0) {
    try { await trashFolder(extra) } catch { /* уже в корзине */ }
  }
}

/**
 * Убирает дубли: на каждого пациента оставляет одну папку (самую старую),
 * переносит в неё файлы из остальных и удаляет лишние папки.
 */
export async function dedupeFolders(): Promise<{ groups: number; removed: number }> {
  const root = await ensureRoot()
  const r = await gfetch(`${DRIVE}/files?` + new URLSearchParams({
    q: `'${esc(root)}' in parents and mimeType='${FOLDER_MIME}' and trashed=false`,
    fields: 'files(id,name,createdTime,appProperties)',
    pageSize: '1000',
    spaces: 'drive',
  }))
  const folders: DriveFileMeta[] = (await r.json()).files ?? []

  const byPatient = new Map<string, DriveFileMeta[]>()
  for (const f of folders) {
    const pid = f.appProperties?.patientId
    if (!pid) continue
    const list = byPatient.get(pid) ?? []
    list.push(f)
    byPatient.set(pid, list)
  }

  let groups = 0
  let removed = 0
  for (const [pid, list] of byPatient) {
    if (list.length < 2) {
      folderCache.set(pid, list[0].id)
      continue
    }
    groups++
    const sorted = [...list].sort((a, b) => String(a.createdTime).localeCompare(String(b.createdTime)))
    const keeper = sorted[0]
    for (const extra of sorted.slice(1)) {
      await mergeFolder(extra.id, keeper.id)
      removed++
    }
    folderCache.set(pid, keeper.id)
  }
  return { groups, removed }
}

/** Занятое место на Диске аккаунта (usage — весь аккаунт, drive — только Диск). */
export async function storageQuota(): Promise<{ usage: number; limit: number; drive: number }> {
  const r = await gfetch(`${DRIVE}/about?fields=storageQuota`)
  const q = (await r.json()).storageQuota ?? {}
  return { usage: Number(q.usage ?? 0), limit: Number(q.limit ?? 0), drive: Number(q.usageInDrive ?? 0) }
}

/** Количество файлов и занятый объём по каждому пациенту (ключ — patientId). */
export async function patientSizes(): Promise<Record<string, { files: number; bytes: number }>> {
  const root = await ensureRoot()
  const r = await gfetch(`${DRIVE}/files?` + new URLSearchParams({
    q: `'${esc(root)}' in parents and mimeType='${FOLDER_MIME}' and trashed=false`,
    fields: 'files(id,appProperties)',
    pageSize: '1000',
    spaces: 'drive',
  }))
  const folders: DriveFileMeta[] = (await r.json()).files ?? []
  const out: Record<string, { files: number; bytes: number }> = {}
  for (const f of folders) {
    const pid = f.appProperties?.patientId
    if (!pid) continue
    const files = await listFolder(f.id)
    out[pid] = { files: files.length, bytes: files.reduce((s, x) => s + Number(x.size ?? 0), 0) }
  }
  return out
}
