"use client"

import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Trash2, Save, ArrowLeft, Check } from 'lucide-react'
import { uid } from '@/lib/uid'
import { useStore } from './Store'
import ToothChart from './ToothChart'
import { TOOTH_VECTORS } from '@/lib/tooth-vectors'

/**
 * Зубы в порядке вдоль зубной дуги: от дальнего левого верхнего (18)
 * через передние до дальнего правого нижнего (48).
 *
 * Считаем по углу вокруг центра схемы. Номер зуба для этого не годится:
 * числовой порядок идёт квадрантами и прыгает через всю челюсть.
 */
const ARC_ORDER: number[] = (() => {
  const xs = TOOTH_VECTORS.map((t) => t.x)
  const ys = TOOTH_VECTORS.map((t) => t.y)
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2
  return [...TOOTH_VECTORS]
    .sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx))
    .map((t) => t.n)
})()
import { Heading, Field } from './UI'
import type { Order, Item } from '@/lib/model'
import { WORKS, SUPPORTS, STATUS, DOCTORS, today, total, money, orderSchema, workOf, normalizeDoctor } from '@/lib/model'
import styles from './OrderForm.module.css'

type Draft = { material: string; support: string; price: string }
const MAX_PRICE = 1000000000
function onStump(support: string) { return support.toLowerCase().includes('культ') }
function defaultPrice(id: Item['workId'], support: string): number {
  const w = workOf(id)
  if (id === 'zirconia-implant') return 3000
  if (id === 'zirconia-stump') return 2500
  if (id === 'pmma') return onStump(support) ? 300 : 600
  if (/wax|восков/i.test(`${id} ${w.name}`)) return 200
  return w.price
}
const keyOf = (id: Item['workId'], support: string) => `${id}|${support}`
function parsePrice(raw: string): number | null {
  if (!raw.trim()) return null
  const n = Number(raw.replace(',', '.'))
  return Number.isFinite(n) && n >= 0 && n <= MAX_PRICE ? Math.round(n * 100) / 100 : null
}
const SHADE_ROWS = [
  { label: 'A', colors: [['A1','#F3EAD7'],['A2','#EAD9B9'],['A3','#DCC399'],['A3.5','#CCAD80'],['A4','#B59365']] },
  { label: 'B', colors: [['B1','#F5EFD9'],['B2','#EADBBA'],['B3','#D9C491'],['B4','#C5AA77']] },
  { label: 'C', colors: [['C1','#E6DFCF'],['C2','#D5CBB7'],['C3','#BDB093'],['C4','#A29479']] },
  { label: 'D', colors: [['D2','#E4D9C8'],['D3','#CFC0AA'],['D4','#B6A48C']] },
  { label: 'BL', colors: [['BL1','#FFFEFA'],['BL2','#F5F2E9'],['BL3','#EAE5D8'],['BL4','#DDD6C5']] },
]

export default function OrderForm({ original }: { original?: Order }) {
  const { data, saveOrder, createPatient, nextNumber } = useStore()
  const router = useRouter()
  const [doctor, setDoctor] = useState(normalizeDoctor(original?.doctor || ''))
  const [patientId, setPatient] = useState(original?.patientId || '')
  const [patientName, setPatientName] = useState('')
  const [createdAt, setCreated] = useState(original?.createdAt || today())
  const [dueDate, setDue] = useState(original?.dueDate || today())
  const [status, setStatus] = useState<Order['status']>(original?.status || 'new')
  const [comment, setComment] = useState(original?.comment || '')
  const [paid, setPaid] = useState(String(original?.paid || 0))
  const [items, setItems] = useState<Item[]>(original?.items || [])
  const [selected, setSelected] = useState<number[]>([])
  // Якорь диапазона: зуб, с которого начинается выделение по Shift.
  // В ref, потому что он нужен только обработчику и не влияет на отрисовку.
  const anchor = useRef<number | null>(null)
  const [workId, setWork] = useState<Item['workId']>(WORKS[0].id)
  const [drafts, setDrafts] = useState<Partial<Record<Item['workId'], Draft>>>({})
  const [prices, setPrices] = useState<Record<string, string>>({})
  const [shade, setShade] = useState('A2')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  function draftOf(id: Item['workId']): Draft {
    const w = workOf(id)
    return drafts[id] ?? { material: w.material, support: w.support, price: String(defaultPrice(id, w.support)) }
  }
  const draft = draftOf(workId)
  const curPrice = parsePrice(draft.price)
  const current = workOf(workId)
  function updateDraft(id: Item['workId'], value: Draft) {
    setDrafts(prev => ({ ...prev, [id]: value }))
  }
  function changePrice(id: Item['workId'], value: string) {
    const d = draftOf(id)
    updateDraft(id, { ...d, price: value })
    setPrices(prev => ({ ...prev, [keyOf(id, d.support)]: value }))
  }
  /**
   * Обычный клик — выбрать или снять один зуб.
   * Shift + клик — добавить весь диапазон от прошлого зуба до этого.
   *
   * Порядок считается по дуге, а не по номеру зуба. Если брать порядок
   * номеров, клик 11 → Shift+клик 15 захватит ещё и правую сторону:
   * 11, 21, 12, 22, 13, 23, 14, 24, 15. На экране это не соседние зубы.
   * Поэтому сортируем зубы по углу вокруг центра дуги — тогда диапазон
   * идёт вдоль челюсти, как человек и ожидает.
   */
  function toggle(n: number, range = false) {
    if (range && anchor.current !== null && anchor.current !== n) {
      const a = ARC_ORDER.indexOf(anchor.current)
      const b = ARC_ORDER.indexOf(n)
      if (a >= 0 && b >= 0) {
        const [from, to] = a < b ? [a, b] : [b, a]
        // Добавляем к уже выбранному, а не заменяем: так не теряется
        // то, что человек отметил раньше.
        setSelected(prev => [...new Set([...prev, ...ARC_ORDER.slice(from, to + 1)])])
        return
      }
    }
    anchor.current = n
    setSelected(prev => prev.includes(n) ? prev.filter(v => v !== n) : [...prev, n])
  }
  function assign(id: Item['workId'], d: Draft) {
    if (!selected.length) { setError('Выберите зубы на схеме.'); return }
    const amount = parsePrice(d.price)
    if (amount === null) { setError('Введите корректную цену от 0 до 1 000 000 000 ₽.'); return }
    const fresh: Item[] = selected.map(tooth => ({
      id: uid(), tooth, workId: id, material: d.material, support: d.support, shade, price: amount,
    }))
    setItems(prev => [...prev.filter(i => !selected.includes(i.tooth)), ...fresh])
    setSelected([])
    setError('')
  }
  function chooseWork(id: Item['workId']) {
    setWork(id)
    setError('')
    // Preserve the last material, support and custom price for this construction.
    if (selected.length) assign(id, draftOf(id))
  }
  function changeSupport(value: string) {
    let id = workId
    if (workId === 'zirconia-stump' || workId === 'zirconia-implant') {
      id = onStump(value) ? 'zirconia-stump' : 'zirconia-implant'
    }
    const d = draftOf(id)
    const price = prices[keyOf(id, value)] ?? String(defaultPrice(id, value))
    updateDraft(id, { ...d, support: value, price })
    setWork(id)
    // Changing a field prepares parameters; apply explicitly to avoid accidental assignment.
  }
  function clearWorkOnSelected() {
    setItems(prev => prev.filter(i => !selected.includes(i.tooth)))
    setSelected([])
  }
  function changeItemPrice(id: string, raw: string) {
    const amount = parsePrice(raw)
    if (amount === null) { setError('Цена позиции должна быть неотрицательной и конечной.'); return }
    setItems(prev => prev.map(i => i.id === id ? { ...i, price: amount } : i))
    setError('')
  }
  async function save(e: FormEvent) {
    e.preventDefault()
    if (saving) return
    setError('')
    if (!items.length) { setError('Добавьте хотя бы одну конструкцию на зуб.'); return }
    if (!patientId && !patientName.trim()) { setError('Выберите пациента или введите нового.'); return }
    if (items.some(i => !Number.isFinite(i.price) || i.price < 0 || i.price > MAX_PRICE)) {
      setError('Проверьте цены позиций.'); return
    }
    setSaving(true)
    try {
      let pid = patientId
      if (!pid) {
        const created = await createPatient({ id: uid(), name: patientName.trim(), note: '' })
        pid = created.id
        setPatient(pid)
      }
      const order: Order = {
        id: original?.id || uid(), number: original?.number ?? (await nextNumber()), patientId: pid,
        createdAt, dueDate,
        // Приём больше не вводится в форме: у новых нарядов пусто,
        // у старых сохраняется то, что уже было записано.
        appointment: original?.appointment ?? '',
        status, comment, paid: Number(paid),
        // Дата оплаты: если оплата появилась впервые — сегодня, если снята — пусто. Уже сохранённую дату не трогаем.
        paidOn: Number(paid) > 0 ? (original?.paidOn || today()) : '',
        archived: original?.archived ?? false,
        doctor,
        // Техник и примерка появились вместе с ролями. У старых нарядов
        // эти поля пустые — форма их не сбрасывает.
        technician: original?.technician ?? '',
        fittingAt: original?.fittingAt ?? '',
        isPaid: original?.isPaid ?? Number(paid) > 0,
        salary: original?.salary ?? 0,
        needsClarification: original?.needsClarification ?? false,
        items,
      }
      const parsed = orderSchema.safeParse(order)
      if (!parsed.success) throw new Error(parsed.error.issues.map(i => i.message).join('; '))
      await saveOrder(parsed.data, !original)
      router.push('/orders')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка сохранения')
      setSaving(false)
    }
  }
  const supportOptions = (workId === 'zirconia-stump' || workId === 'zirconia-implant' || workId === 'pmma') ? SUPPORTS : ['На культе']
  const allowedSupports = [...new Set([...supportOptions, draft.support])]
  const materials = workId === 'inlay-veneer' ? ['Диоксид циркония', 'Стеклокерамика'] : [current.material]
  return (
    <form onSubmit={save}>
      <Heading title={original ? 'Наряд №' + original.number : 'Новый наряд'}
        sub="Выберите зубы и нажмите конструкцию. Для своих параметров используйте кнопку «Применить»."
        action={<Link href="/orders" className="btn"><ArrowLeft size={16} /> К нарядам</Link>} />
      {error && <div className="alert" role="alert">{error}</div>}
      <section className="panel form-meta">
        <Field label="Пациент"><select value={patientId} onChange={e => setPatient(e.target.value)}>
          <option value="">+ Новый пациент</option>
          {data.patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select></Field>
        {!patientId && <Field label="ФИО нового пациента *"><input required maxLength={200} value={patientName}
          onChange={e => setPatientName(e.target.value)} placeholder="Например, Иванов Иван" /></Field>}
        <Field label="Врач">
          <div className="doctor-picker">
            {DOCTORS.map((d) => {
              const on = doctor === d
              return (
                <button
                  key={d}
                  type="button"
                  className={'doctor-chip' + (on ? ' on' : '')}
                  aria-pressed={on}
                  title={on ? 'Нажмите, чтобы снять выбор' : `Выбрать врача ${d}`}
                  onClick={() => setDoctor(on ? '' : d)}
                >
                  <span className="doctor-check">
                    <Check size={11} strokeWidth={3.5} />
                  </span>
                  {d}
                </button>
              )
            })}
          </div>
        </Field>
        <Field label="Дата заказа"><input required type="date" value={createdAt} onChange={e => setCreated(e.target.value)} /></Field>
        <Field label="Дата готовности"><input required type="date" min={createdAt} value={dueDate} onChange={e => setDue(e.target.value)} /></Field>
      </section>
      <div className="designer-grid">
        <section className="panel">
          <div className="panel-heading"><span className="step">01</span><h2>Конструкция</h2></div>
          <p className="muted small">Выберите зубы, затем нажмите конструкцию.</p>
          <div className="work-tiles">
            {WORKS.map(w => {
              const d = draftOf(w.id)
              return <div key={w.id} className={styles.card}>
                <button type="button" className={'work-tile ' + (workId === w.id ? 'selected' : '')}
                  aria-pressed={workId === w.id} onClick={() => chooseWork(w.id)}>
                  <span className="work-icon" style={{ background: w.color }}>
                    <img className={styles.icon} src="/brand/construction-tooth.svg" width={26} height={30} alt="" />
                  </span>
                  <span><strong>{w.name}</strong><small>{d.material}</small></span>
                  <span className="dot" style={{ background: w.color }} />
                </button>
              </div>
            })}
          </div>
          <div className="note">Каждый зуб имеет свою конструкцию. Новое назначение заменяет работу только на выбранных зубах.</div>
        </section>
        <section className="panel chart-panel">
          <div className="panel-heading"><span className="step">02</span><h2>Схема FDI</h2><span className="badge">{selected.length} выбрано</span></div>
          <div className="row spread"><span className="muted small">32 постоянных зуба</span><div className="row">
            <button type="button" className="btn small" onClick={() => { setSelected([]); anchor.current = null }}>Очистить выбор</button>
            <button type="button" className="btn small" disabled={!selected.length} onClick={clearWorkOnSelected}>Снять работу</button>
          </div></div>
          <ToothChart selected={selected} items={items} onToggle={toggle} />
          {!!selected.length && <p className="small muted">Выбраны: {[...selected].sort((a,b) => a-b).join(', ')}</p>}
        </section>
        <section className="panel">
          <div className="panel-heading"><span className="step">03</span><h2>Параметры</h2></div>
          <Field label="Материал"><select value={draft.material} onChange={e => updateDraft(workId, { ...draft, material: e.target.value })}>
            {[...new Set([...materials, draft.material])].map(m => <option key={m}>{m}</option>)}
          </select></Field>
          <Field label="Опора / фиксация"><select value={draft.support} onChange={e => changeSupport(e.target.value)}>
            {allowedSupports.map(v => <option key={v}>{v}</option>)}
          </select></Field>
          <Field label="Цена за единицу, ₽"><input type="number" min="0" max={MAX_PRICE} step="0.01" value={draft.price}
            onChange={e => changePrice(workId, e.target.value)} /></Field>
          <div className="field"><span>Оттенок VITA / Bleach</span>
            <div className={styles.palette}>
              {SHADE_ROWS.map(row => <div key={row.label} className={styles.shadeRow}>
                <span className={styles.family}>{row.label}</span>
                <div className={styles.swatches}>
                  {row.colors.map(([code, hex]) => <button type="button" key={code} aria-pressed={shade === code}
                    className={`${styles.swatch} ${shade === code ? styles.active : ''}`}
                    style={{ background: hex }} onClick={() => setShade(code)}>{code}</button>)}
                </div>
              </div>)}
            </div>
            <small>Светлее → темнее внутри каждого ряда. Цвета экранные и условные, не заменяют физическую расцветку.</small>
          </div>
          <div className="estimate"><span>Предварительный расчёт по выбранным зубам</span>
            <strong>{selected.length} × {money(curPrice ?? 0)}</strong><b>{money(selected.length * (curPrice ?? 0))}</b>
          </div>
          <button type="button" className="btn primary full" disabled={!selected.length || curPrice === null}
            onClick={() => assign(workId, draft)}
            title="Применить параметры к выбранным зубам">Применить</button>
          <p className="small muted">Цена и параметры применяются при назначении. Для уже добавленного зуба цену можно изменить в таблице ниже.</p>
        </section>
      </div>
      <section className="panel">
        <div className="panel-heading"><h2>Позиции наряда</h2><span className="badge">{items.length} единиц</span></div>
        {!items.length ? <div className="empty">Выберите зубы и назначьте конструкцию.</div> :
          <div className="table-wrap"><table><thead><tr><th>Зуб</th><th>Вид работы</th><th>Материал / опора</th><th>Оттенок</th><th className="num">Цена</th><th /></tr></thead>
            <tbody>{[...items].sort((a,b) => a.tooth-b.tooth).map(i => <tr key={i.id}>
              <td><b>{i.tooth}</b></td>
              <td><span className="dot" style={{ background: workOf(i.workId).color }} /> {workOf(i.workId).name}</td>
              <td className="muted">{i.material}<br />{i.support}</td><td>{i.shade}</td>
              <td className="num"><input className="price-input" type="number" min="0" max={MAX_PRICE} step="0.01"
                aria-label={`Цена зуба ${i.tooth}`} value={i.price} onChange={e => changeItemPrice(i.id, e.target.value)} /></td>
              <td><button type="button" className="icon-btn danger" aria-label={`Удалить работу зуба ${i.tooth}`}
                onClick={() => setItems(prev => prev.filter(x => x.id !== i.id))}><Trash2 size={16} /></button></td>
            </tr>)}</tbody></table></div>}
        {!!items.length && <div className="row" style={{ marginTop: 12 }}><button type="button" className="btn small"
          onClick={() => setItems([])}><Trash2 size={14} /> Удалить все позиции</button></div>}
        <div className="form-meta bottom-fields">
          <Field label="Оплачено, ₽"><input type="number" min="0" max={total({ items })} step="0.01" value={paid} onChange={e => setPaid(e.target.value)} /></Field>
          <Field label="Статус"><select value={status} onChange={e => setStatus(e.target.value as Order['status'])}>
            {Object.entries(STATUS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
          </select></Field>
          <Field label="Комментарий"><textarea rows={2} maxLength={5000} value={comment} onChange={e => setComment(e.target.value)} placeholder="Особенности работы, пожелания…" /></Field>
        </div>
        <div className="save-bar"><div><span className="muted">Итого по наряду</span><strong>{money(total({ items }))}</strong>
          <small>{items.length} единиц · остаток {money(Math.max(0, total({ items }) - (Number(paid) || 0)))}</small></div>
          <button type="submit" disabled={saving} className="btn primary"><Save size={17} />{saving ? 'Сохраняю…' : 'Сохранить наряд'}</button>
        </div>
      </section>
    </form>
  )
}
