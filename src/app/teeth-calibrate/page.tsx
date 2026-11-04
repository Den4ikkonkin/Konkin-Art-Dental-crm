'use client'
import { useState } from 'react'

/* порядок, в котором кликать: 11–18, 21–28, 31–38, 41–48 */
const ORDER = [
  11, 12, 13, 14, 15, 16, 17, 18,
  21, 22, 23, 24, 25, 26, 27, 28,
  31, 32, 33, 34, 35, 36, 37, 38,
  41, 42, 43, 44, 45, 46, 47, 48,
]

export default function TeethCalibrate() {
  const [pts, setPts] = useState<[number, number, number][]>([])
  const next = ORDER.find((n) => !pts.some((p) => p[0] === n))

  function add(e: React.MouseEvent<HTMLDivElement>) {
    if (next === undefined) return
    const r = e.currentTarget.getBoundingClientRect()
    const x = +(((e.clientX - r.left) / r.width) * 100).toFixed(2)
    const y = +(((e.clientY - r.top) / r.height) * 100).toFixed(2)
    setPts((p) => [...p, [next, x, y]])
  }

  const code =
    'const POINTS: [number, number, number][] = [\n' +
    pts.map(([n, x, y]) => `  [${n}, ${x}, ${y}],`).join('\n') +
    '\n]'

  return (
    <div style={{ padding: 24, maxWidth: 720 }}>
      <h1 style={{ fontSize: 22 }}>Калибровка схемы зубов</h1>
      <p>
        Следующий зуб: <b>{next ?? 'готово'}</b>. Кликните в центр этого зуба на картинке.
      </p>
      <div className="row" style={{ margin: '12px 0' }}>
        <button type="button" className="btn small" onClick={() => setPts((p) => p.slice(0, -1))}>
          Отменить последний
        </button>
        <button type="button" className="btn small" onClick={() => setPts([])}>
          Начать заново
        </button>
        <span className="muted small">Отмечено: {pts.length} из 32</span>
      </div>

      <div style={{ position: 'relative', cursor: 'crosshair' }} onClick={add}>
        <img src="/teeth/dark.png" alt="" style={{ display: 'block', width: '100%' }} />
        {pts.map(([n, x, y]) => (
          <span
            key={n}
            style={{
              position: 'absolute',
              left: `${x}%`,
              top: `${y}%`,
              transform: 'translate(-50%, -50%)',
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: '#ffa052',
              pointerEvents: 'none',
            }}
          />
        ))}
      </div>

      <textarea
        readOnly
        rows={12}
        value={code}
        onFocus={(e) => e.target.select()}
        style={{ width: '100%', marginTop: 16, fontFamily: 'monospace', fontSize: 12 }}
      />
      <p className="muted small">Скопируйте текст из поля выше и вставьте в ToothChart.tsx вместо пустого POINTS.</p>
    </div>
  )
}