'use client'

// Блок «Команда» на главной: крупные круглые аватарки в одну строку.
// Клик по аватарке открывает карточку сотрудника: фото, календарь и наряды.
// Администратора в блоке не показываем.

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useStore } from './Store'
import Avatar from './Avatar'
import { today } from '@/lib/model'
import styles from './TeamPanel.module.css'

type Member = {
  user_id: string
  login: string
  display_name: string | null
  role: 'admin' | 'doctor' | 'technician'
  avatar_url: string | null
}

type Order = {
  id: string
  number: number
  patientId: string
  dueDate: string
  status: string
  doctor?: string
  technician?: string
  items: { price: number }[]
}

type Patient = { id: string; name: string }

const ROLE_LABEL: Record<string, string> = {
  admin: 'Администратор',
  doctor: 'Врач',
  technician: 'Техник',
}

const STATUS_LABEL: Record<string, string> = {
  new: 'Новый',
  awaiting_fitting: 'Ждёт примерки',
  fitted: 'Примерка',
  in_progress: 'В работе',
  done: 'Готово',
}

const MONTHS = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
]
const WEEK = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

/** Фото может быть записано как полный путь или как голое имя файла. */
function photoSrc(m: Member): string {
  const v = (m.avatar_url ?? '').trim()
  if (v) return v.startsWith('/') || v.startsWith('http') ? v : `/team/${v}`
  return `/team/${m.login}.png`
}

const norm = (s: string) => (s ?? '').trim().toLowerCase()

export default function TeamPanel() {
  const { session, realRole, data } = useStore()
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [openId, setOpenId] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    void (async () => {
      const { data: rows, error } = await supabase.rpc('team_directory')
      if (!alive) return
      if (!error && rows) setMembers(rows as Member[])
      setLoading(false)
    })()
    return () => { alive = false }
  }, [session?.user.id])

  const visible = members.filter((m) => m.role !== 'admin')
  const opened = visible.find((m) => m.user_id === openId) ?? null

  if (loading || !visible.length) return null

  return (
    <section className={styles.panel}>
      <div className={styles.head}>
        <h2>Команда</h2>
        <span className={styles.count}>{visible.length}</span>
        {realRole === 'admin' && (
          <Link href="/users" className={styles.link}>Управление доступом</Link>
        )}
      </div>

      <ul className={styles.list}>
        {visible.map((m) => {
          const name = (m.display_name ?? '').trim() || m.login
          const isMe = m.user_id === session?.user.id
          return (
            <li key={m.user_id} className={isMe ? styles.me : undefined}>
              <button
                type="button"
                className={styles.card}
                onClick={() => setOpenId(m.user_id)}
                aria-label={`Открыть карточку: ${name}`}
              >
                <Avatar src={photoSrc(m)} name={name} size={150} />
              </button>
              <b>{name}</b>
              <small>{isMe ? 'это вы' : ROLE_LABEL[m.role] ?? m.role}</small>
            </li>
          )
        })}
      </ul>

      {opened && (
        <MemberModal
          member={opened}
          isMe={opened.user_id === session?.user.id}
          orders={data.orders as Order[]}
          patients={data.patients as Patient[]}
          onClose={() => setOpenId(null)}
        />
      )}
    </section>
  )
}

function MemberModal({
  member, isMe, orders, patients, onClose,
}: {
  member: Member
  isMe: boolean
  orders: Order[]
  patients: Patient[]
  onClose: () => void
}) {
  const name = (member.display_name ?? '').trim() || member.login
  const nameKey = norm(name)
  const loginKey = norm(member.login)

  // Наряды, где сотрудник указан техником или врачом (по имени или логину)
  const mine = useMemo(
    () =>
      orders
        .filter((o) => {
          const t = norm(o.technician ?? '')
          const d = norm(o.doctor ?? '')
          return t === nameKey || d === nameKey || t === loginKey || d === loginKey
        })
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    [orders, nameKey, loginKey],
  )

  const active = mine.filter((o) => o.status !== 'done').length
  const done = mine.length - active

  // Дни месяца, где есть срок по незавершённым нарядам
  const dueDays = useMemo(() => {
    const set = new Set<string>()
    mine.forEach((o) => { if (o.status !== 'done') set.add(o.dueDate) })
    return set
  }, [mine])

  const [month, setMonth] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const year = month.getFullYear()
  const mon = month.getMonth()
  const offset = (new Date(year, mon, 1).getDay() + 6) % 7
  const daysInMonth = new Date(year, mon + 1, 0).getDate()
  const cells: (number | null)[] = [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  const iso = (d: number) => `${year}-${String(mon + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  const todayIso = today()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  const patientName = (id: string) => patients.find((p) => p.id === id)?.name ?? '—'

  return (
    <div className={styles.overlay} onClick={onClose} role="dialog" aria-modal="true" aria-label={name}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <button type="button" className={styles.close} onClick={onClose} aria-label="Закрыть">✕</button>

        <div className={styles.top}>
          <Avatar src={photoSrc(member)} name={name} size={200} className={styles.big} />
          <div className={styles.who}>
            <span className={styles.eyebrow}>
              {ROLE_LABEL[member.role] ?? member.role}{isMe ? ' · это вы' : ''}
            </span>
            <h3>{name}</h3>
            <div className={styles.stats}>
              <div><strong>{active}</strong><span>в работе</span></div>
              <div><strong>{done}</strong><span>готово</span></div>
              <div><strong>{mine.length}</strong><span>всего нарядов</span></div>
            </div>
          </div>
        </div>

        <div className={styles.grid}>
          <div className={styles.calendar}>
            <div className={styles.calHead}>
              <button type="button" onClick={() => setMonth(new Date(year, mon - 1, 1))} aria-label="Предыдущий месяц">‹</button>
              <b>{MONTHS[mon]} {year}</b>
              <button type="button" onClick={() => setMonth(new Date(year, mon + 1, 1))} aria-label="Следующий месяц">›</button>
            </div>
            <div className={styles.week}>
              {WEEK.map((w) => <span key={w}>{w}</span>)}
            </div>
            <div className={styles.days}>
              {cells.map((d, i) =>
                d === null ? (
                  <span key={i} />
                ) : (
                  <span
                    key={i}
                    className={[
                      styles.day,
                      iso(d) === todayIso ? styles.todayCell : '',
                      dueDays.has(iso(d)) ? styles.hasWork : '',
                    ].join(' ')}
                  >
                    {d}
                  </span>
                ),
              )}
            </div>
          </div>

          <div className={styles.works}>
            <h4>Наряды и работы</h4>
            {mine.length === 0 && <div className={styles.empty}>Нарядов пока нет</div>}
            {mine.map((o) => (
              <Link key={o.id} href={`/orders/${o.id}`} className={styles.work} onClick={onClose}>
                <span className={styles.num}>№{o.number}</span>
                <span className={styles.info}>
                  <b>{patientName(o.patientId)}</b>
                  <small>{o.dueDate} · {o.items.length} ед.</small>
                </span>
                <span className={`${styles.badge} ${o.status === 'done' ? styles.badgeDone : ''}`}>
                  {STATUS_LABEL[o.status] ?? o.status}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
