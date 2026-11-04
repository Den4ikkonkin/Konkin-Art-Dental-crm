import { requireUser, jsonError } from '@/lib/drive-server-auth'
import { storageQuota } from '@/lib/gdrive'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/drive/quota — занято и всего места на Google Drive аккаунта.
export async function GET(req: Request) {
  if (!(await requireUser(req))) return jsonError('Нужно войти в приложение заново.', 401)
  try {
    return Response.json(await storageQuota())
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : 'Ошибка Google Drive', 500)
  }
}
