import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { FALLBACK_SUPABASE_URL, FALLBACK_SUPABASE_ANON_KEY } from './config'

// Переменные окружения имеют приоритет, но если файл .env.local не прочитался,
// берём публичные значения из config.ts — приложение всё равно запустится.
// Подробнее, почему это безопасно: см. комментарий в config.ts.
const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const rawKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// Заглушки из .env.example не должны считаться рабочим значением.
const isPlaceholder = (v?: string) =>
  !v || /ВСТАВЬТЕ|ВАШ-|PLACEHOLDER/i.test(v)

export const supabaseUrl = isPlaceholder(rawUrl) ? FALLBACK_SUPABASE_URL : rawUrl!
export const supabaseAnonKey = isPlaceholder(rawKey) ? FALLBACK_SUPABASE_ANON_KEY : rawKey!

/** Откуда взялись значения: 'env' — из .env.local, 'config' — запасные из кода. */
export const supabaseSource: 'env' | 'config' =
  isPlaceholder(rawUrl) || isPlaceholder(rawKey) ? 'config' : 'env'

export const supabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
})

export const FILES_BUCKET = 'patient-files'
export const MAX_FILE_BYTES = 25 * 1024 * 1024
