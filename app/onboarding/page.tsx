'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { reportError, showError } from '@/lib/error-handler'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowRight, Check } from 'lucide-react'

const CURRENCIES = [
  { code: 'USD', name: 'US Dollar', symbol: '$' },
  { code: 'EUR', name: 'Euro', symbol: '€' },
  { code: 'GBP', name: 'British Pound', symbol: '£' },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥' },
  { code: 'CAD', name: 'Canadian Dollar', symbol: 'CA$' },
  { code: 'AUD', name: 'Australian Dollar', symbol: 'A$' },
]

const CATEGORIES = [
  { id: 'food', name: 'Food & Dining', emoji: '🍔' },
  { id: 'transport', name: 'Transport', emoji: '🚗' },
  { id: 'shopping', name: 'Shopping', emoji: '🛍️' },
  { id: 'entertainment', name: 'Entertainment', emoji: '🎬' },
  { id: 'health', name: 'Health', emoji: '🏥' },
  { id: 'bills', name: 'Bills & Utilities', emoji: '📄' },
]

export default function OnboardingPage() {
  const router = useRouter()
  const supabase = createClient()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  
  const [currency, setCurrency] = useState('EUR')
  const [selectedCategories, setSelectedCategories] = useState<string[]>(['food', 'transport', 'shopping'])
  const [monthlyBudget, setMonthlyBudget] = useState('')

  const handleComplete = async () => {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) {
        router.push('/auth/login')
        return
      }

      // Update user settings
      const { error: settingsError } = await supabase
        .from('user_settings')
        .upsert({
          user_id: user.id,
          default_currency: currency,
          onboarding_completed: true,
        })

      if (settingsError) throw settingsError

      // Create default categories
      const categoriesToInsert = CATEGORIES
        .filter(cat => selectedCategories.includes(cat.id))
        .map(cat => ({
          user_id: user.id,
          name: cat.name,
          color: getColorForCategory(cat.id),
          icon: cat.emoji,
        }))

      const { error: categoriesError } = await supabase
        .from('categories')
        .insert(categoriesToInsert)

      if (categoriesError) throw categoriesError

      // Create default budget if provided
      if (monthlyBudget && parseFloat(monthlyBudget) > 0) {
        const { error: budgetError } = await supabase
          .from('budgets')
          .insert({
            user_id: user.id,
            name: 'Monthly Budget',
            amount: parseFloat(monthlyBudget),
            currency: currency,
            period: 'monthly',
          })

        if (budgetError) throw budgetError
      }

      router.push('/dashboard')
    } catch (error) {
      reportError(error, 'Onboarding')
      showError(error, { fallback: 'No se pudo completar la configuración. Reintentá en un momento.', context: 'Onboarding' })
    } finally {
      setLoading(false)
    }
  }

  const getColorForCategory = (id: string) => {
    const colors: Record<string, string> = {
      food: '#10b981',
      transport: '#3b82f6',
      shopping: '#f59e0b',
      entertainment: '#ec4899',
      health: '#ef4444',
      bills: '#8b5cf6',
    }
    return colors[id] || '#6b7280'
  }

  const toggleCategory = (id: string) => {
    setSelectedCategories(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <div className="flex items-center justify-between mb-2">
            <div className="flex gap-1">
              {[1, 2, 3].map(i => (
                <div
                  key={i}
                  className={`h-2 w-12 rounded-full transition-colors ${
                    i <= step ? 'bg-blue-600' : 'bg-gray-200'
                  }`}
                />
              ))}
            </div>
            <span className="text-sm text-muted-foreground">Step {step} of 3</span>
          </div>
          <CardTitle className="text-2xl">
            {step === 1 && 'Choose Your Currency'}
            {step === 2 && 'Select Categories'}
            {step === 3 && 'Set Your Budget'}
          </CardTitle>
          <CardDescription>
            {step === 1 && 'Select your preferred currency for tracking expenses'}
            {step === 2 && 'Choose categories that match your spending habits'}
            {step === 3 && 'Set a monthly budget to stay on track (optional)'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {step === 1 && (
            <div className="grid grid-cols-2 gap-3">
              {CURRENCIES.map(curr => (
                <button
                  key={curr.code}
                  onClick={() => setCurrency(curr.code)}
                  className={`p-4 rounded-lg border-2 transition-all text-left ${
                    currency === curr.code
                      ? 'border-blue-600 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold">{curr.code}</div>
                      <div className="text-sm text-muted-foreground">{curr.name}</div>
                    </div>
                    <div className="text-2xl">{curr.symbol}</div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {step === 2 && (
            <div className="grid grid-cols-2 gap-3">
              {CATEGORIES.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => toggleCategory(cat.id)}
                  className={`p-4 rounded-lg border-2 transition-all text-left relative ${
                    selectedCategories.includes(cat.id)
                      ? 'border-blue-600 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {selectedCategories.includes(cat.id) && (
                    <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center">
                      <Check className="w-3 h-3 text-white" />
                    </div>
                  )}
                  <div className="text-3xl mb-2">{cat.emoji}</div>
                  <div className="font-medium">{cat.name}</div>
                </button>
              ))}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="budget">Monthly Budget ({currency})</Label>
                <Input
                  id="budget"
                  type="number"
                  placeholder="0.00"
                  value={monthlyBudget}
                  onChange={(e) => setMonthlyBudget(e.target.value)}
                  min="0"
                  step="0.01"
                />
                <p className="text-sm text-muted-foreground">
                  You can skip this and set it up later in settings
                </p>
              </div>

              <Card className="bg-blue-50 border-blue-200">
                <CardContent className="pt-6">
                  <h4 className="font-semibold mb-2">Your Setup Summary</h4>
                  <ul className="space-y-1 text-sm text-muted-foreground">
                    <li>Currency: {currency}</li>
                    <li>Categories: {selectedCategories.length} selected</li>
                    {monthlyBudget && <li>Monthly Budget: {currency} {monthlyBudget}</li>}
                  </ul>
                </CardContent>
              </Card>
            </div>
          )}

          <div className="flex gap-3 pt-4">
            {step > 1 && (
              <Button
                variant="outline"
                onClick={() => setStep(step - 1)}
                disabled={loading}
                className="flex-1"
              >
                Back
              </Button>
            )}
            {step < 3 ? (
              <Button
                onClick={() => setStep(step + 1)}
                disabled={loading}
                className="flex-1"
              >
                Continue <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
            ) : (
              <Button
                onClick={handleComplete}
                disabled={loading}
                className="flex-1"
              >
                {loading ? 'Setting up...' : 'Complete Setup'}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
