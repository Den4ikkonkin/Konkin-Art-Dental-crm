'use client'

// Хранилище на сервере. Данные в Supabase и доступны с любого устройства.
// Доступ к строкам ограничивают RLS-политики: чужой пользователь их не увидит,
// даже зная публичный ключ из фронтенда.

import {
  createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode,
} from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, supabaseConfigured } from '@/lib/supabase'
import * as db from '@/lib/db'
import {
  emptyState, type State, type Patient, type Order, type Salary,
} from '@/lib/model'
import type { Profile, Role } from '@/lib/roles'

type Context = {
  data: State
  ready: boolean
  busy: boolean
  error: string
  notice: string
  session: Session | null
  configured: boolean
  refresh: () => Promise<void>
  clearMessages: () => void
  signOut: () => Promise<void>
  createPatient: (p: Patient) => Promise<Patient>
  updatePatient: (p: Patient) => Promise<void>
  deletePatient: (id: string) => Promise<void>
  saveOrder: (o: Order, isNew: boolean) => Promise<Order>
  changeOrderStatus: (id: string, status: Order['status']) => Promise<void>
  setOrderPaid: (id: string, paid: number, paidOn?: string) => Promise<void>
  setOrderArchived: (id: string, archived: boolean) => Promise<void>
  setOrderDoctor: (id: string, doctor: string) => Promise<void>
  deleteOrder: (id: string) => Promise<void>
  addSalary: (s: Salary) => Promise<void>
  deleteSalary: (id: string) => Promise<void>
  setMonthlySalary: (amount: number) => Promise<void>
  nextNumber: () => Promise<number>
  importAll: (s: State) => Promise<void>
  clearAll: () => Promise<void>
  /** Профиль из таблицы profiles: роль, логин, статус. */
  profile: Profile | null
  /** Роль, которая сейчас управляет интерфейсом. Может быть подменена админом. */
  role: Role
  /** Фактическая роль из базы. Нужна, чтобы вернуться из режима просмотра. */
  realRole: Role
  /** Режим «Просмотр как врач / техник». Доступен только админу. */
  viewAs: 'doctor' | 'technician' | null
  setViewAs: (v: 'doctor' | 'technician' | null) => void
  /** Состояние «пароль пора сменить» после первого входа. */
  mustChangePassword: boolean
  markPasswordChanged: () => Promise<void>
  reloadProfile: () => Promise<void>
}

const Store = createContext<Context | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<State>(emptyState)
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [viewAs, setViewAsState] = useState<'doctor' | 'technician' | null>(null)

  const reloadProfile = useCallback(async () => {
    try {
      const p = await db.loadProfile()
      setProfile(p)
    } catch {
      setProfile(null)
    }
  }, [])

  const setViewAs = useCallback((v: 'doctor' | 'technician' | null) => {
    setViewAsState(v)
    if (typeof window !== 'undefined') {
      if (v) sessionStorage.setItem('kad.viewAs', v)
      else sessionStorage.removeItem('kad.viewAs')
    }
  }, [])

  const markPasswordChanged = useCallback(async () => {
    await db.clearMustChangePassword()
    setProfile((p) => (p ? { ...p, mustChangePassword: false } : p))
  }, [])

  // Защита от одновременных запросов: устаревший ответ не перезапишет новые данные.
  const loadSeq = useRef(0)

  const refresh = useCallback(async () => {
    if (!supabaseConfigured) {
      setError('Не заданы адрес и публичный ключ Supabase. Проверьте файл .env.local и перезапустите сервер.')
      setReady(true)
      return
    }
    const my = ++loadSeq.current
    setBusy(true)
    try {
      const next = await db.loadState()
      if (my === loadSeq.current) setData(next)
    } catch (e) {
      if (my === loadSeq.current) setError(e instanceof Error ? e.message : 'Не удалось загрузить данные')
    } finally {
      if (my === loadSeq.current) { setBusy(false); setReady(true) }
    }
  }, [])

  // Следим за состоянием входа. Смена пользователя перезагружает данные.
  useEffect(() => {
    if (!supabaseConfigured) {
      setError('Не заданы адрес и публичный ключ Supabase. Проверьте файл .env.local и перезапустите сервер.')
      setReady(true)
      return
    }
    let alive = true
    const savedView = typeof window !== 'undefined'
      ? (sessionStorage.getItem('kad.viewAs') as 'doctor' | 'technician' | null)
      : null
    if (savedView === 'doctor' || savedView === 'technician') setViewAsState(savedView)

    supabase.auth.getSession().then(({ data: s }) => {
      if (!alive) return
      setSession(s.session)
      if (s.session) { void refresh(); void reloadProfile() }
      else setReady(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      if (!alive) return
      setSession(s)
      if (s) { void refresh(); void reloadProfile() }
      else {
        setData(emptyState); setProfile(null); setViewAsState(null)
        if (typeof window !== 'undefined') sessionStorage.removeItem('kad.viewAs')
        setReady(true)
      }
    })
    return () => { alive = false; sub.subscription.unsubscribe() }
  }, [refresh, reloadProfile])

  /** Обёртка: выполняет запрос, обновляет состояние и показывает понятный текст ошибки. */
  async function run<T>(work: () => Promise<T>, apply: (result: T) => void): Promise<T> {
    setError('')
    try {
      const result = await work()
      apply(result)
      return result
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Неизвестная ошибка'
      setError(message)
      throw e
    }
  }

  // Подмена роли доступна только настоящему администратору и никогда
  // не повышает права: RLS всё равно видит реального пользователя,
  // поэтому режим просмотра безопасен — он только меняет интерфейс.
  const realRole: Role = profile?.role ?? 'technician'
  const role: Role = realRole === 'admin' && viewAs ? viewAs : realRole

  const value: Context = {
    data, ready, busy, error, notice, session,
    profile,
    role,
    realRole,
    viewAs: realRole === 'admin' ? viewAs : null,
    setViewAs,
    mustChangePassword: Boolean(profile?.mustChangePassword),
    markPasswordChanged,
    reloadProfile,
    configured: supabaseConfigured,
    refresh,
    clearMessages: () => { setError(''); setNotice('') },
    signOut: async () => { await supabase.auth.signOut() },

    createPatient: (p) => run(() => db.insertPatient(p), (saved) => setData((d) => ({ ...d, patients: [...d.patients, saved] }))),

    updatePatient: (p) => run(() => db.updatePatient(p), () =>
      setData((d) => ({ ...d, patients: d.patients.map((x) => (x.id === p.id ? p : x)) }))),

    deletePatient: (id) => run(() => db.removePatient(id), () =>
      setData((d) => ({ ...d, patients: d.patients.filter((x) => x.id !== id) }))),

    saveOrder: (o, isNew) => run(() => db.upsertOrder(o), (saved) =>
      setData((d) => ({ ...d, orders: isNew ? [saved, ...d.orders] : d.orders.map((x) => (x.id === saved.id ? saved : x)) }))),

    changeOrderStatus: (id, status) => run(() => db.setOrderStatus(id, status), () =>
      setData((d) => ({ ...d, orders: d.orders.map((x) => (x.id === id ? { ...x, status } : x)) }))),

    // Галочка «Получено»: ставит полную сумму наряда или 0.
    setOrderPaid: (id, paid, paidOn = '') => run(() => db.setOrderPaid(id, paid, paidOn), () =>
      setData((d) => ({ ...d, orders: d.orders.map((x) => (x.id === id ? { ...x, paid, paidOn } : x)) }))),

    // Архив: наряд уходит с рабочей доски, но остаётся в данных.
    setOrderArchived: (id, archived) => run(() => db.setOrderArchived(id, archived), () =>
      setData((d) => ({ ...d, orders: d.orders.map((x) => (x.id === id ? { ...x, archived } : x)) }))),



    // Смена врача с карточки: пересчёт статистики по врачам идёт из data.orders автоматически.
    setOrderDoctor: (id, doctor) => run(() => db.setOrderDoctor(id, doctor), () =>
      setData((d) => ({ ...d, orders: d.orders.map((x) => (x.id === id ? { ...x, doctor } : x)) }))),

    deleteOrder: (id) => run(() => db.removeOrder(id), () =>
      setData((d) => ({ ...d, orders: d.orders.filter((x) => x.id !== id) }))),

    addSalary: (s) => run(() => db.insertSalary(s), () =>
      setData((d) => ({ ...d, salary: [{ ...s }, ...d.salary] }))),

    deleteSalary: (id) => run(() => db.removeSalary(id), () =>
      setData((d) => ({ ...d, salary: d.salary.filter((x) => x.id !== id) }))),

    setMonthlySalary: (amount) => run(() => db.saveMonthlySalary(amount), () =>
      setData((d) => ({ ...d, monthlySalary: amount }))),

    nextNumber: () => db.nextOrderNumber(),

    importAll: (s) => run(() => db.replaceAll(s), () => setData(s)),

    clearAll: () => run(() => db.clearEverything(), () => setData(emptyState)),
  }

  return <Store.Provider value={value}>{children}</Store.Provider>
}

export function useStore() {
  const ctx = useContext(Store)
  if (!ctx) throw new Error('StoreProvider отсутствует в дереве компонентов')
  return ctx
}
