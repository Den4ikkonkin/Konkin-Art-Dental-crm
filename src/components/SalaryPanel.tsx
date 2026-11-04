'use client'

// Оклад и выплаты. Раньше это было в «Настройках», теперь живёт здесь:
// всё, что касается денег, собрано на одной странице «Мой заработок».

import { useState } from 'react'
import { useStore } from './Store'
import { Field } from './UI'
import { money, today, formatDate, monthKey, monthLabel } from '@/lib/model'
import { uid } from '@/lib/uid'
import { Save, Trash2, Wallet } from 'lucide-react'

export default function SalaryPanel({ month }: { month: string }) {
  const { data, setMonthlySalary, addSalary, deleteSalary } = useStore()

  const [plan, setPlan] = useState(String(data.monthlySalary))
  const [date, setDate] = useState(today())
  const [amount, setAmount] = useState('25000')
  const [note, setNote] = useState('')
  const [notice, setNotice] = useState('')

  async function action(fn: () => Promise<void>, ok: string) {
    try {
      await fn()
      setNotice(ok)
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Ошибка')
    }
  }

  async function register(day: 4 | 19) {
    const d = today().slice(0, 8) + String(day).padStart(2, '0')
    if (d > today()) {
      setNotice('Дата выплаты ещё не наступила.')
      return
    }
    if (data.salary.some((p) => p.date === d && p.note === `Оклад ${day}-го`)) {
      setNotice('Эта выплата уже внесена.')
      return
    }
    if (!confirm(`Подтвердить фактически полученные ${money(data.monthlySalary / 2)} за ${formatDate(d)}?`)) return
    await action(
      () => addSalary({ id: uid(), date: d, amount: data.monthlySalary / 2, note: `Оклад ${day}-го` }),
      'Выплата добавлена.',
    )
  }

  // Показываем выплаты выбранного месяца, а без фильтра — все.
  const history = month ? data.salary.filter((s) => monthKey(s.date) === month) : data.salary
  const received = history.reduce((s, p) => s + p.amount, 0)

  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2><Wallet size={17} className="inline-icon" /> Оклад и выплаты</h2>
          <p className="muted small">
            План — не полученные деньги. В заработок попадают только подтверждённые выплаты.
          </p>
        </div>
        <span className="badge">
          {month ? monthLabel(month) : 'Всё время'}: {money(received)}
        </span>
      </div>

      {notice && <div className="note" role="status">{notice}</div>}

      <form
        className="salary-plan"
        onSubmit={(e) => {
          e.preventDefault()
          void action(() => setMonthlySalary(Number(plan)), 'План оклада сохранён.')
        }}
      >
        <Field label="Плановый оклад в месяц, ₽">
          <input type="number" min="0" step="0.01" required value={plan} onChange={(e) => setPlan(e.target.value)} />
        </Field>
        <button className="btn" type="submit"><Save size={16} /> Сохранить план</button>
      </form>

      <p className="note">
        По умолчанию оклад приходит двумя частями: 4-го и 19-го числа.
        Кнопка ниже вносит половину плана на текущий месяц.
      </p>

      <div className="row">
        <button type="button" className="btn mint" onClick={() => void register(4)}>Получил 4-го</button>
        <button type="button" className="btn mint" onClick={() => void register(19)}>Получил 19-го</button>
      </div>

      <div className="divider" />

      <h3>Добавить выплату</h3>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void action(
            () => addSalary({ id: uid(), date, amount: Number(amount), note }),
            'Выплата добавлена.',
          )
          setNote('')
        }}
      >
        <div className="salary-form-row">
          <Field label="Фактическая дата выплаты">
            <input required type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Полученная сумма, ₽">
            <input type="number" min="0" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
        </div>
        <Field label="Примечание">
          <input maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Например: аванс" />
        </Field>
        <button className="btn primary" type="submit">Добавить выплату</button>
      </form>

      <div className="divider" />

      <h3>История выплат</h3>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Дата</th><th>Примечание</th><th className="num">Получено</th><th /></tr>
          </thead>
          <tbody>
            {history.map((s) => (
              <tr key={s.id}>
                <td>{formatDate(s.date)}</td>
                <td>{s.note || '—'}</td>
                <td className="num green">{money(s.amount)}</td>
                <td>
                  <button
                    type="button"
                    className="icon-btn danger"
                    aria-label="Удалить выплату"
                    onClick={() => {
                      if (confirm('Удалить выплату?')) void action(() => deleteSalary(s.id), 'Выплата удалена.')
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          {history.length > 0 && (
            <tfoot>
              <tr>
                <td>Итого</td>
                <td />
                <td className="num green">{money(received)}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {!history.length && (
        <p className="empty">
          {month ? `За ${monthLabel(month).toLowerCase()} выплат ещё нет.` : 'Фактических выплат ещё нет.'}
        </p>
      )}
    </section>
  )
}
