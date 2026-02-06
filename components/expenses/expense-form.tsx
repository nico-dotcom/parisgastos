'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { OfflineExpense } from '@/lib/offline-storage'
import { showError, showValidationError, reportError } from '@/lib/error-handler'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'

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

interface ExpenseFormProps {
  expense?: OfflineExpense
  mode?: 'create' | 'edit'
}

// Gastos manuales siempre se crean en este grupo (splitwise_groups.id).
const MANUAL_EXPENSE_GROUP_ID = 92713244

// 6 categorías fijas para Quick Add (ids de la base de datos).
const QUICK_ADD_CATEGORIES: { id: string; name: string; icon: string }[] = [
  { id: '21', name: 'Comida', icon: 'restaurant' },
  { id: '22', name: 'Alimentos (super)', icon: 'local_grocery_store' },
  { id: '23', name: 'Tragos', icon: 'local_bar' },
  { id: '35', name: 'Transporte', icon: 'subway' },
  { id: '19', name: 'Entradas', icon: 'confirmation_number' },
  { id: '4', name: 'Comida y bebidas (Café)', icon: 'coffee' },
]

const isUrl = (str?: string): boolean => {
  if (!str) return false
  return str.startsWith('http://') || str.startsWith('https://') || str.startsWith('//')
}

// Si el nombre tiene paréntesis, mostrar solo lo que está dentro.
const displayCategoryName = (name: string): string => {
  const match = name.match(/\(([^)]+)\)/)
  return match ? match[1].trim() : name
}

export default function ExpenseForm({ expense, mode = 'create' }: ExpenseFormProps) {
  const router = useRouter()
  const supabase = createClient()
  const [user, setUser] = useState<AppUser | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [defaultCurrency, setDefaultCurrency] = useState('EUR')
  const [loading, setLoading] = useState(false)
  const [formLoading, setFormLoading] = useState(true)

  const getTodayDate = () => {
    const today = new Date()
    const year = today.getFullYear()
    const month = String(today.getMonth() + 1).padStart(2, '0')
    const day = String(today.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  const [formData, setFormData] = useState({
    amount: expense?.amount?.toString() || '',
    description: expense?.description || '',
    date: expense?.date ? expense.date.split('T')[0] : getTodayDate(),
    category_id: expense?.category_id != null ? String(expense.category_id) : QUICK_ADD_CATEGORIES[0].id,
    is_excluded: expense?.is_excluded || false,
  })
  const [datePickerOpen, setDatePickerOpen] = useState(false)

  // Al abrir el formulario para agregar (sin expense), asegurar que la fecha por defecto sea hoy.
  useEffect(() => {
    if (mode === 'create' && !expense) {
      setFormData((prev) => ({ ...prev, date: getTodayDate() }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  // En edición: fijar la categoría cargada (siempre como string para que coincida con las 6 opciones).
  useEffect(() => {
    if (mode === 'edit' && expense?.category_id != null) {
      setFormData((prev) => ({ ...prev, category_id: String(expense.category_id) }))
    }
  }, [mode, expense?.category_id])

  // Usuario: localStorage (app_user) o restauración desde cookie (/api/auth/me).
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

        // Fetch categories from splitwise_categories
        const { data: categoriesData } = await supabase
          .from('splitwise_categories')
          .select('*')
          .order('name')

        // Suggested categories to show first (IDs de la base de datos)
        const suggestedCategoryIds = ['21', '22', '23', '35', '19', '4']
        
        // Sort categories: suggested first, then rest alphabetically
        const sortedCategories = (categoriesData || []).sort((a, b) => {
          const aIsSuggested = suggestedCategoryIds.includes(a.id)
          const bIsSuggested = suggestedCategoryIds.includes(b.id)
          
          if (aIsSuggested && !bIsSuggested) return -1
          if (!aIsSuggested && bIsSuggested) return 1
          if (aIsSuggested && bIsSuggested) {
            // Maintain order within suggested categories
            return suggestedCategoryIds.indexOf(a.id) - suggestedCategoryIds.indexOf(b.id)
          }
          // Alphabetical for non-suggested
          return a.name.localeCompare(b.name)
        })

        setCategories(sortedCategories)

        // Default currency is already set to 'EUR' in state initialization
      } catch (error) {
        reportError(error, 'ExpenseForm loadUser')
        showError(error, { fallback: 'No se pudieron cargar los datos.', context: 'ExpenseForm loadUser' })
      } finally {
        setFormLoading(false)
      }
    }

    loadUserData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router])


  const formatDate = (dateString: string) => {
    // Parse YYYY-MM-DD as local date (evita que medianoche UTC se vea como día anterior)
    const [y, m, d] = dateString.split('-').map(Number)
    const date = new Date(y, m - 1, d)
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    if (date.toDateString() === today.toDateString()) {
      return 'Hoy'
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Ayer'
    } else {
      return date.toLocaleDateString('es-ES', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      })
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return

    setLoading(true)

    try {
      // Convert comma to dot for locales that use comma as decimal separator (iOS keyboards)
      const sanitizedAmount = formData.amount.replace(',', '.')
      const amount = parseFloat(sanitizedAmount)
      if (isNaN(amount) || amount <= 0) {
        showValidationError('Introducí un importe válido.')
        setLoading(false)
        return
      }

      if (!formData.description.trim()) {
        showValidationError('Introducí una descripción.')
        setLoading(false)
        return
      }

      if (mode === 'create') {
        // If shopping expense (is_excluded), force category_id = 44 (Ropa)
        const categoryId = formData.is_excluded ? '44' : formData.category_id
        
        // RPC: 7 params obligatorios. p_trip_id = 92713244 siempre.
        const rpcParams = {
          p_app_user_id: user.id,
          p_trip_id: 92713244 as number,
          p_description: formData.description,
          p_amount: amount,
          p_currency_code: defaultCurrency,
          p_category_id: categoryId ? parseInt(categoryId) : null,
          p_expense_date: new Date(formData.date).toISOString(),
        }
        const { error } = await supabase.rpc('rpc_insert_manual_expense', rpcParams)

        if (error) {
          reportError(error, 'Expense create')
          showError(error, { context: 'Expense create', fallback: 'No se pudo crear el gasto.' })
          setLoading(false)
          return
        }

        // Redirige al timeline, que refetchéa desde rpc_expense_timeline (sin optimistic updates)
        router.push('/expenses')
      } else if (expense) {
        const categoryId = formData.is_excluded ? '44' : formData.category_id
        const { error } = await supabase.rpc('rpc_update_manual_expense', {
          p_app_user_id: user.id,
          p_expense_internal_id: parseInt(expense.id, 10),
          p_description: formData.description,
          p_amount: amount,
          p_currency_code: defaultCurrency,
          p_category_id: categoryId ? parseInt(categoryId) : null,
          p_expense_date: new Date(formData.date).toISOString(),
        })
        if (error) {
          reportError(error, 'Expense update')
          showError(error, { context: 'Expense update', fallback: 'No se pudo actualizar el gasto.' })
          setLoading(false)
          return
        }
        router.push('/expenses')
      }
    } catch (error: any) {
      showError(error, { context: 'Expense save', fallback: 'No se pudo guardar el gasto.' })
      setLoading(false)
    }
  }

  const isTripAllocation = !formData.is_excluded

  if (formLoading || !user) {
    return (
      <div className="min-h-screen bg-[#f9f8f4] dark:bg-[#1a1c1a] flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-[#c16a4d] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-500">Cargando...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-[#f9f8f4] dark:bg-[#1a1c1a] min-h-screen flex flex-col font-display text-slate-800 dark:text-slate-100">
      {/* Header - Quick Add Expense */}
      <div className="flex items-center justify-between px-6 pt-6 pb-3 shrink-0 z-10">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex items-center justify-center size-9 rounded-full bg-white dark:bg-slate-800 text-[#2d4a3e] dark:text-slate-200 shadow-sm hover:bg-slate-50 transition-colors"
        >
          <span className="material-symbols-outlined text-[20px]">close</span>
        </button>
        <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-[#2d4a3e]/80 dark:text-white/80">
          Agregar gasto rápido
        </h2>
        <div className="w-9" />
      </div>

      <div className="flex-1 w-full max-w-md mx-auto px-6 pb-36 overflow-y-auto no-scrollbar">
        <form id="quick-add-form" onSubmit={handleSubmit}>
          {/* Amount */}
          <div className="bg-white dark:bg-slate-800 rounded-3xl p-5 shadow-[0_4px_30px_-4px_rgba(45,74,62,0.08)] mb-3">
            <label className="block text-[10px] font-bold text-[#2d4a3e]/50 dark:text-slate-400 uppercase tracking-widest mb-1.5 ml-1">
              Importe
            </label>
            <div className="flex items-baseline text-[#2d4a3e] dark:text-white">
              <span className="text-2xl font-bold mr-1.5 opacity-30">€</span>
              <input
                className="bg-transparent text-5xl leading-none font-extrabold tracking-tight border-none p-0 w-full focus:ring-0 placeholder-[#2d4a3e]/10 dark:placeholder-white/10"
                inputMode="decimal"
                placeholder="0.00"
                type="text"
                autoComplete="off"
                value={formData.amount}
                onChange={(e) => {
                  // Allow digits, dots, and commas only
                  const raw = e.target.value.replace(/[^0-9.,]/g, '')
                  setFormData({ ...formData, amount: raw })
                }}
                required
                disabled={loading}
              />
            </div>
          </div>

          {/* Description */}
          <div className="bg-white dark:bg-slate-800 rounded-3xl p-5 shadow-[0_4px_30px_-4px_rgba(45,74,62,0.08)] mb-4">
            <label className="block text-[10px] font-bold text-[#2d4a3e]/50 dark:text-slate-400 uppercase tracking-widest mb-1 ml-1">
              Lugar
            </label>
            <input
              className="w-full bg-transparent border-0 text-base font-medium placeholder:text-slate-300 dark:placeholder:text-slate-600 text-slate-800 dark:text-slate-200 focus:ring-0 px-0 py-1.5"
              placeholder="¿Para qué es?"
              type="text"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              required
              disabled={loading}
            />
          </div>

          {/* Allocation: Trip Budget / Shopping */}
          <div className="space-y-3 mb-3">
            <label className="block text-[10px] font-bold text-[#2d4a3e]/50 dark:text-slate-400 uppercase tracking-widest ml-1">
              Asignación
            </label>
            <div className="bg-slate-200/50 dark:bg-slate-700/50 p-1 rounded-2xl flex items-center gap-1">
              <input
                type="radio"
                id="allocation-trip"
                name="allocation"
                value="trip"
                checked={isTripAllocation}
                onChange={() =>
                  setFormData({ ...formData, is_excluded: false, category_id: formData.category_id || QUICK_ADD_CATEGORIES[0].id })
                }
                className="sr-only"
              />
              <label
                htmlFor="allocation-trip"
                className={`flex-1 cursor-pointer py-2.5 rounded-xl text-center text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  isTripAllocation ? 'bg-[#2d4a3e] text-white shadow-md' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">travel_explore</span>
                Presupuesto del viaje
              </label>
              <input
                type="radio"
                id="allocation-personal"
                name="allocation"
                value="personal"
                checked={formData.is_excluded}
                onChange={() => setFormData({ ...formData, is_excluded: true, category_id: '44' })}
                className="sr-only"
              />
              <label
                htmlFor="allocation-personal"
                className={`flex-1 cursor-pointer py-2.5 rounded-xl text-center text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  formData.is_excluded ? 'bg-[#2d4a3e] text-white shadow-md' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">shopping_bag</span>
                Compras
              </label>
            </div>
          </div>

          {/* Categories - only when Trip Budget (6 categorías) */}
          {isTripAllocation && (
            <div className="mb-4">
              <label className="block text-[10px] font-bold text-[#2d4a3e]/50 dark:text-slate-400 uppercase tracking-widest mb-3 ml-1">
                Categoría
              </label>
              <div className="grid grid-cols-3 gap-3 w-full">
                {QUICK_ADD_CATEGORIES.map((cat) => {
                  const isSelected = String(formData.category_id) === String(cat.id)
                  return (
                    <label key={cat.id} className="relative cursor-pointer block">
                      <input
                        type="radio"
                        name="category"
                        value={cat.id}
                        checked={isSelected}
                        onChange={() => setFormData({ ...formData, category_id: cat.id })}
                        className="sr-only"
                      />
                      <div
                        className={`aspect-square flex flex-col items-center justify-center gap-1 p-0.5 rounded-xl border transition-all max-w-[88px] w-full mx-auto ${
                          isSelected
                            ? 'ring-2 ring-[#2d4a3e] bg-[#2d4a3e] text-white shadow-lg scale-[1.02] border-transparent'
                            : 'bg-white dark:bg-slate-800 shadow-sm border-slate-100 dark:border-slate-700'
                        }`}
                      >
                        <div
                          className={`size-12 rounded-lg flex items-center justify-center transition-colors shrink-0 ${
                            isSelected ? 'bg-white/20 text-white' : 'bg-[#2d4a3e]/5 text-[#2d4a3e]'
                          }`}
                        >
                          <span className="material-symbols-outlined text-[28px]">{cat.icon}</span>
                        </div>
                        <span className={`text-[9px] font-bold uppercase tracking-wide text-center leading-tight ${isSelected ? 'text-white' : 'text-slate-500'}`}>
                          {displayCategoryName(cat.name)}
                        </span>
                      </div>
                    </label>
                  )
                })}
              </div>
            </div>
          )}

          {/* Shopping confirmation - only when Shopping */}
          {formData.is_excluded && (
            <div className="mb-4">
              <div className="bg-[#2d4a3e]/5 border border-[#2d4a3e]/10 rounded-2xl px-4 py-3 flex items-center gap-3 text-left">
                <div className="size-10 rounded-full bg-white dark:bg-slate-800 flex items-center justify-center text-[#2d4a3e] shadow-sm shrink-0">
                  <span className="material-symbols-outlined text-[20px]">inventory_2</span>
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-[#2d4a3e] dark:text-white">
                    Se registra como compra y se guarda en el presupuesto de Compras, no en el del viaje.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Date */}
          <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
            <PopoverTrigger asChild>
              <div className="bg-white dark:bg-slate-800 rounded-3xl p-3 pr-4 shadow-[0_4px_30px_-4px_rgba(45,74,62,0.08)] flex items-center justify-between cursor-pointer active:scale-[0.99] transition-transform mb-6">
                <div className="flex items-center gap-3">
                  <div className="size-10 rounded-xl bg-[#2d4a3e]/5 flex items-center justify-center text-[#2d4a3e]">
                    <span className="material-symbols-outlined text-[20px]">calendar_today</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[9px] font-bold text-[#2d4a3e]/40 uppercase tracking-widest">
                      Fecha
                    </span>
                    <span className="text-sm font-bold text-[#2d4a3e] dark:text-slate-200">
                      {formatDate(formData.date)}
                    </span>
                  </div>
                </div>
                <span className="material-symbols-outlined text-slate-300 text-[20px]">expand_more</span>
              </div>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 bg-white dark:bg-slate-800 border-[#2d4a3e]/10 shadow-xl" align="start">
              <Calendar
                mode="single"
                selected={new Date(formData.date + 'T12:00:00')}
                onSelect={(date) => {
                  if (date) {
                    const y = date.getFullYear()
                    const m = String(date.getMonth() + 1).padStart(2, '0')
                    const d = String(date.getDate()).padStart(2, '0')
                    setFormData({ ...formData, date: `${y}-${m}-${d}` })
                    setDatePickerOpen(false)
                  }
                }}
                className="rounded-2xl"
                classNames={{
                  months: 'flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0',
                  month: 'space-y-4',
                  caption: 'flex justify-center pt-1 relative items-center',
                  caption_label: 'text-sm font-medium text-[#2d4a3e] dark:text-slate-200',
                  nav: 'space-x-1 flex items-center',
                  button_previous: 'absolute left-1',
                  button_next: 'absolute right-1',
                  table: 'w-full border-collapse space-y-1',
                  head_row: 'flex',
                  head_cell: 'text-[#2d4a3e]/50 dark:text-slate-400 rounded-md w-9 font-normal text-[0.8rem]',
                  row: 'flex w-full mt-2',
                  cell: 'h-9 w-9 text-center text-sm p-0 relative [&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-outside)]:bg-[#f9f8f4]/50 dark:bg-slate-800/50 [&:has([aria-selected])]:bg-[#2d4a3e]/10 first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20',
                  day: 'h-9 w-9 p-0 font-normal aria-selected:opacity-100 hover:bg-[#2d4a3e]/10 dark:hover:bg-slate-700 rounded-md',
                  day_selected: 'bg-[#2d4a3e] text-white hover:bg-[#2d4a3e] hover:text-white focus:bg-[#2d4a3e] focus:text-white',
                  day_today: 'bg-[#c16a4d]/10 text-[#c16a4d] font-semibold',
                  day_outside: 'text-slate-400 opacity-50',
                  day_disabled: 'text-slate-400 opacity-50',
                  day_range_middle: 'aria-selected:bg-[#2d4a3e]/10 aria-selected:text-[#2d4a3e] dark:aria-selected:text-slate-200',
                  day_hidden: 'invisible',
                }}
              />
            </PopoverContent>
          </Popover>
          <input
            type="date"
            value={formData.date}
            onChange={(e) => setFormData({ ...formData, date: e.target.value })}
            className="sr-only"
            required
            disabled={loading}
          />
        </form>
      </div>

      {/* Fixed Bottom Button - Quick Add style */}
      <div className="fixed bottom-0 left-0 right-0 px-6 pt-4 pb-8 bg-gradient-to-t from-[#f9f8f4] via-[#f9f8f4] to-transparent dark:from-[#1a1c1a] dark:via-[#1a1c1a] z-20">
        <div className="max-w-md mx-auto">
          <button
            type="submit"
            form="quick-add-form"
            disabled={loading}
            className="w-full bg-[#2d4a3e] hover:brightness-110 active:scale-[0.98] text-white h-[56px] rounded-2xl text-base font-bold shadow-xl shadow-[#2d4a3e]/20 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
          >
            <span>{loading ? 'Guardando...' : 'Agregar gasto'}</span>
            <span className="material-symbols-outlined text-[20px]">check</span>
          </button>
        </div>
      </div>
    </div>
  )
}
