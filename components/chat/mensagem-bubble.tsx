'use client'

import { useState, type ReactNode } from 'react'
import {
  AlertTriangle,
  ArrowRightLeft,
  Check,
  CheckCheck,
  Clock,
  Copy,
  HelpCircle,
  Megaphone,
  RefreshCw,
  User,
} from 'lucide-react'

import { TextoMensagem } from '@/components/chat/texto-mensagem'
import { parseConteudoContato } from '@/lib/contato-vcard'
import { isConteudoProtocolo } from '@/lib/mensagem-conteudo'
import { cn, isBotMessage, isClientMessage } from '@/lib/utils'

/**
 * O chat aparece em dois contextos com regras visuais distintas:
 *
 * - `workdesk`: o atendente ESCREVE aqui, então a bolha mostra estado de envio
 *   (ticks, falha, "tentar novamente") e o cinza-secundário do chat de trabalho.
 * - `supervisao`: telas de leitura (Setor → Monitoramento e Dashboard →
 *   Monitoramento). Não há envio, então não há ticks; em compensação o bot ganha
 *   bolha azul, porque distinguir bot de atendente é justamente o que o
 *   supervisor precisa enxergar.
 */
export type BubbleVariant = 'workdesk' | 'supervisao'

export type SendOutcome = 'normal' | 'sending' | 'pending' | 'sent' | 'failed' | 'indeterminate'

export interface MensagemBubbleData {
  id: string
  remetente: string
  conteudo?: string | null
  tipo?: string | null
  enviado_em?: string | null
  url_imagem?: string | null
  media_type?: string | null
  erro_envio?: string | null
}

/** Uma mensagem é "de saída" quando não veio do cliente (colaborador, bot, sistema…). */
export function isOutgoingMessage(remetente: string): boolean {
  return !isClientMessage(remetente)
}

// ─── Contato compartilhado via WhatsApp (media_type === 'contact') ────────────
// Os formatos aceitos estão documentados em `lib/contato-vcard.ts`.

/** Heurística: detecta vCard quando o integrador não setou media_type. */
export function isContactMessage(m: { media_type?: string | null; conteudo?: string | null }): boolean {
  if (m.media_type === 'contact') return true
  const c = m.conteudo
  if (typeof c !== 'string') return false
  if (c.includes('BEGIN:VCARD')) return true
  const trimmed = c.trim()
  if (!trimmed.startsWith('[') && !trimmed.startsWith('{')) return false
  try {
    const parsed = JSON.parse(trimmed)
    const items = Array.isArray(parsed) ? parsed : [parsed]
    return items.length > 0 && items.every((it: any) =>
      it && typeof it === 'object' && (it.name || it.vcard) && (it.phones || it.vcard)
    )
  } catch {
    return false
  }
}

function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).catch(() => fallbackCopy(text))
    return
  }
  fallbackCopy(text)
}

function fallbackCopy(text: string) {
  const ta = document.createElement('textarea')
  ta.value = text
  ta.style.position = 'fixed'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  ta.select()
  document.execCommand('copy')
  document.body.removeChild(ta)
}

export function ContactCard({ conteudo, isOutgoing }: { conteudo: string; isOutgoing: boolean }) {
  const [copied, setCopied] = useState(false)

  const { contatos: contactList, texto } = parseConteudoContato(conteudo)

  // Conteúdo que não é contato reconhecível cai no texto puro, em vez de sumir.
  if (contactList.length === 0) {
    return <p className="text-sm whitespace-pre-wrap">{conteudo}</p>
  }

  return (
    <div className="space-y-2">
      {/* O cliente costuma escrever antes e depois de anexar o contato — o
          recado dele tem que continuar visível, não só o cartão. */}
      {texto && <p className="text-sm whitespace-pre-wrap">{texto}</p>}
      {contactList.map((contact, idx) => {
        // Sem telefone não monta "+" sozinho nem oferece o botão de copiar.
        const formattedPhone = !contact.phone
          ? ''
          : contact.phone.startsWith('+') ? contact.phone : `+${contact.phone}`

        return (
          <div
            key={idx}
            className={cn(
              'flex items-center gap-3 rounded-xl p-3 border',
              isOutgoing ? 'bg-white/15 border-white/20' : 'bg-background/60 border-border/50',
            )}
          >
            <div className={cn(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
              isOutgoing ? 'bg-white/20' : 'bg-primary/10',
            )}>
              <User className={cn('h-5 w-5', isOutgoing ? 'text-white' : 'text-primary')} aria-hidden="true" />
            </div>
            <div className="flex-1 min-w-0">
              <p className={cn('text-sm font-semibold truncate', isOutgoing ? 'text-white' : 'text-foreground')}>
                {contact.name}
              </p>
              {formattedPhone && (
                <p className={cn('text-xs truncate', isOutgoing ? 'text-white/70' : 'text-muted-foreground')}>
                  {formattedPhone}
                </p>
              )}
            </div>
            {formattedPhone && (
            <button
              type="button"
              onClick={() => {
                copyText(formattedPhone.replace(/\s/g, ''))
                setCopied(true)
                setTimeout(() => setCopied(false), 2000)
              }}
              className={cn(
                'flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all shrink-0',
                isOutgoing
                  ? 'bg-white/20 hover:bg-white/30 text-white'
                  : 'bg-primary/10 hover:bg-primary/20 text-primary',
              )}
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Copiado!' : 'Copiar'}
            </button>
            )}
          </div>
        )
      })}
    </div>
  )
}

function horaCurta(enviadoEm?: string | null): string | null {
  if (!enviadoEm) return null
  return new Date(enviadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

/** Aviso centralizado do sistema (transferência, disparo, encerramento…). */
export function MensagemSistema({
  mensagem,
  variant = 'workdesk',
}: { mensagem: MensagemBubbleData; variant?: BubbleVariant }) {
  const conteudo = mensagem.conteudo || ''
  const isTransferencia = conteudo.startsWith('Transferido')
  const hora = horaCurta(mensagem.enviado_em)
  // As telas de supervisão usam o aviso um ponto maior que o do WorkDesk.
  const supervisao = variant === 'supervisao'
  const iconClass = supervisao ? 'h-3.5 w-3.5 shrink-0' : 'h-3 w-3 shrink-0'

  return (
    <div className="flex justify-center">
      <div className={cn(
        'flex items-center gap-2 px-3 py-1.5 rounded-lg border max-w-[90%]',
        supervisao ? 'text-[11px]' : 'text-[10px]',
        isTransferencia
          ? 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300'
          : 'bg-muted/80 border-border text-muted-foreground',
      )}>
        {isTransferencia
          ? <ArrowRightLeft className={cn(iconClass, 'text-blue-600 dark:text-blue-400')} aria-hidden="true" />
          : <Megaphone className={cn(iconClass, 'text-primary')} aria-hidden="true" />}
        <span>{conteudo}</span>
        {hora && <span className="shrink-0 ml-1 opacity-60">{hora}</span>}
      </div>
    </div>
  )
}

/** Divisor tracejado que marca onde o ticket começa, depois do histórico do bot. */
export function SeparadorInicioTicket({ numero }: { numero?: number | null }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="flex-1 border-t border-dashed border-primary/30" />
      <span className="text-[10px] font-medium text-primary/70 whitespace-nowrap">
        Início do Ticket #{numero}
      </span>
      <div className="flex-1 border-t border-dashed border-primary/30" />
    </div>
  )
}

/** Recado interno do supervisor — nunca sai para o cliente, por isso o destaque. */
export function MensagemSupervisor({ mensagem }: { mensagem: MensagemBubbleData }) {
  const conteudo = mensagem.conteudo || ''
  const linhas = conteudo.split('\n')
  const ultima = linhas[linhas.length - 1]
  const temAssinatura = linhas.length > 1 && ultima.startsWith('— ')
  const corpo = temAssinatura ? linhas.slice(0, -1).join('\n').trimEnd() : conteudo
  const hora = horaCurta(mensagem.enviado_em)

  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 dark:border-amber-700 dark:bg-amber-950/30">
        <div className="mb-0.5 flex items-center gap-1 text-[10px] font-semibold text-amber-700 dark:text-amber-400">
          🔒 Mensagem do supervisor
        </div>
        <p className="whitespace-pre-wrap text-sm text-amber-900 dark:text-amber-200">{corpo}</p>
        {temAssinatura && (
          <p className="mt-0.5 text-right text-[10px] italic text-amber-700/70 dark:text-amber-400/70">{ultima}</p>
        )}
        {hora && (
          <p className="mt-1 text-right text-[10px] text-amber-700/70 dark:text-amber-400/70">{hora}</p>
        )}
      </div>
    </div>
  )
}

/** Transforma URLs em links clicáveis, preservando o resto do texto. */
function renderTextWithLinks(text: string, isOutgoing: boolean) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g)
  return parts.map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a
        key={i}
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          'underline break-all hover:opacity-80',
          isOutgoing ? 'text-primary-foreground' : 'text-blue-500 dark:text-blue-400',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {part}
      </a>
    ) : (
      part
    ),
  )
}

export interface MensagemBubbleProps<T extends MensagemBubbleData = MensagemBubbleData> {
  mensagem: T
  /** Estado de envio; sem valor, a bolha é tratada como já entregue. */
  sendOutcome?: SendOutcome
  /** Erro efêmero que ainda não foi persistido em `mensagem.erro_envio`. */
  erroEnvio?: string | null
  /** Sem callback, o botão "Tentar novamente" não aparece (ex.: visão do supervisor). */
  onRetry?: (mensagem: T) => void
  /**
   * Renderização da mídia. Cada tela injeta a sua: o WorkDesk usa o player com
   * transcrição; o monitoramento usa a prévia somente-leitura.
   */
  media?: ReactNode
  /** Bloco de citação da mensagem respondida, quando a tela suporta responder. */
  replyPreview?: ReactNode
  /** Classes extras da caixa (ex.: largura máxima diferente no desktop). */
  bubbleClassName?: string
  /** Marca a caixa para o scroll-to da citação encontrar a mensagem original. */
  dataMsgId?: string
  /** Contexto visual; ver {@link BubbleVariant}. Padrão: 'workdesk'. */
  variant?: BubbleVariant
}

/**
 * Caixa da mensagem, sem a linha que a alinha. Use quando a tela já tem o
 * próprio wrapper de linha (o WorkDesk desktop tem, por causa dos botões de
 * responder que ficam fora da bolha).
 */
export function MensagemBubbleBox<T extends MensagemBubbleData>({
  mensagem,
  sendOutcome = 'normal',
  erroEnvio,
  onRetry,
  media,
  replyPreview,
  bubbleClassName,
  dataMsgId,
  variant = 'workdesk',
}: MensagemBubbleProps<T>) {
  const supervisao = variant === 'supervisao'
  const outgoing = isOutgoingMessage(mensagem.remetente)
  // Na supervisão não há envio em curso: sem ticks e sem estado de falha.
  const isFailedSend = !supervisao && (sendOutcome === 'failed' || sendOutcome === 'indeterminate')
  const erro = erroEnvio || mensagem.erro_envio
  const hora = horaCurta(mensagem.enviado_em)
  const isContato = isContactMessage(mensagem) && Boolean(mensagem.conteudo)
  // Documento/áudio/vídeo e PDF já são descritos pelo próprio bloco de mídia.
  const mostraTexto = Boolean(mensagem.conteudo)
    && !isContato
    && mensagem.tipo !== 'documento'
    && mensagem.tipo !== 'audio'
    && mensagem.tipo !== 'video'
    && !mensagem.url_imagem?.toLowerCase().endsWith('.pdf')
  // Mídia declarada no tipo mas sem arquivo: avisa em vez de mostrar bolha vazia.
  const midiaAusente = Boolean(mensagem.tipo)
    && mensagem.tipo !== 'texto'
    && !mensagem.url_imagem
    && !isContato

  return (
    <div
      data-msg-id={dataMsgId}
      className={cn(
        'rounded-lg px-3 py-2 break-words overflow-hidden',
        supervisao
          ? cn(
              'max-w-[80%] text-sm',
              isClientMessage(mensagem.remetente)
                ? 'bg-muted'
                : isBotMessage(mensagem.remetente)
                  ? 'bg-blue-100 dark:bg-blue-900/30'
                  : 'bg-primary text-primary-foreground',
            )
          : cn(
              'max-w-[85%]',
              outgoing
                ? 'bg-primary text-primary-foreground rounded-br-md'
                : 'bg-secondary text-secondary-foreground rounded-bl-md',
            ),
        isFailedSend && 'bg-orange-500 text-white border-2 border-orange-300',
        bubbleClassName,
      )}
    >
      {replyPreview}

      {isFailedSend && (
        <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide">
          {sendOutcome === 'indeterminate'
            ? <HelpCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            : <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
          {sendOutcome === 'indeterminate' ? 'Envio não confirmado' : 'Falha no envio'}
        </div>
      )}

      {media}

      {midiaAusente && (
        <div className="mb-1 flex items-start gap-2 px-2.5 py-2 rounded-md bg-amber-500/10 border border-amber-500/30 text-xs">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500 mt-0.5" aria-hidden="true" />
          <div className="flex flex-col gap-0.5">
            <span className="font-medium">
              {`${mensagem.tipo![0].toUpperCase()}${mensagem.tipo!.slice(1)} não recebida`}
            </span>
            <span className="opacity-70">
              O arquivo não foi anexado a esta mensagem (URL ausente no banco). Verifique o fluxo n8n.
            </span>
          </div>
        </div>
      )}

      {isContato ? (
        <ContactCard conteudo={mensagem.conteudo as string} isOutgoing={outgoing} />
      ) : mostraTexto && (
        isConteudoProtocolo(mensagem.conteudo!)
          ? <TextoMensagem conteudo={mensagem.conteudo} className="text-sm whitespace-pre-wrap" />
          : <p className="text-sm whitespace-pre-wrap">{renderTextWithLinks(mensagem.conteudo!, outgoing)}</p>
      )}

      {isFailedSend && (
        <div className="mt-2 space-y-1.5">
          {erro && <p className="text-xs leading-snug opacity-95">{erro}</p>}
          {onRetry && (
            <button
              type="button"
              onClick={() => onRetry(mensagem)}
              className="inline-flex items-center gap-1.5 rounded-md bg-white/25 hover:bg-white/35 px-2.5 py-1 text-xs font-medium transition-colors"
            >
              <RefreshCw className="h-3 w-3" aria-hidden="true" />
              Tentar novamente
            </button>
          )}
        </div>
      )}

      {supervisao ? (
        <p className={cn(
          'text-[10px] mt-1',
          isClientMessage(mensagem.remetente) ? 'text-muted-foreground' : 'opacity-70',
        )}>
          {hora}
        </p>
      ) : (
        <div className="mt-1 flex items-center justify-end gap-1 text-[10px] opacity-60">
          {hora && <span>{hora}</span>}
          {outgoing && (
            <>
              {(sendOutcome === 'sending' || sendOutcome === 'pending') && <Clock className="h-3 w-3 animate-pulse" aria-hidden="true" />}
              {sendOutcome === 'sent' && <Check className="h-3 w-3" aria-hidden="true" />}
              {sendOutcome === 'failed' && <AlertTriangle className="h-3 w-3" aria-hidden="true" />}
              {sendOutcome === 'indeterminate' && <HelpCircle className="h-3 w-3" aria-hidden="true" />}
              {sendOutcome === 'normal' && <CheckCheck className="h-3 w-3" aria-hidden="true" />}
            </>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Bolha completa (linha + caixa), compartilhada entre o WorkDesk e o painel de
 * monitoramento. Decide sozinha os formatos especiais — sistema, supervisor e
 * contato — para as duas telas não divergirem de novo.
 */
export function MensagemBubble<T extends MensagemBubbleData>({
  dimmed,
  ...props
}: MensagemBubbleProps<T> & { dimmed?: boolean }) {
  const { mensagem } = props

  if (mensagem.remetente === 'supervisor') {
    return <MensagemSupervisor mensagem={mensagem} />
  }
  if (mensagem.remetente === 'sistema') {
    return <MensagemSistema mensagem={mensagem} variant={props.variant} />
  }

  const outgoing = isOutgoingMessage(mensagem.remetente)

  return (
    <div className={cn('flex', outgoing ? 'justify-end' : 'justify-start', dimmed && 'opacity-70')}>
      <MensagemBubbleBox {...props} />
    </div>
  )
}
