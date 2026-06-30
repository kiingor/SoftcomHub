'use client'

import { Lock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { isConteudoProtocolo, CONTEUDO_PROTOCOLO_LABEL } from '@/lib/mensagem-conteudo'

/**
 * Renderiza o texto de uma mensagem. Se o conteúdo for, na verdade, um blob de
 * metadados de protocolo do WhatsApp (vazado pelo integrador), mostra um aviso
 * discreto em vez do JSON cru. Ver lib/mensagem-conteudo.ts.
 */
export function TextoMensagem({
  conteudo,
  className,
}: {
  conteudo?: string | null
  className?: string
}) {
  if (!conteudo) return null

  if (isConteudoProtocolo(conteudo)) {
    return (
      <p className={cn('inline-flex items-center gap-1.5 text-xs italic opacity-70', className)}>
        <Lock className="h-3 w-3 shrink-0" aria-hidden="true" />
        {CONTEUDO_PROTOCOLO_LABEL}
      </p>
    )
  }

  return <p className={cn('break-words', className)}>{conteudo}</p>
}
