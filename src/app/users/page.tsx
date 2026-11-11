'use client'

// Пользователи: создание учёток, временные пароли, архивация.
// Создание идёт через серверный маршрут с service_role: ключ
// администратора в браузер не попадает никогда.

import { useEffect, useState } from 'react'
import { useStore } from '@/components/Store'
import { Heading, Field } from '@/components/UI'
import { supabase } from '@/lib/supabase'
import { AlertTriangle, UserPlus, KeyRound, Archive, RotateCcw } from 'lucide-react'
import type { Role } from '@/lib/roles'

type UserRow = {
  userId: string
  login: string
  role: Role
  status: 'active' | 'archived'
  displayName: string
  mustChangePassword: boolean
}

const ROLE_RU: Record<Role, string> = {
  admin: 'Администратор',
  doctor: 'Врач',
  technician: 'Техник',
}

export default function UsersPage() {
  const { role, session } = useStore()
  const [rows, setRows] = useState<UserRow[]>([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState({ login: '', role: 'technician' as Role, password: '' })

  async function load() {
    const { data, error } = await supabase
      .from('profiles')
      .select('user_id,login,role,status,display_name,must_change_password')
      .order('login')
    if (error) { setError('Не удалось загрузить список пользователей'); return }
    setRows((data as {
      user_id: string; login: string; role: Role; status: 'active' | 'archived'
      display_name: string | null; must_change_password: boolean
    }[]).map((r) => ({
      userId: r.user_id, login: r.login, role: r.role, status: r.status,
      displayName: r.display_name ?? '', mustChangePassword: r.must_change_password,
    })))
  }

  useEffect(() => { if (role === 'admin') void load() }, [role])

  async function createUser(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setNotice('')
    if (!/^[a-z0-9_.-]{2,32}$/.test(draft.login)) {
      setError('Логин: строчные латинские буквы, цифры, точка, дефис. От 2 до 32 символов.')
      return
    }
    if (draft.password.length < 8) {
      setError('Пароль не короче 8 символов.')
      return
    }
    setBusy(true)
    try {
      const token = session?.access_token
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(draft),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error ?? 'Не удалось создать пользователя')
      setNotice(`Учётка «${draft.login}» создана. Передайте пароль лично: он больше не покажется.`)
      setDraft({ login: '', role: 'technician', password: '' })
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка создания')
    } finally {
      setBusy(false)
    }
  }

  async function archiveUser(userId: string, login: string) {
    if (!confirm(`Заблокировать вход для «${login}»? Наряды и файлы сохранятся, администратор их видит.`)) return
    const token = session?.access_token
    const res = await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ userId, status: 'archived' }),
    })
    if (!res.ok) { setError('Не удалось архивировать пользователя'); return }
    await load()
  }

  async function restoreUser(userId: string) {
    const token = session?.access_token
    const res = await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ userId, status: 'active' }),
    })
    if (!res.ok) { setError('Не удалось восстановить пользователя'); return }
    await load()
  }

  async function resetPassword(userId: string, login: string) {
    const next = prompt(`Новый временный пароль для «${login}» (не короче 8 символов):`)
    if (!next) return
    if (next.length < 8) { setError('Пароль не короче 8 символов.'); return }
    const token = session?.access_token
    const res = await fetch('/api/admin/users', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ userId, password: next }),
    })
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      setError(json.error ?? 'Не удалось сбросить пароль')
      return
    }
    setNotice(`Пароль для «${login}» изменён. При следующем входе потребуется смена.`)
  }

  if (role !== 'admin') {
    return (
      <div className="panel empty">
        <AlertTriangle size={20} className="inline-icon" />
        Раздел доступен только администратору.
      </div>
    )
  }

  return (
    <>
      <Heading
        title="Пользователи"
        sub="Учётки по логину: технические адреса пользователю не показываются. Заблокированный не входит, его данные остаются."
      />

      {error && <div className="alert" role="alert">{error}</div>}
      {notice && <div className="note" role="status">{notice}</div>}

      <form className="panel" onSubmit={createUser}>
        <h2><UserPlus size={16} className="inline-icon" /> Новая учётка</h2>
        <div className="form-meta">
          <Field label="Логин *">
            <input
              required maxLength={32}
              placeholder="denis"
              value={draft.login}
              onChange={(e) => setDraft({ ...draft, login: e.target.value.toLowerCase() })}
            />
          </Field>
          <Field label="Роль *">
            <select value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value as Role })}>
              <option value="technician">Техник</option>
              <option value="doctor">Врач</option>
              <option value="admin">Администратор</option>
            </select>
          </Field>
          <Field label="Временный пароль *">
            <input
              required type="text" minLength={8} maxLength={72}
              placeholder="не короче 8 символов"
              value={draft.password}
              onChange={(e) => setDraft({ ...draft, password: e.target.value })}
            />
          </Field>
        </div>
        <button className="btn primary" type="submit" disabled={busy}>
          <UserPlus size={16} /> {busy ? 'Создаю…' : 'Создать учётку'}
        </button>
      </form>

      <section className="panel">
        <div className="panel-heading"><h2>Учётки</h2></div>
        <table className="responsive">
          <thead>
            <tr><th>Логин</th><th>Роль</th><th>Статус</th><th>Действия</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.userId}>
                <td data-label="Логин">{r.login}</td>
                <td data-label="Роль">{ROLE_RU[r.role]}</td>
                <td data-label="Статус">{r.status === 'active' ? 'Активен' : 'Заблокирован'}</td>
                <td data-label="Действия">
                  <div className="row">
                    <button className="btn small" onClick={() => void resetPassword(r.userId, r.login)}>
                      <KeyRound size={13} /> Сбросить пароль
                    </button>
                    {r.status === 'active' ? (
                      <button className="btn small danger" onClick={() => void archiveUser(r.userId, r.login)}>
                        <Archive size={13} /> Заблокировать
                      </button>
                    ) : (
                      <button className="btn small" onClick={() => void restoreUser(r.userId)}>
                        <RotateCcw size={13} /> Вернуть
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  )
}
