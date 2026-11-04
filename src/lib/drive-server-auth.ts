// Проверка, что запрос пришёл от вошедшего в приложение пользователя.
// Токен Supabase проверяется на сервере Supabase, поэтому подделать его нельзя.
import { supabaseUrl, supabaseAnonKey } from './supabase'

export async function requireUser(req: Request): Promise<boolean> {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!token) return false
  const r = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: supabaseAnonKey, authorization: `Bearer ${token}` },
    cache: 'no-store',
  })
  return r.ok
}

export function jsonError(message: string, status = 400) {
  return Response.json({ error: message }, { status })
}
