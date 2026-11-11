import { NextResponse } from 'next/server'
import { adminClient, userClient, hasServiceRole, serverUrl, serverAnonKey } from '@/lib/server-supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function loginToEmail(login: string): string {
  return `${login.trim().toLowerCase()}@konkin.local`
}

type Guard = { ok: true; userId: string } | { ok: false; error: string; code: number }

async function requireAdmin(request: Request): Promise<Guard> {
  const header = request.headers.get('authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (!token) return { ok: false, error: 'Нет авторизации: не передан токен сессии', code: 401 }

  const client = userClient(token)
  const { data: auth, error: authError } = await client.auth.getUser(token)
  if (authError || !auth?.user) {
    const why = authError?.message ?? 'пользователь по токену не найден'
    const status = (authError as { status?: number } | null)?.status ?? 'нет'
    console.error('[admin] getUser failed:', why, status)
    return {
      ok: false,
      error: `Сессия недействительна: ${why} (код ${status}). Выйдите из системы и войдите заново.`,
      code: 401,
    }
  }

  const { data: profile, error: profileError } = await client
    .from('profiles')
    .select('role,status')
    .eq('user_id', auth.user.id)
    .maybeSingle()

  if (profileError) {
    return { ok: false, error: 'Не удалось прочитать профиль: ' + profileError.message, code: 403 }
  }
  const row = profile as { role?: string; status?: string } | null
  if (!row) {
    return { ok: false, error: 'Профиль этого пользователя не найден в базе', code: 403 }
  }
  if (row.role !== 'admin' || row.status !== 'active') {
    return {
      ok: false,
      error: `Доступ только для администратора (роль: ${row.role}, статус: ${row.status})`,
      code: 403,
    }
  }
  return { ok: true, userId: auth.user.id }
}

function noServiceRole() {
  return NextResponse.json(
    {
      error:
        'На сервере не задан SUPABASE_SERVICE_ROLE_KEY. Добавьте его в Vercel → Settings → Environment Variables для нужного окружения и сделайте Redeploy.',
    },
    { status: 500 },
  )
}

export async function POST(request: Request) {
  const guard = await requireAdmin(request)
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.code })

  const body = (await request.json().catch(() => null)) as
    | { login?: string; role?: string; password?: string; displayName?: string }
    | null
  if (!body?.login || !body.password) {
    return NextResponse.json({ error: 'Нужны логин и пароль' }, { status: 400 })
  }
  if (!/^[a-z0-9_.-]{2,32}$/.test(body.login)) {
    return NextResponse.json(
      { error: 'Логин: строчные латинские, цифры, точка, дефис. От 2 до 32 символов' },
      { status: 400 },
    )
  }
  if (body.password.length < 8) {
    return NextResponse.json({ error: 'Пароль короче 8 символов' }, { status: 400 })
  }

  const admin = adminClient()
  if (!admin) return noServiceRole()

  const role = ['admin', 'doctor', 'technician'].includes(body.role ?? '') ? body.role! : 'technician'

  const { data: created, error } = await admin.auth.admin.createUser({
    email: loginToEmail(body.login),
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

  const { error: profileError } = await admin.from('profiles').upsert(
    {
      user_id: created.user.id,
      login: body.login.toLowerCase(),
      role,
      status: 'active',
      display_name: body.displayName ?? body.login,
      must_change_password: true,
    },
    { onConflict: 'user_id' },
  )
  if (profileError) {
    return NextResponse.json(
      { error: 'Учётка создана, профиль не сохранён: ' + profileError.message },
      { status: 500 },
    )
  }

  if (role === 'technician') {
    await admin
      .from('technicians')
      .update({ profile_id: created.user.id })
      .ilike('name', body.displayName ?? body.login)
      .is('profile_id', null)
  }
  if (role === 'doctor') {
    await admin
      .from('doctors')
      .update({ profile_id: created.user.id })
      .ilike('surname', body.displayName ?? body.login)
      .is('profile_id', null)
  }

  return NextResponse.json({ ok: true, userId: created.user.id, login: body.login.toLowerCase() })
}

export async function PATCH(request: Request) {
  const guard = await requireAdmin(request)
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.code })

  const body = (await request.json().catch(() => null)) as
    | { userId?: string; status?: 'active' | 'archived' }
    | null
  if (!body?.userId || !body.status) {
    return NextResponse.json({ error: 'Нужны userId и status' }, { status: 400 })
  }
  if (body.userId === guard.userId && body.status === 'archived') {
    return NextResponse.json({ error: 'Нельзя заблокировать самого себя' }, { status: 400 })
  }

  const admin = adminClient()
  if (!admin) return noServiceRole()

  const { error } = await admin.from('profiles').update({ status: body.status }).eq('user_id', body.userId)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  await admin.auth.admin.updateUserById(body.userId, {
    ban_duration: body.status === 'archived' ? '876000h' : 'none',
  })
  return NextResponse.json({ ok: true })
}

export async function PUT(request: Request) {
  const guard = await requireAdmin(request)
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.code })

  const body = (await request.json().catch(() => null)) as
    | { userId?: string; password?: string }
    | null
  if (!body?.userId || !body.password || body.password.length < 8) {
    return NextResponse.json({ error: 'Пароль короче 8 символов' }, { status: 400 })
  }

  const admin = adminClient()
  if (!admin) return noServiceRole()

  const { error } = await admin.auth.admin.updateUserById(body.userId, { password: body.password })
  if (error) return NextResponse.json({ error: 'Не удалось сменить пароль: ' + error.message }, { status: 400 })

  await admin.from('profiles').update({ must_change_password: true }).eq('user_id', body.userId)
  return NextResponse.json({ ok: true })
}

/** Диагностика. Показывает, к каким проектам Supabase относятся URL и ключ на сервере. Секреты не раскрывает. */
export async function GET() {
  const hostRef = (u: string) => {
    try { return new URL(u).hostname.split('.')[0] } catch { return '?' }
  }
  const keyRef = (k: string) => {
    try {
      return JSON.parse(Buffer.from(k.split('.')[1] ?? '', 'base64url').toString()).ref ?? '?'
    } catch { return '?' }
  }
  const urlProject = hostRef(serverUrl)
  const anonKeyProject = keyRef(serverAnonKey)
  return NextResponse.json({
    serviceRole: hasServiceRole ? 'ключ задан' : 'ключа НЕТ',
    urlProject,
    anonKeyProject,
    projectsMatch: urlProject === anonKeyProject,
  })
}
