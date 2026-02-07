'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getCategoryMaterialIcon } from '@/lib/category-icons'
import { reportError, showError } from '@/lib/error-handler'

// Expense interface - matches RPC response structure
interface Expense {
  id: string // expense_id from RPC (internal_id from DB)
  user_id: string
  amount: number // amount from RPC (NOT paid_amount)
  description: string
  date: string
  currency: string
  category_id?: string
  category?: {
    id: string
    name: string
    color: string
    icon: string
  }
  is_excluded?: boolean
  source: 'manual' | 'splitwise' // Exact value from DB - NO defaults
  synced: boolean
  created_at: string
  updated_at: string
}

interface Category {
  id: string
  name: string
  color: string
  icon: string
}

interface AppUser {
  id: string
  email: string
  display_name: string
  created_at: string
}

export default function ExpensesClient() {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()
  const [user, setUser] = useState<AppUser | null>(null)
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [defaultCurrency, setDefaultCurrency] = useState('EUR')
  const [expenseType, setExpenseType] = useState<'trip' | 'shopping'>('trip')
  const [loading, setLoading] = useState(true)

  const mapTimelineExpenses = (data: any[], appUserId: string): Expense[] => {
    const timelineExpenses = data as Array<{
      expense_id: number
      description: string
      date: string
      amount: number
      currency: string
      category: string
      category_id?: number
      category_icon: string
      category_color: string
      source: string
      is_excluded: boolean
    }>

    // De-duplicate by expense_id in case the RPC returns
    // multiple rows per expense (e.g. per participant).
    const uniqueById = new Map<number, (typeof timelineExpenses)[number]>()
    for (const exp of timelineExpenses) {
      if (!uniqueById.has(exp.expense_id)) {
        uniqueById.set(exp.expense_id, exp)
      }
    }

    const uniqueExpenses = Array.from(uniqueById.values())
    return uniqueExpenses.map((exp) => ({
      id: String(exp.expense_id),
      user_id: appUserId,
      amount: Number(exp.amount),
      description: exp.description || '',
      date: exp.date || new Date().toISOString(),
      currency: exp.currency || 'EUR',
      category_id: exp.category_id != null ? String(exp.category_id) : undefined,
      category: {
        id: exp.category_id != null ? String(exp.category_id) : '',
        name: exp.category,
        color: exp.category_color,
        icon: exp.category_icon,
      },
      is_excluded: exp.is_excluded || false,
      source: exp.source as 'manual' | 'splitwise',
      synced: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }))
  }

  // Load user and data. Usuario: localStorage (app_user) o restauración desde cookie (/api/auth/me).
  useEffect(() => {
    const loadUserData = async () => {
      try {
        let appUser: AppUser | null = null
        const userStr = localStorage.getItem('app_user')
        if (userStr) {
          appUser = JSON.parse(userStr)
        } else {
          const res = await fetch('/api/auth/me', { credentials: 'include' })
          if (res.ok) {
            const data = await res.json()
            appUser = data.user
            localStorage.setItem('app_user', JSON.stringify(appUser))
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

        // RPC con p_app_user_id = id del usuario logueado
        // Fetch categories and initial expenses (trip mode) using RPC
        const [categoriesResult, expensesResult] = await Promise.all([
          supabase
            .from('splitwise_categories')
            .select('*')
            .order('name'),
          supabase.rpc('rpc_expense_timeline', {
            p_app_user_id: appUser.id,
            p_mode: 'trip',
            p_limit: 1000, // Get all trip expenses
            p_offset: 0,
          }),
        ])

        setCategories(categoriesResult.data || [])

        // Default currency is already set to 'EUR' in state initialization

        // Load expenses from RPC - DB is the ONLY source of truth (trip mode)
        if (expensesResult.data && Array.isArray(expensesResult.data)) {
          const expenses = mapTimelineExpenses(expensesResult.data, appUser.id)

          // Set expenses directly from RPC - NO IndexedDB, NO offline storage
          setExpenses(expenses.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()))
        }
      } catch (error) {
        reportError(error, 'ExpensesClient loadUser')
        showError(error, { fallback: 'No se pudieron cargar los gastos.', context: 'ExpensesClient loadUser' })
      } finally {
        setLoading(false)
      }
    }

    loadUserData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router])

  // Refetch expenses when navigating back to this page (e.g., after creating expense)
  useEffect(() => {
    if (pathname === '/expenses' && user && !loading) {
      const refetchExpenses = async () => {
        try {
          const { data } = await supabase.rpc('rpc_expense_timeline', {
            p_app_user_id: user.id,
            p_mode: expenseType,
            p_limit: 1000,
            p_offset: 0,
          })

          if (data && Array.isArray(data)) {
            const expenses = mapTimelineExpenses(data, user.id)
            setExpenses(expenses.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()))
          }
        } catch (error) {
          reportError(error, 'ExpensesClient refetch')
          showError(error, { fallback: 'No se pudieron actualizar los gastos.', context: 'ExpensesClient refetch' })
        }
      }

      refetchExpenses()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, user, loading])

  // Refetch expenses when component mounts or user changes
  // This ensures we always have the latest data from DB
  useEffect(() => {
    if (!loading && user) {
      const refetchExpenses = async () => {
        try {
          // Fetch expenses directly from RPC - DB is the ONLY source of truth
          const { data } = await supabase.rpc('rpc_expense_timeline', {
            p_app_user_id: user.id,
            p_mode: expenseType,
            p_limit: 1000,
            p_offset: 0,
          })

          if (data && Array.isArray(data)) {
            const expenses = mapTimelineExpenses(data, user.id)

            // Set expenses directly from RPC - NO IndexedDB, NO offline storage
            setExpenses(expenses.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()))
          }
        } catch (error) {
          reportError(error, 'ExpensesClient refetch')
          showError(error, { fallback: 'No se pudieron actualizar los gastos.', context: 'ExpensesClient refetch' })
        }
      }

      refetchExpenses()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  // Filter expenses (data already comes filtered by mode from RPC)
  const filteredExpenses = useMemo(() => {
    return expenses
  }, [expenses])

  // Formato fecha completa: "Martes 4 de feb" o "Hoy, martes 4 de feb"
  const weekdays = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
  const monthsShort = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

  const formatDateKey = (date: Date, today: Date, yesterday: Date): string => {
    if (date.toDateString() === today.toDateString()) return 'Hoy'
    if (date.toDateString() === yesterday.toDateString()) return 'Ayer'
    const weekday = weekdays[date.getDay()]
    const day = date.getDate()
    const month = monthsShort[date.getMonth()]
    return `${weekday} ${day} de ${month}`
  }

  // Group expenses by date
  const groupedExpenses = useMemo(() => {
    const groups: Record<string, { expenses: Expense[]; total: number }> = {}
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    filteredExpenses.forEach((expense) => {
      const date = new Date(expense.date)
      const dateKey = formatDateKey(date, today, yesterday)

      if (!groups[dateKey]) {
        groups[dateKey] = { expenses: [], total: 0 }
      }
      groups[dateKey].expenses.push(expense)
      groups[dateKey].total += expense.amount
    })

    // Sort expenses within each group by time (newest first)
    Object.keys(groups).forEach((key) => {
      groups[key].expenses.sort((a, b) => {
        return new Date(b.date).getTime() - new Date(a.date).getTime()
      })
    })

    // Sort groups by date (newest first), using first expense date in each group
    const sortedGroups: Record<string, { expenses: Expense[]; total: number }> = {}
    const sortedKeys = Object.keys(groups).sort((a, b) => {
      const timeA = new Date(groups[a].expenses[0]?.date ?? 0).getTime()
      const timeB = new Date(groups[b].expenses[0]?.date ?? 0).getTime()
      return timeB - timeA
    })

    sortedKeys.forEach((key) => {
      sortedGroups[key] = groups[key]
    })

    return sortedGroups
  }, [filteredExpenses])

  const formatCurrency = (amount: number, currency: string = defaultCurrency) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
    }).format(amount)
  }

  const convertToUSD = (amount: number) => {
    const rate = 1.09 // EUR to USD rate
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(amount * rate)
  }

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-[#f9f8f4] dark:bg-[#111621] flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-[#c16a4d] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-500">Cargando gastos...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative flex min-h-screen w-full flex-col overflow-x-hidden pb-24 bg-[#f9f8f4]">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-[#f9f8f4]/95 backdrop-blur-[20px] transition-colors duration-200">
        <div className="flex items-center px-4 pt-4 pb-2">
          <h2 className="text-xl font-bold leading-tight tracking-tight text-[#2d4a3e]">
            Cronología
          </h2>
        </div>
        <div className="px-4 pb-3 w-full mt-4">
          <div className="flex w-full p-1 bg-white border border-[#2d4a3e]/10 rounded-xl shadow-sm">
            <button
              onClick={() => {
                setExpenseType('trip')
                if (user) {
                  supabase
                    .rpc('rpc_expense_timeline', {
                      p_app_user_id: user.id,
                      p_mode: 'trip',
                      p_limit: 1000,
                      p_offset: 0,
                    })
                    .then(({ data }) => {
                      if (data && Array.isArray(data)) {
                        const expenses = mapTimelineExpenses(data, user.id)
                        setExpenses(
                          expenses.sort(
                            (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
                          )
                        )
                      }
                    })
                    .catch((error) => {
                      reportError(error, 'ExpensesClient loadTrip')
                      showError(error, { fallback: 'No se pudieron cargar los gastos del viaje.', context: 'ExpensesClient loadTrip' })
                    })
                }
              }}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all active:scale-[0.98] ${
                expenseType === 'trip'
                  ? 'bg-[#2d4a3e] text-white font-semibold shadow-sm'
                  : 'text-[#2d4a3e]/60 hover:text-[#2d4a3e] hover:bg-[#2d4a3e]/5'
              }`}
            >
              Gastos del viaje
            </button>
            <button
              onClick={() => {
                setExpenseType('shopping')
                if (user) {
                  supabase
                    .rpc('rpc_expense_timeline', {
                      p_app_user_id: user.id,
                      p_mode: 'shopping',
                      p_limit: 1000,
                      p_offset: 0,
                    })
                    .then(({ data }) => {
                      if (data && Array.isArray(data)) {
                        const expenses = mapTimelineExpenses(data, user.id)
                        setExpenses(
                          expenses.sort(
                            (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
                          )
                        )
                      }
                    })
                    .catch((error) => {
                      reportError(error, 'ExpensesClient loadShopping')
                      showError(error, { fallback: 'No se pudieron cargar las compras.', context: 'ExpensesClient loadShopping' })
                    })
                }
              }}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all active:scale-[0.98] ${
                expenseType === 'shopping'
                  ? 'bg-[#2d4a3e] text-white font-semibold shadow-sm'
                  : 'text-[#2d4a3e]/60 hover:text-[#2d4a3e] hover:bg-[#2d4a3e]/5'
              }`}
            >
              Compras
            </button>
          </div>
        </div>
      </div>

      {/* Expenses List */}
      <div className="flex flex-col w-full px-4 pt-4">
        {loading ? (
          <div className="text-center py-12">
            <div className="w-8 h-8 border-4 border-[#c16a4d] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-[#2d4a3e]/60">Cargando gastos...</p>
          </div>
        ) : Object.keys(groupedExpenses).length === 0 ? (
          <div className="text-center py-12">
            <span className="material-symbols-outlined text-[48px] text-[#2d4a3e]/40 mb-4 block">
              receipt_long
            </span>
            <h3 className="text-base font-semibold mb-2 text-[#2d4a3e]">No hay gastos</h3>
            <p className="text-xs text-[#2d4a3e]/60 mb-4">
              Empieza añadiendo tu primer gasto
            </p>
            <button
              onClick={() => router.push('/expenses/new')}
              className="px-4 py-2 bg-[#c16a4d] text-white rounded-lg font-medium hover:bg-[#a65940] transition-colors"
            >
              Añadir gasto
            </button>
          </div>
        ) : (
          Object.entries(groupedExpenses).map(([dateKey, { expenses: dayExpenses, total }]) => (
            <div key={dateKey} className="mb-5">
              <div className="sticky top-[112px] z-10 bg-[#f9f8f4] py-3 px-3 transition-colors duration-200 flex items-baseline justify-between">
                <h3 className="text-[#2d4a3e] text-base font-bold leading-tight">{dateKey}</h3>
                <span className="text-[#2d4a3e]/60 text-xs font-semibold tracking-tight">
                  {formatCurrency(total)}
                </span>
              </div>
              <div className="flex flex-col gap-4">
                {dayExpenses.map((expense, index) => {
                  const isShoppingExpense = expense.is_excluded || expense.category?.id === '44'
                  const categoryColor = isShoppingExpense ? '#c16a4d' : (expense.category?.color || '#3e6656')
                  const categoryIcon = isShoppingExpense ? 'shopping_bag' : getCategoryMaterialIcon(expense.category?.id)
                  // Use source directly from DB - NO defaults, NO inference
                  const isSplitwise = expense.source === 'splitwise'
                  const sourceLabel = expense.source === 'splitwise' ? 'Splitwise' : 'Manual'

                  return (
                    <div
                      key={`${expenseType}-${expense.id}-${index}`}
                      onClick={() => router.push(`/expenses/${expense.source}/${expense.id}`)}
                      className="group flex items-center justify-between p-3 rounded-2xl bg-white dark:bg-slate-800 shadow-[0_4px_20px_-6px_rgba(45,74,62,0.15)] dark:shadow-black/20 border border-slate-200/90 dark:border-slate-700 hover:border-[#2d4a3e]/25 dark:hover:border-slate-600 transition-all active:scale-[0.99] cursor-pointer"
                    >
                      <div className="flex items-center gap-4">
                        <div
                          className="flex items-center justify-center rounded-xl shrink-0 size-12 overflow-hidden"
                          style={{
                            backgroundColor: `${categoryColor}1A`,
                            color: categoryColor,
                          }}
                        >
                          <span className="material-symbols-outlined text-[28px]">{categoryIcon}</span>
                        </div>
                        <div className="flex flex-col justify-center">
                          <p className="text-[#2d4a3e] text-sm font-semibold leading-normal line-clamp-1">
                            {expense.description || 'Sin descripción'}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-0.5">
                        <p className="text-[#2d4a3e] text-sm font-bold leading-normal">
                          {formatCurrency(expense.amount, expense.currency)}
                        </p>
                        <p className="text-[#2d4a3e]/50 text-xs font-medium leading-tight">
                          ~{convertToUSD(expense.amount)}
                        </p>
                        <div className="mt-1">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${
                              isSplitwise
                                ? 'bg-[#c16a4d]/10 text-[#c16a4d] ring-[#c16a4d]/20'
                                : 'bg-[#2d4a3e]/5 text-[#2d4a3e]/70 ring-[#2d4a3e]/10'
                            }`}
                          >
                            {sourceLabel}
                          </span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))
        )}
        <div className="h-28"></div>
      </div>

      {/* Bottom Navigation - misma que dashboard general */}
      <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto z-40 bg-white/90 dark:bg-[#1e2532]/95 backdrop-blur-lg border-t border-gray-100 dark:border-slate-800 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="flex items-center justify-between px-10 h-16 pb-2 relative">
          <button
            onClick={() => router.push('/dashboard')}
            className="flex flex-col items-center justify-center gap-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors w-12"
          >
            <span className="material-symbols-outlined">dashboard</span>
            <span className="text-xs font-medium">Panel</span>
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
            onClick={() => pathname !== '/expenses' && router.push('/expenses')}
            className="flex flex-col items-center justify-center gap-1 text-[#2d4a3e] w-12"
          >
            <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>receipt_long</span>
            <span className="text-xs font-semibold">Gastos</span>
          </button>
        </div>
      </nav>
    </div>
  )
}
