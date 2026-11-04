import { money } from '@/lib/model'
export function Heading({
  title,
  sub,
  action,
}: {
  title: string
  sub: string
  action?: React.ReactNode
}) {
  return (
    <div className="page-heading">
      <div>
        <span className="eyebrow">РАБОЧЕЕ ПРОСТРАНСТВО</span>
        <h1>{title}</h1>
        <p>{sub}</p>
      </div>
      {action}
    </div>
  )
}
export function Metrics({
  values,
}: {
  values: { label: string; value: number; currency?: boolean; hint?: string; color?: string; onClick?: () => void }[]
}) {
  return (
    <div className="metrics">
      {values.map((v) => (
        <section
          className={'metric' + (v.onClick ? ' clickable' : '')}
          key={v.label}
          onClick={v.onClick}
          role={v.onClick ? 'button' : undefined}
          tabIndex={v.onClick ? 0 : undefined}
          onKeyDown={v.onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); v.onClick?.() } } : undefined}
        >
          <span>{v.label}</span>
          <strong style={{ color: v.color }}>{v.currency ? money(v.value) : v.value}</strong>
          <small>{v.hint || ' '}</small>
        </section>
      ))}
    </div>
  )
}
export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  )
}
