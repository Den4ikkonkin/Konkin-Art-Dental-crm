import { requireUser, jsonError } from '@/lib/drive-server-auth'
import { ensurePatientFolder, listFolder } from '@/lib/gdrive'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/drive/list?patientId=...&patientName=...  — файлы папки пациента
export async function GET(req: Request) {
  if (!(await requireUser(req))) return jsonError('Нужно войти в приложение заново.', 401)
  const url = new URL(req.url)
  const patientId = url.searchParams.get('patientId') ?? ''
  const patientName = url.searchParams.get('patientName') ?? ''
  if (!patientId) return jsonError('Не указан пациент')
  try {
    const folder = await ensurePatientFolder(patientId, patientName)
    return Response.json({ files: await listFolder(folder) })
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : 'Ошибка Google Drive', 500)
  }
}
