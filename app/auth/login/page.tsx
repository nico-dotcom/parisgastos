'use client'

import React from "react"

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { getErrorMessage, reportError } from '@/lib/error-handler'
import { Mail } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // Asegurar que se envíen cookies
        body: JSON.stringify({ email }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to login')
      }

      // Store user session in localStorage y sessionStorage para doble persistencia
      const userStr = JSON.stringify(data.user)
      localStorage.setItem('app_user', userStr)
      sessionStorage.setItem('app_user', userStr)

      // Redirigir según usuario: Valen → /dashboard/valen, resto → /dashboard
      const valenUserId = '30d7709b-c04a-4325-adf3-60211e75bc65'
      if (data.user?.id === valenUserId) {
        router.push('/dashboard/valen')
      } else {
        router.push('/dashboard')
      }
    } catch (err: unknown) {
      reportError(err, 'Login')
      setError(getErrorMessage(err, 'No se pudo iniciar sesión.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#f9f8f4] dark:bg-[#1e1614] flex items-center justify-center p-4 font-sans">
      <div className="w-full max-w-[360px] flex flex-col gap-8 transform translate-y-[-5%]">
        {/* Header */}
        <div className="flex flex-col items-center gap-2 px-4 text-center animate-fade-in">
          <h1 className="text-[#2C4C3B] dark:text-[#d1d5db] tracking-tight text-[32px] font-bold leading-tight">
            {"Paris 2026"}
          </h1>
        </div>

        {/* Card Container */}
        <div className="bg-white dark:bg-[#2a2220] rounded-xl shadow-[0_4px_24px_rgba(0,0,0,0.04)] p-6 flex flex-col gap-6 ring-1 ring-black/5 dark:ring-white/10">
          <form onSubmit={handleLogin} className="flex flex-col gap-6">
            {error && (
              <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-200 text-sm">
                {error}
              </div>
            )}

            {/* Email Input Field */}
            <label className="flex flex-col w-full gap-2">
              <span className="text-[#181211] dark:text-[#e2d8d5] text-sm font-bold leading-normal ml-1">
                Email Address
              </span>
              <div className="relative group">
                <input
                  className="flex w-full resize-none overflow-hidden rounded-lg text-[#181211] dark:text-white focus:outline-0 focus:ring-2 focus:ring-[#c16a4e]/20 focus:border-[#c16a4e] border border-[#e2d8d5] dark:border-[#5a4842] bg-[#fbf9f9] dark:bg-[#1e1614] h-14 placeholder:text-[#89685d]/60 p-[15px] pr-12 text-base font-normal leading-normal transition-all duration-200"
                  placeholder="name@example.com"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={loading}
                />
                <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center justify-center pointer-events-none text-[#89685d] dark:text-[#89685d]">
                  <Mail className="w-5 h-5" />
                </div>
              </div>
            </label>

            {/* Primary Action Button */}
            <button
              type="submit"
              disabled={loading}
              className="flex w-full cursor-pointer items-center justify-center overflow-hidden rounded-lg h-12 px-5 bg-[#c16a4e] hover:bg-[#a55b43] active:scale-[0.98] text-[#fbf9f9] text-base font-bold leading-normal tracking-[0.015em] transition-all duration-200 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="truncate">
                {loading ? 'Loading...' : 'Continue'}
              </span>
            </button>
          </form>
        </div>

        {/* Minimalist Footer */}
        <p className="text-[#89685d] dark:text-[#a89c98] text-sm font-medium leading-relaxed text-center px-8">
          {""}
        </p>
      </div>
    </div>
  )
}
