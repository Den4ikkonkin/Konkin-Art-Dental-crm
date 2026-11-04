'use client'
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="panel empty">
      <h1>Не удалось открыть страницу</h1>
      <p>Данные не удалены. Попробуйте обновить страницу.</p>
      <button className="btn" onClick={() => reset()}>
        Повторить
      </button>
    </div>
  )
}
