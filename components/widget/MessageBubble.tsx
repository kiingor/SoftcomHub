'use client'

import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'

interface Message {
  id: string
  remetente: 'cliente-widget' | 'colaborador'
  conteudo: string
  tipo: string
  enviado_em: string
}

export function MessageBubble({ message }: { message: Message }) {
  const isClient = message.remetente === 'cliente-widget'
  // Guarda contra data ausente — new Date(undefined) lança RangeError e
  // derrubaria o render inteiro do chat.
  const timestamp = message.enviado_em ? new Date(message.enviado_em) : new Date()
  const timeAgo = formatDistanceToNow(timestamp, { locale: ptBR, addSuffix: true })

  // Renderiza ícone para tipos de mídia
  const getMediaIcon = () => {
    switch (message.tipo) {
      case 'imagem':
        return '📷'
      case 'audio':
        return '🎤'
      case 'video':
        return '🎬'
      case 'documento':
        return '📎'
      case 'contact':
        return '👤'
      default:
        return null
    }
  }

  const mediaIcon = getMediaIcon()

  return (
    <div className={`flex ${isClient ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-xs px-4 py-2 rounded-lg ${
          isClient
            ? 'bg-primary text-white rounded-br-none'
            : 'bg-white text-foreground border rounded-bl-none'
        }`}
      >
        {mediaIcon ? (
          <p className="text-sm">
            {mediaIcon} {message.tipo.charAt(0).toUpperCase() + message.tipo.slice(1)}
          </p>
        ) : (
          <p className="text-sm break-words">{message.conteudo}</p>
        )}
        <p
          className={`text-xs mt-1 ${
            isClient ? 'text-white/70' : 'text-muted-foreground'
          }`}
        >
          {timeAgo}
        </p>
      </div>
    </div>
  )
}
