'use client'

// Service Worker registration
export async function registerServiceWorker() {
  // Skip in development/preview environments where SW may not be available
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    console.log('[PWA] Service worker not supported')
    return null
  }

  // Check if we're in a preview environment
  const isPreview = window.location.hostname.includes('vusercontent.net') || 
                    window.location.hostname.includes('localhost')
  if (isPreview) {
    console.log('[PWA] Skipping service worker registration in preview environment')
    return null
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
    })

    console.log('[PWA] Service Worker registered:', registration)

    // Handle updates
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing
      if (!newWorker) return

      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          // New service worker available: avisar a la app para mostrar toast in-app (no confirm del navegador)
          window.dispatchEvent(new CustomEvent('pwa-update-available', { detail: { newWorker } }))
        }
      })
    })

    return registration
  } catch (error) {
    console.log('[PWA] Service Worker registration skipped:', error.message)
    return null
  }
}

// Request notification permission
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) {
    console.log('[PWA] Notifications not supported')
    return 'denied'
  }

  if (Notification.permission === 'granted') {
    return 'granted'
  }

  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission()
    return permission
  }

  return Notification.permission
}

// Subscribe to push notifications
export async function subscribeToPushNotifications(
  registration: ServiceWorkerRegistration
): Promise<PushSubscription | null> {
  try {
    // Check if already subscribed
    let subscription = await registration.pushManager.getSubscription()

    if (!subscription) {
      // Create new subscription
      const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      
      if (!vapidPublicKey) {
        console.warn('[PWA] VAPID public key not configured')
        return null
      }

      const convertedVapidKey = urlBase64ToUint8Array(vapidPublicKey)

      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedVapidKey,
      })

      console.log('[PWA] Push subscription created:', subscription)
    }

    return subscription
  } catch (error) {
    console.error('[PWA] Failed to subscribe to push notifications:', error)
    return null
  }
}

// Unsubscribe from push notifications
export async function unsubscribeFromPushNotifications(
  registration: ServiceWorkerRegistration
): Promise<boolean> {
  try {
    const subscription = await registration.pushManager.getSubscription()
    
    if (subscription) {
      await subscription.unsubscribe()
      console.log('[PWA] Unsubscribed from push notifications')
      return true
    }
    
    return false
  } catch (error) {
    console.error('[PWA] Failed to unsubscribe:', error)
    return false
  }
}

// Show local notification
export function showNotification(
  title: string,
  options?: NotificationOptions
): Promise<void> {
  if (!('Notification' in window)) {
    console.warn('[PWA] Notifications not supported')
    return Promise.resolve()
  }

  if (Notification.permission !== 'granted') {
    console.warn('[PWA] Notification permission not granted')
    return Promise.resolve()
  }

  return navigator.serviceWorker.ready.then((registration) => {
    return registration.showNotification(title, {
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-72.png',
      ...options,
    })
  })
}

// Check if app is installed
export function isAppInstalled(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true
}

// Prompt to install app
export function promptInstall(deferredPrompt: any) {
  if (!deferredPrompt) {
    console.warn('[PWA] Install prompt not available')
    return
  }

  deferredPrompt.prompt()
  
  deferredPrompt.userChoice.then((choiceResult: any) => {
    if (choiceResult.outcome === 'accepted') {
      console.log('[PWA] User accepted the install prompt')
    } else {
      console.log('[PWA] User dismissed the install prompt')
    }
  })
}

// Helper function to convert VAPID key
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')

  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }

  return outputArray
}

// Register background sync
export async function registerBackgroundSync(tag: string): Promise<void> {
  if ('serviceWorker' in navigator && 'sync' in ServiceWorkerRegistration.prototype) {
    try {
      const registration = await navigator.serviceWorker.ready
      await (registration as any).sync.register(tag)
      console.log('[PWA] Background sync registered:', tag)
    } catch (error) {
      console.error('[PWA] Background sync registration failed:', error)
    }
  }
}

// Listen for service worker messages
export function listenToServiceWorkerMessages(
  callback: (data: any) => void
): () => void {
  if (!('serviceWorker' in navigator)) {
    return () => {}
  }

  const handler = (event: MessageEvent) => {
    callback(event.data)
  }

  navigator.serviceWorker.addEventListener('message', handler)

  return () => {
    navigator.serviceWorker.removeEventListener('message', handler)
  }
}
