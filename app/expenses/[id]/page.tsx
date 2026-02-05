'use client'

import { use } from 'react'
import ExpenseDetailClient from '@/components/expenses/expense-detail-client'

export default function ExpenseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  
  // Note: Authentication is handled on the client side with localStorage
  // The ExpenseDetailClient component will check for the user session and redirect if needed
  
  return <ExpenseDetailClient expenseId={id} />
}
