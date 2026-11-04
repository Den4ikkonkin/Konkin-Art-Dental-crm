import { requireUser, jsonError } from '@/lib/drive-server-auth'
import { ensurePatientFolder, uploadToFolder, forgetPatientFolder } from '@/lib/gdrive'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_BYTES = 25 * 1024 * 1024

// POST /api/drive/upload  (multipart: patientId, patientName, file)
export async function POST(req: Request) {
  if (!(await requireUser(req))) return jsonError('Нужно войти в приложение заново.', 401)
  let form: FormData
  try { form = await req.formData() } catch { return jsonError('Не удалось прочитать файл') }

  const patientId = String(form.get('patientId') ?? '')
  const patientName = String(form.get('patientName') ?? '')
  const file = form.get('file')
  if (!patientId) return jsonError('Не указан пациент')
  if (!(file instanceof File)) return jsonError('Файл не передан')
  if (file.size > MAX_BYTES) return jsonError(`Файл больше ${MAX_BYTES / 1024 / 1024} МБ`, 413)

  const data = new Uint8Array(await file.arrayBuffer())
  try {
    const folder = await ensurePatientFolder(patientId, patientName)
    const saved = await uploadToFolder(folder, file.name, file.type, data)
    return Response.json({ file: saved })
  } catch (e) {
    // Папку могли удалить на Диске вручную — тогда забываем её и создаём заново.
    const msg = e instanceof Error ? e.message : ''
    if (/404/.test(msg)) {
      forgetPatientFolder(patientId)
      try {
        const folder = await ensurePatientFolder(patientId, patientName)
        const saved = await uploadToFolder(folder, file.name, file.type, data)
        return Response.json({ file: saved })
      } catch (retry) {
        return jsonError(retry instanceof Error ? retry.message : 'Ошибка загрузки в Google Drive', 500)
      }
    }
    return jsonError(msg || 'Ошибка загрузки в Google Drive', 500)
  }
}
