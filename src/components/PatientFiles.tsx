'use client'

// Файлы пациента: хранятся в Google Drive, в папке конкретного пациента.
// Кнопка «Загрузить» кладёт файл в папку пациента и показывает полосу прогресса.

import { useCallback, useEffect, useRef, useState } from 'react'
import { driveList, driveUpload, driveDelete, driveDedupe } from '@/lib/drive'
import type { DriveFile } from '@/lib/gdrive-types'
import { prettySize } from '@/lib/db'
import { Upload, Trash2, FileText, ImageIcon, ExternalLink, Loader, Layers } from 'lucide-react'

const LIMIT = 25 * 1024 * 1024

export default function PatientFiles({ patientId, patientName }: { patientId: string; patientName: string }) {
  const [files, setFiles] = useState<DriveFile[]>([])
  const [busy, setBusy] = useState(true)
  const [uploading, setUploading] = useState('')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [merging, setMerging] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setBusy(true)
    try { setFiles(await driveList(patientId, patientName)); setError('') }
    catch (e) { setError(e instanceof Error ? e.message : 'Не удалось прочитать файлы') }
    finally { setBusy(false) }
  }, [patientId, patientName])

  useEffect(() => { void load() }, [load])

  async function pick(list: FileList | null) {
    if (!list?.length) return
    setError(''); setNote('')
    const chosen = Array.from(list)
    for (const file of chosen) {
      if (file.size > LIMIT) {
        setError(`Файл «${file.name}» больше ${LIMIT / 1024 / 1024} МБ и не загружен.`)
        continue
      }
      setUploading(file.name)
      setProgress(0)
      try {
        await driveUpload(patientId, patientName, file, setProgress)
        setProgress(100)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Ошибка загрузки')
      }
    }
    // Небольшая пауза, чтобы полоса успела дойти до 100% и не мигала.
    await new Promise((r) => setTimeout(r, 250))
    setUploading('')
    setProgress(0)
    if (input.current) input.current.value = ''
    await load()
  }

  async function drop(f: DriveFile) {
    if (!confirm(`Удалить файл «${f.name}» из Google Drive? Действие необратимо.`)) return
    try { await driveDelete(patientId, patientName, f.id); await load() }
    catch (e) { setError(e instanceof Error ? e.message : 'Не удалось удалить файл') }
  }

  async function merge() {
    if (!confirm('Слить одинаковые папки пациентов на Google Drive? Файлы переедут в одну папку, лишние папки удалятся.')) return
    setMerging(true); setError(''); setNote('')
    try {
      const r = await driveDedupe()
      setNote(r.removed ? `Объединено папок: ${r.removed}` : 'Одинаковых папок не найдено')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось слить папки')
    } finally {
      setMerging(false)
    }
  }

  const totalBytes = files.reduce((s, f) => s + Number(f.size ?? 0), 0)

  return (
    <div className="files-panel">
      <div className="files-head">
        <div>
          <h3>Файлы пациента</h3>
          <small>{patientName} · {files.length} шт · {prettySize(totalBytes)} · Google Drive</small>
        </div>
        <div className="row nowrap">
          <span className="size-pill" title="Занято на Диске">{prettySize(totalBytes)}</span>
          <button className="btn small" onClick={() => void merge()} disabled={merging}
            title="Слить одинаковые папки пациентов на Диске">
            <Layers size={15} /> {merging ? 'Слияние…' : 'Слить дубли'}
          </button>
          <label className="btn primary">
            <Upload size={16} /> Загрузить файлы
            <input ref={input} type="file" multiple accept="image/*,application/pdf,.dcm,text/plain,.stl,.zip"
              className="sr-only" onChange={(e) => void pick(e.target.files)} />
          </label>
        </div>
      </div>

      {uploading && (
        <div className="upload-state" role="status">
          <div className="upload-row">
            <Loader size={15} className="spin" />
            <span className="upload-name" title={uploading}>{uploading}</span>
            <b className="upload-pct">{progress}%</b>
          </div>
          <div className="upload-bar" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
            <i style={{ width: progress + '%' }} />
          </div>
        </div>
      )}
      {error && <div className="alert" role="alert">{error}</div>}
      {note && <div className="note" role="status">{note}</div>}

      {busy ? <div className="empty">Чтение файлов…</div>
        : !files.length ? <div className="empty">Файлы ещё не загружены.</div>
        : (
          <div className="file-grid">
            {files.map((f) => (
              <div className="file-card" key={f.id}>
                <div className="file-icon">
                  {(f.mimeType ?? '').startsWith('image/') ? <ImageIcon size={22} /> : <FileText size={22} />}
                </div>
                <div className="file-info">
                  <b title={f.name}>{f.name}</b>
                  <small>{prettySize(Number(f.size ?? 0))} · {new Date(f.createdTime).toLocaleDateString('ru-RU')}</small>
                </div>
                <div className="row nowrap">
                  {f.webViewLink && (
                    <a className="icon-btn" href={f.webViewLink} target="_blank" rel="noopener" aria-label={`Открыть ${f.name} в Google Drive`}>
                      <ExternalLink size={15} />
                    </a>
                  )}
                  <button className="icon-btn danger" aria-label={`Удалить ${f.name}`} onClick={() => void drop(f)}><Trash2 size={15} /></button>
                </div>
              </div>
            ))}
          </div>
        )}

      <p className="note">
        Файлы хранятся в Google Drive, в папке пациента внутри «Konkin Art Dental — пациенты».
        Папка у каждого пациента одна: повторная загрузка кладёт файлы в неё же.
      </p>
    </div>
  )
}
