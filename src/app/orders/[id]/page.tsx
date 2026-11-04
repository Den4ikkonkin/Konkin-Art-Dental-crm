 'use client'

import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useStore } from '@/components/Store'
import OrderForm from '@/components/OrderForm'

export default function Page() {
  const { id } = useParams<{ id: string }>()
  const { data } = useStore()
  const order = data.orders.find((o) => o.id === id)
  return order
    ? <OrderForm key={order.id} original={order} />
    : <div className="panel empty">Наряд не найден. <Link href="/orders">К списку</Link></div>
}
