// IndexedDB wrapper for offline expense storage
const DB_NAME = 'expense-tracker-db'
const DB_VERSION = 1
const EXPENSES_STORE = 'expenses'
const PENDING_STORE = 'pending-sync'

export interface OfflineExpense {
  id: string
  user_id: string
  amount: number
  description: string
  date: string
  currency: string
  category_id?: string
  category?: {
    id: string
    name: string
    color: string
    icon: string
  }
  payment_method?: string
  notes?: string
  is_excluded?: boolean
  source?: 'splitwise' | 'manual' // Source of the expense: 'splitwise' or 'manual'
  synced: boolean
  created_at: string
  updated_at: string
}

export interface PendingAction {
  id: string
  action: 'create' | 'update' | 'delete'
  expense: OfflineExpense
  timestamp: number
}

class OfflineStorage {
  private db: IDBDatabase | null = null

  async init(): Promise<void> {
    if (this.db) return

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        this.db = request.result
        resolve()
      }

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result

        // Create expenses store
        if (!db.objectStoreNames.contains(EXPENSES_STORE)) {
          const expenseStore = db.createObjectStore(EXPENSES_STORE, { keyPath: 'id' })
          expenseStore.createIndex('date', 'date', { unique: false })
          expenseStore.createIndex('synced', 'synced', { unique: false })
          expenseStore.createIndex('user_id', 'user_id', { unique: false })
        }

        // Create pending sync store
        if (!db.objectStoreNames.contains(PENDING_STORE)) {
          const pendingStore = db.createObjectStore(PENDING_STORE, { keyPath: 'id' })
          pendingStore.createIndex('timestamp', 'timestamp', { unique: false })
        }
      }
    })
  }

  async getAllExpenses(): Promise<OfflineExpense[]> {
    await this.init()
    if (!this.db) throw new Error('Database not initialized')

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([EXPENSES_STORE], 'readonly')
      const store = transaction.objectStore(EXPENSES_STORE)
      const request = store.getAll()

      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  async getExpensesByDateRange(startDate: Date, endDate: Date): Promise<OfflineExpense[]> {
    await this.init()
    if (!this.db) throw new Error('Database not initialized')

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([EXPENSES_STORE], 'readonly')
      const store = transaction.objectStore(EXPENSES_STORE)
      const index = store.index('date')
      const range = IDBKeyRange.bound(startDate.toISOString(), endDate.toISOString())
      const request = index.getAll(range)

      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  async saveExpense(expense: OfflineExpense): Promise<void> {
    await this.init()
    if (!this.db) throw new Error('Database not initialized')

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([EXPENSES_STORE], 'readwrite')
      const store = transaction.objectStore(EXPENSES_STORE)
      const request = store.put(expense)

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  async saveMultipleExpenses(expenses: OfflineExpense[]): Promise<void> {
    await this.init()
    if (!this.db) throw new Error('Database not initialized')

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([EXPENSES_STORE], 'readwrite')
      const store = transaction.objectStore(EXPENSES_STORE)

      let completed = 0
      const total = expenses.length

      expenses.forEach((expense) => {
        const request = store.put(expense)
        request.onsuccess = () => {
          completed++
          if (completed === total) resolve()
        }
        request.onerror = () => reject(request.error)
      })

      if (total === 0) resolve()
    })
  }

  async deleteExpense(id: string): Promise<void> {
    await this.init()
    if (!this.db) throw new Error('Database not initialized')

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([EXPENSES_STORE], 'readwrite')
      const store = transaction.objectStore(EXPENSES_STORE)
      const request = store.delete(id)

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  async addPendingAction(action: PendingAction): Promise<void> {
    await this.init()
    if (!this.db) throw new Error('Database not initialized')

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([PENDING_STORE], 'readwrite')
      const store = transaction.objectStore(PENDING_STORE)
      const request = store.put(action)

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  async getPendingActions(): Promise<PendingAction[]> {
    await this.init()
    if (!this.db) throw new Error('Database not initialized')

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([PENDING_STORE], 'readonly')
      const store = transaction.objectStore(PENDING_STORE)
      const request = store.getAll()

      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  async deletePendingAction(id: string): Promise<void> {
    await this.init()
    if (!this.db) throw new Error('Database not initialized')

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([PENDING_STORE], 'readwrite')
      const store = transaction.objectStore(PENDING_STORE)
      const request = store.delete(id)

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  async clearAll(): Promise<void> {
    await this.init()
    if (!this.db) throw new Error('Database not initialized')

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([EXPENSES_STORE, PENDING_STORE], 'readwrite')
      
      const expenseStore = transaction.objectStore(EXPENSES_STORE)
      const pendingStore = transaction.objectStore(PENDING_STORE)
      
      expenseStore.clear()
      pendingStore.clear()

      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
    })
  }
}

export const offlineStorage = new OfflineStorage()
