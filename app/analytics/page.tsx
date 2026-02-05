import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AnalyticsClient from '@/components/analytics/analytics-client'

export default async function AnalyticsPage() {
  const supabase = await createClient()
  
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  // Get app_user_id from app_users table using email
  const { data: appUser } = await supabase
    .from('app_users')
    .select('id')
    .eq('email', user.email)
    .single()

  if (!appUser) {
    redirect('/auth/login')
  }

  // Fetch expenses using RPC
  const { data: expensesData } = await supabase.rpc('rpc_expense_timeline', {
    p_app_user_id: appUser.id,
    p_limit: 1000,
    p_offset: 0,
  })

  // Transform RPC response to match AnalyticsClient expectations
  const expenses = (expensesData || []).map((exp: any) => ({
    id: String(exp.expense_id),
    amount: Number(exp.amount), // This is paid_amount from RPC
    description: exp.description,
    date: exp.date,
    currency: exp.currency,
    category: {
      id: '',
      name: exp.category,
      color: exp.category_color,
      icon: exp.category_icon,
    },
    is_excluded: exp.is_excluded,
  }))

  // Fetch categories (global, not per user)
  const { data: categories } = await supabase
    .from('splitwise_categories')
    .select('*')
    .order('name')

  const { data: budgets } = await supabase
    .from('budgets')
    .select('*')
    .eq('user_id', user.id)

  return (
    <AnalyticsClient
      expenses={expenses || []}
      categories={categories || []}
      budgets={budgets || []}
      defaultCurrency="EUR"
    />
  )
}
