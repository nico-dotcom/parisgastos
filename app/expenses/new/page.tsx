import ExpenseForm from '@/components/expenses/expense-form'

export default function NewExpensePage() {
  // Note: Authentication is handled on the client side with localStorage
  // The ExpenseForm component will check for the user session and redirect if needed
  
  return <ExpenseForm />
}
