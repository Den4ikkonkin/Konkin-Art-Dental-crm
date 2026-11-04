'use client'

// Настройка цветов интерфейса — только для администратора.
//
// Почему отдельная страница, а не блок в «Настройках»: редактор занимает
// много места, и его не нужно показывать техникам и врачам. В «Настройках»
// остаётся выбор темы, а цвета живут здесь.
//
// Предпросмотр применяется сразу ко всему приложению через BrandProvider.
// Кнопка «Сохранить» записывает палитру в базу, «Сбросить» возвращает
// заводские цвета.

import { useEffect, useState } from 'react'
import { useStore } from '@/components/Store'
import { useBrand } from '@/components/BrandTheme'
import { useTheme } from '@/components/Theme'
import { Heading } from '@/components/UI'
import {
  PALETTE_FIELDS, PRESETS, isHex, DARK_DEFAULT, LIGHT_DEFAULT, type ThemePalette,
} from '@/lib/brand'
import { Palette, RotateCcw, Save, AlertTriangle, Check, Moon, Sun } from 'lucide-react'

export default function ThemePage() {
  const { role } = useStore()
  const { theme } = useTheme()
  const { dark, light, saving, error, save, reset, loading } = useBrand()

  const [draftDark, setDraftDark] = useState<ThemePalette>(dark)
  const [draftLight, setDraftLight] = useState<ThemePalette>(light)
  const [notice, setNotice] = useState('')
  const [editing, setEditing] = useState<'dark' | 'light'>(theme)

  // Когда палитра подгрузилась из базы — подставляем её в редактор.
  useEffect(() => { setDraftDark(dark) }, [dark])
  useEffect(() => { setDraftLight(light) }, [light])

  if (role !== 'admin') {
    return (
      <div className="panel empty">
        <AlertTriangle size={20} className="inline-icon" />
        Раздел доступен только администратору.
      </div>
    )
  }

  const current = editing === 'dark' ? draftDark : draftLight
  const setCurrent = editing === 'dark' ? setDraftDark : setDraftLight

  function setColor(key: keyof ThemePalette, value: string) {
    setCurrent({ ...current, [key]: value })
    setNotice('')
  }

  function applyPreset(id: string) {
    const preset = PRESETS.find((p) => p.id === id)
    if (!preset) return
    setDraftDark(preset.dark)
    setDraftLight(preset.light)
    setNotice(`Набор «${preset.name}» выбран. Нажмите «Сохранить», чтобы применить для всех.`)
  }

  async function commit() {
    setNotice('')
    try {
      await save({ dark: draftDark, light: draftLight })
      setNotice('Цвета сохранены. Изменения видны всем пользователям.')
    } catch {
      // Текст ошибки уже в контексте — покажем его ниже.
    }
  }

  async function resetAll() {
    if (!confirm('Вернуть заводские цвета Konkin Art Dental? Текущая палитра будет перезаписана.')) return
    setNotice('')
    try {
      await reset()
      setDraftDark(DARK_DEFAULT)
      setDraftLight(LIGHT_DEFAULT)
      setNotice('Заводские цвета восстановлены.')
    } catch {
      /* ошибка в контексте */
    }
  }

  return (
    <>
      <Heading
        title="Цвета интерфейса"
        sub="Палитра применяется ко всем пользователям: техникам, врачам и администратору. Предпросмотр — сразу, сохранение — по кнопке."
      />

      {(error || notice) && (
        <div className={error ? 'alert' : 'note'} role="status">
          <span>{error || notice}</span>
        </div>
      )}

      {/* ---------- Наборы ---------- */}
      <section className="panel">
        <div className="panel-heading">
          <h2><Palette size={17} className="inline-icon" /> Готовые наборы</h2>
        </div>
        <p className="muted">
          Набор задаёт обе темы сразу — тёмную и светлую. Дальше можно поправить отдельные цвета вручную.
        </p>
        <div className="preset-grid">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className="preset-card"
              onClick={() => applyPreset(p.id)}
            >
              <span className="preset-swatches" aria-hidden="true">
                <i style={{ background: p.dark.bg }} />
                <i style={{ background: p.dark.panel }} />
                <i style={{ background: p.dark.orange }} />
                <i style={{ background: p.dark.mint }} />
              </span>
              <b>{p.name}</b>
              <small>{p.hint}</small>
            </button>
          ))}
        </div>
      </section>

      {/* ---------- Ручная правка ---------- */}
      <section className="panel">
        <div className="panel-heading">
          <h2>Отдельные цвета</h2>
          <div className="row nowrap">
            <button
              type="button"
              className={'btn small' + (editing === 'dark' ? ' primary' : '')}
              onClick={() => setEditing('dark')}
            >
              <Moon size={14} /> Тёмная тема
            </button>
            <button
              type="button"
              className={'btn small' + (editing === 'light' ? ' primary' : '')}
              onClick={() => setEditing('light')}
            >
              <Sun size={14} /> Светлая тема
            </button>
          </div>
        </div>

        <div className="palette-editor">
          {PALETTE_FIELDS.map((field) => {
            const value = current[field.key]
            const bad = !isHex(value)
            return (
              <label className="color-field" key={field.key}>
                <span className="color-field-head">
                  <b>{field.label}</b>
                  <small>{field.hint}</small>
                </span>
                <span className="color-field-input">
                  <input
                    type="color"
                    value={bad ? '#000000' : value}
                    onChange={(e) => setColor(field.key, e.target.value)}
                    aria-label={field.label}
                  />
                  <input
                    type="text"
                    className={bad ? 'input-bad' : ''}
                    value={value}
                    maxLength={7}
                    spellCheck={false}
                    onChange={(e) => setColor(field.key, e.target.value.trim())}
                    aria-label={`${field.label}, код цвета`}
                  />
                </span>
              </label>
            )
          })}
        </div>

        <div className="row palette-actions">
          <button type="button" className="btn primary" onClick={() => void commit()} disabled={saving || loading}>
            <Save size={16} /> {saving ? 'Сохранение…' : 'Сохранить для всех'}
          </button>
          <button type="button" className="btn" onClick={() => void resetAll()} disabled={saving}>
            <RotateCcw size={16} /> Заводские цвета
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => { setDraftDark(dark); setDraftLight(light); setNotice('Правки отменены.') }}
          >
            Отменить правки
          </button>
        </div>

        <div className="palette-preview" aria-hidden="true">
          <span className="preview-chip" style={{ background: current.orange, color: '#1a1206' }}>
            <Check size={13} /> Кнопка
          </span>
          <span className="preview-chip" style={{ background: current.mint, color: '#0d1a15' }}>Оплачено</span>
          <span className="preview-chip" style={{ background: current.panel, color: current.text, border: `1px solid ${current.line}` }}>
            Панель
          </span>
          <span className="preview-chip" style={{ background: current.bg, color: current.muted, border: `1px solid ${current.line}` }}>
            Фон
          </span>
        </div>
      </section>
    </>
  )
}
