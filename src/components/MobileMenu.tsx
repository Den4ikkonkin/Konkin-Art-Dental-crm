'use client'

// Меню «⋯» для действий, которые на телефоне не помещаются в строку.

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { MoreHorizontal } from 'lucide-react'

export type MenuItem = {
  label: string
  icon?: ReactNode
  onClick?: () => void
  href?: string
  danger?: boolean
}

export default function MobileMenu({ items, label }: { items: MenuItem[]; label: string }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="mmenu" ref={box}>
      <button
        type="button"
        className="icon-btn mmenu-trigger"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <MoreHorizontal size={18} />
      </button>
      {open && (
        <ul className="mmenu-list" role="menu">
          {items.map((it) => (
            <li key={it.label} role="none">
              {it.href ? (
                <a role="menuitem" href={it.href} className={'mmenu-item' + (it.danger ? ' danger' : '')}
                   onClick={() => setOpen(false)}>
                  {it.icon}<span>{it.label}</span>
                </a>
              ) : (
                <button role="menuitem" type="button" className={'mmenu-item' + (it.danger ? ' danger' : '')}
                        onClick={() => { setOpen(false); it.onClick?.() }}>
                  {it.icon}<span>{it.label}</span>
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
