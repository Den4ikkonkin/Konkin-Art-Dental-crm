import { readFileSync } from 'node:fs'
if (!('WebSocket' in globalThis)) {
  ;(globalThis as any).WebSocket = class { static OPEN=1; static CLOSED=3; readyState=3
    addEventListener(){} removeEventListener(){} close(){} send(){throw new Error('no rt')} }
}
const env: Record<string,string> = {}
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const t = line.trim()
  if (!t || t.startsWith('#')) continue
  const i = t.indexOf('=')
  if (i < 0) continue
  let v = t.slice(i + 1).trim()
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
  env[t.slice(0, i).trim()] = v
}

async function main() {
  const { createClient } = await import('@supabase/supabase-js')
  const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await db.auth.signInWithPassword({ email: env.SUPABASE_EMAIL, password: env.SUPABASE_PASSWORD })
  if (error || !data.session) { console.log('ВХОД НЕ УДАЛСЯ:', error?.message); return }
  console.log('✓ вошли как', data.user.email)

  const { data: rows, error: e2 } = await db.from('notification_settings')
    .select('telegram_chat_id,telegram_username,link_code,enabled,morning_time,utc_offset_minutes')
  console.log('\n=== НАСТРОЙКИ В БАЗЕ ===')
  if (e2) console.log('ОШИБКА:', e2.message)
  else if (!rows?.length) console.log('строк НЕТ — код привязки ни разу не создавался')
  else rows.forEach((r: any) => {
    console.log('chat_id  :', r.telegram_chat_id || '(ПУСТО — не привязан)')
    console.log('username :', r.telegram_username || '(пусто)')
    console.log('link_code:', r.link_code || '(пусто)')
    console.log('время    :', r.morning_time, '| UTC+', Number(r.utc_offset_minutes) / 60, '| вкл:', r.enabled)
  })
}
main()
