const CACHE_VERSION = 'v1.0.0'
const CACHE_NAME = `paris-gastos-${CACHE_VERSION}`
const STATIC_CACHE = `static-${CACHE_VERSION}`
const DYNAMIC_CACHE = `dynamic-${CACHE_VERSION}`

// Files to cache immediately
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/icon.svg',
  '/pwa-logo.png',
  '/apple-icon.png',
]

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...')
  
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('[SW] Caching static assets')
        return cache.addAll(STATIC_ASSETS)
      })
      .catch((error) => {
        console.error('[SW] Failed to cache static assets:', error)
      })
  )
  
  // Force the waiting service worker to become the active service worker
  self.skipWaiting()
})

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...')
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((cacheName) => {
              // Delete old caches
              return cacheName !== STATIC_CACHE && 
                     cacheName !== DYNAMIC_CACHE &&
                     cacheName !== CACHE_NAME
            })
            .map((cacheName) => {
              console.log('[SW] Deleting old cache:', cacheName)
              return caches.delete(cacheName)
            })
        )
      })
  )
  
  // Take control of all pages immediately
  self.clients.claim()
})

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)
  
  // Skip cross-origin requests
  if (url.origin !== location.origin) {
    return
  }
  
  // Skip API requests (always fetch fresh)
  if (url.pathname.startsWith('/api/')) {
    return
  }
  
  event.respondWith(
    caches.match(request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          // Return cached response and update cache in background
          updateCache(request)
          return cachedResponse
        }
        
        // Not in cache, fetch from network
        return fetch(request)
          .then((response) => {
            // Don't cache non-successful responses
            if (!response || response.status !== 200 || response.type === 'error') {
              return response
            }
            
            // Clone response to cache it
            const responseToCache = response.clone()
            
            caches.open(DYNAMIC_CACHE)
              .then((cache) => {
                cache.put(request, responseToCache)
              })
            
            return response
          })
          .catch((error) => {
            console.error('[SW] Fetch failed:', error)
            // Return offline page if available
            return caches.match('/')
          })
      })
  )
})

// Background sync for offline actions
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync:', event.tag)
  
  if (event.tag === 'sync-expenses') {
    event.waitUntil(syncExpenses())
  }
})

// Push notification handler
self.addEventListener('push', (event) => {
  console.log('[SW] Push notification received')
  
  const data = event.data ? event.data.json() : {}
  const title = data.title || 'Paris Gastos'
  const options = {
    body: data.body || 'New update available',
    icon: '/pwa-logo.png',
    badge: '/icon.svg',
    data: data.url || '/',
    actions: [
      {
        action: 'open',
        title: 'Open'
      },
      {
        action: 'close',
        title: 'Close'
      }
    ]
  }
  
  event.waitUntil(
    self.registration.showNotification(title, options)
  )
})

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked')
  
  event.notification.close()
  
  if (event.action === 'open' || !event.action) {
    const urlToOpen = event.notification.data || '/'
    
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true })
        .then((clientList) => {
          // Check if window is already open
          for (const client of clientList) {
            if (client.url === urlToOpen && 'focus' in client) {
              return client.focus()
            }
          }
          // Open new window
          if (clients.openWindow) {
            return clients.openWindow(urlToOpen)
          }
        })
    )
  }
})

// Message handler for immediate updates
self.addEventListener('message', (event) => {
  console.log('[SW] Message received:', event.data)
  
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

// Helper: Update cache in background
async function updateCache(request) {
  try {
    const response = await fetch(request)
    if (response && response.status === 200) {
      const cache = await caches.open(DYNAMIC_CACHE)
      await cache.put(request, response)
    }
  } catch (error) {
    console.error('[SW] Cache update failed:', error)
  }
}

// Helper: Sync expenses when back online
async function syncExpenses() {
  try {
    // Get pending expenses from IndexedDB or localStorage
    // Send to API
    console.log('[SW] Syncing expenses...')
    
    // This would integrate with your actual sync logic
    const response = await fetch('/api/expenses/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    })
    
    if (response.ok) {
      console.log('[SW] Expenses synced successfully')
    }
  } catch (error) {
    console.error('[SW] Sync failed:', error)
    throw error // Will retry sync later
  }
}
