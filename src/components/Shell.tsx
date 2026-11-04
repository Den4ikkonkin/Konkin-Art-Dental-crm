"use client"

// Оболочка приложения: боковое меню, верхняя панель, плашка режима
// просмотра. Меню зависит от роли — врач, техник и администратор
// видят разные рабочие пространства, но одну и ту же визуальную систему.

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import {
  LayoutDashboard, Users, ClipboardList, CalendarDays, ChartPie, BellRing, Settings,
  Plus, LogOut, RefreshCw, Menu, X, FolderOpen, Image as ImageIcon, Wrench,
  Send, Stethoscope, Tag, ShieldCheck, FlaskConical, Archive, Eye, UserCog,
} from 'lucide-react'
import { useStore } from './Store'
import { ThemeToggle } from './Theme'
import { NAV, PRIMARY_ACTION, WORKSPACE_TITLE, type Role } from '@/lib/roles'
import styles from './KonkinBrand.module.css'

// Иконки по строковому имени из roles.ts: сам roles.ts должен оставаться
// чистым модулем без React, поэтому иконки сопоставляются здесь.
const ICONS: Record<string, typeof LayoutDashboard> = {
  layout: LayoutDashboard,
  users: Users,
  clipboard: ClipboardList,
  calendar: CalendarDays,
  chart: ChartPie,
  bell: BellRing,
  settings: Settings,
  folder: FolderOpen,
  image: ImageIcon,
  wrench: Wrench,
  send: Send,
  stethoscope: Stethoscope,
  tag: Tag,
  shield: ShieldCheck,
  flask: FlaskConical,
  archive: Archive,
}

const ROLE_LABEL: Record<Role, string> = {
  admin: 'Администратор',
  doctor: 'Врач',
  technician: 'Техник',
}

export default function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname()
  const {
    ready, error, busy, notice, refresh, signOut, session, clearMessages,
    role, realRole, viewAs, setViewAs, profile,
  } = useStore()
  const [menuOpen, setMenuOpen] = useState(false)

  const links = NAV[role]
  const action = PRIMARY_ACTION[role]
  const title = WORKSPACE_TITLE[role]
  const displayName = profile?.displayName || profile?.login || ''

  return (
    <div className="app">
      {menuOpen && (
        <button
          type="button"
          className="nav-scrim"
          aria-label="Закрыть меню"
          onClick={() => setMenuOpen(false)}
        />
      )}

      <aside className={menuOpen ? 'sidebar open' : 'sidebar'}>
        <div className="sidebar-head">
          <Link
            href={role === 'technician' ? '/queue' : '/'}
            className={styles.brand}
            aria-label="Konkin Art Dental — на главную"
            onClick={() => setMenuOpen(false)}
          >
            <img className={styles.dark} src="/brand/konkin-art-dental-dark.svg" alt="Konkin Art Dental — CAD/CAM Studio" width={880} height={560} />
            <img className={styles.light} src="/brand/konkin-art-dental-light.svg" alt="Konkin Art Dental — CAD/CAM Studio" width={880} height={560} />
          </Link>
          <button
            type="button"
            className="icon-btn nav-close"
            aria-label="Закрыть меню"
            onClick={() => setMenuOpen(false)}
          >
            <X size={18} />
          </button>
        </div>

        <div className="nav-label">{title}</div>

        <nav>
          {links.map(({ href, label, icon }) => {
            const Icon = ICONS[icon] ?? LayoutDashboard
            const active = href === '/' ? path === '/' : path.startsWith(href)
            return (
              <Link
                key={href}
                href={href}
                className={active ? 'nav active' : 'nav'}
                onClick={() => setMenuOpen(false)}
              >
                <Icon size={19} />{label}
              </Link>
            )
          })}
        </nav>

        <div className="sidebar-bottom">
          <span className="dot" style={{ background: '#ABD988' }} /> {ROLE_LABEL[role]}
          <br />
          <small>{displayName || session?.user.email || 'вход выполнен'}</small>
          <button type="button" className="btn small full sidebar-out" onClick={() => void signOut()}>
            <LogOut size={14} /> Выйти
          </button>
        </div>
      </aside>

      <div className="workspace">
        {viewAs && (
          <div className="impersonation-bar" role="status">
            <Eye size={16} />
            <span>Режим просмотра: {ROLE_LABEL[viewAs].toLowerCase()}</span>
            <button type="button" className="btn small" onClick={() => setViewAs(null)}>
              <UserCog size={14} /> Вернуться в режим администратора
            </button>
          </div>
        )}

        <header className="topbar">
          <div className="topbar-title">
            <button
              type="button"
              className="icon-btn nav-toggle"
              aria-label="Открыть меню"
              onClick={() => setMenuOpen(true)}
            >
              <Menu size={18} />
            </button>
            <div>
              <span className="eyebrow">KONKIN ART DENTAL</span>
              <strong>{title}</strong>
            </div>
          </div>
          <div className="row">
            <Link href="/notifications" className="icon-btn" title="Уведомления" aria-label="Уведомления">
              <BellRing size={16} />
            </Link>
            <ThemeToggle />
            <button
              type="button"
              className="icon-btn"
              title="Обновить данные"
              aria-label="Обновить данные"
              onClick={() => void refresh()}
              disabled={busy}
            >
              <RefreshCw size={16} className={busy ? 'spin' : ''} />
            </button>
            {action && (
              <Link href={action.href} className="btn primary">
                <Plus size={17} /> {action.label}
              </Link>
            )}
          </div>
        </header>

        <main>
          {error && (
            <div className="alert" role="alert">
              <span>{error}</span>
              <button type="button" className="btn small" onClick={clearMessages}>Понятно</button>
            </div>
          )}
          {notice && (
            <div className="note" role="status">
              <span>{notice}</span>
              <button type="button" className="btn small" onClick={clearMessages}>Скрыть</button>
            </div>
          )}
          {ready ? children : <div className="empty">Загрузка рабочего пространства…</div>}
        </main>

        <footer>
          Konkin Art Dental · данные на сервере Supabase
          <Link href="/settings">Резервная копия и настройки</Link>
          {realRole === 'admin' && !viewAs && (
            <span className="footer-viewas">
              <Link href="/demo">Демо</Link>
            </span>
          )}
        </footer>
      </div>
    </div>
  )
}
