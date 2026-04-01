'use client'

/**
 * Sistema de captura e envio de logs de erro para a tabela error_logs.
 *
 * Uso:
 *   import { logError, setupGlobalErrorHandlers } from '@/lib/error-logger'
 *
 *   // Captura manual em try/catch:
 *   logError({ tela: 'WorkDesk', error: err, metadata: { ticketId: '...' } })
 *
 *   // Captura global (chamar 1x no layout):
 *   setupGlobalErrorHandlers()
 */

// Debounce: evita flood de erros iguais (mesma mensagem em <5s)
const recentErrors = new Map<string, number>()
const DEBOUNCE_MS = 5000

function isDuplicate(key: string): boolean {
  const last = recentErrors.get(key)
  const now = Date.now()
  if (last && now - last < DEBOUNCE_MS) return true
  recentErrors.set(key, now)
  // Limpar entradas antigas
  if (recentErrors.size > 50) {
    const cutoff = now - DEBOUNCE_MS
    for (const [k, v] of recentErrors) {
      if (v < cutoff) recentErrors.delete(k)
    }
  }
  return false
}

// Detectar nome da tela a partir da rota
function detectTela(pathname: string): string {
  if (pathname.startsWith('/workdesk')) return 'WorkDesk'
  if (pathname.startsWith('/dashboard/monitoramento')) return 'Dashboard Monitoramento'
  if (pathname.startsWith('/dashboard/configuracoes')) return 'Dashboard Configurações'
  if (pathname.startsWith('/dashboard/tickets')) return 'Dashboard Tickets'
  if (pathname.startsWith('/dashboard/logs')) return 'Dashboard Logs'
  if (pathname.startsWith('/dashboard/relatorios')) return 'Dashboard Relatórios'
  if (pathname.startsWith('/dashboard')) return 'Dashboard'
  if (pathname.startsWith('/login')) return 'Login'
  return 'Desconhecida'
}

interface LogErrorParams {
  tela?: string
  error: Error | string | unknown
  componente?: string
  metadata?: Record<string, unknown>
}

/**
 * Envia um erro para a API de logs.
 * Fire-and-forget — nunca lança exceção.
 */
export function logError({ tela, error, componente, metadata }: LogErrorParams): void {
  try {
    if (typeof window === 'undefined') return

    const rota = window.location.pathname + window.location.search
    const resolvedTela = tela || detectTela(window.location.pathname)

    let logMessage: string
    if (error instanceof Error) {
      logMessage = `${error.name}: ${error.message}\n\nStack:\n${error.stack || 'N/A'}`
    } else if (typeof error === 'string') {
      logMessage = error
    } else {
      logMessage = JSON.stringify(error, null, 2)
    }

    // Debounce para evitar flood
    const dedupeKey = `${resolvedTela}:${logMessage.slice(0, 100)}`
    if (isDuplicate(dedupeKey)) return

    // Tentar pegar dados do usuário do DOM (data attributes) ou localStorage
    let usuario_id: string | null = null
    let usuario_nome: string | null = null
    try {
      const stored = localStorage.getItem('colaborador_info')
      if (stored) {
        const info = JSON.parse(stored)
        usuario_id = info.id || null
        usuario_nome = info.nome || null
      }
    } catch {
      // Ignora — pode não ter colaborador logado
    }

    const payload = {
      tela: resolvedTela,
      rota,
      log: logMessage,
      componente: componente || null,
      usuario_id,
      usuario_nome,
      navegador: navigator.userAgent,
      metadata: metadata || {},
    }

    // Fire-and-forget
    fetch('/api/logs/error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => {
      // Silencioso — não podemos logar um erro do logger
    })
  } catch {
    // Nunca lança exceção
  }
}

let globalHandlersSetup = false

// Padrões de mensagem a ignorar no console.error para evitar ruído
const CONSOLE_ERROR_IGNORE = [
  'Auth session missing',
  'AuthSessionMissingError',
  'Warning:',           // React dev warnings
  'Download the React', // React devtools
  'Error fetching colaborador:',    // Login flow — transient
  'Error loading transfer data:',   // UI load — retry by user
  'Error saving user:',             // Form validation — not a system error
  'Error saving atendente:',        // Form validation
  'Error saving canal:',            // Form config
  'Error saving tipos atendimento:',// Form config
  'Error saving subsetor:',         // Form config
  'Error checking email:',          // Form validation
  'Error fetching setores:',        // Dashboard load
  'Exception fetching setores:',    // Dashboard load
  'Erro ao buscar métricas:',       // Dashboard metrics
  'Erro ao carregar avisos:',       // Notifications load
  '[EvoPolling]',                   // Evolution polling — transient
  '[Evolution Check]',              // Evolution status check — transient
  'hydration',                      // Next.js hydration mismatch
  'Hydration',                      // Next.js hydration mismatch
]

/**
 * Registra handlers globais para capturar erros não tratados.
 * Também intercepta console.error para enviar ao log de erros.
 * Chamar 1x no layout raiz.
 */
export function setupGlobalErrorHandlers(): void {
  if (typeof window === 'undefined') return
  if (globalHandlersSetup) return
  globalHandlersSetup = true

  // Erros JS não capturados
  window.addEventListener('error', (event) => {
    // Ignorar erros de scripts de terceiros (extensões, analytics, etc.)
    if (event.filename && !event.filename.includes(window.location.origin)) return

    logError({
      error: event.error || `${event.message} at ${event.filename}:${event.lineno}:${event.colno}`,
      componente: 'GlobalErrorHandler',
      metadata: {
        type: 'uncaught_error',
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      },
    })
  })

  // Promises rejeitadas sem catch
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason
    // Ignorar AbortError (fetch cancelado intencionalmente)
    if (reason?.name === 'AbortError') return
    // Ignorar erros de autenticação do Supabase (redirect normal)
    if (typeof reason === 'string' && reason.includes('Auth session missing')) return

    logError({
      error: reason instanceof Error ? reason : String(reason),
      componente: 'UnhandledRejection',
      metadata: {
        type: 'unhandled_rejection',
      },
    })
  })

  // Interceptar console.error para capturar erros explícitos da aplicação
  const originalConsoleError = console.error.bind(console)
  console.error = (...args: unknown[]) => {
    // Sempre chama o console.error original (continua aparecendo no DevTools)
    originalConsoleError(...args)

    try {
      const message = args.map(a => {
        if (a instanceof Error) return `${a.name}: ${a.message}`
        if (typeof a === 'string') return a
        try { return JSON.stringify(a) } catch { return String(a) }
      }).join(' ')

      // Ignorar ruído conhecido
      if (CONSOLE_ERROR_IGNORE.some(pattern => message.includes(pattern))) return

      logError({
        error: message,
        componente: 'console.error',
        metadata: {
          type: 'console_error',
          args: args.map(a => {
            if (a instanceof Error) return { name: a.name, message: a.message, stack: a.stack }
            try { return JSON.parse(JSON.stringify(a)) } catch { return String(a) }
          }),
        },
      })
    } catch {
      // Nunca interfere com o console original
    }
  }
}
