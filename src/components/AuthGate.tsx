'use client'

// Экран входа. Логин вместо почты: технический адрес вида
// denis@konkin.local пользователь не видит и не вводит.
// Самостоятельной регистрации нет — учётки создаёт администратор.

import { useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { loginToEmail } from '@/lib/db'
import { LogIn, ShieldAlert } from 'lucide-react'

export default function AuthGate() {
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setMessage('')

    if (password.length < 8) {
      setMessage('Пароль не короче 8 символов.')
      return
    }

    setBusy(true)
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: loginToEmail(login),
        password,
      })
      if (error) throw error
    } catch (err) {
      const text = err instanceof Error ? err.message : 'Не удалось выполнить вход'
      setMessage(
        /Invalid login|invalid_grant/i.test(text)
          ? 'Неверный логин или пароль.'
          : /Email not confirmed/i.test(text)
            ? 'Учётка не подтверждена. Обратитесь к администратору.'
            : /banned|blocked/i.test(text)
              ? 'Доступ к системе закрыт. Обратитесь к администратору.'
              : text,
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={submit}>
        <Link href="/" className="auth-logo" aria-label="Konkin Art Dental — CAD/CAM Studio">
          <img
            className="auth-logo-dark"
            src="/brand/konkin-art-dental-dark.svg"
            alt="Konkin Art Dental — CAD/CAM Studio"
            width={880}
            height={560}
          />
          <img
            className="auth-logo-light"
            src="/brand/konkin-art-dental-light.svg"
            alt="Konkin Art Dental — CAD/CAM Studio"
            width={880}
            height={560}
          />
        </Link>

        <h1>Вход в лабораторию</h1>
        <p className="muted">
          Введите логин, который выдал администратор. Пароль можно сменить после входа в разделе «Настройки».
        </p>

        <label className="field">
          <span>Логин</span>
          <input
            type="text"
            required
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            value={login}
            onChange={(e) => setLogin(e.target.value.toLowerCase())}
            placeholder="denis"
          />
        </label>

        <label className="field">
          <span>Пароль</span>
          <input
            type="password"
            required
            minLength={8}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="минимум 8 символов"
          />
        </label>

        {message && <div className="alert" role="alert">{message}</div>}

        <button className="btn primary full" type="submit" disabled={busy}>
          <LogIn size={17} />
          {busy ? 'Проверяю…' : 'Войти'}
        </button>

        <p className="muted small">
          <ShieldAlert size={14} className="inline-icon" />
          Самостоятельная регистрация отключена. Учётку создаёт администратор лаборатории.
        </p>
      </form>
    </div>
  )
}
