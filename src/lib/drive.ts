'use client'

// Клиентская часть Google Drive: вызывает маршруты /api/drive/* с токеном входа.
import { supabase } from './supabase'
import type { DriveFile } from './gdrive-types'

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Нужно войти в приложение заново.')
  return { authorization: `Bearer ${token}` }
}

async function parse<T>(r: Response): Promise<T> {
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error ?? `Ошибка ${r.status}`)
  return j as T
}

export async function driveList(patientId: string, patientName: string): Promise<DriveFile[]> {
  const q = new URLSearchParams({ patientId, patientName })
  const r = await fetch(`/api/drive/list?${q}`, { headers: await authHeader(), cache: 'no-store' })
  return (await parse<{ files: DriveFile[] }>(r)).files
}

/**
 * Загрузка файла с прогрессом. XMLHttpRequest нужен, чтобы получать событие
 * progress: fetch не сообщает, сколько байт уже отправлено.
 */
export async function driveUpload(
  patientId: string,
  patientName: string,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<DriveFile> {
  const headers = await authHeader()
  const fd = new FormData()
  fd.append('patientId', patientId)
  fd.append('patientName', patientName)
  fd.append('file', file)

  return new Promise<DriveFile>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', '/api/drive/upload')
    xhr.setRequestHeader('authorization', headers.authorization)

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100))
    }
    xhr.upload.onload = () => onProgress?.(100)
    xhr.onload = () => {
      let body: { file?: DriveFile; error?: string } = {}
      try { body = JSON.parse(xhr.responseText || '{}') } catch { /* не JSON */ }
      if (xhr.status >= 200 && xhr.status < 300 && body.file) resolve(body.file)
      else reject(new Error(body.error ?? `Ошибка загрузки (${xhr.status})`))
    }
    xhr.onerror = () => reject(new Error('Сеть недоступна, файл не загружен'))
    xhr.ontimeout = () => reject(new Error('Истекло время загрузки'))
    xhr.send(fd)
  })
}

export async function driveDelete(patientId: string, patientName: string, fileId: string): Promise<void> {
  const r = await fetch('/api/drive/delete', {
    method: 'POST',
    headers: { ...(await authHeader()), 'content-type': 'application/json' },
    body: JSON.stringify({ patientId, patientName, fileId }),
  })
  await parse(r)
}

/** Слить одинаковые папки пациентов на Диске. */
export async function driveDedupe(): Promise<{ groups: number; removed: number }> {
  const r = await fetch('/api/drive/dedupe', { method: 'POST', headers: await authHeader() })
  return parse<{ groups: number; removed: number }>(r)
}

export async function driveQuota(): Promise<{ usage: number; limit: number; drive: number }> {
  const r = await fetch('/api/drive/quota', { headers: await authHeader(), cache: 'no-store' })
  return parse<{ usage: number; limit: number; drive: number }>(r)
}

export async function driveSizes(): Promise<Record<string, { files: number; bytes: number }>> {
  const r = await fetch('/api/drive/sizes', { headers: await authHeader(), cache: 'no-store' })
  return (await parse<{ sizes: Record<string, { files: number; bytes: number }> }>(r)).sizes
}
