'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { showError, reportError } from '@/lib/error-handler'

const CURRENT_TRIP_ID_KEY = 'current_trip_id'
const DEFAULT_TRIP_ID = 92713244

interface AppUser {
  id: string
  email: string
  display_name: string
  created_at: string
}

interface TripBudgetsResult {
  trip?: { total_budget?: number; amount?: number; currency?: string }
  shopping?: { total_budget?: number; amount?: number; currency?: string }
}

interface DailyDay {
  date: string
  daily_budget: number
}

interface DailyBudgetsResult {
  days: DailyDay[]
  total_allocated?: number
  avg_allocated?: number
}

function parseTripId(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value)) return value
  if (typeof value === 'string') {
    const n = parseInt(value, 10)
    if (Number.isFinite(n) && Number.isInteger(n)) return n
  }
  return null
}

function formatDayLabel(dateStr: string, amount?: number, currency: string = 'EUR'): string {
  const d = new Date(dateStr + 'T12:00:00')
  const day = d.getDate()
  const month = d.toLocaleDateString('es-ES', { month: 'short' })
  const datePart = `${day} ${month}`
  if (amount != null && Number.isFinite(amount)) {
    const formatted = new Intl.NumberFormat('es', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount)
    return `${datePart} — ${formatted}`
  }
  return datePart
}

export default function BudgetClient() {
  const router = useRouter()
  const supabase = createClient()
  const [user, setUser] = useState<AppUser | null>(null)
  const [tripId, setTripId] = useState<number>(DEFAULT_TRIP_ID)
  const [loading, setLoading] = useState(true)

  const [tripBudget, setTripBudget] = useState<string>('')
  const [shoppingBudget, setShoppingBudget] = useState<string>('')
  const [days, setDays] = useState<DailyDay[]>([])
  const [totalAllocated, setTotalAllocated] = useState<number>(0)
  const [avgAllocated, setAvgAllocated] = useState<number>(0)
  const [currency, setCurrency] = useState<string>('EUR')

  const [selectedDayIndex, setSelectedDayIndex] = useState(0)
  const [selectedDayAmount, setSelectedDayAmount] = useState<string>('')
  const [savingTrip, setSavingTrip] = useState(false)
  const [savingShopping, setSavingShopping] = useState(false)
  const [savingDaily, setSavingDaily] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const showSuccess = useCallback((msg: string) => {
    setSuccessMessage(msg)
    const t = setTimeout(() => setSuccessMessage(null), 2500)
    return () => clearTimeout(t)
  }, [])

  const loadData = useCallback(
    async (appUserId: string, tId: number) => {
      const [budgetsRes, dailyRes] = await Promise.all([
        supabase.rpc('rpc_get_trip_budgets', { p_trip_id: tId, p_app_user_id: appUserId }),
        supabase.rpc('rpc_list_trip_daily_budgets', { p_trip_id: tId, p_app_user_id: appUserId }),
      ])

      const budgets = budgetsRes.data as TripBudgetsResult | null
      if (budgets?.trip != null) {
        const t = budgets.trip as { total_budget?: number; amount?: number; currency?: string }
        const val = t.total_budget ?? t.amount ?? 0
        setTripBudget(String(val))
        if (t.currency) setCurrency(t.currency)
      }
      if (budgets?.shopping != null) {
        const s = budgets.shopping as { total_budget?: number; amount?: number }
        const val = s.total_budget ?? s.amount ?? 0
        setShoppingBudget(String(val))
      }

      const daily = dailyRes.data as DailyBudgetsResult | null
      if (daily?.days && Array.isArray(daily.days)) {
        setDays(daily.days)
        setTotalAllocated(daily.total_allocated ?? 0)
        setAvgAllocated(daily.avg_allocated ?? 0)
      }
    },
    [supabase]
  )

  useEffect(() => {
    let cancelled = false
    const loadUserData = async () => {
      try {
        let appUser: AppUser | null = null
        const userStr = localStorage.getItem('app_user')
        if (userStr) {
          try {
            appUser = JSON.parse(userStr)
          } catch {
            appUser = null
          }
        }
        if (!appUser) {
          const res = await fetch('/api/auth/me', { credentials: 'include' })
          if (!res.ok) {
            if (!cancelled) router.push('/auth/login')
            return
          }
          const data = await res.json()
          appUser = data.user
          if (appUser) localStorage.setItem('app_user', JSON.stringify(appUser))
        }
        if (cancelled) return
        if (!appUser) {
          router.push('/auth/login')
          return
        }
        setUser(appUser)
        const storedTripId = parseTripId(
          typeof window !== 'undefined' ? localStorage.getItem(CURRENT_TRIP_ID_KEY) : null
        )
        const tId = storedTripId != null ? storedTripId : DEFAULT_TRIP_ID
        setTripId(tId)
        await loadData(appUser.id, tId)
      } catch (e) {
        reportError(e, 'Budget load')
        if (!cancelled) router.push('/auth/login')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    loadUserData()
    const timeout = setTimeout(() => {
      setLoading((prev) => {
        if (prev) router.push('/auth/login')
        return false
      })
    }, 12000)
    return () => {
      cancelled = true
      clearTimeout(timeout)
    }
  }, [router, loadData])

  useEffect(() => {
    if (days.length === 0) return
    const safeIndex = Math.min(selectedDayIndex, days.length - 1)
    if (safeIndex !== selectedDayIndex) setSelectedDayIndex(safeIndex)
    setSelectedDayAmount(String(days[safeIndex].daily_budget ?? 0))
  }, [selectedDayIndex, days])

  const handleSaveTripBudget = async () => {
    if (!user) return
    const total = parseFloat(tripBudget)
    if (Number.isNaN(total) || total < 0) return
    setSavingTrip(true)
    try {
      const { error } = await supabase.rpc('rpc_upsert_trip_budget', {
        p_trip_id: tripId,
        p_app_user_id: user.id,
        p_budget_type: 'trip',
        p_total_budget: total,
        p_currency: currency,
      })
      if (error) throw error
      await loadData(user.id, tripId)
      showSuccess('Presupuesto del viaje actualizado')
    } catch (e: any) {
      showError(e, { context: 'Budget', fallback: 'No se pudo guardar el presupuesto.' })
    } finally {
      setSavingTrip(false)
    }
  }

  const handleSaveShoppingBudget = async () => {
    if (!user) return
    const total = parseFloat(shoppingBudget)
    if (Number.isNaN(total) || total < 0) return
    setSavingShopping(true)
    try {
      const { error } = await supabase.rpc('rpc_upsert_trip_budget', {
        p_trip_id: tripId,
        p_app_user_id: user.id,
        p_budget_type: 'shopping',
        p_total_budget: total,
        p_currency: currency,
      })
      if (error) throw error
      await loadData(user.id, tripId)
      showSuccess('Presupuesto de compras actualizado')
    } catch (e: any) {
      showError(e, { context: 'Budget', fallback: 'No se pudo guardar el presupuesto de compras.' })
    } finally {
      setSavingShopping(false)
    }
  }

  const handleSaveDailyBudget = async () => {
    if (!user || days.length === 0) return
    const selectedDate = days[selectedDayIndex]?.date
    if (selectedDate == null) return
    const amount = parseFloat(selectedDayAmount)
    if (Number.isNaN(amount) || amount < 0) return
    setSavingDaily(true)
    try {
      const date =
        typeof selectedDate === 'string'
          ? selectedDate.slice(0, 10)
          : new Date(selectedDate).toISOString().slice(0, 10)
      const { error } = await supabase.rpc('rpc_upsert_trip_daily_budget', {
        p_trip_id: tripId,
        p_app_user_id: user.id,
        p_date: date,
        p_daily_budget: Number(amount),
      })
      if (error) throw error
      await loadData(user.id, tripId)
      showSuccess('Día actualizado')
    } catch (e: any) {
      showError(e, { context: 'Budget', fallback: 'No se pudo guardar el día.' })
    } finally {
      setSavingDaily(false)
    }
  }

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-[#f9f8f4] dark:bg-[#111621] flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-[#c16a4d] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const selectedDay = days[selectedDayIndex]
  const formatCurrency = (n: number) =>
    new Intl.NumberFormat('es', { style: 'currency', currency: currency || 'EUR', maximumFractionDigits: 0 }).format(n)

  return (
    <div className="mx-auto max-w-md min-h-screen bg-[#f9f8f4] dark:bg-[#111621] relative shadow-2xl overflow-hidden flex flex-col font-display antialiased">
      <header className="sticky top-0 z-20 flex items-center px-6 pt-4 pb-4 bg-[#f9f8f4]/95 dark:bg-[#111621]/95 backdrop-blur-sm shrink-0">
        <h1 className="text-[#2d4a3e] dark:text-white text-lg font-bold tracking-tight">
          Gestionar presupuestos
        </h1>
      </header>

      <main className="flex flex-col gap-6 p-6 pt-2 overflow-y-auto pb-24">
        {/* Trip Budget */}
        <div className="rounded-2xl bg-white dark:bg-[#1e2532] p-6 shadow-[0_4px_20px_-2px_rgba(45,74,62,0.08)] border border-transparent dark:border-slate-800">
          <div className="flex items-center gap-3 mb-6">
            <div className="flex size-10 items-center justify-center rounded-full bg-[#2d4a3e]/10 text-[#2d4a3e] dark:text-emerald-400">
              <span className="material-symbols-outlined text-[18px]">flight_takeoff</span>
            </div>
            <div>
              <h2 className="text-base font-bold text-[#2d4a3e] dark:text-white leading-tight">
                Presupuesto del viaje
              </h2>
              <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">
                Asignación total (tope)
              </p>
            </div>
          </div>
          <div className="relative group mb-6">
            <label className="block text-[11px] font-semibold text-slate-500 mb-1" htmlFor="trip-budget">
              Importe
            </label>
            <div className="flex items-baseline relative">
              <span className="text-lg font-bold text-slate-400 absolute left-0 bottom-2.5">€</span>
              <input
                id="trip-budget"
                type="number"
                inputMode="decimal"
                min="0"
                step="1"
                value={tripBudget}
                onChange={(e) => setTripBudget(e.target.value)}
                className="w-full bg-transparent border-0 border-b border-slate-200 focus:border-[#2d4a3e] focus:ring-0 px-0 pl-6 py-2 text-2xl font-bold text-[#2d4a3e] dark:text-white placeholder-slate-200"
                placeholder="0"
              />
              <span className="text-[11px] font-medium text-slate-400 absolute right-0 bottom-4">
                {currency || 'EUR'}
              </span>
            </div>
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleSaveTripBudget}
              disabled={savingTrip}
              className="w-full flex items-center justify-center gap-2 bg-[#2d4a3e] hover:bg-[#1f352c] text-white px-5 py-2.5 rounded-xl text-[11px] font-semibold shadow-lg shadow-[#2d4a3e]/20 transition-all active:scale-95 disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[14px]">check</span>
              {savingTrip ? 'Guardando...' : 'Guardar cambios'}
            </button>
          </div>
        </div>

        {/* Daily Breakdown */}
        <div className="rounded-2xl bg-white dark:bg-[#1e2532] p-6 shadow-[0_4px_20px_-2px_rgba(45,74,62,0.08)] border border-transparent dark:border-slate-800 flex flex-col h-auto">
          <div className="flex items-center gap-3 mb-6 shrink-0">
            <div className="flex size-10 items-center justify-center rounded-full bg-[#2d4a3e]/10 text-[#2d4a3e] dark:text-emerald-400">
              <span className="material-symbols-outlined text-[18px]">calendar_month</span>
            </div>
            <div>
              <h2 className="text-base font-bold text-[#2d4a3e] dark:text-white leading-tight">
                Desglose diario
              </h2>
              <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">
                Total asignado:{' '}
                <span className="text-[#2d4a3e] dark:text-white font-bold">
                  {formatCurrency(totalAllocated)}
                </span>
              </p>
            </div>
          </div>
          <div className="mb-6">
            <label className="block text-[11px] font-semibold text-slate-500 mb-1.5" htmlFor="day-select">
              Día
            </label>
            <div className="relative">
              <select
                id="day-select"
                value={days.length === 0 ? '' : Math.min(selectedDayIndex, days.length - 1)}
                onChange={(e) => setSelectedDayIndex(Number(e.target.value))}
                disabled={days.length === 0}
                className="w-full h-auto appearance-none rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-[0_4px_20px_-2px_rgba(45,74,62,0.08)] py-3.5 pl-4 pr-12 text-xs font-semibold text-[#2d4a3e] dark:text-white focus:border-[#2d4a3e] focus:ring-2 focus:ring-[#2d4a3e]/20 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {days.length === 0 ? (
                  <option value="">No hay días</option>
                ) : (
                  days.map((day, i) => (
                    <option key={day.date} value={i}>
                      {formatDayLabel(day.date, day.daily_budget, currency)}
                    </option>
                  ))
                )}
              </select>
              <span className="material-symbols-outlined pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[18px] text-[#2d4a3e]/70 dark:text-slate-400">
                expand_more
              </span>
            </div>
          </div>
          <div className="relative group mt-2">
            <label className="block text-[11px] font-semibold text-slate-500 mb-2" htmlFor="daily-amount">
              Importe asignado al día
            </label>
            <div className="flex items-baseline relative">
              <span className="text-lg font-bold text-slate-400 absolute left-0 bottom-2.5">€</span>
              <input
                id="daily-amount"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={selectedDayAmount}
                onChange={(e) => setSelectedDayAmount(e.target.value)}
                className="w-full bg-transparent border-0 border-b border-slate-200 focus:border-[#2d4a3e] focus:ring-0 px-0 pl-6 py-2 text-2xl font-bold text-[#2d4a3e] dark:text-white placeholder-slate-200"
                placeholder="0"
              />
              <span className="text-[11px] font-medium text-slate-400 absolute right-0 bottom-4">
                {currency || 'EUR'}
              </span>
            </div>
          </div>
          <div className="flex justify-end mt-6">
            <button
              type="button"
              onClick={handleSaveDailyBudget}
              disabled={savingDaily || !selectedDay}
              className="w-full flex items-center justify-center gap-2 bg-[#2d4a3e] hover:bg-[#1f352c] text-white px-5 py-2.5 rounded-xl text-[11px] font-semibold shadow-lg shadow-[#2d4a3e]/20 transition-all active:scale-95 disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[14px]">check</span>
              {savingDaily ? 'Guardando...' : 'Guardar día'}
            </button>
          </div>
        </div>

        {/* Shopping Budget */}
        <div className="rounded-2xl bg-white dark:bg-[#1e2532] p-6 shadow-[0_4px_20px_-2px_rgba(45,74,62,0.08)] border border-transparent dark:border-slate-800 relative overflow-hidden">
          <div className="absolute right-0 top-0 size-24 bg-[#c16a4d]/5 rounded-bl-full pointer-events-none" />
          <div className="flex items-center gap-3 mb-6 relative z-10">
            <div className="flex size-10 items-center justify-center rounded-full bg-[#c16a4d]/10 text-[#c16a4d]">
              <span className="material-symbols-outlined text-[18px]">shopping_bag</span>
            </div>
            <div>
              <h2 className="text-base font-bold text-[#2d4a3e] dark:text-white leading-tight">
                Presupuesto compras
              </h2>
              <p className="text-[10px] font-medium text-[#c16a4d] uppercase tracking-wide">
                Asignación separada
              </p>
            </div>
          </div>
          <div className="relative group mb-6 z-10">
            <label className="block text-[11px] font-semibold text-slate-500 mb-1" htmlFor="shopping-budget">
              Límite compras
            </label>
            <div className="flex items-baseline relative">
              <span className="text-lg font-bold text-slate-400 absolute left-0 bottom-2.5">€</span>
              <input
                id="shopping-budget"
                type="number"
                inputMode="decimal"
                min="0"
                step="1"
                value={shoppingBudget}
                onChange={(e) => setShoppingBudget(e.target.value)}
                className="w-full bg-transparent border-0 border-b border-slate-200 focus:border-[#c16a4d] focus:ring-0 px-0 pl-5 py-2 text-2xl font-bold text-[#2d4a3e] dark:text-white placeholder-slate-200"
                placeholder="0"
              />
              <span className="text-[11px] font-medium text-slate-400 absolute right-0 bottom-4">
                {currency || 'EUR'}
              </span>
            </div>
          </div>
          <div className="flex justify-end z-10 relative">
            <button
              type="button"
              onClick={handleSaveShoppingBudget}
              disabled={savingShopping}
              className="w-full flex items-center justify-center gap-2 bg-[#c16a4d] hover:bg-[#a65940] text-white px-5 py-2.5 rounded-xl text-[11px] font-semibold shadow-lg shadow-[#c16a4d]/20 transition-all active:scale-95 disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[14px]">save</span>
              {savingShopping ? 'Guardando...' : 'Guardar presupuesto'}
            </button>
          </div>
        </div>

        <div className="px-2 text-center mt-4 mb-8">
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Los cambios en el desglose diario actualizarán el saldo restante en el panel.
          </p>
        </div>
      </main>

      {/* Mensaje de éxito sutil */}
      {successMessage && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 rounded-full bg-[#2d4a3e] text-white text-xs font-medium shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-300"
        >
          <span className="material-symbols-outlined text-[14px] text-emerald-300">check_circle</span>
          {successMessage}
        </div>
      )}
    </div>
  )
}
