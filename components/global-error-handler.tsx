'use client'

import { useEffect } from 'react'
import { setupGlobalErrorHandlers } from '@/lib/error-logger'

/**
 * Componente invisível que registra os handlers globais de erro.
 * Incluir 1x no layout raiz.
 */
export function GlobalErrorHandler() {
  useEffect(() => {
    setupGlobalErrorHandlers()
  }, [])

  return null
}
