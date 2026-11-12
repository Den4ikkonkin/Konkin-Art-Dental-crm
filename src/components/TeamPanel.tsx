'use client'

// Блок «Команда» на главной: круглые аватарки всех, у кого есть доступ.
//
// Данные из функции team_directory(), а не из таблицы profiles: политика
// profiles_self не даёт технику видеть чужие строки, и без функции он
// увидел бы только себя.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useStore } from './Store'
import Avatar from './Avatar'
import styles from './TeamPanel.module.css'

type Member = {
  user_id: string
  login: string
  display_name: string | null
  role: 'admin' | 'doctor' | 'technician'
  avatar_url: string | null
}

const ROLE_LABEL: Record<string, string> = {
  admin: 'Администратор',
  doctor: 'Врач',
  technician: 'Техник',
}

/** Фото может быть записано как полный путь или как голое имя файла. */
function photoSrc(m: Member): string {
  const v = (m.avatar_url ?? '').trim()
  if (v) return v.startsWith('/') || v.startsWith('http') ? v : `/team/${v}`
  return `/team/${m.login}.png`
}

export default function TeamPanel() {
  const { session, realRole } = useStore()
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    void (async () => {
      const { data, error } = await supabase.rpc('team_directory')
      if (!alive) return
      if (!error && data) setMembers(data as Member[])
      setLoading(false)
    })()
    return () => { alive = false }
  }, [session?.user.id])

  if (loading) return null
  if (!members.length) return null

  return (
    <section className={styles.panel}>
      <div className={styles.head}>
        <h2>Команда</h2>
        <span className={styles.count}>{members.length}</span>
        {realRole === 'admin' && (
          <Link href="/users" className={styles.link}>Управление доступом</Link>
        )}
      </div>

      <ul className={styles.list}>
        {members.map((m) => {
          const name = (m.display_name ?? '').trim() || m.login
          const isMe = m.user_id === session?.user.id
          return (
            <li key={m.user_id} className={isMe ? styles.me : undefined}>
              <Avatar src={photoSrc(m)} name={name} size={54} />
              <b>{name}</b>
              <small>{isMe ? 'это вы' : ROLE_LABEL[m.role] ?? m.role}</small>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
