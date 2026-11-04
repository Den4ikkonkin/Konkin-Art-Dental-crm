import Link from 'next/link'
export default function NotFound() {
  return (
    <div className="panel empty">
      <h1>Страница не найдена</h1>
      <Link className="btn" href="/">
        На главную
      </Link>
    </div>
  )
}
