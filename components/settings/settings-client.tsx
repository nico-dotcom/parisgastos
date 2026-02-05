'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { ArrowLeft, Plus, Edit2, Trash2, Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getCategoryMaterialIcon } from '@/lib/category-icons'
import { showError, showValidationError, reportError } from '@/lib/error-handler'
import { toast } from 'sonner'
import type { User } from '@supabase/supabase-js'

interface Category {
  id: string
  name: string
  color: string
  icon: string
}

interface Settings {
  default_currency: string
  theme?: string
  notifications_enabled?: boolean
}

interface SettingsClientProps {
  user: User
  categories: Category[]
  settings: Settings | null
}

const AVAILABLE_ICONS = ['🍔', '🚗', '🛍️', '🎬', '🏥', '📄', '✈️', '🏠', '💼', '📱', '☕', '🎮']
const COLORS = [
  '#10b981',
  '#3b82f6',
  '#f59e0b',
  '#ec4899',
  '#ef4444',
  '#8b5cf6',
  '#06b6d4',
  '#84cc16',
]

export default function SettingsClient({
  user,
  categories,
  settings,
}: SettingsClientProps) {
  const router = useRouter()
  const supabase = createClient()
  const [currency, setCurrency] = useState(settings?.default_currency || 'EUR')
  const [savingSettings, setSavingSettings] = useState(false)

  const [newCategory, setNewCategory] = useState({
    name: '',
    icon: '🍔',
    color: '#10b981',
  })
  const [editingCategory, setEditingCategory] = useState<Category | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const handleSaveSettings = async () => {
    setSavingSettings(true)
    try {
      const { error } = await supabase
        .from('user_settings')
        .upsert({
          user_id: user.id,
          default_currency: currency,
        })

      if (error) throw error
      toast.success('Configuración guardada.')
    } catch (error) {
      showError(error, { context: 'Settings', fallback: 'No se pudo guardar la configuración.' })
    } finally {
      setSavingSettings(false)
    }
  }

  const handleAddCategory = async () => {
    if (!newCategory.name.trim()) {
      showValidationError('Escribí el nombre de la categoría.')
      return
    }

    try {
      const { error } = await supabase.from('categories').insert({
        user_id: user.id,
        name: newCategory.name,
        icon: newCategory.icon,
        color: newCategory.color,
      })

      if (error) throw error

      setNewCategory({ name: '', icon: '🍔', color: '#10b981' })
      router.refresh()
    } catch (error) {
      showError(error, { context: 'Settings', fallback: 'No se pudo agregar la categoría.' })
    }
  }

  const handleUpdateCategory = async () => {
    if (!editingCategory) return

    try {
      const { error } = await supabase
        .from('categories')
        .update({
          name: editingCategory.name,
          icon: editingCategory.icon,
          color: editingCategory.color,
        })
        .eq('id', editingCategory.id)

      if (error) throw error

      setEditingCategory(null)
      router.refresh()
    } catch (error) {
      showError(error, { context: 'Settings', fallback: 'No se pudo actualizar la categoría.' })
    }
  }

  const handleDeleteCategory = async (id: string) => {
    setDeletingId(id)
    try {
      const { error } = await supabase.from('categories').delete().eq('id', id)

      if (error) throw error
      router.refresh()
    } catch (error) {
      showError(error, { context: 'Settings', fallback: 'No se pudo eliminar la categoría.' })
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
      <header className="bg-white border-b">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => router.push('/dashboard')}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-xl font-bold">Settings</h1>
              <p className="text-sm text-muted-foreground">Manage your preferences</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6">
        <Tabs defaultValue="general" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="categories">Categories</TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Account</CardTitle>
                <CardDescription>Your account information</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Email</Label>
                  <Input value={user.email} disabled />
                </div>
                <div>
                  <Label>User ID</Label>
                  <Input value={user.id} disabled className="font-mono text-sm" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Preferences</CardTitle>
                <CardDescription>Customize your app experience</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="currency">Default Currency</Label>
                  <Select value={currency} onValueChange={setCurrency}>
                    <SelectTrigger id="currency">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USD">USD ($)</SelectItem>
                      <SelectItem value="EUR">EUR (€)</SelectItem>
                      <SelectItem value="GBP">GBP (£)</SelectItem>
                      <SelectItem value="JPY">JPY (¥)</SelectItem>
                      <SelectItem value="CAD">CAD (CA$)</SelectItem>
                      <SelectItem value="AUD">AUD (A$)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button onClick={handleSaveSettings} disabled={savingSettings}>
                  {savingSettings ? 'Saving...' : 'Save Changes'}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="categories" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Add New Category</CardTitle>
                <CardDescription>Create a custom category for your expenses</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="category-name">Category Name</Label>
                  <Input
                    id="category-name"
                    placeholder="e.g., Groceries"
                    value={newCategory.name}
                    onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Icon</Label>
                  <div className="grid grid-cols-6 gap-2">
                    {AVAILABLE_ICONS.map((icon) => (
                      <button
                        key={icon}
                        type="button"
                        onClick={() => setNewCategory({ ...newCategory, icon })}
                        className={`p-3 text-2xl rounded-lg border-2 transition-all ${
                          newCategory.icon === icon
                            ? 'border-blue-600 bg-blue-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        {icon}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Color</Label>
                  <div className="grid grid-cols-8 gap-2">
                    {COLORS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setNewCategory({ ...newCategory, color })}
                        className={`w-10 h-10 rounded-lg transition-all ${
                          newCategory.color === color ? 'ring-2 ring-offset-2 ring-blue-600' : ''
                        }`}
                        style={{ backgroundColor: color }}
                      >
                        {newCategory.color === color && <Check className="w-5 h-5 text-white mx-auto" />}
                      </button>
                    ))}
                  </div>
                </div>

                <Button onClick={handleAddCategory}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Category
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Your Categories</CardTitle>
                <CardDescription>Manage your expense categories</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {categories.map((category) => (
                    <div
                      key={category.id}
                      className="flex items-center justify-between p-3 rounded-lg border"
                    >
                      {editingCategory?.id === category.id ? (
                        <div className="flex-1 flex items-center gap-2">
                          <Input
                            value={editingCategory.name}
                            onChange={(e) =>
                              setEditingCategory({ ...editingCategory, name: e.target.value })
                            }
                            className="max-w-xs"
                          />
                          <Button size="sm" onClick={handleUpdateCategory}>
                            Save
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setEditingCategory(null)}
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-3">
                            <div
                              className="w-10 h-10 rounded-full flex items-center justify-center overflow-hidden"
                              style={{ backgroundColor: `${category.color}20` }}
                            >
                              <span className="material-symbols-outlined text-[24px]">
                                {getCategoryMaterialIcon(category.id)}
                              </span>
                            </div>
                            <span className="font-medium">{category.name}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setEditingCategory(category)}
                            >
                              <Edit2 className="w-4 h-4" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon">
                                  <Trash2 className="w-4 h-4 text-red-500" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete Category?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This will remove the category from all associated expenses.
                                    This action cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleDeleteCategory(category.id)}
                                    disabled={deletingId === category.id}
                                  >
                                    {deletingId === category.id ? 'Deleting...' : 'Delete'}
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </>
                      )}
                    </div>
                  ))}

                  {categories.length === 0 && (
                    <div className="text-center py-12 text-muted-foreground">
                      No categories yet. Add your first category above.
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}
