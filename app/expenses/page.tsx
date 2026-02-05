'use client'

import ExpensesClient from '@/components/expenses/expenses-client'

function ExpensesPage() {
  // Note: Authentication is handled on the client side with localStorage
  // The ExpensesClient component will check for the user session and redirect if needed
  
  return <ExpensesClient />
}

export default ExpensesPage
