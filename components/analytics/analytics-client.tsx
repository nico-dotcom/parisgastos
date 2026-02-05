'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ArrowLeft, TrendingUp, TrendingDown, PieChart, BarChart3, Calendar } from 'lucide-react'
import { getCategoryMaterialIcon } from '@/lib/category-icons'

interface Category {
  id: string
  name: string
  color: string
  icon: string
}

interface Expense {
  id: string
  amount: number
  description: string
  date: string
  currency: string
  category: Category | null
  is_excluded?: boolean
}

interface Budget {
  id: string
  amount: number
  currency: string
  category_id?: string
}

interface AnalyticsClientProps {
  expenses: Expense[]
  categories: Category[]
  budgets: Budget[]
  defaultCurrency: string
}

export default function AnalyticsClient({
  expenses,
  categories,
  budgets,
  defaultCurrency,
}: AnalyticsClientProps) {
  const router = useRouter()
  const [timeRange, setTimeRange] = useState('month')

  // Filter expenses by time range
  const filteredExpenses = useMemo(() => {
    const now = new Date()
    let startDate = new Date()

    switch (timeRange) {
      case 'week':
        startDate.setDate(now.getDate() - 7)
        break
      case 'month':
        startDate.setMonth(now.getMonth() - 1)
        break
      case 'quarter':
        startDate.setMonth(now.getMonth() - 3)
        break
      case 'year':
        startDate.setFullYear(now.getFullYear() - 1)
        break
      default:
        startDate.setMonth(now.getMonth() - 1)
    }

    return expenses.filter((exp) => {
      const expDate = new Date(exp.date)
      return expDate >= startDate && !exp.is_excluded
    })
  }, [expenses, timeRange])

  // Calculate category spending
  const categorySpending = useMemo(() => {
    const spending: Record<string, { amount: number; count: number; category: Category }> = {}

    filteredExpenses.forEach((exp) => {
      if (exp.category) {
        const key = exp.category.id
        if (!spending[key]) {
          spending[key] = { amount: 0, count: 0, category: exp.category }
        }
        spending[key].amount += exp.amount
        spending[key].count += 1
      }
    })

    return Object.values(spending).sort((a, b) => b.amount - a.amount)
  }, [filteredExpenses])

  // Calculate daily spending trend
  const dailySpending = useMemo(() => {
    const daily: Record<string, number> = {}

    filteredExpenses.forEach((exp) => {
      const date = new Date(exp.date).toISOString().split('T')[0]
      daily[date] = (daily[date] || 0) + exp.amount
    })

    return Object.entries(daily)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-30)
  }, [filteredExpenses])

  // Calculate statistics
  const stats = useMemo(() => {
    const total = filteredExpenses.reduce((sum, exp) => sum + exp.amount, 0)
    const average = filteredExpenses.length > 0 ? total / filteredExpenses.length : 0
    
    // Calculate trend compared to previous period
    const now = new Date()
    let previousStart = new Date()
    let previousEnd = new Date()

    switch (timeRange) {
      case 'week':
        previousStart.setDate(now.getDate() - 14)
        previousEnd.setDate(now.getDate() - 7)
        break
      case 'month':
        previousStart.setMonth(now.getMonth() - 2)
        previousEnd.setMonth(now.getMonth() - 1)
        break
      case 'quarter':
        previousStart.setMonth(now.getMonth() - 6)
        previousEnd.setMonth(now.getMonth() - 3)
        break
      case 'year':
        previousStart.setFullYear(now.getFullYear() - 2)
        previousEnd.setFullYear(now.getFullYear() - 1)
        break
    }

    const previousExpenses = expenses.filter((exp) => {
      const expDate = new Date(exp.date)
      return expDate >= previousStart && expDate < previousEnd && !exp.is_excluded
    })

    const previousTotal = previousExpenses.reduce((sum, exp) => sum + exp.amount, 0)
    const trend = previousTotal > 0 ? ((total - previousTotal) / previousTotal) * 100 : 0

    return {
      total,
      average,
      count: filteredExpenses.length,
      trend,
      isIncrease: trend > 0,
    }
  }, [filteredExpenses, expenses, timeRange])

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: defaultCurrency,
    }).format(amount)
  }

  const maxCategoryAmount = categorySpending[0]?.amount || 1

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
      <header className="bg-white border-b">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => router.push('/dashboard')}>
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div>
                <h1 className="text-xl font-bold">Analytics</h1>
                <p className="text-sm text-muted-foreground">Spending insights and trends</p>
              </div>
            </div>
            <Select value={timeRange} onValueChange={setTimeRange}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="week">Last Week</SelectItem>
                <SelectItem value="month">Last Month</SelectItem>
                <SelectItem value="quarter">Last Quarter</SelectItem>
                <SelectItem value="year">Last Year</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Spending
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{formatCurrency(stats.total)}</div>
              <div className="flex items-center gap-1 mt-1 text-sm">
                {stats.isIncrease ? (
                  <TrendingUp className="w-4 h-4 text-red-500" />
                ) : (
                  <TrendingDown className="w-4 h-4 text-green-500" />
                )}
                <span className={stats.isIncrease ? 'text-red-500' : 'text-green-500'}>
                  {Math.abs(stats.trend).toFixed(1)}%
                </span>
                <span className="text-muted-foreground">vs previous period</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Average Transaction
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{formatCurrency(stats.average)}</div>
              <p className="text-sm text-muted-foreground mt-1">
                {stats.count} transactions
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Top Category
              </CardTitle>
            </CardHeader>
            <CardContent>
              {categorySpending[0] ? (
                <>
                  <div className="flex items-center gap-2 mb-2">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center overflow-hidden"
                      style={{ backgroundColor: `${categorySpending[0].category.color}20` }}
                    >
                      <span className="material-symbols-outlined text-[20px]">
                        {getCategoryMaterialIcon(categorySpending[0].category.id)}
                      </span>
                    </div>
                    <div className="text-2xl font-bold">{categorySpending[0].category.name}</div>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {formatCurrency(categorySpending[0].amount)} • {categorySpending[0].count}{' '}
                    transactions
                  </p>
                </>
              ) : (
                <p className="text-muted-foreground">No data</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Category Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PieChart className="w-5 h-5" />
              Spending by Category
            </CardTitle>
            <CardDescription>
              See where your money goes across different categories
            </CardDescription>
          </CardHeader>
          <CardContent>
            {categorySpending.length > 0 ? (
              <div className="space-y-4">
                {categorySpending.map((item) => {
                  const percentage = (item.amount / stats.total) * 100
                  const barWidth = (item.amount / maxCategoryAmount) * 100

                  return (
                    <div key={item.category.id}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-8 h-8 rounded-full flex items-center justify-center overflow-hidden"
                            style={{ backgroundColor: `${item.category.color}20` }}
                          >
                            <span className="material-symbols-outlined text-[20px]">
                              {getCategoryMaterialIcon(item.category.id)}
                            </span>
                          </div>
                          <span className="font-medium">{item.category.name}</span>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold">{formatCurrency(item.amount)}</p>
                          <p className="text-sm text-muted-foreground">
                            {percentage.toFixed(1)}%
                          </p>
                        </div>
                      </div>
                      <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${barWidth}%`,
                            backgroundColor: item.category.color,
                          }}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {item.count} {item.count === 1 ? 'transaction' : 'transactions'}
                      </p>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="text-center py-12">
                <PieChart className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No expense data for this period</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Daily Spending Trend */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              Spending Trend
            </CardTitle>
            <CardDescription>Daily spending over the selected period</CardDescription>
          </CardHeader>
          <CardContent>
            {dailySpending.length > 0 ? (
              <div className="space-y-2">
                {dailySpending.slice(-10).map(([date, amount]) => {
                  const percentage = (amount / stats.total) * 100

                  return (
                    <div key={date} className="flex items-center gap-3">
                      <div className="w-20 text-sm text-muted-foreground">
                        {new Date(date).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </div>
                      <div className="flex-1 h-8 bg-gray-100 rounded overflow-hidden">
                        <div
                          className="h-full bg-blue-600 transition-all flex items-center justify-end pr-2"
                          style={{ width: `${Math.max(percentage * 3, 5)}%` }}
                        >
                          <span className="text-xs text-white font-medium">
                            {formatCurrency(amount)}
                          </span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="text-center py-12">
                <Calendar className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No spending trend data available</p>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
