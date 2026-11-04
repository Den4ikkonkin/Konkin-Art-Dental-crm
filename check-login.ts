import './scripts/ws-shim'
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const email = process.env.SUPABASE_EMAIL!
const password = process.env.SUPABASE_PASSWORD!

const db = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })

const { data, error } = await db.auth.signInWithPassword({ email, password })
if (error || !data.session) {
  console.log('✖ ВХОД НЕ УДАЛСЯ:', error?.message)
  process.exit(1)
}
console.log('✓ Вход выполнен:', data.user.email)
console.log('  uid:', data.user.id)

const [p, o, s] = await Promise.all([
  db.from('patients').select('id,name').limit(5),
  db.from('orders').select('id,number,due_on,appointment,status').limit(5),
  db.from('notification_settings').select('telegram_chat_id,link_code,morning_time').maybeSingle(),
])
console.log('  пациентов (видно):', p.data?.length ?? p.error?.message)
console.log('  нарядов (видно):', o.data?.length ?? o.error?.message)
console.log('  настройки бота:', s.data ?? '(строка ещё не создана — это нормально)')
if (o.data?.length) console.log('  пример наряда:', JSON.stringify(o.data[0]))
