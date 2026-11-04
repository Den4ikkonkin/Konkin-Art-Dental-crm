'use client'

// Портфолио. Каждая работа привязана к наряду — это требование,
// а не пожелание. Публичного доступа нет: только внутри CRM.

import { useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useStore } from '@/components/Store'
import { Heading } from '@/components/UI'
import { Image as ImageIcon } from 'lucide-react'
import { workOf } from '@/lib/model'

export default function PortfolioPage() {
  const { data } = useStore()
  const params = useSearchParams()
  const technician = params.get('technician') ?? ''
  const [query, setQuery] = useState('')

  // Портфолио строится из завершённых нарядов: отдельной таблицы
  // на витрине не нужно, пока нет загруженных фотографий портфолио.
  const works = useMemo(() => {
    const list = data.orders
      .filter((o) => o.status === 'done' && !o.archived)
      .filter((o) => (technician ? (o.technician || 'Денис') === technician : true))

    return list
      .map((o) => ({
        order: o,
        patient: data.patients.find((p) => p.id === o.patientId)?.name ?? 'Пациент',
        works: [...new Set(o.items.map((i) => i.workId))].map((id) => {
          try { return workOf(id).short } catch { return id }
        }),
      }))
      .filter((row) => {
        if (!query) return true
        const hay = `${row.patient} ${row.order.technician} ${row.works.join(' ')}`.toLowerCase()
        return hay.includes(query.toLowerCase())
      })
  }, [data.orders, data.patients, technician, query])

  return (
    <>
      <Heading
        title="Портфолио"
        sub={technician
          ? `Работы техника ${technician}. Каждая фотография привязана к наряду.`
          : 'Готовые работы техников. Портфолио видно только внутри CRM.'}
      />

      <section className="panel">
        <div className="panel-heading">
          <h2><ImageIcon size={16} className="inline-icon" /> Работы</h2>
          <input
            className="search-input"
            placeholder="Поиск по пациенту или виду работ"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        {works.length === 0 ? (
          <div className="empty">
            Готовых работ пока нет. Портфолио заполняется из нарядов со статусом «Готов».
          </div>
        ) : (
          <div className="portfolio-grid">
            {works.map((row) => (
              <article className="portfolio-card" key={row.order.id}>
                <div className="portfolio-thumb" aria-hidden="true">
                  <ImageIcon size={26} />
                </div>
                <div className="portfolio-body">
                  <strong>Наряд №{row.order.number}</strong>
                  <small>{row.order.technician || 'Денис'} · {row.order.doctor || 'врач не указан'}</small>
                  <div className="portfolio-tags">
                    {row.works.map((w) => <span className="tag" key={w}>{w}</span>)}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  )
}
