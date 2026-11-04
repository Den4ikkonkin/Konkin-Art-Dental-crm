import assert from 'node:assert/strict'
import { demoState } from '../src/lib/demo'
import {
  allocatedPaid,
  summarize,
  stateSchema,
  orderSchema,
  FDI,
  inPeriod,
  total,
  summarizeDoctors,
  DOCTORS,
} from '../src/lib/model'
const state = stateSchema.parse(demoState())
assert.equal(FDI.length, 32)
assert.equal(new Set(FDI).size, 32)
assert.ok(!FDI.includes(19))
const rows = summarize(state.orders)
assert.equal(rows.length, 5)
assert.equal(
  rows.reduce((s, r) => s + r.count, 0),
  6,
)
assert.equal(rows[0].id, 'zirconia-implant')
for (const order of state.orders) {
  assert.equal(
    Math.round(allocatedPaid(order).reduce((s, n) => s + n, 0) * 100),
    Math.round(order.paid * 100),
  )
}
assert.ok(!orderSchema.safeParse({ ...state.orders[0], paid: total(state.orders[0]) + 1 }).success)
assert.ok(!orderSchema.safeParse({ ...state.orders[0], items: [] }).success)
assert.ok(!stateSchema.safeParse({ ...state, patients: [] }).success)

// Врачи: демо чередует двух врачей, сводка должна сложиться в общую сумму работ.
const doctorRows = summarizeDoctors(state.orders)
// Врачей стало трое (добавлен Ижерский), поэтому и строк в сводке три.
assert.equal(doctorRows.length, 3, 'в сводке ровно три известных врача')
assert.equal(doctorRows.reduce((s, d) => s + d.count, 0), 6, 'все работы распределены по врачам')
assert.equal(doctorRows.reduce((s, d) => s + d.orders, 0), state.orders.length, 'все наряды учтены')
assert.ok(doctorRows.every((d) => DOCTORS.includes(d.name as never)), 'имена — из справочника')
// Наряд без врача попадает в строку «Не указан».
const noDoctor = summarizeDoctors([{ ...state.orders[0], doctor: '' }])
assert.ok(noDoctor.some((d) => d.name === 'Не указан'), 'наряд без врача не теряется')
// Старые данные без поля doctor читаются как пустая строка.
assert.equal(orderSchema.parse({ ...state.orders[0], doctor: undefined }).doctor, '')
const sample = {
  ...state.orders[0],
  paid: 0.02,
  items: [1, 1, 1, 0].map((price, i) => ({
    ...state.orders[0].items[0],
    id: 'test' + i,
    tooth: 11 + i,
    price,
  })),
}
assert.equal(
  allocatedPaid(sample).reduce((s, n) => s + n, 0),
  0.02,
)
assert.equal(allocatedPaid(sample)[3], 0)
assert.ok(inPeriod({ createdAt: '2025-12-30' }, 'prev', new Date(2026, 0, 4)))
assert.ok(!inPeriod({ createdAt: '2026-01-30' }, 'prev', new Date(2026, 0, 4)))
assert.equal(
  Math.round(rows.reduce((s, r) => s + r.paid, 0) * 100),
  Math.round(state.orders.reduce((s, o) => s + o.paid, 0) * 100),
)
console.log(
  'OK: FDI, validation, counts, fixed order, payment allocation, zero-price item, year boundary, totals',
)

