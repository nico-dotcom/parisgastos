'use client'

import dynamic from 'next/dynamic'

const BudgetClient = dynamic(
  () => import('@/components/budget/budget-client'),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-screen bg-[#f9f8f4] dark:bg-[#111621] flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-[#c16a4d] border-t-transparent rounded-full animate-spin" />
      </div>
    ),
  }
)

export default function BudgetPageClient() {
  return <BudgetClient />
}
