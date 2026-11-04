import EarningsRings from '@/components/EarningsRings'

/* Страница только для проверки визуала колец. Механика не подключена. */
export default function RingsPreviewPage() {
  return (
    <main style={{ maxWidth: 1200, margin: '0 auto', padding: 32 }}>
      <h1 style={{ fontSize: 26, marginBottom: 20 }}>Мой заработок — предпросмотр колец</h1>
      <EarningsRings />
    </main>
  )
}
