import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { FALLBACK_SUPABASE_URL, FALLBACK_SUPABASE_ANON_KEY } from './config'

const isPlaceholder = (v?: string) =>
  !v || /ВСТАВЬТЕ|ВАШ-|PLACEHOLDER/i.test(v)

export const serverUrl = isPlaceholder(process.env.NEXT_PUBLIC_SUPABASE_URL)
  ? FALLBACK_SUPABASE_URL
  : process.env.NEXT_PUBLIC_SUPABASE_URL!

export const serverAnonKey = isPlaceholder(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  ? FALLBACK_SUPABASE_ANON_KEY
  : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

export const hasServiceRole = serviceRoleKey.length > 40

export function adminClient(): SupabaseClient | null {
  if (!serverUrl || !hasServiceRole) return null
  return createClient(serverUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export function userClient(token: string): SupabaseClient {
  return createClient(serverUrl, serverAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { authorization: `Bearer ${token}` } },
  })
}
