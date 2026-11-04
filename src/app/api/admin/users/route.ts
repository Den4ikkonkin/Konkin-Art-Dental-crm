// POST   /api/admin/users — создать учётку по логину
// PATCH  /api/admin/users — заблокировать или восстановить
// PUT    /api/admin/users — выдать новый временный пароль
//
// service_role живёт только здесь, на сервере. Браузер присылает
// access token администратора, маршрут проверяет роль в базе
// и только потом трогает Auth.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

/** Логин превращается в технический email — пользователь его не видит. */
function loginToEmail(login: string): string {
  return `${login.trim().toLowerCase()}@konkin.local`
}

function adminClient() {
  if (!url || !serviceKey) return null
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/** Проверка, что запрос делает действующий администратор. */
async function requireAdmin(request: Request): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const header = request.headers.get('authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!token || !url || !anon) return { ok: false, error: 'Нет авторизации' }

  const userClient = createClient(url, anon, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { authorization: `Bearer ${token}` } },
  })

  const { data: auth, error: authError } = await userClient.auth.getUser()
  if (authError || !auth.user) return { ok: false, error: 'Сессия недействительна' }

  const { data: profile } = await userClient
    .from('profiles')
    .select('role,status')
    .eq('user_id', auth.user.id)
    .maybeSingle()

  const row = profile as { role?: string; status?: string } | null
  if (!row || row.role !== 'admin' || row.status !== 'active') {
    return { ok: false, error: 'Доступ только для администратора' }
  }

  return { ok: true, userId: auth.user.id }
}

export async function POST(request: Request) {
  const guard = await requireAdmin(request)
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: 403 })

  const body = await request.json().catch(() => null) as
    { login?: string; role?: string; password?: string; displayName?: string } | null
  if (!body?.login || !body.password) {
    return NextResponse.json({ error: 'Нужны логин и пароль' }, { status: 400 })
  }
  if (!/^[a-z0-9_.-]{2,32}$/.test(body.login)) {
    return NextResponse.json({ error: 'Логин: строчные латинские, цифры, точка, дефис' }, { status: 400 })
  }
  if (body.password.length < 8) {
    return NextResponse.json({ error: 'Пароль короче 8 символов' }, { status: 400 })
  }

  const admin = adminClient()
  if (!admin) return NextResponse.json({ error: 'На сервере не задан SUPABASE_SERVICE_ROLE_KEY' }, { status: 500 })

  const email = loginToEmail(body.login)
  const role = ['admin', 'doctor', 'technician'].includes(body.role ?? '')
    ? body.role!
    : 'technician'

  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password: body.password,
    email_confirm: true,
    user_metadata: { display_name: body.displayName ?? body.login, login: body.login },
  })

  if (error || !created.user) {
    const msg = /already/i.test(error?.message ?? '')
      ? 'Такой логин уже занят'
      : error?.message ?? 'Не удалось создать пользователя'
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  // Профиль создаёт триггер, но роль и логин выставляем явно:
  // триггер не знает, кем должен быть человек.
  const { error: profileError } = await admin
    .from('profiles')
    .upsert({
      user_id: created.user.id,
      login: body.login.toLowerCase(),
      role,
      status: 'active',
      display_name: body.displayName ?? body.login,
      must_change_password: true,
    }, { onConflict: 'user_id' })

  if (profileError) {
    return NextResponse.json({ error: 'Учётка создана, профиль не сохранён: ' + profileError.message }, { status: 500 })
  }

  // Привязка к справочнику: техник по имени, врач по фамилии.
  if (role === 'technician') {
    await admin.from('technicians').update({ profile_id: created.user.id })
      .ilike('name', body.displayName ?? body.login).is('profile_id', null)
  }
  if (role === 'doctor') {
    await admin.from('doctors').update({ profile_id: created.user.id })
      .ilike('surname', body.displayName ?? body.login).is('profile_id', null)
  }

  return NextResponse.json({ ok: true, userId: created.user.id, login: body.login.toLowerCase() })
}

export async function PATCH(request: Request) {
  const guard = await requireAdmin(request)
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: 403 })

  const body = await request.json().catch(() => null) as
    { userId?: string; status?: 'active' | 'archived' } | null
  if (!body?.userId || !body.status) {
    return NextResponse.json({ error: 'Нужны userId и status' }, { status: 400 })
  }
  if (body.userId === guard.userId && body.status === 'archived') {
    return NextResponse.json({ error: 'Нельзя заблокировать самого себя' }, { status: 400 })
  }

  const admin = adminClient()
  if (!admin) return NextResponse.json({ error: 'Нет service_role' }, { status: 500 })

  const { error } = await admin.from('profiles').update({ status: body.status }).eq('user_id', body.userId)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  // Заблокированный не должен иметь возможности обновить сессию.
  if (body.status === 'archived') {
    await admin.auth.admin.updateUserById(body.userId, { ban_duration: '876000h' })
  } else {
    await admin.auth.admin.updateUserById(body.userId, { ban_duration: 'none' })
  }

  return NextResponse.json({ ok: true })
}

export async function PUT(request: Request) {
  const guard = await requireAdmin(request)
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: 403 })

  const body = await request.json().catch(() => null) as
    { userId?: string; password?: string } | null
  if (!body?.userId || !body.password || body.password.length < 8) {
    return NextResponse.json({ error: 'Пароль короче 8 символов' }, { status: 400 })
  }

  const admin = adminClient()
  if (!admin) return NextResponse.json({ error: 'Нет service_role' }, { status: 500 })

  const { error } = await admin.auth.admin.updateUserById(body.userId, { password: body.password })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  // Временный пароль снова требует смены при входе.
  await admin.from('profiles').update({ must_change_password: true }).eq('user_id', body.userId)

  return NextResponse.json({ ok: true })
}
