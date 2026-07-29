'use client'

import { Lock, MousePointerClick } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CONTEUDO_PROTOCOLO_LABEL, interpretarConteudo } from '@/lib/mensagem-conteudo'

/**
 * Renderiza o texto de uma mensagem.
 *
 * O `conteudo` nem sempre é texto: o integrador entrega resposta de botão,
 * reação e blob de protocolo do WhatsApp no mesmo campo, todos como JSON. Sem
 * traduzir isso, o atendente lia `{"payload":"Continuar Atendimento",…}` na
 * conversa. Ver lib/mensagem-conteudo.ts.
 */
export function TextoMensagem({
  conteudo,
  className,
}: {
  conteudo?: string | null
  className?: string
}) {
  if (!conteudo) return null

  const interpretado = interpretarConteudo(conteudo)

  if (interpretado.tipo === 'protocolo') {
    return (
      <p className={cn('inline-flex items-center gap-1.5 text-xs italic opacity-70', className)}>
        <Lock className="h-3 w-3 shrink-0" aria-hidden="true" />
        {CONTEUDO_PROTOCOLO_LABEL}
      </p>
    )
  }

  // O rótulo do botão é o que o cliente apertou — o ícone evita confundir com
  // uma frase que ele tenha digitado.
  if (interpretado.tipo === 'botao') {
    return (
      <p className={cn('inline-flex items-center gap-1.5 break-words', className)}>
        <MousePointerClick className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden="true" />
        {interpretado.texto}
      </p>
    )
  }

  if (interpretado.tipo === 'reacao') {
    return (
      <p className={cn('inline-flex items-center gap-1.5', className)}>
        <span className="text-lg leading-none" aria-hidden="true">{interpretado.emoji}</span>
        <span className="text-xs italic opacity-70">Reagiu a uma mensagem</span>
      </p>
    )
  }

  return <p className={cn('break-words', className)}>{interpretado.texto}</p>
}
