import { requireUser, jsonError } from '@/lib/drive-server-auth'
import { dedupeFolders } from '@/lib/gdrive'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

// POST /api/drive/dedupe — сливает одинаковые папки пациентов на Google Drive.
export async function POST(req: Request) {
  if (!(await requireUser(req))) return jsonError('Нужно войти в приложение заново.', 401)
  try {
    const result = await dedupeFolders()
    return Response.json(result)
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : 'Ошибка Google Drive', 500)
  }
}
