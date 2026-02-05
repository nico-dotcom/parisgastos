'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { offlineStorage, type OfflineExpense, type PendingAction } from '@/lib/offline-storage'

export function useOfflineSync(userId: string) {
  const [isOnline, setIsOnline] = useState(true)
  const [isSyncing, setIsSyncing] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)

  // Monitor online status
  useEffect(() => {
    setIsOnline(navigator.onLine)

    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // Check pending actions - use ref to avoid recreating
  const checkPendingActionsRef = useRef<() => Promise<void>>()
  
  checkPendingActionsRef.current = async () => {
    try {
      const pending = await offlineStorage.getPendingActions()
      setPendingCount(pending.length)
    } catch (error) {
      console.error('[v0] Failed to check pending actions:', error)
    }
  }
  
  const checkPendingActions = useCallback(async () => {
    await checkPendingActionsRef.current?.()
  }, [])

  // Sync pending actions
  const syncPendingActions = useCallback(async () => {
    if (!isOnline || isSyncing) return

    setIsSyncing(true)
    console.log('[v0] Starting sync...')

    try {
      const pending = await offlineStorage.getPendingActions()
      console.log(`[v0] Found ${pending.length} pending actions`)

      // Get supabase client inside the function to avoid dependency issues
      const supabaseClient = createClient()

      for (const action of pending) {
        try {
          switch (action.action) {
            // 'create' actions are NOT handled here - expenses must be created directly via RPC
            // No offline creation allowed - expenses only exist if persisted in DB
            
            case 'update':
              await supabaseClient
                .from('splitwise_expenses')
                .update({
                  total_amount: action.expense.amount,
                  description: action.expense.description,
                  expense_date: action.expense.date,
                  currency_code: action.expense.currency || 'EUR',
                  category_id: action.expense.category_id ? parseInt(action.expense.category_id) : null,
                  is_excluded: action.expense.is_excluded || false,
                })
                .eq('id', action.expense.id)
              break

            case 'delete':
              await supabaseClient.from('splitwise_expenses').delete().eq('id', action.expense.id)
              await offlineStorage.deleteExpense(action.expense.id)
              break
          }

          // Mark as synced
          if (action.action !== 'delete') {
            await offlineStorage.saveExpense({
              ...action.expense,
              synced: true,
            })
          }

          // Remove from pending
          await offlineStorage.deletePendingAction(action.id)
          console.log(`[v0] Synced ${action.action} for expense ${action.expense.id}`)
        } catch (error) {
          console.error(`[v0] Failed to sync action ${action.id}:`, error)
          // Keep in pending queue for retry
        }
      }

      // Update pending count after sync
      const remainingPending = await offlineStorage.getPendingActions()
      setPendingCount(remainingPending.length)
      console.log('[v0] Sync complete')
    } catch (error) {
      console.error('[v0] Sync failed:', error)
    } finally {
      setIsSyncing(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline, isSyncing]) // Removed checkPendingActions and supabase from deps

  // Sync on connection - only when coming back online (not on every render)
  const [wasOffline, setWasOffline] = useState(false)
  
  useEffect(() => {
    if (isOnline && wasOffline && !isSyncing) {
      // Only sync when we come back online from offline state
      const timeoutId = setTimeout(() => {
        syncPendingActions()
      }, 1000)
      setWasOffline(false)
      return () => clearTimeout(timeoutId)
    } else if (!isOnline) {
      setWasOffline(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline, isSyncing]) // Only depend on isOnline and isSyncing, not syncPendingActions

  // Check pending on mount
  useEffect(() => {
    checkPendingActions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Only run once on mount

  // Create expense is REMOVED - expenses must be created directly via Supabase RPC
  // No offline creation allowed - expenses only exist if persisted in DB

  // Update expense (offline-first)
  const updateExpense = useCallback(
    async (id: string, updates: Partial<OfflineExpense>) => {
      const expenses = await offlineStorage.getAllExpenses()
      const existing = expenses.find((e) => e.id === id)

      if (!existing) throw new Error('Expense not found')

      const updatedExpense: OfflineExpense = {
        ...existing,
        ...updates,
        synced: false,
        updated_at: new Date().toISOString(),
      }

      await offlineStorage.saveExpense(updatedExpense)

      const action: PendingAction = {
        id: crypto.randomUUID(),
        action: 'update',
        expense: updatedExpense,
        timestamp: Date.now(),
      }
      await offlineStorage.addPendingAction(action)
      const pending = await offlineStorage.getPendingActions()
      setPendingCount(pending.length)

      if (isOnline) {
        syncPendingActions()
      }

      return updatedExpense
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isOnline] // Only depend on isOnline
  )

  // Delete expense (offline-first)
  const deleteExpense = useCallback(
    async (id: string) => {
      const expenses = await offlineStorage.getAllExpenses()
      const existing = expenses.find((e) => e.id === id)

      if (!existing) throw new Error('Expense not found')

      const action: PendingAction = {
        id: crypto.randomUUID(),
        action: 'delete',
        expense: existing,
        timestamp: Date.now(),
      }
      await offlineStorage.addPendingAction(action)
      const pending = await offlineStorage.getPendingActions()
      setPendingCount(pending.length)

      if (isOnline) {
        syncPendingActions()
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isOnline] // Only depend on isOnline
  )

  return {
    isOnline,
    isSyncing,
    pendingCount,
    syncPendingActions,
    // createExpense removed - expenses must be created directly via Supabase RPC
    updateExpense,
    deleteExpense,
  }
}
