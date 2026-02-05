'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useOfflineSync } from '@/hooks/use-offline-sync'
import ExpenseForm from './expense-form'
import { createClient } from '@/lib/supabase/client'
import { getCategoryMaterialIcon } from '@/lib/category-icons'
import { showError, showValidationError, reportError } from '@/lib/error-handler'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

interface Category {
  id: string
  name: string
  color: string
  icon: string
}

// Response shape from rpc_splitwise_expense_detail
interface SplitwiseExpenseDetail {
  expense: {
    id: number
    description: string
    date: string
    currency: string
    total_amount: number
    source: 'splitwise'
    category: {
      id: number
      name: string
      icon: string
    }
  }
  my_share: {
    owed_amount: number
    paid_amount: number
  }
  participants: Array<{
    user_id: number
    name: string
    initials: string
    paid_amount: number
    owed_amount: number
    is_me: boolean
    is_payer: boolean
  }>
}

// Response shape from rpc_manual_expense_detail
interface ManualExpenseDetail {
  expense: {
    id: number
    description: string
    date: string
    currency: string
    amount: number
    source: 'manual'
    category: {
      id: number
      name: string
      icon: string
    }
  }
}

// Legacy interface for manual expenses (deprecated)
interface Expense {
  id: number
  description: string
  date: string
  currency: string
  total_amount: number
  source: string
  is_excluded: boolean
  category: {
    name: string
    icon: string
    color: string
  }
  participants: Array<{
    user: string
    paid: number
    owed: number
  }>
}

interface ExpenseDetailProps {
  expense: Expense | SplitwiseExpenseDetail | ManualExpenseDetail
  categories: Category[]
  defaultCurrency: string
  appUserId?: string
}

// Type guard to check if expense is SplitwiseExpenseDetail
const isSplitwiseDetail = (exp: Expense | SplitwiseExpenseDetail | ManualExpenseDetail): exp is SplitwiseExpenseDetail => {
  if (!exp || typeof exp !== 'object') return false
  const hasExpense = 'expense' in exp
  const hasMyShare = 'my_share' in exp
  const hasParticipants = 'participants' in exp
  return hasExpense && hasMyShare && hasParticipants
}

// Type guard to check if expense is ManualExpenseDetail
const isManualDetail = (exp: Expense | SplitwiseExpenseDetail | ManualExpenseDetail): exp is ManualExpenseDetail => {
  if (!exp || typeof exp !== 'object') return false
  const hasExpense = 'expense' in exp
  const hasAmount = hasExpense && 'amount' in (exp as any).expense
  const hasSource = hasExpense && (exp as any).expense?.source === 'manual'
  return hasExpense && hasAmount && hasSource && !('my_share' in exp)
}

export default function ExpenseDetail({
  expense,
  categories,
  defaultCurrency,
  appUserId,
}: ExpenseDetailProps) {
  const router = useRouter()
  const supabase = createClient()
  const [isEditing, setIsEditing] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  // Usuario logueado: appUserId (del padre) o desde localStorage (app_user). Nunca un id fijo.
  const [userId, setUserId] = useState<string>(appUserId || '')

  useEffect(() => {
    if (!userId) {
      const userStr = localStorage.getItem('app_user')
      if (userStr) {
        const appUser = JSON.parse(userStr)
        setUserId(appUser.id)
      }
    }
  }, [userId])

  const { isOnline } = useOfflineSync(userId || appUserId || '')

  const handleDelete = async () => {
    if (isSplitwiseDetail(expense)) {
      showValidationError('Los gastos de Splitwise no se pueden eliminar desde esta app.')
      return
    }

    setDeleteDialogOpen(false)
    setIsDeleting(true)
    const effectiveUserId = userId || appUserId || ''
    try {
      if (!effectiveUserId) {
        showValidationError('No se pudo identificar al usuario.')
        setIsDeleting(false)
        return
      }

      let expenseInternalId: number
      if (isManualDetail(expense)) {
        expenseInternalId = expense.expense.id
      } else {
        const manualExpense = expense as Expense
        expenseInternalId = manualExpense.id
      }

      const { error } = await supabase.rpc('rpc_delete_manual_expense', {
        p_app_user_id: effectiveUserId,
        p_expense_internal_id: expenseInternalId,
      })

      if (error) {
        throw error
      }

      router.push('/expenses')
    } catch (error) {
      showError(error, { context: 'Expense delete', fallback: 'No se pudo eliminar el gasto.' })
    } finally {
      setIsDeleting(false)
    }
  }

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
    }).format(amount)
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const weekdays = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
    const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
    const weekday = weekdays[date.getDay()]
    const month = months[date.getMonth()]
    const day = date.getDate()
    const year = date.getFullYear()
    return `${weekday}, ${day} ${month} ${year}`
  }

  const convertToUSD = (amount: number, currency: string) => {
    // Simple conversion rate (EUR to USD)
    const rate = currency === 'EUR' ? 1.09 : 1.0
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(amount * rate)
  }

  // Formato fecha detalle: "18 ene 2026"
  const formatDateShort = (dateString: string) => {
    const date = new Date(dateString)
    const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
    const month = months[date.getMonth()]
    const day = date.getDate()
    const year = date.getFullYear()
    return `${day} ${month} ${year}`
  }

  // Get initials from name (e.g., "Nicolas Russo" -> "NR")
  const getInitials = (name: string): string => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  if (isEditing && userId && (isManualDetail(expense) || (!isSplitwiseDetail(expense) && 'source' in expense && expense.source === 'manual'))) {
    // Transform expense to match ExpenseForm expectations (only for manual expenses)
    let expenseForForm
    if (isManualDetail(expense)) {
      const { expense: exp } = expense
      const expCatId = String(exp.category.id)
      const matched = categories.find(c => String(c.id) === expCatId)
      expenseForForm = {
        id: String(exp.id),
        user_id: userId,
        amount: exp.amount,
        description: exp.description,
        date: exp.date,
        currency: exp.currency,
        category_id: matched ? String(matched.id) : expCatId,
        category: {
          id: String(exp.category.id),
          name: exp.category.name,
          color: matched?.color ?? '#5b957d',
          icon: exp.category.icon,
        },
        is_excluded: false,
        synced: true,
        created_at: exp.date,
        updated_at: exp.date,
      }
    } else {
      const manualExpense = expense as Expense
      const catWithId = manualExpense.category as { id?: number; name: string }
      const expCatId = catWithId.id != null ? String(catWithId.id) : undefined
      const matched = expCatId
        ? categories.find(c => String(c.id) === expCatId)
        : categories.find(c => c.name === manualExpense.category.name)
      expenseForForm = {
        id: String(manualExpense.id),
        user_id: userId,
        amount: manualExpense.total_amount,
        description: manualExpense.description,
        date: manualExpense.date,
        currency: manualExpense.currency,
        category_id: matched ? String(matched.id) : expCatId ?? '',
        category: manualExpense.category,
        is_excluded: manualExpense.is_excluded,
        synced: true,
        created_at: manualExpense.date,
        updated_at: manualExpense.date,
      }
    }

    return (
      <ExpenseForm
        expense={expenseForForm}
        mode="edit"
      />
    )
  }

  // Manual expense detail view (using rpc_manual_expense_detail)
  if (isManualDetail(expense)) {
    const { expense: exp } = expense

    return (
      <div className="relative flex h-full min-h-screen w-full flex-col overflow-x-hidden max-w-md mx-auto bg-[#f9f8f4] dark:bg-[#171b19]">
        {/* Header */}
        <header className="flex items-center justify-between px-4 py-4 pt-4 sticky top-0 z-10 bg-[#f9f8f4]/90 dark:bg-[#171b19]/90 backdrop-blur-sm">
          <button
            onClick={() => router.back()}
            className="flex size-10 items-center justify-center rounded-full text-[#2d4a3e] dark:text-[#5b957d] hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          >
            <span className="material-symbols-outlined text-[28px]">chevron_left</span>
          </button>
          <h2 className="text-[#2d4a3e] dark:text-white text-base font-bold tracking-tight">Detalles</h2>
          <button
            onClick={() => setIsEditing(true)}
            className="flex items-center justify-center rounded-full text-[#2d4a3e] dark:text-[#5b957d] font-bold text-[15px] px-2 py-1 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          >
            Editar
          </button>
        </header>

        {/* Main Content */}
        <main className="flex-1 flex flex-col items-center px-6 pt-4 pb-8">
          {/* Amount Section */}
          <div className="flex flex-col items-center justify-center w-full mb-12">
            <h1 className="text-[#2d4a3e] dark:text-[#5b957d] text-[52px] font-extrabold leading-none tracking-tight">
              {formatCurrency(exp.amount, exp.currency)}
            </h1>
            <div className="flex flex-col items-center mt-6 gap-1">
              <p className="text-[#2d4a3e]/80 dark:text-[#5b957d]/90 text-base font-bold">
                {formatDate(exp.date)}
              </p>
              <p className="text-[#8c9e97] text-sm font-medium">
                aprox {convertToUSD(exp.amount, exp.currency)}
              </p>
            </div>
          </div>

          {/* Expense Card */}
          <div className="w-full bg-white dark:bg-[#1f2422] rounded-2xl p-6 shadow-[0_4px_20px_-8px_rgba(0,0,0,0.06)] border border-black/[0.03] dark:border-white/[0.05] mb-8">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#ebefed] dark:bg-[#5b957d]/20 text-[#2d4a3e] dark:text-[#5b957d] overflow-hidden">
                <span className="material-symbols-outlined text-[24px]">
                  {getCategoryMaterialIcon(exp.category?.id)}
                </span>
              </div>
              <div className="flex flex-col min-w-0">
                <h3 className="text-base font-bold text-[#2d4a3e] dark:text-[#5b957d] leading-tight truncate">
                  {exp.description || 'Sin descripción'}
                </h3>
                <div className="flex items-center text-[#8c9e97] text-sm font-medium mt-1 truncate">
                  <span className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[16px]">category</span>
                    {exp.category.name || 'Sin categoría'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Delete Button */}
          <div className="w-full flex flex-col items-center">
            <button
              onClick={() => setDeleteDialogOpen(true)}
              disabled={isDeleting}
              className="w-full py-3.5 rounded-xl border border-[#c16a4d]/30 dark:border-[#c16a4d]/40 text-[#c16a4d] dark:text-[#dba393] font-semibold text-[15px] hover:bg-[#c16a4d]/5 dark:hover:bg-[#c16a4d]/10 active:scale-[0.98] transition-all flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isDeleting ? 'Eliminando...' : 'Eliminar Gasto'}
            </button>
          </div>

          <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
            <AlertDialogContent className="bg-[#f9f8f4] dark:bg-[#171b19] border-[#2d4a3e]/10 dark:border-slate-800 max-w-[calc(100%-2rem)] rounded-2xl shadow-xl">
              <AlertDialogHeader>
                <AlertDialogTitle className="text-[#2d4a3e] dark:text-white font-bold">
                  ¿Eliminar este gasto?
                </AlertDialogTitle>
                <AlertDialogDescription className="text-slate-600 dark:text-slate-400">
                  Esta acción no se puede deshacer.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="gap-2 sm:gap-2">
                <AlertDialogCancel className="rounded-xl border-[#2d4a3e]/20 text-[#2d4a3e] dark:text-slate-200 hover:bg-[#2d4a3e]/5">
                  Cancelar
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={(e) => {
                    e.preventDefault()
                    handleDelete()
                  }}
                  className="rounded-xl bg-[#c16a4d] hover:bg-[#a65940] text-white font-semibold"
                >
                  Eliminar
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </main>
      </div>
    )
  }

  // Splitwise expense detail view
  if (isSplitwiseDetail(expense)) {
    const { expense: exp, my_share, participants } = expense
    const myShareAmount = my_share.owed_amount // ✅ Use ONLY owed_amount as MY SHARE
    const payers = participants.filter((p) => p.is_payer)
    const nonPayers = participants.filter((p) => !p.is_payer && !p.is_me)
    const meParticipant = participants.find((p) => p.is_me)

    return (
      <div className="relative flex h-full min-h-screen w-full flex-col overflow-x-hidden max-w-md mx-auto bg-[#f9f8f4] dark:bg-[#171b19]">
        {/* Header */}
        <header className="flex items-center justify-between px-4 py-4 pt-4 sticky top-0 z-10 bg-[#f9f8f4]/90 dark:bg-[#171b19]/90 backdrop-blur-sm">
          <button
            onClick={() => router.back()}
            className="flex size-10 items-center justify-center rounded-full text-[#2d4a3e] dark:text-[#5b957d] hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          >
            <span className="material-symbols-outlined text-[28px]">chevron_left</span>
          </button>
          <h2 className="text-[#2d4a3e] dark:text-white text-base font-bold tracking-tight">Detalles</h2>
          <div className="flex items-center">
            <span className="inline-flex items-center rounded-full bg-[#5b957d]/10 dark:bg-[#5b957d]/20 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#2d4a3e] dark:text-[#5b957d] ring-1 ring-inset ring-[#2d4a3e]/10 dark:ring-[#5b957d]/20 whitespace-nowrap">
              vía Splitwise
            </span>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 flex flex-col items-center px-6 pt-4 pb-8">
          {/* MY SHARE Section */}
          <div className="flex flex-col items-center justify-center w-full mb-8">
            <span className="text-[#677e75] text-sm font-medium mb-1 tracking-wide uppercase">MI PARTE</span>
            <h1 className="text-[#2d4a3e] dark:text-[#5b957d] text-[42px] font-extrabold leading-tight tracking-tight">
              {formatCurrency(myShareAmount, exp.currency)}
            </h1>
            <p className="text-[#8c9e97] text-sm font-medium mt-1">
              aprox {convertToUSD(myShareAmount, exp.currency)}
            </p>
            <div className="mt-6 flex items-center gap-2 bg-[#ebece8] dark:bg-white/5 px-4 py-2 rounded-full border border-black/5 dark:border-white/5">
              <span className="material-symbols-outlined text-[#677e75] text-[18px]">group</span>
              <p className="text-[#4a5f57] dark:text-[#a0b3aa] text-sm font-semibold">
                Total del grupo: {formatCurrency(exp.total_amount, exp.currency)}
              </p>
            </div>
          </div>

          {/* Expense Card */}
          <div className="w-full bg-white dark:bg-[#1f2422] rounded-2xl p-5 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.05)] border border-black/[0.03] dark:border-white/[0.05] mb-8">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#ebefed] dark:bg-[#5b957d]/20 text-[#2d4a3e] dark:text-[#5b957d] overflow-hidden">
                <span className="material-symbols-outlined text-[24px]">
                  {getCategoryMaterialIcon(exp.category?.id)}
                </span>
              </div>
              <div className="flex flex-col min-w-0">
                <h3 className="text-base font-bold text-[#2d4a3e] dark:text-[#5b957d] leading-tight truncate">
                  {exp.description}
                </h3>
                <div className="flex items-center text-[#8c9e97] text-xs font-medium mt-1 truncate">
                  <span>{formatDateShort(exp.date)}</span>
                  <span className="mx-1.5 opacity-50">•</span>
                  <span>{exp.category.name}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Settlement Breakdown */}
          <div className="w-full flex flex-col gap-4">
            <h4 className="text-[#677e75] text-xs font-bold uppercase tracking-wider pl-1 mb-1">
              Resumen de Pagos
            </h4>

            {/* Payers */}
            {payers.map((payer) => (
              <div key={payer.user_id} className="flex items-center justify-between py-1">
                <div className="flex items-center gap-3">
                  <div className="relative h-10 w-10 shrink-0">
                    <div className="h-full w-full rounded-full bg-gradient-to-br from-orange-100 to-orange-200 border-2 border-white dark:border-[#2d3330] flex items-center justify-center text-orange-700 font-bold text-xs shadow-sm">
                      {payer.initials || getInitials(payer.name)}
                    </div>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[#121615] dark:text-white text-sm font-semibold">
                      {payer.name} pagó {formatCurrency(payer.paid_amount, exp.currency)}
                    </span>
                    <span className="text-[#677e75] text-xs">Pagador</span>
                  </div>
                </div>
              </div>
            ))}

            {/* Divider */}
            {payers.length > 0 && (meParticipant || nonPayers.length > 0) && (
              <div className="relative flex py-2 items-center">
                <div className="flex-grow border-t-2 border-dashed border-gray-200 dark:border-white/10"></div>
              </div>
            )}

            {/* Me (if not a payer) */}
            {meParticipant && !meParticipant.is_payer && (
              <div className="flex items-center justify-between py-1">
                <div className="flex items-center gap-3">
                  <div className="relative h-10 w-10 shrink-0">
                    <div className="h-full w-full rounded-full bg-[#2d4a3e] dark:bg-[#5b957d] text-white border-2 border-white dark:border-[#2d3330] flex items-center justify-center font-bold text-xs shadow-sm">
                      TÚ
                    </div>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[#121615] dark:text-white text-sm font-semibold">
                      Tu parte: {formatCurrency(meParticipant.owed_amount, exp.currency)}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Other participants (non-payers, not me) */}
            {nonPayers.map((participant) => (
              <div key={participant.user_id} className="flex items-center justify-between py-1">
                <div className="flex items-center gap-3">
                  <div className="relative h-10 w-10 shrink-0">
                    <div className="h-full w-full rounded-full bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-gray-300 border-2 border-white dark:border-[#2d3330] flex items-center justify-center font-bold text-xs shadow-sm">
                      {participant.initials || getInitials(participant.name)}
                    </div>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[#121615] dark:text-white text-sm font-semibold">
                      Parte de {participant.name}: {formatCurrency(participant.owed_amount, exp.currency)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </main>
      </div>
    )
  }

  reportError(expense, 'ExpenseDetail unknown format')
  return (
    <div className="min-h-screen bg-[#f9f8f4] dark:bg-[#111621] flex items-center justify-center">
      <div className="text-center">
        <p className="text-slate-500">No se pueden mostrar los detalles del gasto</p>
        <button
          onClick={() => router.back()}
          className="mt-4 px-4 py-2 bg-[#2d4a3e] text-white rounded-lg"
        >
          Volver
        </button>
      </div>
    </div>
  )
}
