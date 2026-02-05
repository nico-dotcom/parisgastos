'use client'

import React from "react"

import { useEffect, useState } from 'react'
import { registerServiceWorker, isAppInstalled } from '@/lib/pwa'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Download, X } from 'lucide-react'

export default function PWAProvider({ children }: { children: React.ReactNode }) {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null)
  const [showInstallBanner, setShowInstallBanner] = useState(false)

  useEffect(() => {
    // Unregister any existing service workers to prevent crashes
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const registration of registrations) {
          registration.unregister()
          console.log('[PWA] Unregistered service worker')
        }
      })
    }

    // Check if already installed
    if (isAppInstalled()) {
      console.log('[PWA] App is installed')
      return
    }

    // Listen for install prompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e)
      
      // Show install banner after a delay
      setTimeout(() => {
        setShowInstallBanner(true)
      }, 10000) // Show after 10 seconds
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)

    // Listen for app installed
    window.addEventListener('appinstalled', () => {
      console.log('[PWA] App installed')
      setShowInstallBanner(false)
      setDeferredPrompt(null)
    })

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    }
  }, [])

  // Actualización del service worker: toast in-app (no confirm del navegador)
  useEffect(() => {
    const handleUpdate = (e: Event) => {
      const newWorker = (e as CustomEvent<{ newWorker: ServiceWorker }>).detail?.newWorker
      if (!newWorker) return
      toast.info('Hay una nueva versión disponible.', {
        description: 'Actualizá para tener los últimos cambios.',
        duration: 30000,
        action: {
          label: 'Actualizar',
          onClick: () => {
            newWorker.postMessage({ type: 'SKIP_WAITING' })
            window.location.reload()
          },
        },
      })
    }
    window.addEventListener('pwa-update-available', handleUpdate)
    return () => window.removeEventListener('pwa-update-available', handleUpdate)
  }, [])

  const handleInstall = () => {
    if (!deferredPrompt) return

    deferredPrompt.prompt()
    deferredPrompt.userChoice.then((choiceResult: any) => {
      if (choiceResult.outcome === 'accepted') {
        console.log('[PWA] User accepted install')
      }
      setDeferredPrompt(null)
      setShowInstallBanner(false)
    })
  }

  return (
    <>
      {children}
      
      {showInstallBanner && deferredPrompt && (
        <div className="fixed bottom-4 left-4 right-4 z-50 md:left-auto md:right-4 md:w-96">
          <Card className="shadow-lg">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
                    <Download className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Install App</CardTitle>
                    <CardDescription className="text-xs">
                      Access faster and work offline
                    </CardDescription>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => setShowInstallBanner(false)}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-0 flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowInstallBanner(false)}
                className="flex-1"
              >
                Not Now
              </Button>
              <Button size="sm" onClick={handleInstall} className="flex-1">
                Install
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  )
}
