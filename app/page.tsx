'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function HomePage() {
  const router = useRouter()

  useEffect(() => {
    // Verificar si hay sesión guardada (localStorage o sessionStorage)
    const userLocal = localStorage.getItem('app_user')
    const userSession = sessionStorage.getItem('app_user')
    
    if (userLocal || userSession) {
      console.log('[v0] Sesión encontrada, redirigiendo a dashboard')
      router.push('/dashboard')
    } else {
      console.log('[v0] No hay sesión, redirigiendo a login')
      router.push('/auth/login')
    }
  }, [router])

  return (
    <div className="min-h-screen bg-[#f9f8f4] dark:bg-[#111621] flex items-center justify-center">
      <div className="text-center">
        <div className="w-8 h-8 border-4 border-[#c16a4d] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-slate-500">Cargando...</p>
      </div>
    </div>
  )
}
