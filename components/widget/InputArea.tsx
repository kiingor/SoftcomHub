'use client'

import { useRef, useState } from 'react'
import { Send, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function InputArea({
  onSendMessage,
  sending,
  disabled,
  placeholder = 'Digite sua mensagem…',
  hint,
}: {
  onSendMessage: (conteudo: string, tipo?: string) => void
  sending: boolean
  disabled: boolean
  placeholder?: string
  hint?: string
}) {
  const [message, setMessage] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSend = () => {
    if (message.trim() && !sending) {
      onSendMessage(message.trim(), 'texto')
      setMessage('')
      // Reset textarea height
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'
      }
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value)
    // Auto-grow textarea
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px'
    }
  }

  return (
    <div className="p-3 bg-white border-t space-y-1.5">
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          name="mensagem"
          value={message}
          onChange={handleTextChange}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={placeholder}
          aria-label="Mensagem"
          className="flex-1 px-4 py-2.5 bg-gray-50 border rounded-3xl text-sm resize-none focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus:border-primary/50 focus:bg-white disabled:bg-gray-100 max-h-30 transition-colors"
          rows={1}
        />
        <Button
          onClick={handleSend}
          disabled={!message.trim() || sending || disabled}
          size="icon"
          aria-label={sending ? 'Enviando…' : 'Enviar mensagem'}
          className="rounded-full shrink-0 h-10 w-10"
        >
          {sending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Send className="h-4 w-4" aria-hidden="true" />
          )}
        </Button>
      </div>
      <p className="text-[11px] text-center text-muted-foreground">
        {hint || 'Enter para enviar • Shift+Enter para quebra de linha'}
      </p>
    </div>
  )
}
