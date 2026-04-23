'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { Loader2, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface FloatingSaveBarProps {
  /** Controla a visibilidade da barra. Geralmente conectado ao hasUnsavedX || ... */
  show: boolean
  /** Chamado quando o usuário clica em "Salvar alterações". */
  onSave: () => void | Promise<void>
  /** Indica que uma operação de save está em andamento — desabilita o botão e mostra spinner. */
  saving?: boolean
  /** Lista de seções com alterações não salvas (ex.: ["Informações básicas", "Distribuição"]). Exibida como legenda. */
  dirtyLabels?: string[]
  /** Callback opcional para descartar alterações. Se fornecido, renderiza botão secundário. */
  onDiscard?: () => void
  /** Label customizado para o botão primário. Default: "Salvar alterações". */
  saveLabel?: string
}

/**
 * Barra de save flutuante, fixada na parte inferior da tela. Aparece apenas
 * quando há alterações não salvas (`show=true`).
 *
 * Padrão de UX inspirado em GitHub Settings, Notion, Google Workspace:
 * unifica múltiplos saves dispersos numa página de configurações num único
 * call-to-action persistente e acessível visualmente.
 */
export function FloatingSaveBar({
  show,
  onSave,
  saving = false,
  dirtyLabels,
  onDiscard,
  saveLabel = 'Salvar alterações',
}: FloatingSaveBarProps) {
  const hasLabels = dirtyLabels && dirtyLabels.length > 0

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 28 }}
          className={cn(
            'fixed bottom-4 left-1/2 -translate-x-1/2 z-40',
            'w-[min(720px,calc(100vw-2rem))]',
            'rounded-2xl border border-border/60 bg-card/95 backdrop-blur-xl shadow-xl',
            'flex items-center gap-3 px-4 py-3'
          )}
          role="region"
          aria-label="Alterações não salvas"
        >
          {/* Indicador pulsante */}
          <div className="flex items-center gap-2 shrink-0">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-500/60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
            </span>
            <span className="text-sm font-medium text-foreground">
              Alterações não salvas
            </span>
          </div>

          {/* Lista de seções afetadas (trunca elegantemente no mobile) */}
          {hasLabels && (
            <span className="hidden md:inline text-xs text-muted-foreground truncate min-w-0 flex-1">
              {dirtyLabels!.join(' · ')}
            </span>
          )}
          {!hasLabels && <div className="flex-1" />}

          {/* Ações */}
          <div className="flex items-center gap-2 shrink-0">
            {onDiscard && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onDiscard}
                disabled={saving}
                className="h-9 text-xs"
              >
                Descartar
              </Button>
            )}
            <Button
              size="sm"
              onClick={onSave}
              disabled={saving}
              className="h-9 text-sm gap-1.5 min-w-[140px]"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  {saveLabel}
                </>
              )}
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
