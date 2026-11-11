'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useStore } from './Store'
import { KeyRound } from 'lucide-react'

export default function PasswordCard() {
  const { session, markPasswordChanged } = useStore()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [again, setAgain] = useState('')
  const [message, setMessage] = useState('')
  const [ok, setOk] = useState('')
  const [busy, setBusy] = useState(false)
  const email = session?.user.email ?? ''

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setMessage(''); setOk('')
    if (next.length < 8) return setMessage('Новый пароль короче 8 символов.')
    if (next !== again) return setMessage('Новые пароли не совпадают.')
    if (next === current) return setMessage('Новый пароль совпадает с текущим.')
    setBusy(true)
    try {
      const { error: e1 } = await supabase.auth.signInWithPassword({ email, password: current })
      if (e1) throw new Error('Текущий пароль неверен')
      const { error: e2 } = await supabase.auth.updateUser({ password: next })
      if (e2) throw e2
      await markPasswordChanged()
      setOk('Пароль изменён.'); setCurrent(''); setNext(''); setAgain('')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Не удалось сменить пароль')
    } finally { setBusy(false) }
  }

  return (
    <section className="panel">
      <h2><KeyRound size={17} className="inline-icon" /> Мой пароль</h2>
      {message && <div className="alert" role="alert">{message}</div>}
      {ok && <div className="note" role="status">{ok}</div>}
      <form onSubmit={submit}>
        <div className="form-meta">
          <label className="field"><span>Текущий пароль *</span><input required type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} /></label>
          <label className="field"><span>Новый пароль *</span><input required type="password" minLength={8} maxLength={72} autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} /></label>
          <label className="field"><span>Повторите *</span><input required type="password" minLength={8} maxLength={72} autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} /></label>
        </div>
        <button className="btn primary" type="submit" disabled={busy}><KeyRound size={16} /> {busy ? 'Меняю…' : 'Сменить пароль'}</button>
      </form>
    </section>
  )
}
