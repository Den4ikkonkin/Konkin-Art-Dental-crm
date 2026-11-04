 'use client'

import { useState } from 'react'
import { useStore } from '@/components/Store'
import { useTheme } from '@/components/Theme'
import { Heading } from '@/components/UI'
import { stateSchema, download, today, WORKS } from '@/lib/model'
import { demoState } from '@/lib/demo'
import { Download, Upload, Sun, Moon, Database, Palette } from 'lucide-react'
import MemoryPanel from '@/components/MemoryPanel'
import StorageCard from '@/components/StorageCard'

export default function Page() {
  const { data, importAll, clearAll, session } = useStore()
  const { theme, setTheme } = useTheme()

  const [notice, setNotice] = useState('')

  async function action(fn: () => Promise<void>, ok: string) {
    try { await fn(); setNotice(ok) }
    catch (e) { setNotice(e instanceof Error ? e.message : 'Ошибка') }
  }

  async function importFile(file: File) {
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error('Файл больше 10 МБ')
      const parsed = stateSchema.safeParse(JSON.parse(await file.text()))
      if (!parsed.success) throw new Error('Неверная резервная копия: ' + parsed.error.issues[0].message)
      if (!confirm('Импорт заменит все данные в облаке. Продолжить?')) return
      await action(() => importAll(parsed.data), 'Данные восстановлены из резервной копии.')
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Не удалось прочитать файл')
    }
  }

  return (
    <>
      <Heading title="Настройки" sub="Тема, резервные копии и палитра работ." />
      {notice && <div className="note" role="status">{notice}</div>}

      <div className="settings-grid">
        <StorageCard />
        <section className="panel">
          <h2><Palette size={17} className="inline-icon" /> Оформление</h2>
          <p className="muted">Выберите удобную тему. Выбор сохраняется и действует с любого устройства после входа.</p>
          <div className="theme-choice">
            <button type="button" className={'theme-card ' + (theme === 'dark' ? 'selected' : '')} onClick={() => setTheme('dark')}>
              <span className="theme-preview dark"><Moon size={18} /></span>
              <b>Тёмная</b><small>Как сейчас, для работы вечером</small>
            </button>
            <button type="button" className={'theme-card ' + (theme === 'light' ? 'selected' : '')} onClick={() => setTheme('light')}>
              <span className="theme-preview light"><Sun size={18} /></span>
              <b>Светлая</b><small>Для яркого помещения и печати</small>
            </button>
          </div>
        </section>

        <section className="panel">
          <h2><Database size={17} className="inline-icon" /> Резервное копирование</h2>
          <p className="muted">
            Данные хранятся на сервере Supabase и доступны с любого устройства после входа в аккаунт.
            Аккаунт: <b>{session?.user.email}</b>. Копию удобно делать перед крупными изменениями.
          </p>
          <div className="row">
            <button className="btn primary"
              onClick={() => download('dental-studio-backup-' + today() + '.json', JSON.stringify(data, null, 2))}>
              <Download size={16} /> Экспорт JSON
            </button>
            <label className="btn">
              <Upload size={16} /> Импорт JSON
              <input type="file" accept=".json,application/json" className="sr-only"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void importFile(f); e.target.value = '' }} />
            </label>
          </div>

          <div className="divider" />
          <h3>Демонстрация</h3>
          <p className="muted small">Вымышленные наряды покажут все цвета кольца.</p>
          <button className="btn"
            onClick={() => {
              if (data.orders.length || data.patients.length) { setNotice('Демо можно загрузить только в пустой аккаунт.'); return }
              void action(() => importAll(demoState()), 'Демо-данные загружены.')
            }}>
            Загрузить демо-пример
          </button>
          <button className="btn danger"
            onClick={() => {
              if (confirm('Удалить ВСЕ данные из облака? Сначала сделайте резервную копию.') &&
                  confirm('Подтверждаете полную очистку?')) void action(clearAll, 'Все данные удалены.')
            }}>
            Очистить все данные
          </button>
        </section>

        <MemoryPanel />
      </div>

      <section className="panel">
        <h2>Единая палитра работ</h2>
        <p className="muted">Одинаковые названия и цвета в наряде, на зубной схеме, в легенде и в таблице.
          Палитра по мотивам референса, не официальный стандарт exocad.</p>
        <div className="palette-grid">
          {WORKS.map((w) => (
            <div key={w.id}>
              <span className="swatch" style={{ background: w.color }} />
              <b>{w.name}</b><small>{w.color}</small>
            </div>
          ))}
        </div>
      </section>
    </>
  )
}
