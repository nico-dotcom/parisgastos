'use client'

import { use } from 'react'
import ExpenseDetailClient from '@/components/expenses/expense-detail-client'

export default function SplitwiseExpenseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  
  return <ExpenseDetailClient expenseId={id} expenseType="splitwise" />
}
