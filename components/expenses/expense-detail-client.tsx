'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { reportError, showError } from '@/lib/error-handler'
import ExpenseDetail from './expense-detail'

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

export default function ExpenseDetailClient({ 
  expenseId, 
  expenseType 
}: { 
  expenseId: string
  expenseType: 'manual' | 'splitwise'
}) {
  const router = useRouter()
  const supabase = createClient()
  const [user, setUser] = useState<AppUser | null>(null)
  const [expense, setExpense] = useState<any>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadData = async () => {
      try {
        // Usuario: localStorage (app_user) o restauración desde cookie (/api/auth/me).
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

        // Fetch expense detail and categories in parallel
        // Use RPC based on expenseType (no queries extra needed)
        const [expenseResult, categoriesResult] = await Promise.all([
          expenseType === 'splitwise'
            ? supabase.rpc('rpc_splitwise_expense_detail', {
                p_expense_id: parseInt(expenseId),
                p_app_user_id: appUser.id,
              })
            : supabase.rpc('rpc_manual_expense_detail', {
                p_expense_id: parseInt(expenseId),
                p_app_user_id: appUser.id,
              }),
          supabase.from('splitwise_categories').select('*').order('name'),
        ])

        if (expenseResult.error) {
          reportError(expenseResult.error, 'ExpenseDetailClient load')
          showError(expenseResult.error, { fallback: 'No se pudo cargar el gasto.', context: 'ExpenseDetailClient load' })
          router.push('/expenses')
          return
        }

        if (!expenseResult.data) {
          reportError(new Error('Expense not found'), 'ExpenseDetailClient')
          showError('No se encontró el gasto.')
          router.push('/expenses')
          return
        }

        setExpense(expenseResult.data)
        setCategories(categoriesResult.data || [])
      } catch (error) {
        reportError(error, 'ExpenseDetailClient load')
        showError(error, { fallback: 'No se pudo cargar el gasto.', context: 'ExpenseDetailClient load' })
        router.push('/expenses')
      } finally {
        setLoading(false)
      }
    }

    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expenseId, expenseType, router])

  if (loading || !user || !expense) {
    return (
      <div className="min-h-screen bg-[#f9f8f4] dark:bg-[#111621] flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-[#c16a4d] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-500">Cargando gasto...</p>
        </div>
      </div>
    )
  }

  return (
    <ExpenseDetail
      expense={expense}
      categories={categories}
      defaultCurrency="EUR"
      appUserId={user.id}
    />
  )
}
