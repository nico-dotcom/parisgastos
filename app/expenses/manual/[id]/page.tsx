'use client'

import { use } from 'react'
import ExpenseDetailClient from '@/components/expenses/expense-detail-client'

export default function ManualExpenseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  
  return <ExpenseDetailClient expenseId={id} expenseType="manual" />
}
