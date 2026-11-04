// Проверки ролей и прав. Запуск: npx tsx tests/roles.test.ts
// Здесь проверяется то, что легко сломать при правках интерфейса:
// врач не редактирует наряд, техник не правит «Готов», архивный не входит.

import assert from 'node:assert/strict'
import {
  can,
  canEditOrder,
  canEditOrderContent,
  canSignIn,
  canDeleteFile,
  queueBuckets,
  NAV,
  PRIMARY_ACTION,
} from '../src/lib/roles'
import { dueTone, dueLabel, statusLabel, STATUS_ORDER } from '../src/lib/model'

let passed = 0
function test(name: string, fn: () => void) {
  fn()
  passed++
  console.log('  ✓', name)
}

console.log('Роли и права')

test('врач не редактирует наряд', () => {
  assert.equal(canEditOrder('doctor'), false)
  assert.equal(canEditOrderContent('doctor', { status: 'new' }), false)
})

test('техник правит наряд до «Готов»', () => {
  assert.equal(canEditOrderContent('technician', { status: 'new' }), true)
  assert.equal(canEditOrderContent('technician', { status: 'in_progress' }), true)
  assert.equal(canEditOrderContent('technician', { status: 'done' }), false)
})

test('админ правит наряд в любом статусе', () => {
  assert.equal(canEditOrderContent('admin', { status: 'done' }), true)
})

test('техник не видит чужие зарплаты', () => {
  assert.equal(can('technician', 'salary.view_own'), true)
  assert.equal(can('technician', 'salary.view_all'), false)
})

test('врач не видит зарплаты, но видит суммы по врачам', () => {
  assert.equal(can('doctor', 'salary.view_all'), false)
  assert.equal(can('doctor', 'salary.view_own'), false)
  assert.equal(can('doctor', 'finance.view_doctor_totals'), true)
})

test('кнопка «Демо» и режим роли — только админ', () => {
  assert.equal(can('admin', 'demo.toggle'), true)
  assert.equal(can('doctor', 'demo.toggle'), false)
  assert.equal(can('technician', 'demo.toggle'), false)
  assert.equal(can('admin', 'role.impersonate'), true)
  assert.equal(can('doctor', 'role.impersonate'), false)
})

test('врач создаёт пациента и передаёт, но наряд не создаёт', () => {
  assert.equal(can('doctor', 'patient.create'), true)
  assert.equal(can('doctor', 'patient.handoff'), true)
  assert.equal(can('doctor', 'order.create'), false)
})

test('техник создаёт наряд и пациента', () => {
  assert.equal(can('technician', 'order.create'), true)
  assert.equal(can('technician', 'patient.create'), true)
})

test('прайс правит только админ', () => {
  assert.equal(can('admin', 'price.manage'), true)
  assert.equal(can('doctor', 'price.manage'), false)
  assert.equal(can('technician', 'price.manage'), false)
})

test('архивный пользователь не входит', () => {
  assert.equal(canSignIn({ status: 'archived' }), false)
  assert.equal(canSignIn({ status: 'active' }), true)
  assert.equal(canSignIn(null), false)
})

test('файл удаляет автор или админ', () => {
  assert.equal(canDeleteFile('technician', true), true)
  assert.equal(canDeleteFile('technician', false), false)
  assert.equal(canDeleteFile('doctor', false), false)
  assert.equal(canDeleteFile('admin', false), true)
})

test('меню ролей не пустое и различается', () => {
  assert.ok(NAV.technician.length > 0)
  assert.ok(NAV.doctor.length > 0)
  assert.ok(NAV.admin.length > 0)
  assert.equal(NAV.technician.some((n) => n.href === '/queue'), true)
  assert.equal(NAV.doctor.some((n) => n.href === '/queue'), false)
})

test('основное действие в шапке соответствует роли', () => {
  assert.equal(PRIMARY_ACTION.technician?.href, '/orders/new')
  assert.equal(PRIMARY_ACTION.doctor?.href, '/patients/new')
})

console.log('Сроки и статусы')

test('просрочка считается по сроку готовности', () => {
  const now = new Date('2026-03-10T10:00:00')
  assert.equal(dueTone({ dueDate: '2026-03-05', status: 'in_progress' }, now), 'overdue')
  assert.equal(dueTone({ dueDate: '2026-03-10', status: 'in_progress' }, now), 'soon')
  assert.equal(dueTone({ dueDate: '2026-03-11', status: 'in_progress' }, now), 'soon')
  assert.equal(dueTone({ dueDate: '2026-03-20', status: 'in_progress' }, now), 'calm')
})

test('готовый и архивный наряд не красятся как просрочка', () => {
  const now = new Date('2026-03-10T10:00:00')
  assert.equal(dueTone({ dueDate: '2026-01-01', status: 'done' }, now), 'done')
  assert.equal(dueTone({ dueDate: '2026-01-01', status: 'done', archived: true }, now), 'archived')
})

test('у каждого цвета есть текстовая подпись', () => {
  assert.equal(dueLabel('calm'), 'Срок не близко')
  assert.equal(dueLabel('soon'), 'Срок приближается')
  assert.equal(dueLabel('overdue'), 'Просрочен')
  assert.equal(dueLabel('archived'), 'Архив')
  assert.equal(dueLabel('done'), 'Готов')
})

test('шесть статусов: пять рабочих и архив отдельно', () => {
  assert.equal(STATUS_ORDER.length, 5)
  assert.equal(statusLabel('done'), 'Готов')
  assert.equal(statusLabel('done', true), 'Архив')
  assert.equal(statusLabel('awaiting_fitting'), 'Ожидает примерки')
})

test('очередь считает блоки и не путает просрочку с готовым', () => {
  const now = new Date('2026-03-10T10:00:00')
  const buckets = queueBuckets([
    { status: 'new', dueDate: '2026-03-20' },
    { status: 'in_progress', dueDate: '2026-03-01' },
    { status: 'awaiting_fitting', dueDate: '2026-03-15' },
    { status: 'done', dueDate: '2026-02-01' },
    { status: 'done', dueDate: '2026-02-01', archived: true },
  ], now)
  assert.equal(buckets.new, 1)
  assert.equal(buckets.inProgress, 1)
  assert.equal(buckets.awaitingFitting, 1)
  assert.equal(buckets.done, 1)
  assert.equal(buckets.overdue, 1)
  assert.equal(buckets.archived, 1)
})

console.log(`\nПройдено проверок: ${passed}`)
