'use client'

import { useState } from 'react'
import { useStore } from '@/components/Store'
import { Heading } from '@/components/UI'
import OrderCard from '@/components/OrderCardV2'
import OrdersTable from '@/components/OrdersTable'
import '@/components/oc-card.css'
import { STATUS, exportCsv } from '@/lib/model'
import { Download, Search, LayoutGrid, List, Archive, ArrowLeft } from 'lucide-react'
import cardStyles from '@/components/OrderCard.module.css'

export default function Page() {
  const { data } = useStore()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const [view, setView] = useState<'cards' | 'table'>('cards')
  const [archive, setArchive] = useState(false)

  // Архив — отдельный режим: там только убранные наряды, и фильтры статуса не мешают.
  const archivedCount = data.orders.filter((o) => o.archived).length

  const list = data.orders.filter((o) => {
    if (Boolean(o.archived) !== archive) return false
    if (!archive && status !== 'all' && o.status !== status) return false
    const name = data.patients.find((p) => p.id === o.patientId)?.name || ''
    return `${o.number} ${name}`.toLowerCase().includes(query.toLowerCase())
  })

  const nameOf = (id: string) => data.patients.find((p) => p.id === id)?.name || ''

  return (
    <>
      {/* Верх: заголовок слева; статусы, вид и CSV — справа, в одну линию */}
      <Heading
        title={archive ? 'Архив нарядов' : 'Наряды'}
        sub={
          archive
            ? 'Готовые и оплаченные наряды, убранные с основной доски.'
            : 'Все заказы, статусы и оплаты в одном месте.'
        }
        action={
          <div className={cardStyles.headActions}>
            {!archive && (
              <div className="pills">
                {[['all', 'Все'], ...Object.entries(STATUS)].map(([k, v]) => (
                  <button key={k} className={status === k ? 'active' : ''} onClick={() => setStatus(k)}>
                    {v}
                  </button>
                ))}
              </div>
            )}

            <div className="pills" role="group" aria-label="Вид отображения">
              <button
                className={view === 'cards' ? 'active' : ''}
                onClick={() => setView('cards')}
                title="Карточки"
                aria-label="Показать карточками"
              >
                <LayoutGrid size={14} />
              </button>
              <button
                className={view === 'table' ? 'active' : ''}
                onClick={() => setView('table')}
                title="Таблица"
                aria-label="Показать таблицей"
              >
                <List size={14} />
              </button>
            </div>

            <button className="btn" onClick={() => exportCsv(list, data.patients)}>
              <Download size={17} /> CSV
            </button>
          </div>
        }
      />

      {/* Вторая строка: поиск слева, архив справа — рядом */}
      <div className={cardStyles.topRow}>
        <div className="search">
          <Search size={15} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Пациент или номер наряда"
          />
        </div>

        {archive ? (
          <div className="archive-bar">
            <div className="archive-bar-text">
              <Archive size={16} />
              <span>
                <b>Архив</b> · {archivedCount} {archivedCount === 1 ? 'наряд' : archivedCount < 5 ? 'наряда' : 'нарядов'}
              </span>
            </div>
            <button className="archive-link active" onClick={() => setArchive(false)}>
              <ArrowLeft size={14} /> Вернуться к нарядам
            </button>
          </div>
        ) : (
          <div className="archive-bar">
            <div className="archive-bar-text">
              <Archive size={16} />
              <span>{archivedCount ? `В архиве ${archivedCount}` : 'Архив пуст'}</span>
            </div>
            <button
              className="archive-link"
              onClick={() => setArchive(true)}
              disabled={!archivedCount}
              title={archivedCount ? 'Открыть архив нарядов' : 'Пока нечего показывать'}
              style={archivedCount ? undefined : { opacity: .5, cursor: 'not-allowed' }}
            >
              <Archive size={14} /> Открыть архив
              {archivedCount > 0 && <span className="archive-count">{archivedCount}</span>}
            </button>
          </div>
        )}
      </div>

      {view === 'cards' ? (
        list.length ? (
          <div className="oc-grid">
            {list.map((o) => (
              <OrderCard key={o.id} order={o} patientName={nameOf(o.patientId)} />
            ))}
          </div>
        ) : (
          <div className="archive-empty">
            <Archive size={30} />
            <span>
              {archive
                ? 'В архиве пока пусто. Уберите готовый наряд кнопкой с иконкой архива на карточке.'
                : 'Нарядов пока нет в этом списке.'}
            </span>
          </div>
        )
      ) : (
        <section className="panel">
          <OrdersTable orders={list} />
        </section>
      )}
    </>
  )
}
