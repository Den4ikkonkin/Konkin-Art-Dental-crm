'use client'

// Прайс: одна цена за работу для всех техников.
// Изменять может только администратор — и это проверяет RLS.

import { useEffect, useState } from 'react'
import { useStore } from '@/components/Store'
import { Heading, Field } from '@/components/UI'
import { loadPriceList, upsertPrice, type PriceRow } from '@/lib/db'
import { WORKS, money } from '@/lib/model'
import { Save, AlertTriangle, Tag } from 'lucide-react'

export default function PricePage() {
  const { role } = useStore()
  const [rows, setRows] = useState<PriceRow[]>([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(true)

  const [draft, setDraft] = useState({ workId: '', name: '', price: '' })

  useEffect(() => {
    loadPriceList()
      .then(setRows)
      .catch(() => setError('Не удалось загрузить прайс'))
      .finally(() => setLoading(false))
  }, [])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setNotice('')
    const price = Number(draft.price.replace(',', '.'))
    if (!draft.workId.trim() || !draft.name.trim() || !Number.isFinite(price) || price < 0) {
      setError('Заполните вид работы, название и неотрицательную цену.')
      return
    }
    try {
      await upsertPrice({ workId: draft.workId.trim(), name: draft.name.trim(), price })
      setRows(await loadPriceList())
      setDraft({ workId: '', name: '', price: '' })
      setNotice('Позиция сохранена. В уже созданных нарядах цена не меняется.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения')
    }
  }

  if (role !== 'admin') {
    return (
      <div className="panel empty">
        <AlertTriangle size={20} className="inline-icon" />
        Прайс изменяет только администратор.
      </div>
    )
  }

  // Показываем и позиции из базы, и стартовый список из model.ts:
  // так видно, что уже в базе, а что ещё можно добавить.
  const merged = [...rows]
  for (const w of WORKS) {
    if (!merged.some((r) => r.workId === w.id)) {
      merged.push({
        id: 'seed-' + w.id, workId: w.id, name: w.name, shortName: w.short,
        material: w.material, support: w.support, color: w.color, price: w.price, isActive: true,
      })
    }
  }

  return (
    <>
      <Heading
        title="Прайс"
        sub="Фиксированная цена за работу, одна для всех техников. Цена в наряде фиксируется при создании."
      />

      {error && <div className="alert" role="alert">{error}</div>}
      {notice && <div className="note" role="status">{notice}</div>}

      <form className="panel" onSubmit={save}>
        <h2><Tag size={16} className="inline-icon" /> Добавить или обновить позицию</h2>
        <div className="form-meta">
          <Field label="Код работы *">
            <input
              required maxLength={64}
              placeholder="например, zirconia-implant"
              value={draft.workId}
              onChange={(e) => setDraft({ ...draft, workId: e.target.value })}
            />
          </Field>
          <Field label="Название *">
            <input
              required maxLength={200}
              placeholder="Коронка из циркония"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </Field>
          <Field label="Цена, ₽ *">
            <input
              required inputMode="decimal"
              placeholder="4500"
              value={draft.price}
              onChange={(e) => setDraft({ ...draft, price: e.target.value })}
            />
          </Field>
        </div>
        <button className="btn primary" type="submit"><Save size={16} /> Сохранить</button>
      </form>

      <section className="panel">
        <div className="panel-heading"><h2>Позиции</h2></div>
        {loading ? (
          <div className="empty">Загрузка…</div>
        ) : (
          <table className="responsive">
            <thead>
              <tr><th>Код</th><th>Название</th><th>Материал</th><th>Цена</th></tr>
            </thead>
            <tbody>
              {merged.map((r) => (
                <tr key={r.workId}>
                  <td data-label="Код"><code>{r.workId}</code></td>
                  <td data-label="Название">{r.name}</td>
                  <td data-label="Материал">{r.material || '—'}</td>
                  <td data-label="Цена" className="num">
                    <span style={{ color: r.color || undefined }}>{money(r.price)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  )
}
