'use client'

// Обязательная смена пароля при первом входе.
// Пока флаг must_change_password включён, Gate показывает этот экран
// вместо рабочих страниц — обойти его нельзя.

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useStore } from './Store'
import { KeyRound, LogOut } from 'lucide-react'

export default function FirstLoginPassword() {
  const { markPasswordChanged, signOut } = useStore()
  const [next, setNext] = useState('')
  const [again, setAgain] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setMessage('')

    if (next.length < 8) { setMessage('Пароль не короче 8 символов.'); return }
    if (next !== again) { setMessage('Пароли не совпадают.'); return }

    setBusy(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: next })
      if (error) throw error
      await markPasswordChanged()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Не удалось сменить пароль')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={submit}>
        <h1><KeyRound size={20} className="inline-icon" /> Смена пароля</h1>
        <p className="muted">
          Администратор выдал временный пароль. Задайте свой — не короче 8 символов.
          Этот шаг обязателен при первом входе.
        </p>

        <label className="field">
          <span>Новый пароль</span>
          <input
            type="password" required minLength={8} autoComplete="new-password"
            value={next} onChange={(e) => setNext(e.target.value)}
            placeholder="минимум 8 символов"
          />
        </label>

        <label className="field">
          <span>Повторите пароль</span>
          <input
            type="password" required minLength={8} autoComplete="new-password"
            value={again} onChange={(e) => setAgain(e.target.value)}
          />
        </label>

        {message && <div className="alert" role="alert">{message}</div>}

        <button className="btn primary full" type="submit" disabled={busy}>
          <KeyRound size={16} /> {busy ? 'Сохраняю…' : 'Сохранить пароль'}
        </button>

        <button
          type="button"
          className="btn small full"
          onClick={() => void signOut()}
        >
          <LogOut size={14} /> Выйти
        </button>
      </form>
    </div>
  )
}
