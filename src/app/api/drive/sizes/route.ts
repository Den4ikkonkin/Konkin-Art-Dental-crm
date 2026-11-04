import { requireUser, jsonError } from '@/lib/drive-server-auth'
import { patientSizes } from '@/lib/gdrive'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

// GET /api/drive/sizes — количество файлов и занятый объём по каждому пациенту.
export async function GET(req: Request) {
  if (!(await requireUser(req))) return jsonError('Нужно войти в приложение заново.', 401)
  try {
    return Response.json({ sizes: await patientSizes() })
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : 'Ошибка Google Drive', 500)
  }
}
