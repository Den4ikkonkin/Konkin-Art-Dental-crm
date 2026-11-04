import { requireUser, jsonError } from '@/lib/drive-server-auth'
import { ensurePatientFolder, getParents, deleteFile } from '@/lib/gdrive'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST /api/drive/delete  { patientId, patientName, fileId }
// Удаляет только файл, который лежит в папке этого пациента.
export async function POST(req: Request) {
  if (!(await requireUser(req))) return jsonError('Нужно войти в приложение заново.', 401)
  const body = await req.json().catch(() => null) as { patientId?: string; patientName?: string; fileId?: string } | null
  if (!body?.patientId || !body.fileId) return jsonError('Не хватает данных')
  try {
    const folder = await ensurePatientFolder(body.patientId, body.patientName ?? '')
    const parents = await getParents(body.fileId)
    if (!parents.includes(folder)) return jsonError('Файл не относится к этому пациенту', 403)
    await deleteFile(body.fileId)
    return Response.json({ ok: true })
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : 'Ошибка Google Drive', 500)
  }
}
