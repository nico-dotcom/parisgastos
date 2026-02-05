'use client'

import { toast } from 'sonner'

/**
 * Estrategia unificada de errores para PWA: el usuario no ve la consola.
 * - Mensajes cortos y claros en español.
 * - Siempre log completo en consola para depuración.
 * - Un solo canal de feedback: toast (no alert).
 */

const FALLBACK_MESSAGE = 'Algo falló. Reintentá en un momento.'

/**
 * Convierte cualquier error a un mensaje corto y entendible para el usuario.
 * No incluir detalles técnicos (códigos, stack).
 */
export function getErrorMessage(error: unknown, fallback: string = FALLBACK_MESSAGE): string {
  if (error == null) return fallback
  if (typeof error === 'string') return error
  if (error instanceof Error) {
    const msg = error.message?.trim()
    if (msg) {
      // Mensajes de API conocidos → traducir o simplificar
      if (msg.includes('Email no registrado') || msg.toLowerCase().includes('email')) return 'Email no registrado.'
      if (msg.includes('Network') || msg.includes('fetch') || msg.includes('Failed to fetch')) return 'Sin conexión. Revisá tu internet.'
      if (msg.includes('500') || msg.includes('Internal server')) return 'Error del servidor. Reintentá en un momento.'
      if (msg.includes('401') || msg.includes('Unauthorized')) return 'Sesión inválida. Volvé a iniciar sesión.'
      if (msg.length > 80) return fallback // Mensaje muy largo → genérico
      return msg
    }
  }
  if (typeof (error as { error?: string })?.error === 'string') {
    return (error as { error: string }).error
  }
  if (typeof (error as { message?: string })?.message === 'string') {
    return (error as { message: string }).message
  }
  return fallback
}

/**
 * Registra el error completo en consola (para depuración). Usar siempre antes de mostrar algo al usuario.
 */
export function reportError(error: unknown, context?: string): void {
  const prefix = context ? `[${context}]` : '[Error]'
  if (error instanceof Error) {
    console.error(prefix, error.message, error)
  } else {
    console.error(prefix, error)
  }
}

/**
 * Muestra el error al usuario por toast y registra el error completo en consola.
 * Usar en toda la app en lugar de alert() para errores.
 */
export function showError(error: unknown, options?: { fallback?: string; context?: string; description?: string }): void {
  const message = getErrorMessage(error, options?.fallback ?? FALLBACK_MESSAGE)
  if (options?.context) reportError(error, options.context)
  else reportError(error)
  toast.error(message, {
    description: options?.description ?? 'Reintentá en un momento.',
    duration: 5000,
  })
}

/**
 * Para validaciones de formulario: solo mensaje corto, sin descripción extra.
 */
export function showValidationError(message: string): void {
  toast.error(message, { duration: 4000 })
}
