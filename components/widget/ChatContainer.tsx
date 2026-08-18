'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, LogOut } from 'lucide-react'
import { MessageBubble } from './MessageBubble'
import { InputArea } from './InputArea'
import { Button } from '@/components/ui/button'
import { useAdaptivePoll } from '@/hooks/use-adaptive-poll'

interface Message {
  id: string
  remetente: 'cliente-widget' | 'colaborador'
  conteudo: string
  tipo: string
  enviado_em: string
}

interface TicketInfo {
  status: string
  em_atendimento: boolean
  atendente_nome: string | null
}

export function ChatContainer({
  ticketId,
  token,
  onLogout,
}: {
  ticketId: string
  token: string
  widgetKey: string
  onLogout: () => void
}) {
  const [mensagens, setMensagens] = useState<Message[]>([])
  const [ticket, setTicket] = useState<TicketInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [joinNotice, setJoinNotice] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const prevAtendente = useRef<string | null>(null)

  // Busca mensagens + estado do ticket via endpoint autenticado por JWT.
  // Polling adaptativo em vez de Realtime anon — não mexe no RLS de produção.
  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/widget/messages/${ticketId}?offset=0&limit=50`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
      if (!res.ok) throw new Error('Erro ao carregar mensagens')
      const data = await res.json()
      setMensagens(data.mensagens || [])
      setTicket(data.ticket || null)

      // Avisa quando um atendente assume o chat.
      const nome: string | null = data.ticket?.atendente_nome || null
      if (nome && prevAtendente.current === null) {
        setJoinNotice(`${nome} entrou no atendimento`)
      }
      prevAtendente.current = nome
      setError(null)
    } catch (err) {
      console.error(err)
      setError(
        err instanceof Error ? err.message : 'Erro ao carregar mensagens',
      )
    } finally {
      setLoading(false)
    }
  }, [ticketId, token])

  useAdaptivePoll(fetchMessages)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensagens, joinNotice, ticket])

  const encerrado = ticket?.status === 'encerrado'
  const emAtendimento = !!ticket?.em_atendimento
  const atendente = ticket?.atendente_nome || null

  const handleSendMessage = async (conteudo: string, tipo = 'texto') => {
    if (!conteudo.trim() || encerrado) return

    setSending(true)
    setError(null)
    try {
      const res = await fetch('/api/widget/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ ticket_id: ticketId, conteudo, tipo }),
      })
      if (!res.ok) throw new Error('Erro ao enviar mensagem')
      await fetchMessages()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao enviar')
    } finally {
      setSending(false)
    }
  }

  const headerTitle = encerrado
    ? 'Atendimento encerrado'
    : atendente || 'Aguardando atendente'
  const headerSub = encerrado
    ? 'Obrigado pelo contato'
    : emAtendimento
      ? 'Atendente'
      : 'Você está na fila'

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-white border-b">
        <div className="flex items-center gap-3 min-w-0">
          <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-sm">
            {atendente ? atendente.charAt(0).toUpperCase() : '·'}
            <span
              className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white ${
                emAtendimento ? 'bg-green-500' : 'bg-amber-400'
              }`}
            />
          </span>
          <div className="min-w-0">
            <p className="font-medium text-sm leading-tight truncate">
              {headerTitle}
            </p>
            <p className="text-xs text-muted-foreground">{headerSub}</p>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onLogout} title="Encerrar">
          <LogOut className="h-4 w-4" />
        </Button>
      </div>

      {/* Mensagens */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* Aviso de fila */}
        {!loading && !emAtendimento && !encerrado && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs px-3 py-2 text-center leading-relaxed">
            ⏳ Você está na fila. Pode deixar sua mensagem — assim que um atendente
            assumir, ele responde por aqui.
          </div>
        )}

        {/* Atendente entrou */}
        {joinNotice && (
          <div className="text-center">
            <span className="inline-block rounded-full bg-green-100 text-green-700 text-xs px-3 py-1">
              🟢 {joinNotice}
            </span>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : mensagens.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center gap-1 px-6">
            <p className="text-sm font-medium">Olá! 👋</p>
            <p className="text-sm text-muted-foreground">
              Conte pra gente como podemos ajudar. É só escrever sua mensagem
              abaixo.
            </p>
          </div>
        ) : (
          mensagens.map((msg) => <MessageBubble key={msg.id} message={msg} />)
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Erro */}
      {error && (
        <div className="mx-4 mb-2 p-2 bg-red-50 text-red-600 text-xs rounded">
          {error}
        </div>
      )}

      {/* Input / encerrado */}
      {encerrado ? (
        <div className="p-4 bg-white border-t text-center text-sm text-muted-foreground">
          Este atendimento foi encerrado.
        </div>
      ) : (
        <InputArea
          onSendMessage={handleSendMessage}
          sending={sending}
          disabled={loading}
        />
      )}
    </div>
  )
}
