'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getCategoryMaterialIcon } from '@/lib/category-icons'
import { toast } from 'sonner'
import { showError, getErrorMessage, reportError } from '@/lib/error-handler'

// RPC types - do not invent; use only these
interface TripBudgetOverview {
  trip: {
    total_budget: number
    currency: string
    spent: number
    remaining: number
  }
  shopping: {
    total_budget: number
    currency: string
    spent: number
    remaining: number
  }
}

interface TodayBudget {
  planned_today: number
  spent_today: number
  available_today: number
}

interface CategoryBreakdown {
  category_id: number
  name: string
  icon: string
  spent: number
}

interface AppUser {
  id: string
  email: string
  display_name: string
  created_at: string
}

// trip_id is BIGINT (splitwise_groups.id). No trips/trip_users. Budgets are per (trip_id + app_user_id).
// Daily budget by date via RPC; no carryover stored. All calculations via RPC.
const CURRENT_TRIP_ID_KEY = 'current_trip_id'
const CURRENT_TRIP_NAME_KEY = 'current_trip_name'
const DEFAULT_TRIP_ID = 92713244

// Qué dashboard ve cada usuario. Mismo dato de RPCs; solo cambia el diseño.
// Para agregar otro usuario al dashboard "valen": añadí su id aquí.
// Para un tercer diseño: añadí un nuevo valor (ej. 'otro') y un nuevo bloque en el render.
const DASHBOARD_BY_USER_ID: Record<string, 'default' | 'valen'> = {
  '30d7709b-c04a-4325-adf3-60211e75bc65': 'valen', // Valen – diseño Bali Trip
}

const VALEN_USER_ID = '30d7709b-c04a-4325-adf3-60211e75bc65'

function parseTripId(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value)) return value
  if (typeof value === 'string') {
    const n = parseInt(value, 10)
    if (Number.isFinite(n) && Number.isInteger(n)) return n
  }
  return null
}

interface DashboardClientProps {
  /** Si viene de /dashboard/valen, forzamos layout valen. Si no, se usa DASHBOARD_BY_USER_ID. */
  variant?: 'default' | 'valen'
}

export default function DashboardClient({ variant: variantFromUrl }: DashboardClientProps = {}) {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()
  const [user, setUser] = useState<AppUser | null>(null)
  const [tripId, setTripId] = useState<number | null>(null)
  const [tripName, setTripName] = useState<string>('Viaje')
  const [overview, setOverview] = useState<TripBudgetOverview | null>(null)
  const [today, setToday] = useState<TodayBudget | null>(null)
  const [categories, setCategories] = useState<CategoryBreakdown[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null)
  const [syncFailureCount, setSyncFailureCount] = useState(0)
  const [rateLimit429, setRateLimit429] = useState(false)
  const SYNC_COOLDOWN_MS = 3 * 60 * 1000 // 3 minutos
  const LAST_SYNC_KEY = 'splitwise_last_sync_at'
  const lastSyncAtFromDb = null; // Declare the variable here

  // ✅ 1. Normalización UTC: función única para verificar cooldown
  const canSync = useCallback((lastSyncISO: string | null): boolean => {
    if (!lastSyncISO) return true

    try {
      // ISO string en UTC → getTime() siempre devuelve milisegundos desde epoch
      const lastSyncTime = new Date(lastSyncISO).getTime()
      const diffMs = Date.now() - lastSyncTime
      return diffMs >= SYNC_COOLDOWN_MS
    } catch (error) {
      reportError(error, 'Dashboard canSync')
      return true // Si hay error, permitir sync
    }
  }, [])

  // Estado reactivo del cooldown usando la misma función
  const syncInCooldown = !canSync(lastSyncAt)

  // Guardar timestamp de sync en localStorage
  const saveLastSyncTime = useCallback(() => {
    const now = new Date().toISOString()
    setLastSyncAt(now)
    localStorage.setItem(LAST_SYNC_KEY, now)
  }, [])

  // Cargar timestamp desde localStorage
  const loadLastSyncTime = useCallback(() => {
    try {
      const stored = localStorage.getItem(LAST_SYNC_KEY)
      if (stored) {
        setLastSyncAt(stored)
        return stored
      }
    } catch (error) {
      reportError(error, 'Dashboard loadLastSyncTime')
    }
    return null
  }, [])

  // appUserId = usuario logueado (app_user.id). Nunca un id fijo.
  // PostgREST devuelve RPCs de una fila como array [row]; normalizamos a objeto para overview y today.
  // Caché Safari iOS: loadDashboard usa supabase.rpc() (POST), no fetch GET a /api/... → no aplica cache de GET.
  // Si en el futuro se llama a fetch('/api/trip-data' etc.), usar ?_=${Date.now()} o header Cache-Control: no-cache.
  const loadDashboard = useCallback(
    async (appUserId: string, tId: number) => {
      const [
        { data: overviewData, error: overviewError },
        { data: todayData, error: todayError },
        { data: categoriesData, error: categoriesError },
      ] = await Promise.all([
        supabase.rpc<TripBudgetOverview>('rpc_trip_budget_overview', {
          p_trip_id: tId,
          p_app_user_id: appUserId,
        }),
        supabase.rpc<TodayBudget>('rpc_trip_today_budget', {
          p_trip_id: tId,
          p_app_user_id: appUserId,
        }),
        supabase.rpc<CategoryBreakdown[]>('rpc_trip_category_dashboard', {
          p_trip_id: tId,
          p_app_user_id: appUserId,
        }),
      ])

      if (overviewError) {
        reportError(overviewError, 'Dashboard rpc_trip_budget_overview')
      } else if (overviewData != null) {
        const overview = Array.isArray(overviewData) ? overviewData[0] : overviewData
        if (overview && typeof overview === 'object' && ('trip' in overview || 'shopping' in overview)) {
          setOverview(overview as TripBudgetOverview)
        }
      }

      if (todayError) {
        reportError(todayError, 'Dashboard rpc_trip_today_budget')
      } else if (todayData != null) {
        const today = Array.isArray(todayData) ? todayData[0] : todayData
        if (today && typeof today === 'object' && ('planned_today' in today || 'spent_today' in today)) {
          setToday(today as TodayBudget)
        }
      }

      if (categoriesError) {
        reportError(categoriesError, 'Dashboard rpc_trip_category_dashboard')
      } else if (categoriesData != null) {
        setCategories(Array.isArray(categoriesData) ? categoriesData : [categoriesData])
      }
    },
    [] // Sin dependencias - supabase es estable
  )

  // ✅ 2 & 3: Función única de sync con lock anti-doble sync
  const syncSplitwise = useCallback(
    async (appUserId: string, groupId: string = '92713244', manual: boolean = false) => {
      if (syncing) return
      if (!manual && !canSync(lastSyncAt)) {
        const numericTripId = tripId ?? Number(groupId)
        if (Number.isFinite(numericTripId)) await loadDashboard(appUserId, numericTripId as number)
        return
      }
      setSyncing(true)
      if (process.env.NODE_ENV === 'development') {
        console.log(`[Dashboard] Sync ${manual ? 'MANUAL' : 'AUTO'}`)
      }
      
      try {
        const response = await fetch('/api/splitwise/sync', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache',
          },
          cache: 'no-store',
          body: JSON.stringify({ app_user_id: appUserId, group_id: groupId }),
        })
        
        const data = await response.json().catch(() => null)
        if (!response.ok) {
          if (response.status === 429) setRateLimit429(true)
          throw new Error(data?.message || data?.error || `HTTP ${response.status}`)
        }
        setRateLimit429(false)
        setSyncFailureCount(0)
        saveLastSyncTime()
        const numericTripId = tripId ?? Number(groupId)
        if (Number.isFinite(numericTripId)) await loadDashboard(appUserId, numericTripId as number)
      } catch (error: any) {
        reportError(error, 'v0 Sync')
        const nextFailures = syncFailureCount + 1
        setSyncFailureCount(nextFailures)
        if (nextFailures >= 2) {
          toast.error(getErrorMessage(error, 'No se pudo sincronizar con Splitwise'), {
            description: 'Revisá la conexión o intentá de nuevo en un momento.',
            duration: 5000,
          })
          reportError(error, 'Dashboard sync')
        }
        if (manual) {
          showError(error, { context: 'Dashboard sync', description: 'Revisá la conexión o intentá de nuevo.' })
        }
        const numericTripId = tripId ?? Number(groupId)
        if (Number.isFinite(numericTripId)) await loadDashboard(appUserId, numericTripId as number)
      } finally {
        setSyncing(false)
      }
    },
    [syncing, lastSyncAt, canSync, tripId, loadDashboard, saveLastSyncTime, syncFailureCount]
  )

  // Usuario logueado: localStorage (app_user) o cookie de sesión larga (/api/auth/me).
  useEffect(() => {
    const loadUserData = async () => {
      try {
        let appUser: AppUser | null = null
        // Intentar primero desde localStorage, luego sessionStorage, finalmente cookie
        const userStrLocal = localStorage.getItem('app_user')
        const userStrSession = sessionStorage.getItem('app_user')
        
        if (userStrLocal) {
          appUser = JSON.parse(userStrLocal)
        } else if (userStrSession) {
          appUser = JSON.parse(userStrSession)
          localStorage.setItem('app_user', userStrSession)
        } else {
          const res = await fetch('/api/auth/me', { credentials: 'include' })
          if (res.ok) {
            const data = await res.json()
            appUser = data.user
            const userStr = JSON.stringify(appUser)
            localStorage.setItem('app_user', userStr)
            sessionStorage.setItem('app_user', userStr)
          } else {
            router.push('/auth/login')
            return
          }
        }
        if (!appUser) {
          router.push('/auth/login')
          return
        }
        setUser(appUser)

        // No se usa app_user_id para sync status; se ignora ese campo.

        // trip_id is BIGINT (splitwise_groups.id). Default to 92713244 from splitwise_groups if none in localStorage.
        const storedTripId = parseTripId(
          typeof window !== 'undefined' ? localStorage.getItem(CURRENT_TRIP_ID_KEY) : null
        )
        const storedTripName =
          typeof window !== 'undefined' ? localStorage.getItem(CURRENT_TRIP_NAME_KEY) : null
        const effectiveTripId = storedTripId != null ? storedTripId : DEFAULT_TRIP_ID
        setTripId(effectiveTripId)
        setTripName(storedTripName ?? 'Viaje')
        
        const lastSync = loadLastSyncTime()
        await syncSplitwise(appUser.id, String(effectiveTripId), false)
      } catch (error) {
        reportError(error, 'Dashboard loadUser')
      } finally {
        setLoading(false)
      }
    }
    loadUserData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Solo ejecutar una vez al montar

  // Refrescar datos al entrar o cuando se resuelven usuario + tripId
  useEffect(() => {
    if (!pathname || !user?.id || tripId == null) return
    if (pathname !== '/dashboard' && pathname !== '/dashboard/valen') return
    loadDashboard(user.id, tripId)
  }, [pathname, user?.id, tripId, loadDashboard])

  // ✅ Multi-tab: si otra pestaña actualizó la sync, recargar solo datos (no llamar a Splitwise)
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key !== LAST_SYNC_KEY || e.newValue == null || !user?.id || tripId == null) return
      setLastSyncAt(e.newValue)
      loadDashboard(user.id, tripId)
    }
    window.addEventListener('storage', handleStorageChange)
    return () => window.removeEventListener('storage', handleStorageChange)
  }, [user?.id, tripId, loadDashboard])

  // ✅ 4. PWA / Safari: visibilitychange sin espuma
  useEffect(() => {
    const handlePageshow = async (e: PageTransitionEvent) => {
      if (!e.persisted || !user?.id || tripId == null) return
      await syncSplitwise(user.id, String(tripId), false)
    }
    const handleVisibilityChange = async () => {
      if (document.visibilityState !== 'visible' || !user?.id || tripId == null) return
      await syncSplitwise(user.id, String(tripId), false)
    }
    
    window.addEventListener('pageshow', handlePageshow)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    
    return () => {
      window.removeEventListener('pageshow', handlePageshow)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, tripId])

  const handleLogout = async () => {
    // Limpiar todas las formas de almacenamiento de sesión
    localStorage.removeItem('app_user')
    sessionStorage.removeItem('app_user')
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
    router.push('/auth/login')
  }

  const formatCurrency = (amount: number, currency: string = 'EUR') => {
    return new Intl.NumberFormat('es', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)
  }

  const convertToUSD = (amount: number) => {
    return new Intl.NumberFormat('es', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount * 1.09)
  }

  if (loading || !user) {
    return (
      <div
        className="min-h-screen bg-[#f9f8f4] dark:bg-[#111621] flex items-center justify-center"
        suppressHydrationWarning
      >
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-[#c16a4d] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-500" suppressHydrationWarning>
            Cargando panel...
          </p>
        </div>
      </div>
    )
  }

  // Si entró por /dashboard/valen pero no es Valen, redirigir al dashboard por defecto
  if (variantFromUrl === 'valen' && user.id !== VALEN_USER_ID) {
    router.replace('/dashboard')
    return null
  }

  if (tripId == null) {
    return (
      <div className="min-h-screen bg-[#f9f8f4] dark:bg-[#111621] flex items-center justify-center">
        <div className="text-center px-4">
          <p className="text-slate-600 dark:text-slate-400">No se encontró ningún viaje para tu cuenta.</p>
          <button
            onClick={handleLogout}
            className="mt-4 text-sm font-medium text-[#c16a4d] hover:text-[#a65940]"
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    )
  }

  // rpc_trip_budget_overview → trip + shopping (no mezclar; shopping aislado)
  const trip = overview?.trip ?? { total_budget: 0, currency: 'EUR', spent: 0, remaining: 0 }
  const shopping = overview?.shopping ?? { total_budget: 0, currency: 'EUR', spent: 0, remaining: 0 }
  // rpc_trip_today_budget → planned_today, spent_today, available_today (carryover lo calcula el RPC; front no recalcula)
  const plannedToday = today?.planned_today ?? 0
  const spentToday = today?.spent_today ?? 0
  const availableToday = today?.available_today ?? 0
  const todayPercent = plannedToday > 0 ? Math.round((spentToday / plannedToday) * 100) : 0
  const tripSpentPercent = trip.total_budget > 0 ? Math.round((trip.spent / trip.total_budget) * 100) : 0
  // Shopping % en la lista de categorías: relativo al gasto total (trip + shopping)
  const totalSpentAll = trip.spent + shopping.spent
  const shoppingPercent = totalSpentAll > 0 ? Math.round((shopping.spent / totalSpentAll) * 100) : 0
  // Shopping: SOLO overview.shopping (total_budget, spent, remaining); no breakdown, no sumar en front
  const shoppingBudgetPercent = shopping.total_budget > 0 ? Math.round((shopping.spent / shopping.total_budget) * 100) : 0

  // Variante: desde la URL (/dashboard/valen) o según usuario (DASHBOARD_BY_USER_ID)
  const dashboardVariant = variantFromUrl ?? DASHBOARD_BY_USER_ID[user.id] ?? 'default'

  if (dashboardVariant === 'valen') {
    // Dashboard Valen: 1:1 con RPCs existentes. No crear RPCs nuevos.
    // 1) Trip Budget → rpc_trip_budget_overview: trip.remaining (restante), trip.total_budget (asignado)
    // 2) Today's Budget → rpc_trip_today_budget: planned_today, spent_today (% barra display)
    // 3) Daily Expenses → rpc_trip_budget_overview: trip.spent, trip.total_budget, trip.remaining. NO shopping.
    // 4) Shopping Budget → rpc_trip_budget_overview: shopping.total_budget, shopping.spent, shopping.remaining solo.
    return (
      <div className="min-h-screen bg-gray-100 dark:bg-black font-display antialiased selection:bg-[#2d4a3e]/20">
        <div className="mx-auto max-w-md min-h-screen bg-[#f9f8f4] dark:bg-[#111621] relative shadow-2xl overflow-hidden pb-32">
          <header className="sticky top-0 z-20 flex items-center justify-between px-6 pt-2 pb-2 bg-[#f9f8f4]/90 dark:bg-[#111621]/90 backdrop-blur-sm transition-colors duration-300">
            <div className="flex flex-col gap-0.5 min-w-0">
              <h1 className="text-[#2d4a3e] dark:text-white text-lg font-bold tracking-tight">
                ¡Hola {user.display_name || user.email?.split('@')[0] || 'Usuario'}!
              </h1>
              {syncing && (
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[14px] animate-spin">progress_activity</span>
                  Actualizando...
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => user && syncSplitwise(user.id, tripId != null ? String(tripId) : undefined, true)}
                disabled={syncing}
                className="flex items-center justify-center rounded-full p-2 hover:bg-black/5 dark:hover:bg-white/10 transition-colors disabled:opacity-50"
                title={
                  syncInCooldown
                    ? `Sincronizado hace poco. Pulsa para volver a sincronizar con Splitwise.`
                    : 'Actualizar con Splitwise'
                }
              >
                <span
                  className={`material-symbols-outlined text-[20px] ${syncing ? 'animate-spin' : ''} ${syncInCooldown ? 'text-red-500 dark:text-red-400' : 'text-slate-500 dark:text-slate-400'}`}
                >
                  refresh
                </span>
              </button>
              <button
                onClick={handleLogout}
                className="flex items-center justify-center rounded-full p-2 hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-slate-500 dark:text-slate-400"
                title="Cerrar sesión"
              >
                <span className="material-symbols-outlined text-[20px]">logout</span>
              </button>
            </div>
          </header>
          <main className="flex flex-col gap-6 p-4 pt-2">
            {rateLimit429 && (
              <div className="rounded-xl bg-red-600 text-white px-4 py-3 text-center font-semibold text-sm shadow-lg">
                Too Many Requests
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-1 rounded-2xl bg-white dark:bg-[#1e2532] p-4 shadow-[0_4px_20px_-2px_rgba(45,74,62,0.08)] flex flex-col items-center justify-center gap-3 h-[140px] border border-transparent dark:border-slate-800">
                <span className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400 text-center">
                  Te queda para gastar
                </span>
                <span className="text-3xl font-bold text-[#2d4a3e] dark:text-white tracking-tight tabular-nums">
                  {formatCurrency(trip.remaining, trip.currency)}
                </span>
              </div>
              <div className="col-span-1 rounded-2xl bg-[#2d4a3e] text-white p-4 shadow-[0_0_15px_rgba(45,74,62,0.3)] flex flex-col justify-between h-[140px] relative overflow-hidden group">
                <div className="relative z-10">
                  <span className="text-emerald-50 text-xs font-medium uppercase tracking-wider flex items-center gap-1">
                    Presupuesto de hoy
                  </span>
                  {/* Mostrar cuánto queda hoy: available_today */}
                  <span className="text-2xl font-bold tracking-tight mt-2 block">
                    {formatCurrency(availableToday, trip.currency)}
                  </span>
                </div>
                <div className="relative z-10 mt-auto">
                  <div className="flex justify-between text-xs text-emerald-50 mb-1 font-medium">
                    <span>{formatCurrency(spentToday, trip.currency)} gastado</span>
                    <span>{todayPercent}%</span>
                  </div>
                  <div className="h-1.5 w-full bg-black/20 rounded-full overflow-hidden">
                    <div className="h-full bg-white rounded-full transition-all duration-500" style={{ width: `${Math.min(todayPercent, 100)}%` }} />
                  </div>
                </div>
                <div className="absolute -right-4 -top-4 size-20 bg-white/10 rounded-full blur-xl group-hover:bg-white/20 transition-all duration-500" />
                <div className="absolute -left-2 bottom-6 size-12 bg-emerald-400/20 rounded-full blur-lg" />
              </div>
            </div>
            <div className="flex flex-col gap-5">
              <div className="rounded-2xl bg-white dark:bg-[#1e2532] p-6 shadow-[0_4px_20px_-2px_rgba(45,74,62,0.08)] border border-transparent dark:border-slate-800">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="flex size-10 items-center justify-center rounded-full bg-[#2d4a3e]/10 text-[#2d4a3e] dark:text-emerald-400">
                      <span className="material-symbols-outlined text-[22px]">account_balance_wallet</span>
                    </div>
                    <div className="flex flex-col">
                      <h2 className="text-base font-bold text-[#2d4a3e] dark:text-white leading-tight">Gastos diarios</h2>
                      <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">Presupuesto principal</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-xl font-bold text-[#2d4a3e] dark:text-white">{tripSpentPercent}%</span>
                  </div>
                </div>
                <div className="flex flex-col gap-5">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-3xl font-bold text-[#2d4a3e] dark:text-white tracking-tight">{formatCurrency(trip.spent, trip.currency)}</span>
                      <span className="text-xs font-semibold text-slate-400 mb-1">/ {formatCurrency(trip.total_budget, trip.currency)}</span>
                    </div>
                    <span className="text-xs font-medium text-slate-400">≈ {convertToUSD(trip.spent)} gastado</span>
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className="h-4 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full bg-[#2d4a3e] rounded-full relative shadow-sm" style={{ width: `${Math.min(tripSpentPercent, 100)}%` }} />
                    </div>
                    <div className="flex justify-between items-center text-xs font-medium text-slate-500 dark:text-slate-400 px-0.5">
                      <span>Comida, transporte, actividades, alojamiento</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="rounded-2xl bg-white dark:bg-[#1e2532] p-6 shadow-[0_4px_20px_-2px_rgba(45,74,62,0.08)] border border-transparent dark:border-slate-800 relative overflow-hidden group">
                <div className="absolute right-0 top-0 size-32 bg-[#c16a4d]/5 rounded-bl-full pointer-events-none" />
                <div className="flex items-start justify-between mb-6 relative z-10">
                  <div className="flex items-center gap-3">
                    <div className="flex size-10 items-center justify-center rounded-full bg-[#c16a4d]/10 text-[#c16a4d]">
                      <span className="material-symbols-outlined text-[22px]">shopping_bag</span>
                    </div>
                    <h2 className="text-base font-bold text-[#2d4a3e] dark:text-white leading-tight">Presupuesto de compras</h2>
                  </div>
                </div>
                <div className="flex flex-col gap-5 relative z-10">
                  <div className="flex items-end justify-between">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-3xl font-bold text-slate-700 dark:text-slate-200 tracking-tight">{formatCurrency(shopping.spent, shopping.currency)}</span>
                        <span className="text-xs font-semibold text-slate-400 mb-1">/ {formatCurrency(shopping.total_budget, shopping.currency)}</span>
                      </div>
                      <span className="text-xs font-medium text-slate-400">≈ {convertToUSD(shopping.spent)} gastado</span>
                    </div>
                    <div className="mb-1">
                      <span className="text-xl font-bold text-[#c16a4d]">{shoppingBudgetPercent}%</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className="h-4 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full bg-[#c16a4d] rounded-full shadow-sm" style={{ width: `${Math.min(shoppingBudgetPercent, 100)}%` }} />
                    </div>
                    <div className="flex justify-between items-center text-xs font-medium text-slate-500 dark:text-slate-400 px-0.5">
                      <span>Compras y extras</span>
                      <span className="text-[#c16a4d]">{formatCurrency(shopping.remaining, shopping.currency)} restante</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </main>
          <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto z-40 bg-white/90 dark:bg-[#1e2532]/95 backdrop-blur-lg border-t border-gray-100 dark:border-slate-800 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <div className="flex items-center justify-between px-10 h-16 pb-2 relative">
              <button className="flex flex-col items-center justify-center gap-1 text-[#2d4a3e] w-12">
                <span className="material-symbols-outlined">dashboard</span>
                <span className="text-xs font-semibold">Panel</span>
              </button>
              <div className="absolute left-1/2 -translate-x-1/2 -top-6">
                <button
                  onClick={() => router.push('/expenses/new')}
                  className="size-16 bg-[#c16a4d] hover:bg-[#a65940] text-white rounded-full shadow-lg shadow-[#c16a4d]/40 flex items-center justify-center transition-all hover:scale-105 active:scale-95 border-[4px] border-white dark:border-[#1e2532]"
                >
                  <span className="material-symbols-outlined text-[32px]">add</span>
                </button>
              </div>
              <button
                onClick={() => router.push('/expenses')}
                className="flex flex-col items-center justify-center gap-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors w-12"
              >
                <span className="material-symbols-outlined">receipt_long</span>
                <span className="text-xs font-medium">Gastos</span>
              </button>
            </div>
          </nav>
        </div>
      </div>
    )
  }

  // Dashboard por defecto (todos los usuarios no listados en DASHBOARD_BY_USER_ID)
  return (
    <div className="min-h-screen bg-gray-100 dark:bg-black font-display antialiased selection:bg-[#2d4a3e]/20">
      <div className="mx-auto max-w-md min-h-screen bg-[#f9f8f4] dark:bg-[#111621] relative shadow-2xl overflow-hidden pb-32">
        <header className="sticky top-0 z-20 flex items-center justify-between px-6 pt-2 pb-2 bg-[#f9f8f4]/90 dark:bg-[#111621]/90 backdrop-blur-sm transition-colors duration-300">
          <div className="flex flex-col gap-0.5 min-w-0">
            <h1 className="text-[#2d4a3e] dark:text-white text-lg font-bold tracking-tight">
              ¡Hola {user.display_name || user.email?.split('@')[0] || 'Usuario'}!
            </h1>
            {syncing && (
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[14px] animate-spin">progress_activity</span>
                Actualizando...
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => user && syncSplitwise(user.id, tripId != null ? String(tripId) : undefined, true)}
              disabled={syncing}
              className="flex items-center justify-center rounded-full p-2 hover:bg-black/5 dark:hover:bg-white/10 transition-colors disabled:opacity-50"
              title={
                syncInCooldown
                  ? `Sincronizado hace poco. Pulsa para volver a sincronizar con Splitwise.`
                  : 'Actualizar con Splitwise'
              }
            >
              <span
                className={`material-symbols-outlined text-[20px] ${syncing ? 'animate-spin' : ''} ${syncInCooldown ? 'text-red-500 dark:text-red-400' : 'text-slate-500 dark:text-slate-400'}`}
              >
                refresh
              </span>
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center justify-center rounded-full p-2 hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-slate-500 dark:text-slate-400"
              title="Cerrar sesión"
            >
              <span className="material-symbols-outlined text-[20px]">logout</span>
            </button>
          </div>
        </header>

        <main className="flex flex-col gap-6 p-4 pt-2">
          {rateLimit429 && (
            <div className="rounded-xl bg-red-600 text-white px-4 py-3 text-center font-semibold text-sm shadow-lg">
              Too Many Requests
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            {/* Trip Budget - data from overview.trip only (category_id <> 44, same as Daily Expenses) */}
            <div className="col-span-1 rounded-2xl bg-white dark:bg-[#1e2532] p-4 shadow-[0_4px_20px_-2px_rgba(45,74,62,0.08)] flex flex-col items-center justify-center gap-3 h-[140px] border border-transparent dark:border-slate-800">
              <span className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400 text-center">
                Te queda para gastar
              </span>
              <span className="text-3xl font-bold text-[#2d4a3e] dark:text-white tracking-tight tabular-nums">
                {formatCurrency(trip.remaining, trip.currency)}
              </span>
            </div>

            {/* Today's Budget - data from RPC only; frontend solo muestra (usamos available_today como saldo de hoy) */}
            <div className="col-span-1 rounded-2xl bg-[#2d4a3e] text-white p-4 shadow-[0_0_15px_rgba(45,74,62,0.3)] flex flex-col justify-between h-[140px] relative overflow-hidden group">
              <div className="relative z-10">
                <span className="text-emerald-50 text-xs font-medium uppercase tracking-wider flex items-center gap-1">
                  Presupuesto de hoy
                </span>
                <span className="text-2xl font-bold tracking-tight mt-2 block">
                  {formatCurrency(availableToday, trip.currency)}
                </span>
              </div>
              <div className="relative z-10 mt-auto">
                <div className="flex justify-between text-xs text-emerald-50 mb-1 font-medium">
                  <span>{formatCurrency(spentToday, trip.currency)} gastado</span>
                  <span>{todayPercent}%</span>
                </div>
                <div className="h-1.5 w-full bg-black/20 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-white rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(todayPercent, 100)}%` }}
                  />
                </div>
              </div>
              <div className="absolute -right-4 -top-4 size-20 bg-white/10 rounded-full blur-xl group-hover:bg-white/20 transition-all duration-500" />
              <div className="absolute -left-2 bottom-6 size-12 bg-emerald-400/20 rounded-full blur-lg" />
            </div>
          </div>

          {/* Daily Expenses - trip only (category_id <> 44) */}
          <div className="flex flex-col gap-5">
            <div className="rounded-2xl bg-white dark:bg-[#1e2532] p-6 shadow-[0_4px_20px_-2px_rgba(45,74,62,0.08)] border border-transparent dark:border-slate-800">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-full bg-[#2d4a3e]/10 text-[#2d4a3e] dark:text-emerald-400">
                    <span className="material-symbols-outlined text-[22px]">account_balance_wallet</span>
                  </div>
                  <div className="flex flex-col">
                    <h2 className="text-base font-bold text-[#2d4a3e] dark:text-white leading-tight">
                      Presupuesto del viaje
                    </h2>
                    <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">
                      Gastado vs asignado
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-xl font-bold text-[#2d4a3e] dark:text-white">{tripSpentPercent}%</span>
                </div>
              </div>
              <div className="flex flex-col gap-5">
                <div className="flex flex-col gap-1">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-3xl font-bold text-[#2d4a3e] dark:text-white tracking-tight">
                      {formatCurrency(trip.spent, trip.currency)}
                    </span>
                    <span className="text-sm font-semibold text-slate-400 mb-1">
                      / {formatCurrency(trip.total_budget, trip.currency)}
                    </span>
                  </div>
                  <span className="text-xs font-medium text-slate-400">
                    ≈ {convertToUSD(trip.spent)} gastado
                  </span>
                </div>
                <div className="flex flex-col gap-2">
                  <div className="h-4 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#2d4a3e] rounded-full relative shadow-sm"
                      style={{ width: `${Math.min(tripSpentPercent, 100)}%` }}
                    />
                  </div>
                  <div className="flex justify-between items-center text-xs font-medium text-slate-500 dark:text-slate-400 px-0.5">
                    <span>Comida, transporte, actividades, alojamiento</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Categories: rpc_trip_category_dashboard devuelve exactamente lo que mostrar (sin filtros en front) */}
            <div className="flex flex-col gap-3">
              <div className="px-1">
                <h3 className="text-base font-bold text-[#2d4a3e] dark:text-white">Categorías</h3>
              </div>

              {/* Shopping - from overview.shopping; excluded from trip budget */}
              <div className="rounded-2xl bg-white dark:bg-[#1e2532] p-4 shadow-[0_4px_20px_-2px_rgba(45,74,62,0.08)] border-l-[6px] border-[#c16a4d] flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex size-10 items-center justify-center rounded-full bg-[#c16a4d]/10 text-[#c16a4d] shrink-0">
                    <span className="material-symbols-outlined text-[20px]">shopping_bag</span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-[#2d4a3e] dark:text-white text-sm">Compras</span>
                    </div>
                    <span className="text-xs font-medium text-slate-400">
                      ≈ {convertToUSD(shopping.spent)}
                    </span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-0.5">
                  <span className="font-bold text-[#2d4a3e] dark:text-white text-base">
                    {formatCurrency(shopping.spent, shopping.currency)}
                  </span>
                  <span className="text-xs font-medium text-slate-400">{shoppingPercent}%</span>
                </div>
              </div>

              {/* Lista de categorías tal cual devuelve el RPC */}
              <div className="rounded-2xl bg-white dark:bg-[#1e2532] shadow-[0_4px_20px_-2px_rgba(45,74,62,0.08)] divide-y divide-gray-50 dark:divide-slate-800/50">
                {categories.length === 0 ? (
                  <div className="p-4 text-center text-slate-400 text-sm">Aún no hay categorías</div>
                ) : (
                  categories.map((cat) => {
                    // % relativo al gasto total (trip + shopping) para que las categorías + shopping sumen ~100%
                    const pct =
                      totalSpentAll > 0 ? Math.round((cat.spent / totalSpentAll) * 100) : 0
                    return (
                      <div key={cat.category_id} className="p-4 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="flex size-10 items-center justify-center rounded-full bg-[#2d4a3e]/5 text-[#2d4a3e] dark:text-emerald-400 shrink-0 overflow-hidden">
                            <span className="material-symbols-outlined text-[20px]">
                              {getCategoryMaterialIcon(cat.category_id)}
                            </span>
                          </div>
                          <div className="flex flex-col gap-0.5">
                            <span className="font-semibold text-[#2d4a3e] dark:text-white text-sm">
                              {cat.name}
                            </span>
                            <span className="text-xs font-medium text-slate-400">
                              ≈ {convertToUSD(cat.spent)}
                            </span>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-0.5">
                          <span className="font-bold text-[#2d4a3e] dark:text-white">
                            {formatCurrency(cat.spent, trip.currency)}
                          </span>
                          <span className="text-xs font-medium text-slate-400">{pct}%</span>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </div>
        </main>

        <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto z-40 bg-white/90 dark:bg-[#1e2532]/95 backdrop-blur-lg border-t border-gray-100 dark:border-slate-800 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="flex items-center justify-between px-10 h-16 pb-2 relative">
            <button className="flex flex-col items-center justify-center gap-1 text-[#2d4a3e] w-12">
              <span className="material-symbols-outlined">dashboard</span>
              <span className="text-xs font-semibold">Panel</span>
            </button>
            <div className="absolute left-1/2 -translate-x-1/2 -top-6">
              <button
                onClick={() => router.push('/expenses/new')}
                className="size-16 bg-[#c16a4d] hover:bg-[#a65940] text-white rounded-full shadow-lg shadow-[#c16a4d]/40 flex items-center justify-center transition-all hover:scale-105 active:scale-95 border-[4px] border-white dark:border-[#1e2532]"
              >
                <span className="material-symbols-outlined text-[32px]">add</span>
              </button>
            </div>
            <button
              onClick={() => router.push('/expenses')}
              className="flex flex-col items-center justify-center gap-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors w-12"
            >
              <span className="material-symbols-outlined">receipt_long</span>
              <span className="text-xs font-medium">Gastos</span>
            </button>
          </div>
        </nav>
      </div>
    </div>
  )
}
