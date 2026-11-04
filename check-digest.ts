import './scripts/ws-shim'
import { createClient } from '@supabase/supabase-js'
import { buildDigest } from './src/lib/digest'

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } })
const { data } = await db.auth.signInWithPassword({ email: process.env.SUPABASE_EMAIL!, password: process.env.SUPABASE_PASSWORD! })

const [orders, patients, settings] = await Promise.all([
  db.from('orders').select('id,number,patient_id,due_on,appointment,status,paid,items'),
  db.from('patients').select('id,name'),
  db.from('notification_settings').select('utc_offset_minutes,notify_tomorrow,notify_due_today,notify_overdue,morning_time').maybeSingle(),
])
const st = (settings.data ?? {}) as any
console.log('=== НАСТРОЙКИ ===', settings.data ?? 'строка не создана, берутся значения по умолчанию (UTC+4, 08:00)')
console.log('=== ВСЕГО ===')
console.log('  нарядов:', orders.data?.length, '| пациентов:', patients.data?.length)
const appts = (orders.data ?? []).filter((o: any) => o.appointment)
console.log('  нарядов с приёмом:', appts.length)

const d = buildDigest({
  now: new Date(),
  orders: (orders.data ?? []).map((o: any) => ({ id: o.id, number: o.number, patientId: o.patient_id, appointment: o.appointment ?? '', dueDate: o.due_on, status: o.status, paid: Number(o.paid ?? 0), items: o.items ?? [] })),
  patients: (patients.data ?? []) as any,
  options: { utcOffsetMinutes: st.utc_offset_minutes ?? 240, includeTomorrow: st.notify_tomorrow ?? true, includeDueToday: st.notify_due_today ?? false, includeOverdue: st.notify_overdue ?? false },
})
console.log('\n=== ЧТО ПРИДЁТ В TELEGRAM ===')
console.log(d.text.replace(/<[^>]+>/g, ''))
console.log('\nкнопок «Готово»:', d.todayOrders.length)
