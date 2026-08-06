'use client'

import React from "react"

import { useEffect, useLayoutEffect, useState, useCallback, useRef, useMemo, startTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import { logError } from '@/lib/error-logger'
import { stripBrazilCountryCode } from '@/lib/phone'
import { computeSendOutcome } from '@/lib/message-send-status'
import { areSetorSortConfigsEqual, sortTicketsBySetorConfig } from '@/lib/ticket-sort'
import { isTransferTargetAvailable } from '@/lib/transfer-authorization'
import { marcarSaidaDaFila } from '@/lib/ticket-assignment-stamp'
import { motion, AnimatePresence } from 'framer-motion'
import { formatDistanceToNow, format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { cn, isClientMessage, isBotMessage } from '@/lib/utils'
import { TransferirTicketDialog } from '@/components/tickets/transferir-ticket-dialog'
import { rotuloDuplicidade, ticketsAbertos } from '@/lib/tickets-duplicados'
import { MensagemBubble, MensagemBubbleBox, ContactCard, isContactMessage, isOutgoingMessage, SeparadorConversaNexus, SeparadorInicioTicket } from '@/components/chat/mensagem-bubble'
import { upload } from '@vercel/blob/client'
import { resolveMime } from '@/lib/whatsapp-media'
import {
  MessageCircle,
  Clock,
  AlertTriangle,
  HelpCircle,
  CheckCircle,
  X,
  Filter,
  Search,
  Send,
  ImageIcon,
  Mic,
  FileText,
  Video,
  Menu,
  User,
  Users,
  Check,
  CheckCheck,
  ArrowRightLeft,
  ArrowLeft,
  XCircle,
  Smile,
  Phone,
  Loader2,
  History,
  PanelRightOpen,
  PanelRightClose,
  Copy,
  Megaphone,
  Lock,
  Timer,
  ChevronRight,
  Zap,
  Ticket,
  Hash,
  Download,
  ExternalLink,
  Music,
  Play,
  FileIcon,
  Layers,
  ChevronDown,
  FileArchive,
  FileCode,
  FileSpreadsheet,
  ShieldCheck,
  Pencil,
  MoreHorizontal,
  Save,
  Sparkles,
  Star,
  Info,
  RefreshCw,
  CornerUpLeft,
  Tag,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Checkbox } from '@/components/ui/checkbox'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card'
import { TextoMensagem } from '@/components/chat/texto-mensagem'
import { getFileDownloadUrl, isViewableInBrowser } from '@/lib/anexo-url'
import { isConteudoProtocolo } from '@/lib/mensagem-conteudo'
import { formatPrimeCliente, formatSistemaCliente, isClientePrime } from '@/lib/cliente-softcom'
import { formatDocumento, formatDocumentoInput, isDocumentoValido, rotuloDocumento } from '@/lib/documento-cliente'
import { telefoneSemDDI } from '@/lib/telefone'
import { loadRowsByPages } from '@/lib/supabase/paginate'
import { devePosicionarNoInicioDoTicket, estaNoFimDaConversa } from '@/lib/scroll-conversa'
import {
  calcularInicioJanelaHistoricoIso,
  ehMensagemNexus as isNexusMessage,
  pertenceAoContextoDoTicket,
  selecionarIdsContextoNexusOrfao,
  selecionarInicioHumanoDoTicket,
} from '@/lib/nexus-historico-ticket'
import { toast } from 'sonner'
import { useAudioAlert } from '@/hooks/use-audio-alert'

interface Cliente {
  id: string
  nome: string
  telefone: string | null
  email: string | null
  documento?: string | null
  CNPJ?: string | null
  Registro?: string | null
  PDV?: string | null
  software?: string | null
  prime?: string | boolean | null
  created_at?: string
}

interface ClienteSelecionado {
  id: string | null
  nome: string
  telefone: string | null
  email: string | null
  CNPJ: string | null
  Registro: string | null
  PDV: string | null
  software?: string | null
  prime?: string | boolean | null
}

interface MdmMachine {
  clientId: string
  hostname: string
  online: boolean
  hasMdm: boolean
  mdmVersion: string
  lastInventory: string | null
}

interface MdmResult {
  hasMdm: boolean
  installedCount: number
  totalMachines: number
  machines: MdmMachine[]
}

interface Setor {
  id: string
  nome: string
  cor: string | null
  canal?: string
  tempo_espera_minutos?: number
  }
  
interface Subsetor {
  id: string
  nome: string
  setor_id?: string
}

interface Ticket {
  id: string
  numero: number
  cliente_id: string
  colaborador_id: string | null
  setor_id: string
  subsetor_id: string | null
  status: 'aberto' | 'em_atendimento' | 'encerrado'
  prioridade: 'normal' | 'urgente'
  canal: string
  primeira_resposta_em: string | null
  criado_em: string
  encerrado_em: string | null
  clientes: Cliente
  setores?: Setor
  subsetores?: Subsetor
  ultima_mensagem?: string
  ultima_mensagem_em?: string
  ultima_mensagem_remetente?: 'cliente' | 'colaborador' | 'bot'
  ultima_mensagem_tipo?: string | null
  mensagens_nao_lidas?: number
  is_disparo?: boolean
  disparo_em?: string | null
  user_name_discord?: string | null
}

interface Mensagem {
  id: string
  ticket_id: string | null
  cliente_id: string | null
  remetente: 'cliente' | 'cliente-nexus' | 'colaborador' | 'bot' | 'bot-nexus' | 'sistema' | 'supervisor'
  conteudo: string
  tipo: 'texto' | 'imagem' | 'audio' | 'video' | 'documento'
  enviado_em: string
  phone_number_id?: string | null
  canal_envio?: string | null
  whatsapp_message_id?: string
  status_envio?: 'pendente' | 'enviando' | 'enviado' | 'falhou' | 'indeterminado' | null
  erro_envio?: string | null
  envio_tentativa_em?: string | null
  discord_user_id?: string | null
  url_imagem?: string | null
  media_type?: string | null
  // Reply: internal UUID of the parent mensagem this one quotes (nullable).
  // `reply_parent` is hydrated client-side when rendering to avoid a join.
  reply_to_message_id?: string | null
  reply_parent?: { id: string; conteudo: string; remetente: string; tipo: string } | null
  // For history display
  tickets?: {
    id: string
    status: string
    criado_em: string
    encerrado_em: string | null
  }
}

const SEND_CLAIM_STALE_MS = 10 * 60 * 1000
const MAX_STALE_RECONCILE_ATTEMPTS = 5

// Monta a URL da "Ocorrência rápida" (Service Desk) pro ticket selecionado — usada
// como href de um <a target="_blank"> nativo (não window.open), pra abrir a guia
// respeitando bloqueadores de pop-up e navegação normal do navegador (abrir em nova
// guia/janela, cmd/ctrl+click, etc.).
function buildOcorrenciaRapidaUrl(ticket: Ticket | null): string {
  if (!ticket) return '#'
  const cnpjDigits = (ticket.clientes?.CNPJ || '').replace(/\D/g, '')
  const registroDigits = (ticket.clientes?.Registro || '').replace(/\D/g, '')
  const tel = stripBrazilCountryCode(ticket.clientes?.telefone)
  const q = cnpjDigits || tel || registroDigits
  return `https://agenda.softcomtecnologia.com/service-desk/ocorrencia-rapida?q=${encodeURIComponent(q)}&ticket=${encodeURIComponent(String(ticket.numero))}&tel=${encodeURIComponent(tel)}`
}

// Campanha de ação preventiva pra instalação do MDM Agent Plus — mesma base
// de URL da agenda, aberta com o CNPJ do cliente já preenchido.
function buildMdmCampanhaUrl(cnpj: string | null | undefined): string {
  const params = new URLSearchParams({
    cnpj: (cnpj || '').replace(/\D/g, ''),
    campanha: 'AÇÃO PREVENTIVA',
    campanhaTipo: 'MAPEAMENTO',
    acaoId: '146',
    acaoDescricao: 'MDM Agent Plus - Instalação',
  })
  return `https://agenda.softcomtecnologia.com/clientes?${params.toString()}`
}

// Converte payload de erro dos endpoints /api/evolution/send e /api/whatsapp/send
// em mensagem amigável ao usuário. Cobre Evolution (vcard response) e WhatsApp
// Cloud API (OAuthException + códigos Meta).
function parseSendErrorMessage(result: unknown): string {
  const r = result as Record<string, any> | null | undefined
  if (!r) return 'Erro ao enviar mensagem'

  // Evolution: número não existe no WhatsApp
  // { details: { response: { message: [{ exists: false }] } } }
  const responseMsg = r?.details?.response?.message
  if (Array.isArray(responseMsg) && responseMsg.length > 0) {
    const item = responseMsg[0]
    if (item?.exists === false) {
      return 'O número do cliente não está cadastrado no WhatsApp'
    }
    if (typeof item === 'string') return item
    if (item?.message && typeof item.message === 'string') return item.message
  }

  // Dispositivo desconectado (já tratado em outra branch, mas mantém aqui para retry)
  if (r?.deviceOffline) {
    return 'Dispositivo desconectado — verifique a conexão do WhatsApp'
  }

  // WhatsApp Cloud API (Meta): { details: { error: { code, type, message } } }
  // Códigos: https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes
  const metaError = r?.details?.error
  if (metaError && typeof metaError === 'object') {
    const code = metaError.code
    const metaMsg: string | undefined = typeof metaError.message === 'string' ? metaError.message : undefined

    switch (code) {
      case 190:
        return 'Token do WhatsApp expirado ou inválido — renove nas configurações do setor'
      case 131026:
      case 133010:
        return 'O número informado não está cadastrado no WhatsApp'
      case 131047:
        return 'Janela de 24h expirada — é necessário enviar um template aprovado para reabrir o atendimento'
      case 131051:
        return 'Tipo de mensagem não suportado neste canal'
      case 131045:
      case 131008:
        return 'Formato de telefone inválido'
      case 131056:
        return 'Limite de envios atingido para este número — aguarde alguns minutos'
      case 131031:
        return 'Conta do WhatsApp com restrições temporárias da Meta'
      case 368:
        return 'Conta do WhatsApp bloqueada temporariamente pela Meta'
      case 100:
        return metaMsg ? `Parâmetro inválido: ${metaMsg}` : 'Parâmetro inválido na requisição ao WhatsApp'
    }

    // Código não mapeado — usa a mensagem original da Meta
    if (metaMsg) return `WhatsApp: ${metaMsg}${code ? ` (código ${code})` : ''}`
  }

  // Formatos comuns de mensagem de erro (strings)
  if (typeof r?.details?.message === 'string') return r.details.message
  if (typeof r?.error === 'string' && r.error !== 'Bad Request') return r.error
  if (typeof r?.details?.error === 'string' && r.details.error !== 'Bad Request') return r.details.error

  // Fallback com status HTTP se disponível
  const status = r?.status || r?.details?.status
  if (status) return `Erro ao enviar mensagem (HTTP ${status})`

  return 'Erro ao enviar mensagem'
}


interface ColaboradorSetor {
  setor_id: string
  setores: Setor
}

interface Colaborador {
  id: string
  nome: string
  email: string
  setor_id: string | null
  permissao_id: string | null
  is_online: boolean
  setores_ativos_sessao?: string[] | null
  permissoes?: {
    can_see_all_tickets: boolean
  }
  setores_vinculados?: ColaboradorSetor[]
}

// Format phone number
const formatPhone = (phone: string) => {
  const cleaned = phone.replace(/\D/g, '')
  if (cleaned.length === 13) {
    // Format: +55 (83) 99999-9999
    return `+${cleaned.slice(0, 2)} (${cleaned.slice(2, 4)}) ${cleaned.slice(4, 9)}-${cleaned.slice(9)}`
  }
  if (cleaned.length === 11) {
    // Format: (83) 99999-9999
    return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 7)}-${cleaned.slice(7)}`
  }
  return phone
}

// Documento do cliente (CNPJ ou CPF de MEI) — formatação em @/lib/documento-cliente


// ─── AudioTranscriptionPlayer Component ──────────────────────────────────────
const AudioTranscriptionPlayer = React.memo(function AudioTranscriptionPlayer({ url, mediaType, fileName, conteudo, isOutgoing, mensagemId, setorId, setorIAAtivo, onTranscricao }: {
  url: string
  mediaType?: string | null
  fileName: string
  conteudo?: string
  isOutgoing: boolean
  mensagemId?: string
  setorId?: string
  setorIAAtivo?: boolean
  onTranscricao?: (mensagemId: string, transcricao: string) => void
}) {
  const audioExts = ['mp3', 'ogg', 'wav', 'aac', 'm4a', 'opus', 'oga', 'weba', 'webm', 'mp4', 'amr']
  const isFileNameOnly = !conteudo || conteudo === fileName ||
    audioExts.some(e => conteudo?.toLowerCase().endsWith(`.${e}`)) ||
    conteudo?.startsWith('audio') || conteudo?.startsWith('PTT-')
  const existingTranscription = !isFileNameOnly ? conteudo : null

  const [transcricao, setTranscricao] = useState<string | null>(existingTranscription || null)
  const [transcrevendo, setTranscrevendo] = useState(false)

  const handleTranscrever = async () => {
    if (!mensagemId || !setorId || transcrevendo) return
    setTranscrevendo(true)
    try {
      const res = await fetch('/api/ia/transcrever-audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audio_url: url, setor_id: setorId, mensagem_id: mensagemId }),
      })
      const data = await res.json()
      if (res.ok && data.transcricao) {
        setTranscricao(data.transcricao)
        if (onTranscricao && mensagemId) onTranscricao(mensagemId, data.transcricao)
      }
    } catch (err) {
      console.error('[AudioTranscription] Error:', err)
    } finally {
      setTranscrevendo(false)
    }
  }

  return (
    <div className="mb-2 space-y-1">
      <div className={cn(
        'flex items-center gap-2 rounded-xl px-3 py-2',
        isOutgoing ? 'bg-white/15' : 'bg-muted/60'
      )}>
        <Music className="h-4 w-4 shrink-0 opacity-70" />
        <audio controls className="flex-1 h-8 min-w-0" preload="metadata" style={{ height: '32px' }}>
          <source src={url} type={mediaType || 'audio/ogg'} />
        </audio>
        {setorIAAtivo && !transcricao && (
          <button
            onClick={handleTranscrever}
            disabled={transcrevendo}
            className={cn(
              'shrink-0 rounded p-1 transition-colors',
              isOutgoing ? 'hover:bg-white/20 text-white' : 'hover:bg-muted text-foreground'
            )}
            title="Transcrever áudio"
          >
            {transcrevendo ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <FileText className="h-3.5 w-3.5" />
            )}
          </button>
        )}
        <a
          href={getFileDownloadUrl(url)}
          download={fileName}
          className={cn(
            'shrink-0 rounded p-1 transition-colors',
            isOutgoing ? 'hover:bg-white/20 text-white' : 'hover:bg-muted text-foreground'
          )}
          title="Baixar áudio"
        >
          <Download className="h-3.5 w-3.5" />
        </a>
      </div>
      {transcricao && (
        <div className={cn(
          'rounded-lg px-3 py-2 text-xs italic leading-relaxed',
          isOutgoing ? 'bg-white/10 text-white/90' : 'bg-muted/40 text-muted-foreground'
        )}>
          {transcricao}
        </div>
      )}
    </div>
  )
})

// ─── MessageMedia Component ───────────────────────────────────────────────────
// Renderiza mídia de mensagem baseado no media_type (MIME) com fallback no tipo
interface MessageMediaProps {
  url: string
  mediaType?: string | null
  tipo?: string
  conteudo?: string
  isOutgoing: boolean
  mensagemId?: string
  setorId?: string
  setorIAAtivo?: boolean
  onTranscricao?: (mensagemId: string, transcricao: string) => void
}

// Retorna ícone, label e cores para cada tipo de arquivo
function getFileInfo(ext: string, mediaType?: string | null) {
  const e = ext.toLowerCase()
  if (e === 'pdf' || mediaType === 'application/pdf')
    return { icon: FileText, label: 'PDF', color: 'text-red-600', bg: 'bg-red-50 dark:bg-red-950/30', border: 'border-red-200 dark:border-red-800' }
  if (['doc', 'docx'].includes(e) || mediaType?.includes('word'))
    return { icon: FileText, label: 'Word', color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-950/30', border: 'border-blue-200 dark:border-blue-800' }
  if (['xls', 'xlsx', 'csv'].includes(e) || mediaType?.includes('spreadsheet') || mediaType?.includes('excel'))
    return { icon: FileSpreadsheet, label: 'Planilha', color: 'text-green-600', bg: 'bg-green-50 dark:bg-green-950/30', border: 'border-green-200 dark:border-green-800' }
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(e))
    return { icon: FileArchive, label: e.toUpperCase(), color: 'text-orange-500', bg: 'bg-orange-50 dark:bg-orange-950/30', border: 'border-orange-200 dark:border-orange-800' }
  if (['xml', 'json', 'html', 'htm', 'css', 'js', 'ts', 'txt', 'csv'].includes(e) || mediaType?.startsWith('text/'))
    return { icon: FileCode, label: e.toUpperCase() || 'Texto', color: 'text-purple-600', bg: 'bg-purple-50 dark:bg-purple-950/30', border: 'border-purple-200 dark:border-purple-800' }
  if (['cer', 'crt', 'pem', 'p12', 'pfx', 'key'].includes(e))
    return { icon: ShieldCheck, label: 'Certificado', color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-950/30', border: 'border-emerald-200 dark:border-emerald-800' }
  return { icon: FileIcon, label: e.toUpperCase() || 'Arquivo', color: 'text-muted-foreground', bg: 'bg-muted/50', border: 'border-border' }
}


function MessageMedia({ url, mediaType, tipo, conteudo, isOutgoing, mensagemId, setorId, setorIAAtivo, onTranscricao }: MessageMediaProps) {
  const urlLower = url.toLowerCase().split('?')[0]
  const ext = urlLower.split('.').pop() || ''

  // Determina o tipo real. Precedência:
  //   1. MIME explícito (mais confiável, vem do upload normalizado ou Vercel Blob)
  //   2. Extensão da URL (real, presa ao arquivo)
  //   3. tipo do banco (frequentemente errado quando o integrador n8n
  //      classifica tudo como 'imagem' sem inspecionar o conteúdo).
  const mimeIsImage = mediaType?.startsWith('image/')
  const mimeIsVideo = mediaType?.startsWith('video/')
  const mimeIsAudio = mediaType?.startsWith('audio/')
  const anyMime = !!(mimeIsImage || mimeIsVideo || mimeIsAudio)

  const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp']
  const AUDIO_EXTS = ['mp3', 'ogg', 'wav', 'aac', 'm4a', 'opus', 'amr']
  // .webm fica fora da lista de vídeo: é ambígua (áudio OU vídeo) e nossa
  // gravação produz .ogg agora, então quem grava .webm é vídeo só raramente.
  const VIDEO_EXTS = ['mp4', '3gp', 'mov', 'avi', 'mkv']
  // Extensões de documento/arquivo — explicitamente NÃO-mídia. Quando a URL
  // termina em uma delas, ignoramos o `tipo` do banco (n8n marca tudo como
  // 'imagem') e cai no card de download.
  const DOC_EXTS = [
    'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt',
    'csv', 'xml', 'json', 'zip', 'rar', '7z', 'tar', 'gz',
    'cer', 'crt', 'pem', 'p12', 'pfx', 'key',
  ]
  const extIsKnown =
    IMAGE_EXTS.includes(ext) || AUDIO_EXTS.includes(ext) ||
    VIDEO_EXTS.includes(ext) || DOC_EXTS.includes(ext)

  const isImage = mimeIsImage
    || (!anyMime && IMAGE_EXTS.includes(ext))
    || (!anyMime && !extIsKnown && tipo === 'imagem')
  const isAudio = mimeIsAudio
    || (!anyMime && AUDIO_EXTS.includes(ext))
    || (!anyMime && !extIsKnown && tipo === 'audio')
  const isVideo = mimeIsVideo
    || (!anyMime && VIDEO_EXTS.includes(ext))
    || (!anyMime && !extIsKnown && tipo === 'video')

  const fileName = conteudo || url.split('/').pop()?.split('?')[0] || 'arquivo'

  if (isVideo) {
    return (
      <div className="mb-2 space-y-1.5">
        <video
          controls
          className="max-w-full rounded-lg max-h-64 w-full bg-black"
          preload="metadata"
        >
          <source src={url} type={mediaType || 'video/mp4'} />
          Seu navegador não suporta vídeo.
        </video>
        <a
          href={getFileDownloadUrl(url)}
          download={fileName}
          className={cn(
            'inline-flex items-center gap-1.5 text-[11px] rounded-md px-2 py-1 transition-colors',
            isOutgoing
              ? 'bg-white/20 hover:bg-white/30 text-white'
              : 'bg-muted hover:bg-muted/80 text-foreground'
          )}
        >
          <Download className="h-3 w-3" />
          Baixar vídeo
        </a>
      </div>
    )
  }

  if (isAudio) {
    return (
      <AudioTranscriptionPlayer
        url={url}
        mediaType={mediaType}
        fileName={fileName}
        conteudo={conteudo}
        isOutgoing={isOutgoing}
        mensagemId={mensagemId}
        setorId={setorId}
        setorIAAtivo={setorIAAtivo}
        onTranscricao={onTranscricao}
      />
    )
  }

  if (isImage) {
    return (
      <div className="mb-2">
        <img
          src={url}
          alt="Imagem"
          className="max-w-full rounded-lg max-h-64 object-contain cursor-pointer hover:opacity-90 transition-opacity"
          onClick={() => window.open(url, '_blank')}
        />
      </div>
    )
  }

  // Qualquer outro arquivo com URL → card de anexo
  const { icon: Icon, label, color, bg, border } = getFileInfo(ext, mediaType)
  // O clique no card baixa; ao lado fica o atalho para abrir em outra guia, que
  // é o que resolve consultar o documento sem perder o atendimento de vista. No
  // PDF a ordem se inverte, porque ali ler é o uso normal. Os dois levam
  // `target`, então nenhum anexo substitui a tela.
  const leituraPrimeiro = isViewableInBrowser(ext, mediaType)
  return (
    <div
      className={cn(
        'mb-2 flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors',
        bg, border,
      )}
    >
      <a
        href={leituraPrimeiro ? url : getFileDownloadUrl(url)}
        {...(leituraPrimeiro ? {} : { download: fileName })}
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer hover:opacity-80"
      >
        <Icon className={cn('h-6 w-6 shrink-0', color)} />
        <div className="flex flex-col min-w-0 flex-1">
          <span className="text-sm font-medium text-foreground truncate">{fileName}</span>
          <span className="text-[10px] text-muted-foreground">
            {label} · {leituraPrimeiro ? 'Clique para abrir' : 'Clique para baixar'}
          </span>
        </div>
      </a>
      <a
        href={leituraPrimeiro ? getFileDownloadUrl(url) : url}
        {...(leituraPrimeiro ? { download: fileName } : {})}
        target="_blank"
        rel="noreferrer"
        title={leituraPrimeiro ? 'Baixar arquivo' : 'Abrir em nova guia'}
        aria-label={leituraPrimeiro ? 'Baixar arquivo' : 'Abrir em nova guia'}
        className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
      >
        {leituraPrimeiro
          ? <Download className="h-4 w-4" />
          : <ExternalLink className="h-4 w-4" />}
      </a>
    </div>
  )
}
// ──────────────────────────────────────────────────────────────────────────────


// Disparo Timer Component

function DisparoTimer({ dispatchTime }: { dispatchTime: string }) {
  const [timeLeft, setTimeLeft] = React.useState<string>('')

  React.useEffect(() => {
    const updateTimer = () => {
      const dispatchDate = new Date(dispatchTime).getTime()
      const now = Date.now()
      const twelveMin = 12 * 60 * 1000
      const elapsed = now - dispatchDate
      const remaining = twelveMin - elapsed

      if (remaining <= 0) {
        setTimeLeft('Desbloqueado')
      } else {
        const minutes = Math.floor(remaining / 60000)
        const seconds = Math.floor((remaining % 60000) / 1000)
        setTimeLeft(`${minutes}:${seconds.toString().padStart(2, '0')}`)
      }
    }

    updateTimer()
    const interval = setInterval(updateTimer, 1000)
    return () => clearInterval(interval)
  }, [dispatchTime])

  return (
    <div className="flex items-center gap-2 mt-2 text-xs text-blue-600 dark:text-blue-400">
      <Timer className="h-3 w-3" />
      <span>Tempo para encerrar: {timeLeft}</span>
    </div>
  )
}

export default function WorkdeskPage() {
  const supabase = useMemo(() => createClient(), [])
  const { playAlert, initAudioContext } = useAudioAlert()

  const [colaborador, setColaborador] = useState<Colaborador | null>(null)
  // Always-current ref so intervals/closures read the latest colaborador
  const colaboradorCurrentRef = useRef<Colaborador | null>(null)
  useEffect(() => { colaboradorCurrentRef.current = colaborador }, [colaborador])
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [requestedTicketId, setRequestedTicketId] = useState<string | null>(null)
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null)
  const selectedTicketIdRef = useRef<string | null>(null)
  const previousTicketIdsRef = useRef<Set<string>>(new Set())
  const [mensagens, setMensagens] = useState<Mensagem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMensagens, setLoadingMensagens] = useState(false)
  const [sendingMessage, setSendingMessage] = useState(false) // Declared sendingMessage variable
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setRequestedTicketId(new URLSearchParams(window.location.search).get('ticket'))
  }, [])
  
  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('todos')
  const [prioridadeFilter, setPrioridadeFilter] = useState<string>('todos')
  const [subsetorFilter, setSubsetorFilter] = useState<string>('todos')
  const [searchTerm, setSearchTerm] = useState('')
  const [subsetoresDisponiveis, setSubsetoresDisponiveis] = useState<Subsetor[]>([])

  // Contador de clientes em fila (tickets aberto sem colaborador atribuído nos setores do atendente)
  const [filaCount, setFilaCount] = useState<number>(0)
  // Quebra da fila por setor · subsetor, exibida ao passar o mouse no card.
  const [filaPorSubsetor, setFilaPorSubsetor] = useState<{ rotulo: string; total: number }[]>([])
  const [puxandoTicket, setPuxandoTicket] = useState(false)
  
  // Mobile
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false)
  
  // Dialog
  const [encerrarDialogOpen, setEncerrarDialogOpen] = useState(false)
  // Classificação do atendimento (tipos cadastrados no setor)
  const [tiposEncerramento, setTiposEncerramento] = useState<{ id: string; nome: string }[]>([])
  const [selectedTipoEncerramento, setSelectedTipoEncerramento] = useState<string>('')
  const [loadingTiposEncerramento, setLoadingTiposEncerramento] = useState(false)
  const [transferDialogOpen, setTransferDialogOpen] = useState(false)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  // Em desktop o painel de info já vem aberto; em mobile/tablet começa fechado
  // pra que o chat ocupe a tela inteira ao abrir um ticket.
  const [showClientInfo, setShowClientInfo] = useState(() => {
    if (typeof window === 'undefined') return true
    return window.innerWidth >= 1024
  })
  
  // Guarda contra o realtime reinserir um ticket que acabou de ser transferido.
  const transferringTicketIdsRef = useRef<Set<string>>(new Set())

  // Message input
  const [messageInput, setMessageInput] = useState('')
  const [melhorandoIA, setMelhorandoIA] = useState(false)
  const [setorIAAtivo, setSetorIAAtivo] = useState(false)
  const [setorAssinaturaAtiva, setSetorAssinaturaAtiva] = useState(false)
  const [setorNexusAtivo, setSetorNexusAtivo] = useState(false)

  // Avaliação NPS do atendente
  const [avaliacaoMedia, setAvaliacaoMedia] = useState<number | null>(null)
  const [avaliacaoTotal, setAvaliacaoTotal] = useState(0)
  useEffect(() => {
    if (!colaborador?.id) return
    supabase.from('avaliacoes').select('nota').eq('colaborador_id', colaborador.id)
      .then(({ data }) => {
        if (data && data.length > 0) {
          const media = data.reduce((s, a) => s + a.nota, 0) / data.length
          setAvaliacaoMedia(Math.round(media * 10) / 10)
          setAvaliacaoTotal(data.length)
        } else {
          setAvaliacaoMedia(0)
          setAvaliacaoTotal(0)
        }
      })
  }, [colaborador?.id])

  // Nexus AI
  const [nexusLoading, setNexusLoading] = useState(false)
  const [nexusResponse, setNexusResponse] = useState<string | null>(null)
  const [nexusProductPicker, setNexusProductPicker] = useState(false)

  // Melhorar mensagem com IA
  const handleMelhorarIA = useCallback(async () => {
    if (!messageInput.trim() || !selectedTicket?.setor_id || melhorandoIA) return
    setMelhorandoIA(true)
    try {
      const res = await fetch('/api/ia/melhorar-mensagem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mensagem: messageInput, setor_id: selectedTicket.setor_id }),
      })
      const data = await res.json()
      if (res.ok && data.mensagem_melhorada) {
        setMessageInput(data.mensagem_melhorada)
      } else {
        console.warn('[WorkDesk] IA error:', data.error)
      }
    } catch (err) {
      console.error('[WorkDesk] IA fetch error:', err)
    } finally {
      setMelhorandoIA(false)
    }
  }, [messageInput, selectedTicket?.setor_id, melhorandoIA])

  // Consultar Nexus AI com histórico da conversa
  const handleNexusAjuda = useCallback(async (productSlug: string) => {
    if (nexusLoading || !selectedTicket) return
    setNexusProductPicker(false)
    setNexusLoading(true)
    setNexusResponse(null)
    try {
      const msgs = mensagens.filter(m => m.remetente !== 'sistema' && m.conteudo && m.ticket_id === selectedTicket.id)
      const history = msgs.slice(-20).map(m => ({
        role: m.remetente === 'cliente' ? 'user' as const : 'assistant' as const,
        content: m.conteudo
      }))
      const lastClientMsg = [...msgs].reverse().find(m => m.remetente === 'cliente')
      const message = lastClientMsg?.conteudo || msgs[msgs.length - 1]?.conteudo || ''

      const res = await fetch('/api/ia/nexus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          productSlug,
          history: history.slice(0, -1),
        }),
      })
      const data = await res.json()
      if (res.ok && data.response) {
        setNexusResponse(data.response)
      } else {
        console.warn('[Nexus] Error:', data)
      }
    } catch (err) {
      console.error('[Nexus] Fetch error:', err)
    } finally {
      setNexusLoading(false)
    }
  }, [nexusLoading, selectedTicket, mensagens])

  const [pendingMessages, setPendingMessages] = useState<Map<string, 'sending' | 'sent' | 'error'>>(new Map())
  // Mensagens que falharam ao enviar — mapeia messageId → texto amigável do erro
  const [messageErrors, setMessageErrors] = useState<Map<string, string>>(new Map())
  // Lock de idempotência client-side: evita disparar dois retries simultâneos da mesma mensagem.
  const retryingMessageIdsRef = useRef<Set<string>>(new Set())
  const reconciledStaleSendClaimsRef = useRef<Set<string>>(new Set())
  const staleSendTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const [retryConfirmationMessage, setRetryConfirmationMessage] = useState<Mensagem | null>(null)
  
  // File upload (images and PDFs)
  // Multiple attachments — like WhatsApp, each file becomes its own message
  // (the channels deliver one media per message). `preview` is a blob: URL for
  // images, or a `video:`/`file:` marker for everything else.
  const [attachments, setAttachments] = useState<{ id: string; file: File; preview: string }[]>([])
  const [uploadingFile, setUploadingFile] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const messageTextareaRef = useRef<HTMLTextAreaElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const mobileMessagesViewportRef = useRef<HTMLDivElement>(null)
  const devePosicionarNoInicioDoTicketMobileRef = useRef(false)

  // Voice recording (PTT) state — uses opus-recorder to produce ogg/opus directly
  // (Chrome's native MediaRecorder only emits webm/opus, which Meta Cloud API silently rejects).
  const [isRecording, setIsRecording] = useState(false)
  const [recordingDuration, setRecordingDuration] = useState(0)
  const opusRecorderRef = useRef<any>(null)
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // Ref to handleSendMessage so the recorder's onstop closure always calls
  // the latest version (avoids stale state if user typed/switched ticket).
  const handleSendMessageRef = useRef<((overrideFile?: File | null) => Promise<void>) | null>(null)
  // Reply target — when set, the next outgoing message becomes a quoted reply
  // to this mensagem. UI shows a preview bar above the textarea.
  const [replyingTo, setReplyingTo] = useState<Mensagem | null>(null)

  // Recorded audio awaiting preview/confirmation before send.
  const [recordedAudio, setRecordedAudio] = useState<File | null>(null)
  /** Rascunho não enviado de cada ticket, para sobreviver à troca de conversa. */
  const rascunhosRef = useRef<Map<string, string>>(new Map())
  const ticketDoRascunhoRef = useRef<string | null>(null)
  const recordedAudioUrl = useMemo(
    () => (recordedAudio ? URL.createObjectURL(recordedAudio) : null),
    [recordedAudio],
  )
  useEffect(() => {
    return () => {
      if (recordedAudioUrl) URL.revokeObjectURL(recordedAudioUrl)
    }
  }, [recordedAudioUrl])

  // Auto-resize textarea quando messageInput muda (colar, limpar, IA)
  useEffect(() => {
    const t = messageTextareaRef.current
    if (t) { t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 120) + 'px' }
  }, [messageInput])
  
  // Templates
  const [templates, setTemplates] = useState<any[]>([])
  const [showTemplates, setShowTemplates] = useState(false)
  const [filteredTemplates, setFilteredTemplates] = useState<any[]>([])
  
  // 24h window check
  const [isWindowExpired, setIsWindowExpired] = useState(false)
  const [lastMessageTime, setLastMessageTime] = useState<Date | null>(null)
  
  // Disparo state
  const [disparoDialogOpen, setDisparoDialogOpen] = useState(false)
  // Documento do cliente no disparo: CNPJ ou CPF (MEI)
  const [disparoDocumento, setDisparoDocumento] = useState('')
  const [disparoTelefone, setDisparoTelefone] = useState('')
  const [disparoCliente, setDisparoCliente] = useState<any>(null)
  const [disparoLoading, setDisparoLoading] = useState(false)
  const [disparoSending, setDisparoSending] = useState(false)
  const [disparoStep, setDisparoStep] = useState<'documento' | 'telefone' | 'canal' | 'setor_evolution' | 'mensagem_evolution' | 'setor_whatsapp'>('documento')
  const [disparoLimitBlocked, setDisparoLimitBlocked] = useState(false)
  const [disparoLimitInfo, setDisparoLimitInfo] = useState('')
  const [disparoCanalChoice, setDisparoCanalChoice] = useState<'whatsapp' | 'evolution_api'>('whatsapp')
  const [disparoMensagemEvolution, setDisparoMensagemEvolution] = useState('')
  const [disparoSetorEvolutionId, setDisparoSetorEvolutionId] = useState<string>('')
  const [disparoSetoresEvolution, setDisparoSetoresEvolution] = useState<Array<{ id: string; nome: string; instancia: string; online: 'online' | 'offline' | 'loading' | 'unknown' }>>([])
  const [disparoSetorWhatsappId, setDisparoSetorWhatsappId] = useState<string>('')
  const [disparoSetoresWhatsapp, setDisparoSetoresWhatsapp] = useState<Array<{ id: string; nome: string }>>([])
  // Descrição do diálogo de disparo. O primeiro passo não tem texto: o rótulo do
  // campo já diz o que informar, e a frase só repetia. Continua existindo para
  // leitor de tela, porque o diálogo precisa de descrição acessível.
  const disparoDescricao = disparoStep === 'canal'
    ? 'Escolha por qual canal deseja enviar o disparo.'
    : disparoStep === 'setor_evolution' || disparoStep === 'setor_whatsapp'
      ? 'Escolha de qual setor o disparo será enviado.'
      : disparoStep === 'mensagem_evolution'
        ? 'Escreva a mensagem de abertura para o atendimento via WhatsApp não oficial.'
        : ''
  const [setorCanalConfig, setSetorCanalConfig] = useState<'whatsapp' | 'discord' | 'evolution_api'>('whatsapp')
  const [setorCanaisAtivos, setSetorCanaisAtivos] = useState<string[]>([])
  const [travarOrdenacaoPorSetor, setTravarOrdenacaoPorSetor] = useState<Map<string, boolean>>(new Map())
  const travarOrdenacaoPorSetorRef = useRef<Map<string, boolean>>(new Map())
  const travarOrdenacaoRequestIdRef = useRef(0)
  const travarOrdenacaoRequestPorSetorRef = useRef<Map<string, number>>(new Map())

  const applyTravarOrdenacaoPorSetor = useCallback((next: Map<string, boolean>) => {
    if (areSetorSortConfigsEqual(travarOrdenacaoPorSetorRef.current, next)) return
    travarOrdenacaoPorSetorRef.current = next
    setTravarOrdenacaoPorSetor(next)
  }, [])

  const loadTravarOrdenacaoPorSetor = useCallback(async (
    setorIds: (string | null | undefined)[],
  ): Promise<ReadonlyMap<string, boolean>> => {
    const idsUnicos = Array.from(new Set(setorIds.filter((id): id is string => !!id)))
    if (idsUnicos.length === 0) return travarOrdenacaoPorSetorRef.current

    const requestId = ++travarOrdenacaoRequestIdRef.current
    for (const id of idsUnicos) {
      travarOrdenacaoRequestPorSetorRef.current.set(id, requestId)
    }

    const { data, error } = await supabase
      .from('setores')
      .select('id, travar_ordenacao_chat')
      .in('id', idsUnicos)

    if (error) return travarOrdenacaoPorSetorRef.current

    const resultBySetor = new Map((data || []).map(
      (setor) => [setor.id, setor.travar_ordenacao_chat === true],
    ))
    const next = new Map(travarOrdenacaoPorSetorRef.current)
    for (const id of idsUnicos) {
      if (travarOrdenacaoRequestPorSetorRef.current.get(id) !== requestId) continue
      next.set(id, resultBySetor.get(id) === true)
    }
    applyTravarOrdenacaoPorSetor(next)
    return next
  }, [applyTravarOrdenacaoPorSetor, supabase])

  useEffect(() => {
    setTickets((current) => sortTicketsBySetorConfig(current, travarOrdenacaoPorSetor))
  }, [travarOrdenacaoPorSetor])

  useEffect(() => {
    const channel = supabase
      .channel('workdesk-ticket-sort-config')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'setores' },
        (payload) => {
          const setor = payload.new as { id?: string; travar_ordenacao_chat?: boolean | null }
          if (!setor.id || !travarOrdenacaoPorSetorRef.current.has(setor.id)) return
          const realtimeRequestId = ++travarOrdenacaoRequestIdRef.current
          travarOrdenacaoRequestPorSetorRef.current.set(setor.id, realtimeRequestId)
          const next = new Map(travarOrdenacaoPorSetorRef.current)
          next.set(setor.id, setor.travar_ordenacao_chat === true)
          applyTravarOrdenacaoPorSetor(next)
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [applyTravarOrdenacaoPorSetor, supabase])
  
  // Unread messages tracking
  // Histórico de atendimentos anteriores do cliente — exibido no sidebar direito.
  // Recarrega quando troca de ticket. Inclui todos os tickets do cliente (e dos
  // clientes com mesmo telefone — caso de registros duplicados) exceto o atual.
  type TicketHistoryEntry = {
    id: string
    numero: number | null
    criado_em: string
    encerrado_em: string | null
    status: string
    colaborador_nome: string | null
  }
  const [ticketHistory, setTicketHistory] = useState<TicketHistoryEntry[]>([])
  // Derivado do histórico que já é carregado ao selecionar o ticket — sem
  // consulta extra. O histórico cobre cadastros duplicados do mesmo telefone.
  const outrosAtendimentosAbertos = useMemo(
    () => ticketsAbertos(ticketHistory),
    [ticketHistory],
  )
  const outrosAtendimentesResumo = useMemo(
    () => outrosAtendimentosAbertos
      .map((t) => `#${t.numero ?? '—'}${t.colaborador_nome ? ` (${t.colaborador_nome})` : ' (na fila)'}`)
      .join(', '),
    [outrosAtendimentosAbertos],
  )
  const [loadingHistory, setLoadingHistory] = useState(false)
  // Conversa de um atendimento anterior aberta em modal (somente leitura).
  const [historicoConversa, setHistoricoConversa] = useState<TicketHistoryEntry | null>(null)
  const [historicoConversaMsgs, setHistoricoConversaMsgs] = useState<Mensagem[]>([])
  const [historicoConversaLoading, setHistoricoConversaLoading] = useState(false)
  const historicoScrollRef = useRef<HTMLDivElement>(null)

  // Aba ativa da sidebar direita. Sempre inicia em "Informações" ao carregar
  // a página — não persiste entre sessões (escolha consciente do usuário).
  type InfoTab = 'info' | 'historico'
  const [infoTab, setInfoTab] = useState<InfoTab>('info')

  // Seções da sidebar direita são colapsáveis e o estado persiste em localStorage.
  // Default: 'historico' começa fechada (lista longa, não-essencial); as demais abertas.
  const SIDEBAR_COLLAPSED_KEY = 'workdesk-sidebar-collapsed-v1'
  type SidebarSection = 'cliente' | 'ticket' | 'historico'
  const [collapsedSections, setCollapsedSections] = useState<Record<SidebarSection, boolean>>(() => {
    const defaults: Record<SidebarSection, boolean> = { cliente: false, ticket: false, historico: true }
    if (typeof window === 'undefined') return defaults
    try {
      const raw = localStorage.getItem(SIDEBAR_COLLAPSED_KEY)
      if (!raw) return defaults
      return { ...defaults, ...JSON.parse(raw) }
    } catch {
      return defaults
    }
  })
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, JSON.stringify(collapsedSections))
    } catch {
      // Ignore quota
    }
  }, [collapsedSections])
  const toggleSection = (key: SidebarSection) => {
    setCollapsedSections((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const [unreadCounts, setUnreadCounts] = useState<Map<string, number>>(new Map())
  // Timestamp da PRIMEIRA mensagem do cliente AINDA SEM RESPOSTA do colaborador.
  // Define o âncora do timer de urgência no card. Persiste mesmo após o
  // atendente abrir o ticket — só zera quando o colaborador efetivamente
  // envia uma resposta (handleSendMessage limpa o entry).
  const [firstUnreadAt, setFirstUnreadAt] = useState<Map<string, string>>(new Map())

  // Selecionar cliente dialog
  const [selecionarClienteDialogOpen, setSelecionarClienteDialogOpen] = useState(false)
  const [selecionarClienteCnpj, setSelecionarClienteCnpj] = useState('')
  const [selecionarClienteData, setSelecionarClienteData] = useState<ClienteSelecionado | null>(null)
  const [selecionarClienteLoading, setSelecionarClienteLoading] = useState(false)
  const [vinculandoCliente, setVinculandoCliente] = useState(false)
  const [encerrarAposVinculoCliente, setEncerrarAposVinculoCliente] = useState(false)
  const [clienteNaoInformadoDialogOpen, setClienteNaoInformadoDialogOpen] = useState(false)

  // Editar dados do cliente
  const [editarClienteDialogOpen, setEditarClienteDialogOpen] = useState(false)
  const [editarClienteForm, setEditarClienteForm] = useState({ nome: '', telefone: '', CNPJ: '', Registro: '', PDV: '' })
  const [editarClienteLoading, setEditarClienteLoading] = useState(false)

  // Meus subsetores ativos (seleção do próprio atendente)
  const [meusSubsetorIds, setMeusSubsetorIds] = useState<string[]>([])
  const [subsetorPickerOpen, setSubsetorPickerOpen] = useState(false)
  const [togglingSubsetor, setTogglingSubsetor] = useState(false)

  // Fetch colaborador atual
  const fetchColaborador = useCallback(async () => {
    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser()

      // If session is invalid, redirect to login
      if (authError || !user) {
        // Clear any stale session and redirect
        await supabase.auth.signOut()
        window.location.href = '/login'
        return null
      }

      const { data: colab } = await supabase
        .from('colaboradores')
        .select(
          '*, permissoes(can_see_all_tickets), setores_vinculados:colaboradores_setores(setor_id, setores(id, nome, cor))'
        )
        .eq('email', user.email)
        .single()

  if (colab) {
  setColaborador(colab)
  // Salvar info do colaborador para o error logger
  try { localStorage.setItem('colaborador_info', JSON.stringify({ id: colab.id, nome: colab.nome })) } catch {}
  // Fetch setor canal config (do primeiro setor — mantém legacy pra outros usos)
  const sId = colab.setor_id || colab.setores_vinculados?.[0]?.setor_id
  if (sId) {
    const { data: setorInfo } = await supabase.from('setores').select('canal').eq('id', sId).single()
    if (setorInfo?.canal) setSetorCanalConfig(setorInfo.canal)
  }
  // Canais ATIVOS considerando TODOS os setores do colab (não só o [0]).
  // Antes só lia do setor[0], então um colab em [SDM-só-whatsapp, Cuiabá-só-evolution]
  // tinha setorCanaisAtivos=['whatsapp'] e nem via a opção "Não Oficial" no disparo.
  const allSetorIds = (colab.setores_vinculados || []).map((s: any) => s.setor_id)
  if (colab.setor_id && !allSetorIds.includes(colab.setor_id)) allSetorIds.push(colab.setor_id)
  void loadTravarOrdenacaoPorSetor(allSetorIds)
  if (allSetorIds.length > 0) {
    const { data: canaisAtivos } = await supabase
      .from('setor_canais')
      .select('tipo')
      .in('setor_id', allSetorIds)
      .eq('ativo', true)
    if (canaisAtivos && canaisAtivos.length > 0) {
      setSetorCanaisAtivos(Array.from(new Set(canaisAtivos.map((c: any) => c.tipo))))
    }
  }
  return colab
  }
      return null
    } catch (error) {
      console.error('Error fetching colaborador:', error)
      // On any auth error, redirect to login
      window.location.href = '/login'
      return null
    }
  }, [loadTravarOrdenacaoPorSetor, supabase])

// Fetch tickets - colaborador only sees tickets assigned to them
  const fetchTickets = useCallback(async (colab: Colaborador) => {
    const runQuery = () => supabase
      .from('tickets')
      .select('*, numero, clientes(*), setores!tickets_setor_id_fkey(id, nome, cor, canal, tempo_espera_minutos), subsetores(id, nome)')
      .in('status', ['aberto', 'em_atendimento'])
      .order('criado_em', { ascending: false })
      // ALWAYS filter by colaborador_id - each atendente only sees their own tickets
      .eq('colaborador_id', colab.id)

    let { data, error } = await runQuery()

    // Retry único em erro de rede transitória (Failed to fetch, NetworkError, etc.)
    const isTransientNetworkError = (msg?: string) =>
      !!msg && (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('Load failed'))

    if (error && isTransientNetworkError(error.message)) {
      await new Promise(r => setTimeout(r, 500))
      const retry = await runQuery()
      data = retry.data
      error = retry.error
    }

    if (error) {
      console.warn('[WorkDesk] fetchTickets error:', error.message, error.code)
      // Ruído de rede transitória não vai para error_logs (já filtrado em logError,
      // mas evitamos até a chamada para economizar).
      if (!isTransientNetworkError(error.message)) {
        logError({
          tela: 'WorkDesk',
          error: `fetchTickets: ${error.message}`,
          componente: 'fetchTickets',
          metadata: { type: 'supabase_error', code: error.code, colaboradorId: colab.id, ticketId: selectedTicketIdRef.current },
        })
      }
      // If auth error, try to refresh session
      if (error.code === 'PGRST301' || error.message?.includes('JWT') || error.code === '401') {
        console.warn('[WorkDesk] Auth error detected, refreshing session...')
        await supabase.auth.getUser()
      }
      return
    }

    if (data) {
      // Filter out tickets that are currently being transferred
      const filteredData = data.filter((t) => !transferringTicketIdsRef.current.has(t.id))
      // Fetch last message for all tickets in a single batch query (evita N+1)
      const ticketIds = filteredData.map((t) => t.id)
      let lastMsgMap = new Map<string, { conteudo: string; enviado_em: string; remetente: string; tipo: string | null }>()
      // Para cada ticket onde a última msg foi do cliente, achar a MAIS ANTIGA
      // mensagem do cliente na "rajada" final (sem colaborador depois). Esse
      // timestamp é o ponto de partida do tempo de espera mostrado no card.
      const firstUnreadSeed = new Map<string, string>()
      if (ticketIds.length > 0) {
        const { data: allLastMsgs } = await supabase
          .from('mensagens')
          .select('ticket_id, conteudo, enviado_em, remetente, tipo')
          .in('ticket_id', ticketIds)
          .order('enviado_em', { ascending: false })
        if (allLastMsgs) {
          // Manter apenas a mensagem mais recente por ticket_id
          for (const msg of allLastMsgs) {
            if (!lastMsgMap.has(msg.ticket_id)) {
              lastMsgMap.set(msg.ticket_id, msg)
            }
          }
          // Walk DESC. A rajada termina quando bate em msg do colaborador/bot/sistema.
          // O âncora final fica na MAIS ANTIGA msg do cliente da rajada — i.e.
          // a primeira msg sem resposta.
          const burstEnded = new Set<string>()
          for (const msg of allLastMsgs) {
            if (burstEnded.has(msg.ticket_id)) continue
            if (msg.remetente === 'cliente') {
              firstUnreadSeed.set(msg.ticket_id, msg.enviado_em)
            } else {
              burstEnded.add(msg.ticket_id)
            }
          }
        }
      }
      // Sincroniza com o seed: adiciona ticks que o realtime ainda não pegou,
      // mas TAMBÉM remove tickets onde o colab já respondeu (rajada vazia no
      // seed → cliente não está mais aguardando). Sem essa limpeza, entradas
      // ficariam grudadas após uma resposta feita por outra origem (API direta,
      // outro atendente, retry).
      setFirstUnreadAt((prev) => {
        const next = new Map(prev)
        for (const tid of ticketIds) {
          if (firstUnreadSeed.has(tid)) {
            if (!next.has(tid)) next.set(tid, firstUnreadSeed.get(tid)!)
          } else {
            next.delete(tid)
          }
        }
        return next
      })
      const ticketsWithMessages = filteredData.map((ticket) => {
        const lastMsg = lastMsgMap.get(ticket.id)
        return {
          ...ticket,
          ultima_mensagem: lastMsg?.conteudo || 'Sem mensagens',
          ultima_mensagem_em: lastMsg?.enviado_em || ticket.criado_em,
          ultima_mensagem_remetente: lastMsg?.remetente || null,
          ultima_mensagem_tipo: lastMsg?.tipo || null,
        }
      })
      const sortConfig = await loadTravarOrdenacaoPorSetor(
        ticketsWithMessages.map((ticket) => ticket.setor_id),
      )
      const sortedTickets = sortTicketsBySetorConfig(ticketsWithMessages, sortConfig)
      setTickets(sortedTickets)

      // Keep selectedTicket data in sync without losing focus
      // Mas NÃO sobrescreve se acabamos de trocar o cliente (clienteSwapTicketIdRef)
      if (selectedTicketIdRef.current) {
        const updatedSelected = sortedTickets.find((t) => t.id === selectedTicketIdRef.current)
        if (updatedSelected) {
          if (clienteSwapTicketIdRef.current === updatedSelected.id) {
            // Preserva os dados do cliente que acabamos de trocar manualmente
            setSelectedTicket((prev) => prev ? {
              ...updatedSelected,
              cliente_id: prev.cliente_id,
              clientes: prev.clientes,
            } : updatedSelected)
            // Também preserva na lista
            setTickets((prev) => prev.map((t) =>
              t.id === updatedSelected.id
                ? { ...updatedSelected, cliente_id: t.cliente_id, clientes: t.clientes }
                : t
            ))
          } else {
            setSelectedTicket(updatedSelected)
          }
        }
      }
    }
  }, [loadTravarOrdenacaoPorSetor, supabase])

  // Fetch contagem de clientes em fila nos setores ATIVOS do colaborador.
  // "Em fila" = ticket aberto, sem colaborador atribuído, em um setor que o
  // atendente está vinculado E ativo (setores_ativos_sessao). Setor desativado
  // pelo admin não conta na fila (mesmo se o atendente está vinculado a ele).
  const fetchFilaCount = useCallback(async (colab: Colaborador) => {
    const vinculados = (colab.setores_vinculados || []).map((s) => s.setor_id)
    if (colab.setor_id && !vinculados.includes(colab.setor_id)) vinculados.push(colab.setor_id)
    const ativos = Array.isArray(colab.setores_ativos_sessao) ? colab.setores_ativos_sessao : []
    // Interseção: só conta fila dos setores que estão ativos pra esse atendente
    const setorIds = vinculados.filter((s) => ativos.includes(s))
    if (setorIds.length === 0) {
      setFilaCount(0)
      return
    }
    // Traz as linhas em vez de só contar, para saber em qual subsetor cada um
    // aguarda. A fila é curta por natureza (ticket aberto e sem atendente), então
    // o custo é o mesmo de um count.
    const { data, error } = await supabase
      .from('tickets')
      .select('id, subsetor_id, setor_id, subsetores(nome), setores!tickets_setor_id_fkey(nome)')
      .eq('status', 'aberto')
      .is('colaborador_id', null)
      .in('setor_id', setorIds)
    if (error) return

    const fila = data || []
    setFilaCount(fila.length)

    const porSubsetor = new Map<string, number>()
    for (const t of fila as any[]) {
      const setorNome = t.setores?.nome || 'Setor'
      const rotulo = t.subsetores?.nome
        ? `${setorNome} · ${t.subsetores.nome}`
        : `${setorNome} · Sem subsetor`
      porSubsetor.set(rotulo, (porSubsetor.get(rotulo) || 0) + 1)
    }
    setFilaPorSubsetor(
      [...porSubsetor.entries()]
        .map(([rotulo, total]) => ({ rotulo, total }))
        .sort((a, b) => b.total - a.total || a.rotulo.localeCompare(b.rotulo)),
    )
  }, [supabase])

  // Puxa o próximo ticket da fila ignorando o limite max_tickets_per_agent do setor.
  // Usado pelo botão "Puxar próximo" — atendente assume o ticket mais antigo da fila
  // mesmo já estando no teto definido pelo setor.
  const handlePuxarTicket = useCallback(async () => {
    if (!colaborador?.id || puxandoTicket) return
    setPuxandoTicket(true)
    try {
      const res = await fetch('/api/tickets/pull-next', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ colaboradorId: colaborador.id }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data?.success) {
        toast.success('Ticket adicionado ao seu atendimento')
        // Atualiza tickets e contador na hora — realtime também vai disparar, mas isso
        // garante feedback imediato.
        const colab = colaboradorCurrentRef.current
        if (colab) {
          fetchTickets(colab)
          fetchFilaCount(colab)
        }
      } else {
        const msg = data?.error || 'Não foi possível puxar um ticket'
        toast.error(msg)
      }
    } catch (err) {
      console.error('[handlePuxarTicket] erro:', err)
      toast.error('Erro de rede ao puxar ticket')
    } finally {
      setPuxandoTicket(false)
    }
  }, [colaborador?.id, puxandoTicket, fetchTickets, fetchFilaCount])

  // Fetch subsetores for the colaborador's setores
  const fetchSubsetoresDisponiveis = useCallback(async (colab: Colaborador) => {
    if (!colab.setores_vinculados || colab.setores_vinculados.length === 0) {
      setSubsetoresDisponiveis([])
      return
    }
    
    const setorIds = colab.setores_vinculados.map((s: ColaboradorSetor) => s.setor_id)
    const { data } = await supabase
      .from('subsetores')
      .select('id, nome, setor_id')
      .in('setor_id', setorIds)
      .eq('ativo', true)
      .order('nome')
    
    if (data) {
      setSubsetoresDisponiveis(data)
    }
  }, [supabase])

  // Fetch subsetores onde o colaborador está ativo (colaboradores_subsetores)
  const fetchMeusSubsetores = useCallback(async (colab: Colaborador) => {
    const { data } = await supabase
      .from('colaboradores_subsetores')
      .select('subsetor_id')
      .eq('colaborador_id', colab.id)
    setMeusSubsetorIds(data?.map((d: any) => d.subsetor_id) || [])
  }, [supabase])

// Fetch messages for selected ticket (including client history from today only)
  const fetchMensagens = useCallback(
    async (ticketId: string, clienteId: string, ticketCriadoEm: string, options?: { silent?: boolean }) => {
      if (!options?.silent) setLoadingMensagens(true)

      // Janela relativa ao criado_em do ticket (24h antes), não à meia-noite
      // do momento atual — um ticket aberto logo após meia-noite precisa
      // enxergar a conversa do Nexus de antes dela.
      const inicioJanelaHistorico = calcularInicioJanelaHistoricoIso(ticketCriadoEm)

      // Resolve all cliente_ids with the same phone number (handles duplicate records)
      let allClienteIds = [clienteId]
      const { data: clienteData } = await supabase
        .from('clientes')
        .select('telefone')
        .eq('id', clienteId)
        .single()

      if (clienteData?.telefone) {
        const { data: allClientes } = await supabase
          .from('clientes')
          .select('id')
          .eq('telefone', clienteData.telefone)

        if (allClientes && allClientes.length > 0) {
          allClienteIds = [...new Set(allClientes.map(c => c.id))]
        }
      }

      // Query 1: All messages from current ticket (always reliable)
      const { data: ticketMsgs, error: err1 } = await supabase
        .from('mensagens')
        .select('*, tickets(id, status, criado_em, encerrado_em)')
        .eq('ticket_id', ticketId)
        .order('enviado_em', { ascending: true, nullsFirst: false })

      // Query 2: Messages from OTHER tickets of the same client (24h before this ticket's creation)
      const { data: otherTicketMsgs, error: err2 } = await supabase
        .from('mensagens')
        .select('*, tickets(id, status, criado_em, encerrado_em)')
        .in('cliente_id', allClienteIds)
        .neq('ticket_id', ticketId)
        .not('ticket_id', 'is', null)
        .gte('enviado_em', inicioJanelaHistorico)
        .order('enviado_em', { ascending: true, nullsFirst: false })

      // Query 3: Orphan messages (ticket_id IS NULL) — bot conversations before ticket creation
      const { data: orphanMsgs, error: err3 } = await supabase
        .from('mensagens')
        .select('*')
        .in('cliente_id', allClienteIds)
        .is('ticket_id', null)
        .gte('enviado_em', inicioJanelaHistorico)
        .order('enviado_em', { ascending: true, nullsFirst: false })

      console.log('[fetchMensagens] Q1 ticketMsgs:', ticketMsgs?.length, err1 ? `ERR: ${JSON.stringify(err1)}` : 'OK')
      console.log('[fetchMensagens] Q2 otherTicketMsgs:', otherTicketMsgs?.length, err2 ? `ERR: ${JSON.stringify(err2)}` : 'OK')
      console.log('[fetchMensagens] Q3 orphanMsgs:', orphanMsgs?.length, err3 ? `ERR: ${JSON.stringify(err3)}` : 'OK')
      console.log('[fetchMensagens] allClienteIds:', allClienteIds)

      // Merge all 3 queries, deduplicate by id, and sort chronologically
      const allMsgs = [...(ticketMsgs || []), ...(otherTicketMsgs || []), ...(orphanMsgs || [])]
      const seen = new Set<string>()
      const merged = allMsgs.filter(m => {
        if (seen.has(m.id)) return false
        seen.add(m.id)
        return true
      })
      merged.sort((a, b) => {
        if (!a.enviado_em) return -1
        if (!b.enviado_em) return 1
        return new Date(a.enviado_em).getTime() - new Date(b.enviado_em).getTime()
      })

      const data = merged.length > 0 ? merged : null

      if (data) {
        // Hydrate reply_parent — find each reply's quoted parent inside the
        // already-loaded set. Most parents are in the same conversation so
        // no extra query is needed. Falls back to null for parents not loaded.
        const byId = new Map(data.map((m) => [m.id, m] as const))
        const hydrated = data.map((m) => {
          if (!m.reply_to_message_id) return m
          const parent = byId.get(m.reply_to_message_id)
          if (!parent) return m
          return {
            ...m,
            reply_parent: {
              id: parent.id,
              conteudo: parent.conteudo || '',
              remetente: parent.remetente,
              tipo: parent.tipo,
            },
          }
        })
        setMensagens(hydrated)

        // Check 24h window - only applies to WhatsApp channel
        // Discord has no 24h window limitation
if (setorCanalConfig === 'discord' || setorCanalConfig === 'evolution_api') {
  setIsWindowExpired(false)
  setLastMessageTime(null)
  } else {
        // WhatsApp 24h window starts from the last message the CLIENT sent, not bot/colaborador
        const currentTicketClientMessages = data.filter(
          (m) => m.ticket_id === ticketId && m.remetente === 'cliente'
        )
        if (currentTicketClientMessages.length > 0) {
          const lastClientMsg = currentTicketClientMessages[currentTicketClientMessages.length - 1]
          const lastTime = new Date(lastClientMsg.enviado_em)
          setLastMessageTime(lastTime)

          const now = new Date()
          const hoursDiff = (now.getTime() - lastTime.getTime()) / (1000 * 60 * 60)
          setIsWindowExpired(hoursDiff > 24)
        } else {
          // No client messages yet - for disparo tickets this is expected (locked state)
          // For normal tickets, don't expire the window
          setIsWindowExpired(false)
          setLastMessageTime(null)
        }
        }
      }
      setLoadingMensagens(false)
    },
    [supabase]
  )

  // Fetch templates for the setor
  const fetchTemplates = useCallback(async (setorId: string) => {
    const { data } = await supabase
      .from('templates_mensagem')
      .select('*')
      .eq('setor_id', setorId)
      .order('atalho')

    if (data) setTemplates(data)
  }, [supabase])

  // Initial load
  useEffect(() => {
    const init = async () => {
      const colab = await fetchColaborador()
      if (colab) {
        await fetchTickets(colab)
        await fetchSubsetoresDisponiveis(colab)
        await fetchMeusSubsetores(colab)
        await fetchFilaCount(colab)
      }
      setLoading(false)
    }
    init()
  }, [fetchColaborador, fetchTickets, fetchSubsetoresDisponiveis, fetchMeusSubsetores, fetchFilaCount])

  // Real-time subscription to sync colaborador status across all sessions/browsers
  useEffect(() => {
    if (!colaborador?.id) return

    const channel = supabase
      .channel(`colaborador-sync-${colaborador.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'colaboradores',
          filter: `id=eq.${colaborador.id}`,
        },
        (payload) => {
          const newData = payload.new as any
          // Update local state with the new status from database (single source of truth)
          setColaborador((prev) =>
            prev
              ? {
                  ...prev,
                  is_online: newData.is_online,
                }
              : null
          )
        }
      )
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          console.log('[WorkDesk] Colaborador sync subscription connected')
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn(`[WorkDesk] Colaborador sync subscription error: ${status}`, err)
          // Retry: remove canal para forçar remontagem do useEffect
          setTimeout(() => supabase.removeChannel(channel), 5000)
        }
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [colaborador?.id, supabase])

// Scroll to bottom of messages
  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      if (messagesContainerRef.current) {
        messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight
      }
    }, 100)
  }, [])

  /**
   * Guardado a cada rolagem, e lido DEPOIS que a lista já foi recriada.
   *
   * Medir na hora do efeito não serve: se a mensagem nova já entrou no DOM, o
   * `scrollHeight` cresceu e quem estava no fim aparece como se estivesse no
   * meio. O que decide é onde o atendente estava ANTES da atualização.
   */
  const acompanhandoOFimRef = useRef(true)
  // Ao abrir uma conversa que traz o histórico do Nexus, a referência útil
  // para o atendente é a abertura do ticket — não a primeira mensagem do bot.
  // Esta guarda é consumida uma única vez após o carregamento inicial.
  const devePosicionarNoInicioDoTicketRef = useRef(false)
  // Tickets cuja transição do bot para o humano o atendente já viu nesta
  // sessão. A partir da segunda abertura a conversa volta a abrir no fim.
  const ticketsJaPosicionadosRef = useRef<Set<string>>(new Set())

  const posicionarNoInicioDoTicket = useCallback(() => {
    const container = messagesContainerRef.current
    const ticketStart = container?.querySelector<HTMLElement>('[data-ticket-start]')
    if (!container || !ticketStart) return false

    const ticketId = selectedTicketIdRef.current
    const posicionar = () => {
      if (selectedTicketIdRef.current !== ticketId) return

      const currentContainer = messagesContainerRef.current
      const currentTicketStart = currentContainer?.querySelector<HTMLElement>('[data-ticket-start]')
      if (!currentContainer || !currentTicketStart) return

      currentTicketStart.scrollIntoView({ block: 'start', inline: 'nearest' })
      currentContainer.scrollTop = Math.max(0, currentContainer.scrollTop - 16)
    }

    // Imagens e as animações das bolhas podem alterar a altura logo depois da
    // primeira pintura. Reaplica apenas para o mesmo ticket, sem deslocar quem
    // já tiver aberto outra conversa nesse intervalo.
    posicionar()
    requestAnimationFrame(posicionar)
    window.setTimeout(posicionar, 180)
    return true
  }, [])

  const handleMessagesScroll = useCallback(() => {
    acompanhandoOFimRef.current = estaNoFimDaConversa(messagesContainerRef.current)
  }, [])

  // Load messages only when a DIFFERENT ticket is selected (by ID)
  // This prevents re-fetching when ticket data refreshes but same ticket is open
  const selectedTicketId = selectedTicket?.id || null
  const selectedClienteId = selectedTicket?.cliente_id || null
  const selectedTicketCriadoEm = selectedTicket?.criado_em || ''
  useEffect(() => {
  if (selectedTicketId && selectedClienteId) {
  fetchMensagens(selectedTicketId, selectedClienteId, selectedTicketCriadoEm)
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTicketId])

  // Carrega histórico de atendimentos anteriores do cliente quando o ticket muda.
  // Inclui tickets de todos os clientes que têm o mesmo telefone (lida com
  // registros duplicados criados via webhook ao longo do tempo).
  useEffect(() => {
    if (!selectedTicketId || !selectedClienteId) {
      setTicketHistory([])
      return
    }
    let cancelled = false
    ;(async () => {
      setLoadingHistory(true)
      try {
        // Resolve cliente_ids com o mesmo telefone (mesmo padrão usado em fetchMensagens)
        let allClienteIds = [selectedClienteId]
        const { data: clienteData } = await supabase
          .from('clientes')
          .select('telefone')
          .eq('id', selectedClienteId)
          .single()
        if (clienteData?.telefone) {
          const { data: allClientes } = await supabase
            .from('clientes')
            .select('id')
            .eq('telefone', clienteData.telefone)
          if (allClientes && allClientes.length > 0) {
            allClienteIds = [...new Set(allClientes.map((c) => c.id))]
          }
        }
        // Tickets anteriores: qualquer ticket dos clientes resolvidos, exceto o atual.
        const { data: pastTickets } = await supabase
          .from('tickets')
          .select('id, numero, criado_em, encerrado_em, status, colaboradores(nome)')
          .in('cliente_id', allClienteIds)
          .neq('id', selectedTicketId)
          .order('criado_em', { ascending: false })
          .limit(30)
        if (cancelled) return
        const mapped: TicketHistoryEntry[] = (pastTickets || []).map((t: any) => ({
          id: t.id,
          numero: t.numero,
          criado_em: t.criado_em,
          encerrado_em: t.encerrado_em,
          status: t.status,
          colaborador_nome: t.colaboradores?.nome ?? null,
        }))
        setTicketHistory(mapped)
      } catch (err) {
        console.warn('[workdesk] erro carregando histórico do cliente:', err)
        if (!cancelled) setTicketHistory([])
      } finally {
        if (!cancelled) setLoadingHistory(false)
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTicketId, selectedClienteId])

  // Abre a conversa de um atendimento anterior (somente leitura) em modal.
  const abrirHistoricoConversa = async (h: TicketHistoryEntry) => {
    setHistoricoConversa(h)
    setHistoricoConversaLoading(true)
    setHistoricoConversaMsgs([])
    try {
      // Sem paginar, um ticket longo vinha cortado em 1.000 e, como a ordem é
      // crescente, o que sumia eram justamente as mensagens mais recentes.
      const data = await loadRowsByPages(() => supabase
        .from('mensagens')
        .select('id, remetente, conteudo, tipo, enviado_em, url_imagem, media_type')
        .eq('ticket_id', h.id)
        .order('enviado_em', { ascending: true, nullsFirst: false })
        .order('id', { ascending: true }))
      setHistoricoConversaMsgs((data as unknown as Mensagem[]) || [])
    } catch (err) {
      console.warn('[workdesk] erro carregando conversa do histórico:', err)
    } finally {
      setHistoricoConversaLoading(false)
    }
  }

  // Ao carregar a conversa do histórico, começa rolada no final (mais recente).
  useEffect(() => {
    if (historicoConversaLoading || historicoConversaMsgs.length === 0) return
    const el = historicoScrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [historicoConversaMsgs, historicoConversaLoading])

  // A referência só existe depois de o React montar as mensagens. Usar layout
  // effect evita que a primeira pintura mostre o topo do histórico do Nexus e
  // o efeito comum de rolagem a substitua antes do atendente vê-la.
  useLayoutEffect(() => {
    if (mensagens.length === 0 || loadingMensagens) return
    if (!devePosicionarNoInicioDoTicketRef.current) return
    if (!posicionarNoInicioDoTicket()) return

    devePosicionarNoInicioDoTicketRef.current = false
    // Marca só depois de posicionar de fato: se o marcador ainda não estava no
    // DOM, `posicionarNoInicioDoTicket` devolve false e a conversa não chegou a
    // ser mostrada na transição — dar como vista aqui a mandaria para o fim.
    const ticketPosicionado = selectedTicketIdRef.current
    if (ticketPosicionado) ticketsJaPosicionadosRef.current.add(ticketPosicionado)
    acompanhandoOFimRef.current = false
  }, [mensagens, loadingMensagens, posicionarNoInicioDoTicket])

  useLayoutEffect(() => {
    if (!mobileDrawerOpen || mensagens.length === 0 || loadingMensagens) return
    if (!devePosicionarNoInicioDoTicketMobileRef.current) return

    const container = mobileMessagesViewportRef.current
    const inicioDoTicket = container?.querySelector<HTMLElement>('[data-ticket-start]')
      || container?.querySelector<HTMLElement>('[data-nexus-history-start]')
    devePosicionarNoInicioDoTicketMobileRef.current = false
    if (!container || !inicioDoTicket) return

    inicioDoTicket.scrollIntoView({ block: 'start', inline: 'nearest' })
    container.scrollTop = Math.max(0, container.scrollTop - 16)
    const ticketPosicionado = selectedTicketIdRef.current
    if (ticketPosicionado) ticketsJaPosicionadosRef.current.add(ticketPosicionado)
  }, [mensagens, loadingMensagens, mobileDrawerOpen])

  // Acompanha o fim da conversa — mas só de quem já estava no fim.
  //
  // `mensagens` é recriada a cada recibo de entrega ou de leitura, sem nenhuma
  // mensagem nova: um `.map()` basta para mudar a identidade do array e disparar
  // este efeito. Sem a guarda, o atendente que subiu para reler era puxado de
  // volta para baixo 100ms depois, sozinho.
  useEffect(() => {
    if (mensagens.length === 0 || loadingMensagens) return
    if (!acompanhandoOFimRef.current) return
    scrollToBottom()
  }, [mensagens, loadingMensagens, scrollToBottom])

  // Abrir outra conversa começa no fim, independente de onde a anterior parou.
  useEffect(() => {
    acompanhandoOFimRef.current = true
    devePosicionarNoInicioDoTicketRef.current = devePosicionarNoInicioDoTicket(
      selectedTicketId,
      ticketsJaPosicionadosRef.current,
    )
  }, [selectedTicketId])

// Real-time subscription for tickets
  // Track known ticket IDs to detect truly new arrivals
  const knownTicketIdsRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    knownTicketIdsRef.current = new Set(tickets.map(t => t.id))
  }, [tickets])

  useEffect(() => {
    if (!colaborador) return

    // Use colaboradorId (primitive) instead of colaborador (object) to prevent
    // subscription teardown/rebuild on every setColaborador call
    const colaboradorId = colaborador.id

    // Server-side filter by colaborador_id reduces realtime load dramatically.
    // Transfer-away from this colaborador (new.colaborador_id != me) is NOT delivered
    // by this subscription — that case is covered by the existing 30s pollTickets interval.
    const channel = supabase
      .channel(`tickets-changes-${colaboradorId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'tickets',
          filter: `colaborador_id=eq.${colaboradorId}`,
        },
        (payload) => {
          const newTicket = payload.new as any
          if (newTicket.colaborador_id === colaboradorId) {
            const colab = colaboradorCurrentRef.current
            playAlert('new_ticket')
            toast.info('Novo ticket recebido!')
            if (colab) fetchTickets(colab)
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'tickets',
          filter: `colaborador_id=eq.${colaboradorId}`,
        },
        (payload) => {
          const updatedTicket = payload.new as any
          const oldTicket = payload.old as any
          const colab = colaboradorCurrentRef.current

          // Skip realtime updates for tickets we're currently transferring
          if (transferringTicketIdsRef.current.has(updatedTicket.id)) {
            return
          }

          if (updatedTicket.colaborador_id === colaboradorId) {
            // If ticket was closed (encerrado) by another session/tab, close the panel
            if (updatedTicket.status === 'encerrado' && selectedTicketIdRef.current === updatedTicket.id) {
              setSelectedTicket(null)
              selectedTicketIdRef.current = null
              setMobileDrawerOpen(false)
              setMensagens([])
            }
            // Ticket was just assigned/transferred TO this colaborador
            const isNew = !knownTicketIdsRef.current.has(updatedTicket.id)
            if (isNew || (oldTicket.colaborador_id && oldTicket.colaborador_id !== colaboradorId)) {
              playAlert('new_ticket')
              toast.info('Novo ticket recebido!')
            }
            if (colab) fetchTickets(colab)
          } else if (oldTicket.colaborador_id === colaboradorId) {
            // Ticket was transferred AWAY from this colaborador
            setTickets((prev) => prev.filter((t) => t.id !== updatedTicket.id))
            if (selectedTicketIdRef.current === updatedTicket.id) {
              setSelectedTicket(null)
              selectedTicketIdRef.current = null
            }
          } else {
            // Other update on a ticket we own (status change, etc)
            if (knownTicketIdsRef.current.has(updatedTicket.id) && colab) {
              fetchTickets(colab)
            }
          }
        }
      )
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          console.log('[WorkDesk] Tickets realtime subscription connected')
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn(`[WorkDesk] Tickets realtime subscription error: ${status}`, err)
          // On error, try to re-subscribe after a short delay
          setTimeout(() => {
            supabase.removeChannel(channel)
          }, 5000)
        } else if (status === 'CLOSED') {
          console.warn('[WorkDesk] Tickets realtime subscription closed')
        }
      })

    return () => {
      supabase.removeChannel(channel)
    }
  // Use colaborador?.id (primitive) NOT colaborador (object) — prevents rebuilding
  // the subscription every time any colaborador field changes
  }, [colaborador?.id, fetchTickets, supabase, playAlert])

  // Realtime: contador de fila reage a tickets sem colaborador_id nos setores do atendente.
  // Filtro server-side em colaborador_id é unidirecional (não captura tickets sem dono),
  // então este canal escuta mudanças amplas em tickets e o handler decide se recalcula.
  // Debounce evita rajadas (várias inserções consecutivas → 1 recálculo).
  useEffect(() => {
    if (!colaborador?.id) return
    const setorIds = (colaborador.setores_vinculados || []).map((s) => s.setor_id)
    if (colaborador.setor_id && !setorIds.includes(colaborador.setor_id)) setorIds.push(colaborador.setor_id)
    if (setorIds.length === 0) return

    let debounceTimer: ReturnType<typeof setTimeout> | null = null
    const scheduleRefresh = () => {
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        const colab = colaboradorCurrentRef.current
        if (colab) fetchFilaCount(colab)
      }, 500)
    }

    const affectsQueue = (row: any) =>
      row && setorIds.includes(row.setor_id)

    const channel = supabase
      .channel(`fila-count-${colaborador.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'tickets' },
        (payload) => {
          if (affectsQueue(payload.new)) scheduleRefresh()
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'tickets' },
        (payload) => {
          // Recalcula se a mudança afeta algum setor do atendente
          if (affectsQueue(payload.new) || affectsQueue(payload.old)) scheduleRefresh()
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'tickets' },
        (payload) => {
          if (affectsQueue(payload.old)) scheduleRefresh()
        }
      )
      .subscribe((status, err) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn(`[WorkDesk] Fila count subscription error: ${status}`, err)
          setTimeout(() => supabase.removeChannel(channel), 5000)
        }
      })

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer)
      supabase.removeChannel(channel)
    }
  }, [colaborador?.id, colaborador?.setor_id, colaborador?.setores_vinculados, fetchFilaCount, supabase])

  // Refresh tickets + heartbeat when tab regains visibility
  // Browsers throttle setInterval in background tabs (Chrome: min 1x/min).
  // This ensures heartbeat is sent immediately on return + tickets are refreshed.
  useEffect(() => {
    if (!colaborador?.id) return
    const colaboradorId = colaborador.id

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        // Heartbeat imediato ao voltar foco — evita ficar "stale" no distribuidor
        fetch('/api/colaborador/heartbeat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ colaboradorId }),
        }).catch(() => {})

        // Refresh tickets imediato
        const colab = colaboradorCurrentRef.current
        if (colab) fetchTickets(colab)
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [colaborador?.id, fetchTickets])

  // ── Heartbeat simples — apenas atualiza last_heartbeat para monitoramento ──
  // O is_online é controlado EXCLUSIVAMENTE por ação do usuário (botão online/offline/pausa/logout).
  // NENHUMA lógica automática altera o status. Sem beforeunload, sem sendBeacon, sem stale checks.
  useEffect(() => {
    if (!colaborador?.id) return

    let isActive = true
    const colaboradorId = colaborador.id

    const sendHeartbeat = () => {
      if (!isActive) return
      fetch('/api/colaborador/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ colaboradorId }),
      }).catch(() => {})
    }

    const heartbeatInterval = setInterval(sendHeartbeat, 30000)
    const initialHeartbeatTimeout = setTimeout(sendHeartbeat, 2000)

    return () => {
      isActive = false
      clearInterval(heartbeatInterval)
      clearTimeout(initialHeartbeatTimeout)
    }
  }, [colaborador?.id])

  // Periodic ticket refresh + queue processor
  // Runs whenever colaborador.id is set — NOT gated on is_online.
  // Reason: the page's colaborador.is_online only updates via Realtime (colaboradores-sync).
  // If that Realtime event doesn't fire, is_online stays false and polling never starts,
  // causing tickets to only appear after F5. Using colaboradorCurrentRef ensures we always
  // read the latest status without rebuilding the interval on every status change.
  useEffect(() => {
    if (!colaborador?.id) return

    const colaboradorId = colaborador.id

    // Auto-assign: checks is_online directly from the DB via the API
    // instead of relying on local state that may be stale if Realtime disconnects.
    let autoAssignInFlight = false
    const triggerAutoAssign = async (attempt = 1) => {
      if (autoAssignInFlight) return // Prevent overlapping calls
      autoAssignInFlight = true

      const MAX_ATTEMPTS = 3
      const TIMEOUT_MS = 15000
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS)

      try {
        console.log(
          `[WorkDesk] Disparando auto-assign — colaborador: ${colaboradorId}, tentativa: ${attempt}/${MAX_ATTEMPTS}`
        )

        // The auto-assign API checks is_online in the DB (server-side via service role),
        // so we don't gate on the local is_online state which may be stale.
        const res = await fetch('/api/tickets/auto-assign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ colaboradorId }),
          signal: controller.signal,
        })

        clearTimeout(timeoutId)

        if (res.ok) {
          const data = await res.json().catch(() => ({}))
          console.log(
            `[WorkDesk] Auto-assign concluído — inQueue: ${data.stats?.ticketsInQueue ?? '?'}, assigned: ${data.stats?.ticketsAssigned ?? '?'}, elapsed: ${data.elapsed_ms ?? '?'}ms`
          )
          // Refresh tickets right after assignment
          const fresh = colaboradorCurrentRef.current
          if (fresh) {
            fetchTickets(fresh)
            fetchFilaCount(fresh)
          }
        } else {
          const errorText = await res.text().catch(() => 'sem body')
          console.warn(
            `[WorkDesk] Auto-assign HTTP error — status: ${res.status} ${res.statusText} — body: ${errorText}`
          )
          // Log no servidor
          fetch('/api/logs/error', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              tela: 'WorkDesk',
              rota: '/workdesk',
              componente: 'triggerAutoAssign',
              log: `Auto-assign HTTP error: ${res.status} ${res.statusText} — ${errorText}`,
              usuario_id: colaboradorId,
            }),
          }).catch(() => {})
        }
      } catch (error) {
        clearTimeout(timeoutId)

        const isAbort = error instanceof Error && error.name === 'AbortError'
        const errorMsg = error instanceof Error ? error.message : String(error)
        const errorType = isAbort ? 'TIMEOUT (AbortError após 15s)' : `NETWORK ERROR: ${errorMsg}`

        console.warn(`[WorkDesk] Auto-assign falhou — ${errorType} — tentativa: ${attempt}/${MAX_ATTEMPTS}`)

        // Retry com backoff (só em erros de rede, não em abort/timeout)
        if (!isAbort && attempt < MAX_ATTEMPTS) {
          const backoff = attempt * 2000
          console.log(`[WorkDesk] Auto-assign retry em ${backoff}ms...`)
          autoAssignInFlight = false
          await new Promise(resolve => setTimeout(resolve, backoff))
          return triggerAutoAssign(attempt + 1)
        }

        // Log no servidor após esgotar tentativas
        fetch('/api/logs/error', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tela: 'WorkDesk',
            rota: '/workdesk',
            componente: 'triggerAutoAssign',
            log: `Auto-assign falhou após ${attempt} tentativa(s): ${errorType}`,
            usuario_id: colaboradorId,
          }),
        }).catch(() => {})
      } finally {
        autoAssignInFlight = false
      }
    }

    // Poll tickets every 5 s regardless of online status
    // This guarantees that assignments made by the queue processor appear quickly
    // even if Realtime events are delayed or missed
    let pollInFlight = false
    const pollTickets = async () => {
      if (pollInFlight) return // Prevent overlapping polls
      pollInFlight = true
      try {
        const colab = colaboradorCurrentRef.current
        if (colab) {
          await fetchTickets(colab)
          await fetchFilaCount(colab)
        }
      } finally {
        pollInFlight = false
      }
    }

    // Also periodically sync is_online from DB to prevent stale local state
    // This catches the case where Realtime subscription for colaborador-sync failed
    const syncColaboradorStatus = async () => {
      try {
        const { data } = await supabase
          .from('colaboradores')
          .select('is_online, pausa_atual_id')
          .eq('id', colaboradorId)
          .single()
        if (data) {
          setColaborador((prev) =>
            prev ? { ...prev, is_online: data.is_online } : null
          )
        }
      } catch { /* ignore sync errors */ }
    }

    // Run immediately
    triggerAutoAssign()
    pollTickets()

    const autoAssignInterval = setInterval(triggerAutoAssign, 30000)
    const pollInterval = setInterval(pollTickets, 15000)
    const syncStatusInterval = setInterval(syncColaboradorStatus, 60000)

    // Periodically refresh Supabase auth session to prevent token expiry
    const refreshSession = async () => {
      try {
        await supabase.auth.getUser()
      } catch { /* ignore */ }
    }
    const sessionRefreshInterval = setInterval(refreshSession, 15 * 60 * 1000) // every 15 min — Supabase SDK renova tokens automaticamente

    return () => {
      clearInterval(autoAssignInterval)
      clearInterval(pollInterval)
      clearInterval(syncStatusInterval)
      clearInterval(sessionRefreshInterval)
    }
  // Only depend on colaborador.id — status changes go through colaboradorCurrentRef
  }, [colaborador?.id, fetchTickets, fetchFilaCount, supabase])

// Real-time subscription for messages of current ticket
  // Stable refs for realtime subscription
  const selectedTicketIdRef2 = selectedTicket?.id
  const selectedClienteIdRef = selectedTicket?.cliente_id
  const selectedTicketCriadoEmRef2 = selectedTicket?.criado_em

  useEffect(() => {
    if (!selectedTicketIdRef2 || !selectedClienteIdRef) return

    const handleNewMessage = (payload: any) => {
      const newMessage = payload.new as Mensagem
      setMensagens((prev) => {
        // Avoid duplicates (message might already exist from optimistic update)
        const exists = prev.some((m) => m.id === newMessage.id)
        if (exists) return prev

        // Also remove any temp messages that match this content
        const filtered = prev.filter((m) => {
          if (!m.id.startsWith('temp-')) return true
          return m.conteudo !== newMessage.conteudo
        })

        return [...filtered, newMessage]
      })
    }

    const handleUpdatedMessage = (payload: any) => {
      const updatedMessage = payload.new as Mensagem
      setMensagens((prev) => prev.map((message) =>
        message.id === updatedMessage.id ? { ...message, ...updatedMessage } : message
      ))

      if (!updatedMessage.status_envio) return

      setPendingMessages((prev) => {
        const next = new Map(prev)
        if (['pendente', 'enviando'].includes(updatedMessage.status_envio || '')) {
          next.set(updatedMessage.id, 'sending')
        } else {
          next.delete(updatedMessage.id)
        }
        return next
      })

      setMessageErrors((prev) => {
        const next = new Map(prev)
        if (
          ['falhou', 'indeterminado'].includes(updatedMessage.status_envio || '')
          && updatedMessage.erro_envio
        ) {
          next.set(updatedMessage.id, updatedMessage.erro_envio)
        } else {
          next.delete(updatedMessage.id)
        }
        return next
      })
    }

    // Subscribe to messages for this specific ticket
    const channel = supabase
      .channel(`mensagens-${selectedTicketIdRef2}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'mensagens',
          filter: `ticket_id=eq.${selectedTicketIdRef2}`,
        },
        handleNewMessage
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'mensagens',
          filter: `ticket_id=eq.${selectedTicketIdRef2}`,
        },
        handleUpdatedMessage
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'mensagens',
          filter: `cliente_id=eq.${selectedClienteIdRef}`,
        },
        handleNewMessage
      )
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          console.log('[WorkDesk] Messages subscription connected for ticket:', selectedTicketIdRef2)
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn(`[WorkDesk] Messages subscription error: ${status}`, err)
          setTimeout(() => supabase.removeChannel(channel), 5000)
        }
      })

    const refreshSelectedMessages = async () => {
      await fetchMensagens(selectedTicketIdRef2, selectedClienteIdRef, selectedTicketCriadoEmRef2 || '', { silent: true })
    }

    // Fallback polling to catch any missed messages (Realtime é o primário)
    const pollInterval = setInterval(async () => {
      if (!selectedTicketIdRef2) return
      // Mesma janela relativa ao criado_em do ticket usada em fetchMensagens —
      // não à meia-noite do momento atual.
      const inicioJanelaHistorico = calcularInicioJanelaHistoricoIso(selectedTicketCriadoEmRef2)

      // Resolve all cliente_ids with the same phone (handles duplicate client records)
      let pollClienteIds: string[] = selectedClienteIdRef ? [selectedClienteIdRef] : []
      if (selectedClienteIdRef) {
        const { data: cData } = await supabase
          .from('clientes')
          .select('telefone')
          .eq('id', selectedClienteIdRef)
          .single()
        if (cData?.telefone) {
          const { data: allC } = await supabase
            .from('clientes')
            .select('id')
            .eq('telefone', cData.telefone)
          if (allC && allC.length > 0) {
            pollClienteIds = [...new Set(allC.map(c => c.id))]
          }
        }
      }

      // Same 3-query approach as fetchMensagens
      const { data: ticketMsgs } = await supabase
        .from('mensagens')
        .select('*, tickets(id, status, criado_em, encerrado_em)')
        .eq('ticket_id', selectedTicketIdRef2)
        .order('enviado_em', { ascending: true, nullsFirst: false })

      // Messages from OTHER tickets of the same client
      const { data: otherTicketMsgs } = pollClienteIds.length > 0
        ? await supabase
            .from('mensagens')
            .select('*, tickets(id, status, criado_em, encerrado_em)')
            .in('cliente_id', pollClienteIds)
            .neq('ticket_id', selectedTicketIdRef2)
            .not('ticket_id', 'is', null)
            .gte('enviado_em', inicioJanelaHistorico)
            .order('enviado_em', { ascending: true, nullsFirst: false })
        : { data: [] }

      // Orphan messages (ticket_id IS NULL) — bot conversations
      const { data: orphanMsgs } = pollClienteIds.length > 0
        ? await supabase
            .from('mensagens')
            .select('*')
            .in('cliente_id', pollClienteIds)
            .is('ticket_id', null)
            .gte('enviado_em', inicioJanelaHistorico)
            .order('enviado_em', { ascending: true, nullsFirst: false })
        : { data: [] }

      // Merge all 3 queries, deduplicate by id, and sort
      const allPollMsgs = [...(ticketMsgs || []), ...(otherTicketMsgs || []), ...(orphanMsgs || [])]
      const pollSeen = new Set<string>()
      const merged = allPollMsgs.filter((m: any) => {
        if (pollSeen.has(m.id)) return false
        pollSeen.add(m.id)
        return true
      })
      merged.sort((a, b) => {
        if (!a.enviado_em) return -1
        if (!b.enviado_em) return 1
        return new Date(a.enviado_em).getTime() - new Date(b.enviado_em).getTime()
      })

      if (merged.length > 0) {
        setMensagens((prev) => {
          const prevRealIds = prev.filter(m => !m.id.startsWith('temp-')).map(m => m.id)
          const newRealIds = merged.map((m: any) => m.id)
          const hasNewMessages = newRealIds.some((id: string) => !prevRealIds.includes(id))

          // Never reduce: only update if there are genuinely new messages
          if (!hasNewMessages && newRealIds.length >= prevRealIds.length) return prev

          const tempMessages = prev.filter(m => m.id.startsWith('temp-'))
          const remainingTemps = tempMessages.filter(
            t => !merged.some((d: any) => d.conteudo === t.conteudo)
          )
          return [...merged, ...remainingTemps]
        })
      }
    }, 10000)

    refreshSelectedMessages().catch((err) => {
      console.warn('[WorkDesk] Falha ao atualizar mensagens após conectar realtime:', err)
    })

    return () => {
      supabase.removeChannel(channel)
      clearInterval(pollInterval)
    }
  }, [selectedTicketIdRef2, selectedClienteIdRef, selectedTicketCriadoEmRef2, supabase, fetchMensagens])

  // Global subscription for new messages on all tickets (for audio alerts)
  // Use ref for ticketIds to avoid recreating the channel on every ticket list change
  const ticketsRef = useRef<Ticket[]>([])
  useEffect(() => {
    ticketsRef.current = tickets
  }, [tickets])

  useEffect(() => {
    if (!colaborador) return

    const channel = supabase
      .channel('all-messages-alert')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'mensagens',
        },
        (payload) => {
          const newMessage = payload.new as any
          const currentTickets = ticketsRef.current

          // Only alert for messages in this colaborador's tickets
          if (!currentTickets.some((t) => t.id === newMessage.ticket_id)) return

          // Only alert for client messages (remetente = 'cliente')
          if (newMessage.remetente !== 'cliente') return

          const isViewingThisTicket = selectedTicketIdRef.current === newMessage.ticket_id

          // Badge vermelho de não-lidas: só conta quando NÃO está olhando o ticket.
          if (!isViewingThisTicket) {
            setUnreadCounts((prev) => {
              const newMap = new Map(prev)
              const current = newMap.get(newMessage.ticket_id) || 0
              newMap.set(newMessage.ticket_id, current + 1)
              return newMap
            })
          }
          // Timer de urgência: sempre marca a PRIMEIRA msg sem resposta, mesmo
          // se o atendente já está no ticket. Subsequentes da mesma rajada
          // mantêm o âncora mais antigo (não sobrescreve). Só zera quando o
          // colaborador efetivamente responde (handleSendMessage limpa).
          setFirstUnreadAt((prev) => {
            if (prev.has(newMessage.ticket_id)) return prev
            const newMap = new Map(prev)
            newMap.set(newMessage.ticket_id, newMessage.enviado_em)
            return newMap
          })

          // Always play audio alert for client messages
          playAlert('new_message')
          
          // Show toast only for messages from OTHER tickets
          if (!isViewingThisTicket) {
            const ticket = currentTickets.find((t) => t.id === newMessage.ticket_id)
            if (ticket) {
              toast.info(`Nova mensagem de ${ticket.clientes?.nome || 'Cliente'}`)
            }
          }
          
          // Update ticket's last message info and move to top (like WhatsApp)
          // startTransition → baixa prioridade: não interrompe a renderização das mensagens
          startTransition(() => {
            setTickets((prev) => {
              const updated = prev.map((t) =>
                t.id === newMessage.ticket_id
                  ? {
                      ...t,
                      ultima_mensagem: newMessage.conteudo,
                      ultima_mensagem_em: newMessage.enviado_em,
                      ultima_mensagem_remetente: newMessage.remetente,
                      ultima_mensagem_tipo: newMessage.tipo || t.ultima_mensagem_tipo,
                    }
                  : t
              )
              return sortTicketsBySetorConfig(updated, travarOrdenacaoPorSetorRef.current)
            })
          })
        }
      )
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          console.log('[WorkDesk] All-messages alert subscription connected')
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn(`[WorkDesk] All-messages alert subscription error: ${status}`, err)
          setTimeout(() => supabase.removeChannel(channel), 5000)
        }
      })

    return () => {
      supabase.removeChannel(channel)
    }
  // Use colaborador?.id (primitive) — avoids rebuilding subscription on every setColaborador call
  }, [colaborador?.id, supabase, playAlert])

  // Filter tickets — memoized so typing in the message input does NOT re-filter the list
  const filteredTickets = useMemo(() => tickets.filter((ticket) => {
    const matchesStatus = statusFilter === 'todos' || ticket.status === statusFilter
    const matchesPrioridade = prioridadeFilter === 'todos' || ticket.prioridade === prioridadeFilter
    const matchesSubsetor = subsetorFilter === 'todos' || 
      (subsetorFilter === 'sem_subsetor' && !ticket.subsetor_id) ||
      ticket.subsetor_id === subsetorFilter
    const matchesSearch = ticket.clientes.nome.toLowerCase().includes(searchTerm.toLowerCase())
    return matchesStatus && matchesPrioridade && matchesSubsetor && matchesSearch
  }), [tickets, statusFilter, prioridadeFilter, subsetorFilter, searchTerm])

  // Handle ticket selection
  const handleSelectTicket = useCallback((ticket: Ticket) => {
    const isSameTicket = selectedTicketIdRef.current === ticket.id

    // Update ref immediately so in-flight sends know the ticket changed
    selectedTicketIdRef.current = ticket.id
    setSelectedTicket(ticket)

    if (!isSameTicket) {
      devePosicionarNoInicioDoTicketMobileRef.current = devePosicionarNoInicioDoTicket(
        ticket.id,
        ticketsJaPosicionadosRef.current,
      )
      // Clear messages only when switching to a DIFFERENT ticket — prevents flash of old
      // conversation while new messages load. Re-clicking the same ticket must NOT clear
      // messages because the useEffect won't re-fire (selectedTicketId didn't change).
      setMensagens([])
      setShowTemplates(false)

      // O texto digitado fica guardado por ticket: quem escreve metade da
      // resposta para um cliente, atende outro e volta, encontra o rascunho
      // onde parou. Antes ele era descartado na troca.
      setMessageInput((rascunhoAtual) => {
        const ticketAnterior = ticketDoRascunhoRef.current
        if (ticketAnterior && ticketAnterior !== ticket.id) {
          const proximos = new Map(rascunhosRef.current)
          if (rascunhoAtual.trim()) proximos.set(ticketAnterior, rascunhoAtual)
          else proximos.delete(ticketAnterior)
          rascunhosRef.current = proximos
        }
        ticketDoRascunhoRef.current = ticket.id
        return rascunhosRef.current.get(ticket.id) || ''
      })

      // Anexo, áudio gravado e citação NÃO são rascunho: pertencem ao ticket em
      // que foram preparados. Sem limpar, o boleto de um cliente seguia na fila
      // e ia para o próximo que o atendente respondesse.
      setAttachments((anteriores) => {
        // Mesmo cuidado do resto do arquivo: `preview` só é object URL às vezes.
        anteriores.forEach((anexo) => {
          if (anexo.preview.startsWith('blob:')) URL.revokeObjectURL(anexo.preview)
        })
        return []
      })
      setRecordedAudio(null)
      setReplyingTo(null)
    }

    setMobileDrawerOpen(false)
    // Update canal config based on ticket's setor
    if (ticket.setores?.canal) {
      setSetorCanalConfig(ticket.setores.canal as 'whatsapp' | 'discord' | 'evolution_api')
    }
    // Initialize audio context on user interaction
    initAudioContext()
    // Fetch templates for this setor
    if (ticket.setor_id) {
      fetchTemplates(ticket.setor_id)
      // Check if setor has OpenAI enabled
      supabase.from('setores').select('openai_ativo, nexus_ativo, assinatura_ativa').eq('id', ticket.setor_id).single()
        .then(({ data }) => {
          setSetorIAAtivo(data?.openai_ativo || false)
          setSetorNexusAtivo(data?.nexus_ativo || false)
          setSetorAssinaturaAtiva(data?.assinatura_ativa || false)
        })
    }
    // Clear unread count for this ticket — o badge vermelho de não-lidas some
    // ao abrir. O timer (firstUnreadAt) NÃO é tocado aqui: ele só zera quando
    // o colaborador efetivamente responde (semântica "tempo da primeira msg
    // não respondida", não "não visualizada").
    setUnreadCounts((prev) => {
      const newMap = new Map(prev)
      newMap.delete(ticket.id)
      return newMap
    })
  }, [fetchTemplates, initAudioContext, supabase])

  useEffect(() => {
    if (!requestedTicketId) return
    const ticket = tickets.find((item) => item.id === requestedTicketId)
    if (!ticket) {
      if (!loading) {
        toast.info('Este atendimento não está mais disponível no seu Workdesk.')
        setRequestedTicketId(null)
      }
      return
    }

    handleSelectTicket(ticket)
    setMobileDrawerOpen(window.innerWidth < 768)
    setRequestedTicketId(null)
  }, [handleSelectTicket, loading, requestedTicketId, tickets])

  // Mark as em_atendimento
  const handleMarcarEmAtendimento = async () => {
    if (!selectedTicket || !colaborador) return

    const isFirstResponse = selectedTicket.status === 'aberto'

    await supabase
      .from('tickets')
      .update({
        status: 'em_atendimento',
        colaborador_id: colaborador.id,
        ...(isFirstResponse ? { primeira_resposta_em: new Date().toISOString() } : {}),
      })
      .eq('id', selectedTicket.id)

    // Puxar o ticket para si É a saída da fila, e este caminho não passava por
    // `marcarSaidaDaFila`: medido em 04/08/2026, 25% dos tickets do dia tinham
    // dono e nenhum `atribuido_em`. O card não errava por acaso — grava
    // `primeira_resposta_em` no mesmo instante e o cálculo cai nela —, mas
    // depender dessa coincidência deixa a coluna inútil para qualquer análise.
    // O helper é quem garante "só na primeira vez", no banco: transferência
    // posterior não pode apagar a espera real.
    await marcarSaidaDaFila(supabase, selectedTicket.id)

    setSelectedTicket((prev) =>
      prev ? { ...prev, status: 'em_atendimento', colaborador_id: colaborador.id } : null
    )
    
    if (colaborador) {
      fetchTickets(colaborador)
    }
  }

  // Encerrar ticket
const handleEncerrarTicket = async (ticketOverride?: Ticket): Promise<boolean> => {
    const ticketToClose = ticketOverride ?? selectedTicket
    if (!ticketToClose || !colaborador) return false

    try {
      // Fetch the setor to get finalization message
      const { data: setor } = await supabase
        .from('setores')
        .select('mensagem_finalizacao')
        .eq('id', ticketToClose.setor_id)
        .single()

      // Se há mensagem de finalização, detectar o canal correto e enviar
      if (setor?.mensagem_finalizacao && !isWindowExpired) {
        // Detectar canal pela última mensagem (mesma lógica do handleSendMessage)
        const { data: lastMsgData } = await supabase
          .from('mensagens')
          .select('canal_envio, phone_number_id, discord_user_id')
          .eq('ticket_id', ticketToClose.id)
          .neq('remetente', 'sistema')
          .order('enviado_em', { ascending: false })
          .limit(1)

        const lastCanalEnvio = lastMsgData?.[0]?.canal_envio || null
        const lastPhoneNumberId = lastMsgData?.[0]?.phone_number_id || null
        const lastDiscordUserId = lastMsgData?.[0]?.discord_user_id || null
        const hasDiscordMsg = lastDiscordUserId || mensagens.some(m => m.discord_user_id)

        let setorCanal = 'whatsapp'
        let phoneNumberId: string | null = lastPhoneNumberId

        if (hasDiscordMsg || lastCanalEnvio === 'discord') {
          setorCanal = 'discord'
          phoneNumberId = null
        } else if (lastCanalEnvio === 'evolutionapi' || lastCanalEnvio === 'evolution_api') {
          setorCanal = 'evolution_api'
          phoneNumberId = lastPhoneNumberId
        } else if (lastCanalEnvio === 'whatsapp') {
          setorCanal = 'whatsapp'
          phoneNumberId = lastPhoneNumberId
        } else if (lastPhoneNumberId) {
          const { data: evoCanal } = await supabase
            .from('setor_canais')
            .select('instancia')
            .eq('tipo', 'evolution_api')
            .eq('instancia', lastPhoneNumberId)
            .eq('ativo', true)
            .maybeSingle()
          setorCanal = evoCanal ? 'evolution_api' : 'whatsapp'
          phoneNumberId = lastPhoneNumberId
        } else if (ticketToClose.setor_id) {
          // Fallback: buscar canal ativo do setor
          const { data: canalAtivo } = await supabase
              .from('setor_canais')
              .select('tipo, instancia, phone_number_id')
              .eq('setor_id', ticketToClose.setor_id)
            .eq('ativo', true)
            .order('criado_em', { ascending: true })
            .limit(1)
            .maybeSingle()
          if (canalAtivo) {
            setorCanal = canalAtivo.tipo
            phoneNumberId = canalAtivo.tipo === 'evolution_api'
              ? canalAtivo.instancia
              : canalAtivo.phone_number_id
          }
        }

        console.log('[encerrar] Canal de finalização detectado:', setorCanal, 'phoneNumberId:', phoneNumberId)

        const processedMessage = processTemplateVariables(setor.mensagem_finalizacao, ticketToClose)

        if (setorCanal === 'discord') {
          await fetch('/api/discord/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ticketId: ticketToClose.id,
              message: processedMessage,
            }),
          })
        } else if (setorCanal === 'evolution_api' && phoneNumberId && ticketToClose.clientes.telefone) {
          await fetch('/api/evolution/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ticketId: ticketToClose.id,
              message: processedMessage,
              instanceName: phoneNumberId,
            }),
          })
        } else if (setorCanal === 'whatsapp' && phoneNumberId && ticketToClose.clientes.telefone) {
          await fetch('/api/whatsapp/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              recipientPhone: ticketToClose.clientes.telefone,
              message: processedMessage,
              ticketId: ticketToClose.id,
              phoneNumberId: phoneNumberId,
            }),
          })
        }
      }

      // Update ticket status
      const { data: closedTicket, error: closeError } = await supabase
        .from('tickets')
        .update({
          status: 'encerrado',
          encerrado_em: new Date().toISOString(),
          ...(selectedTipoEncerramento ? { tipo_atendimento_id: selectedTipoEncerramento } : {}),
        })
        .eq('id', ticketToClose.id)
        .select('id')
        .single()

      if (closeError || !closedTicket) throw closeError || new Error('Ticket não encontrado')

      // Dispatch webhook (await to ensure it completes before UI changes)
      try {
        await fetch('/api/webhooks/dispatch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ticketId: ticketToClose.id,
            evento: 'ticket_encerrado',
          }),
        })
      } catch (err) {
        console.error('[Webhook] dispatch error:', err)
      }

      setSelectedTicket(null)
      selectedTicketIdRef.current = null
      setEncerrarDialogOpen(false)
      setSelectedTipoEncerramento('')
      setTiposEncerramento([])
      setMobileDrawerOpen(false)
      setMensagens([])

      if (colaborador) {
        fetchTickets(colaborador)
      }
      return true
    } catch (error) {
      console.error('Error closing ticket:', error)
      toast.error('Não foi possível encerrar o ticket. Tente novamente.')
      return false
    }
  }

  // Helper: cliente tem CNPJ informado
  const clienteTemCNPJ = !!(selectedTicket?.clientes?.CNPJ)

  // Verificar MDM — consulta se as máquinas do CNPJ do cliente têm o agente instalado
  const [mdmPopoverOpen, setMdmPopoverOpen] = useState(false)
  const [mdmLoading, setMdmLoading] = useState(false)
  const [mdmError, setMdmError] = useState<string | null>(null)
  const [mdmResult, setMdmResult] = useState<MdmResult | null>(null)

  const fetchMdmStatus = useCallback(() => {
    const cnpj = selectedTicket?.clientes?.CNPJ
    if (!cnpj) return
    setMdmLoading(true)
    setMdmError(null)
    fetch(`/api/mdm?cnpj=${cnpj.replace(/\D/g, '')}`)
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok) throw new Error(data?.error || 'Falha ao consultar o MDM')
        setMdmResult(data)
      })
      .catch((err: Error) => setMdmError(err.message || 'Falha ao consultar o MDM'))
      .finally(() => setMdmLoading(false))
  }, [selectedTicket?.clientes?.CNPJ])

  // Ao abrir um ticket, já consulta o MDM em segundo plano (sem precisar
  // clicar) pra que o botão já apareça avisando se o cliente não tiver o
  // agente configurado.
  useEffect(() => {
    setMdmPopoverOpen(false)
    setMdmResult(null)
    setMdmError(null)
    if (selectedTicket?.clientes?.CNPJ) {
      fetchMdmStatus()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTicket?.id])

  const handleMdmPopoverChange = useCallback((open: boolean) => {
    setMdmPopoverOpen(open)
    if (open) fetchMdmStatus()
  }, [fetchMdmStatus])

  // Abrir dialog de encerramento — carrega os tipos de atendimento do setor
  const handleAbrirEncerrar = async () => {
    if (!selectedTicket) return
    setSelectedTipoEncerramento('')
    setTiposEncerramento([])
    setEncerrarDialogOpen(true)
    setLoadingTiposEncerramento(true)
    try {
      const { data } = await supabase
        .from('tipos_atendimento')
        .select('id, nome')
        .eq('setor_id', selectedTicket.setor_id)
        .eq('ativo', true)
        .order('ordem', { ascending: true })
        .order('nome', { ascending: true })
      setTiposEncerramento(data || [])
    } catch (err) {
      console.error('[Encerrar] erro ao carregar tipos:', err)
    } finally {
      setLoadingTiposEncerramento(false)
    }
  }

  // Confirmar encerrar — verifica cliente antes
  const handleConfirmarEncerrar = () => {
    setEncerrarDialogOpen(false)
    if (!clienteTemCNPJ) {
      setEncerrarAposVinculoCliente(true)
      setClienteNaoInformadoDialogOpen(true)
    } else {
      setEncerrarAposVinculoCliente(false)
      handleEncerrarTicket()
    }
  }

  // Buscar cliente por CNPJ ou CPF de MEI (painel de seleção)
  const handleSelecionarClienteCnpjLookup = async () => {
    if (!isDocumentoValido(selecionarClienteCnpj)) {
      toast.error('Informe um CNPJ (14 dígitos) ou CPF (11 dígitos) completo')
      return
    }
    setSelecionarClienteLoading(true)
    setSelecionarClienteData(null)
    try {
      const res = await fetch('/api/clientes/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cnpj: selecionarClienteCnpj.replace(/\D/g, '') }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(data?.error || 'Não foi possível buscar o cliente')
      }
      if (data.source === 'not_found') {
        toast.error(`Cliente não encontrado com este ${rotuloDocumento(selecionarClienteCnpj)}`)
      } else if (data?.cliente?.CNPJ) {
        setSelecionarClienteData(data.cliente)
        toast.success(`Cliente encontrado: ${data.cliente.nome}`)
      } else {
        throw new Error('O cliente encontrado não possui CNPJ/CPF válido')
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao buscar cliente')
    } finally {
      setSelecionarClienteLoading(false)
    }
  }

  // Ref para evitar que o real-time sobrescreva a troca de cliente
  const clienteSwapTicketIdRef = useRef<string | null>(null)

  // Confirmar vínculo do cliente ao ticket
  const handleConfirmarSelecionarCliente = async () => {
    if (!selecionarClienteData || !selectedTicket) return
    const ticketId = selectedTicket.id
    const shouldCloseTicket = encerrarAposVinculoCliente
    setVinculandoCliente(true)
    try {
      // Marca que estamos trocando o cliente deste ticket — o real-time não deve sobrescrever
      clienteSwapTicketIdRef.current = ticketId

      const response = await fetch(`/api/tickets/${ticketId}/cliente`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cnpj: selecionarClienteData.CNPJ }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok || !data?.cliente?.id || data?.ticket?.cliente_id !== data.cliente.id) {
        throw new Error(data?.error || 'Não foi possível vincular o cliente ao ticket')
      }

      const clienteVinculado = data.cliente as Cliente
      const ticketVinculado: Ticket = {
        ...selectedTicket,
        cliente_id: clienteVinculado.id,
        clientes: clienteVinculado,
      }

      // Atualiza o estado local com o novo cliente
      // NÃO preserva o telefone antigo — o telefone do ticket é do contato WhatsApp,
      // e o cliente vinculado é a empresa (CNPJ). São dados diferentes.
      setSelectedTicket(ticketVinculado)
      setTickets((prev) =>
        prev.map((t) =>
          t.id === ticketId
            ? { ...t, cliente_id: clienteVinculado.id, clientes: clienteVinculado }
            : t
        )
      )

      setSelecionarClienteDialogOpen(false)
      setSelecionarClienteCnpj('')
      setSelecionarClienteData(null)
      setEncerrarAposVinculoCliente(false)

      // Libera o bloqueio do real-time após 3s (tempo suficiente para o evento passar)
      setTimeout(() => { clienteSwapTicketIdRef.current = null }, 3000)

      if (shouldCloseTicket) {
        toast.success('Cliente vinculado. Encerrando ticket...')
        await handleEncerrarTicket(ticketVinculado)
      } else {
        toast.success('Cliente vinculado ao ticket!')
      }
    } catch (error) {
      clienteSwapTicketIdRef.current = null
      toast.error(error instanceof Error ? error.message : 'Erro ao vincular cliente')
    } finally {
      setVinculandoCliente(false)
    }
  }

  // Abrir dialog de edição de cliente
  const handleAbrirEditarCliente = () => {
    if (!selectedTicket?.clientes) return
    const c = selectedTicket.clientes
    setEditarClienteForm({
      nome: c.nome || '',
      telefone: c.telefone || '',
      CNPJ: c.CNPJ || '',
      Registro: c.Registro || '',
      PDV: c.PDV || '',
    })
    setEditarClienteDialogOpen(true)
  }

  // Salvar edição do cliente
  const handleSalvarEditarCliente = async () => {
    if (!selectedTicket?.clientes?.id) return
    setEditarClienteLoading(true)
    try {
      const clienteId = selectedTicket.clientes.id
      const updateData: Record<string, string | null> = {
        nome: editarClienteForm.nome || null,
        // Telefone é travado para edição no WorkDesk — não faz parte deste update.
        CNPJ: editarClienteForm.CNPJ?.replace(/\D/g, '') || null,
        Registro: editarClienteForm.Registro || null,
        PDV: editarClienteForm.PDV || null,
      }

      const { error } = await supabase
        .from('clientes')
        .update(updateData)
        .eq('id', clienteId)
      if (error) throw error

      // Atualiza estado local
      const updatedCliente = { ...selectedTicket.clientes, ...updateData }
      clienteSwapTicketIdRef.current = selectedTicket.id
      setSelectedTicket((prev) =>
        prev ? { ...prev, clientes: updatedCliente } : null
      )
      setTickets((prev) =>
        prev.map((t) =>
          t.id === selectedTicket.id
            ? { ...t, clientes: updatedCliente }
            : t
        )
      )
      setTimeout(() => { clienteSwapTicketIdRef.current = null }, 3000)

      toast.success('Dados do cliente atualizados!')
      setEditarClienteDialogOpen(false)
    } catch (error) {
      logError({
        tela: 'WorkDesk',
        error,
        componente: 'handleSalvarEditarCliente',
        metadata: { type: 'editar_cliente_error', clienteId: selectedTicket?.clientes?.id },
      })
      toast.error('Erro ao atualizar dados do cliente')
    } finally {
      setEditarClienteLoading(false)
    }
  }

  // Toggle subsetor ativo do colaborador (escreve/remove em colaboradores_subsetores)
  const toggleMeuSubsetor = async (subsetorId: string, setorId: string) => {
    if (!colaborador || togglingSubsetor) return
    setTogglingSubsetor(true)
    const isActive = meusSubsetorIds.includes(subsetorId)
    if (isActive) {
      await supabase
        .from('colaboradores_subsetores')
        .delete()
        .eq('colaborador_id', colaborador.id)
        .eq('subsetor_id', subsetorId)
      setMeusSubsetorIds((prev) => prev.filter((id) => id !== subsetorId))
    } else {
      await supabase
        .from('colaboradores_subsetores')
        .insert({ colaborador_id: colaborador.id, setor_id: setorId, subsetor_id: subsetorId })
      setMeusSubsetorIds((prev) => [...prev, subsetorId])
    }
    setTogglingSubsetor(false)
  }


  // Disparo - busca por CNPJ ou CPF (MEI)
  const handleDocumentoLookup = async () => {
    if (!isDocumentoValido(disparoDocumento)) {
      toast.error('Informe um CNPJ (14 dígitos) ou CPF (11 dígitos) completo')
      return
    }
    setDisparoLoading(true)
    setDisparoCliente(null)
    try {
      const res = await fetch('/api/clientes/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cnpj: disparoDocumento.replace(/\D/g, '') }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(data?.error || 'Não foi possível buscar o cliente')
      }
      if (data.source === 'not_found') {
        toast.error(`Cliente não encontrado com este ${rotuloDocumento(disparoDocumento)}`)
      } else if (data.cliente) {
        setDisparoCliente({
          ...data.cliente,
          cnpj: data.cliente.CNPJ,
          registro: data.cliente.Registro,
        })
        if (data.cliente.telefone) {
          setDisparoTelefone(data.cliente.telefone)
        }
        setDisparoStep('telefone')
        toast.success(`Cliente encontrado: ${data.cliente.nome}`)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao buscar cliente')
    }
    setDisparoLoading(false)
  }

  // Disparo - Format phone input
  const handleDisparoTelefoneChange = (value: string) => {
    const digits = value.replace(/\D/g, '')
    if (digits.length <= 2) {
      setDisparoTelefone(digits)
    } else if (digits.length <= 7) {
      setDisparoTelefone(`(${digits.slice(0, 2)}) ${digits.slice(2)}`)
    } else if (digits.length <= 11) {
      setDisparoTelefone(`(${digits.slice(0, 2)}) ${digits.slice(2, 3)} ${digits.slice(3, 7)}-${digits.slice(7)}`)
    }
  }

  // Disparo - Send template
  // setorIdOverride vem do step de seleção de setor (handleProceedWhatsapp), usado
  // quando o colaborador atende 2+ setores com WhatsApp oficial configurado — sem
  // isso, cairia no fallback `[0]` do array (ordem não garantida pelo Postgrest),
  // que pode ser um setor SEM WhatsApp oficial e quebrar o disparo com um erro
  // enganoso de "setor não configurado".
  const handleEnviarDisparo = async (setorIdOverride?: string) => {
    if (!disparoCliente || !disparoTelefone || !colaborador) {
      toast.error('Sessão sem dados completos. Recarregue a página.')
      return
    }

    const setorId = setorIdOverride || disparoSetorWhatsappId || colaborador.setor_id || colaborador.setores_vinculados?.[0]?.setor_id
    if (!setorId) {
      toast.error('Colaborador sem setor vinculado')
      return
    }

    const phoneDigits = disparoTelefone.replace(/\D/g, '')
    // Add country code if not present
    const fullPhone = phoneDigits.length === 11 ? `55${phoneDigits}` : phoneDigits

    setDisparoSending(true)
    try {
      const res = await fetch('/api/whatsapp/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clienteNome: disparoCliente.nome,
          clienteCnpj: disparoCliente.cnpj,
          clienteRegistro: disparoCliente.registro,
          telefone: fullPhone,
          setorId,
        }),
      })
      const data = await res.json()
      if (data.warning) {
        // Ticket já existe para este cliente
        const atendenteInfo = data.atendente ? ` com o atendente ${data.atendente}` : ''
        toast.error(`Já existe um ticket #${data.ticketNumero || ''}${atendenteInfo} aberto para este cliente.`, { duration: 6000 })
        setDisparoSending(false)
        return
      }
      if (data.success) {
        toast.success(`Disparo enviado! Ticket #${data.ticketNumero || ''} criado.`)
        setDisparoDialogOpen(false)
        resetDisparo()
        // Refresh tickets
        if (colaborador) fetchTickets(colaborador)
      } else {
        toast.error(data.error || 'Erro ao enviar disparo')
      }
    } catch (error) {
      // Disparo falho sem rastro é caro: consome janela de template e o
      // supervisor não consegue saber se o cliente foi notificado ou não.
      logError({
        tela: 'WorkDesk',
        error,
        componente: 'handleEnviarDisparo',
        metadata: { type: 'disparo_whatsapp_error', setorId, telefone: phoneDigits },
      })
      toast.error('Erro ao enviar disparo')
    }
    setDisparoSending(false)
  }

  // Reset disparo modal
  const resetDisparo = () => {
    setDisparoDocumento('')
    setDisparoTelefone('')
    setDisparoCliente(null)
    setDisparoStep('documento')
    setDisparoCanalChoice('whatsapp')
    setDisparoMensagemEvolution('')
    setDisparoSetorEvolutionId('')
    setDisparoSetoresEvolution([])
    setDisparoSetorWhatsappId('')
    setDisparoSetoresWhatsapp([])
  }

  // Quando o canal WhatsApp oficial é escolhido: busca, entre TODOS os setores do
  // colab (não só o [0]), quais têm Template ID + Phone Number ID configurados —
  // seja via setor_canais (tipo whatsapp, ativo) ou via configuração legada direto
  // em `setores`. Mesmo raciocínio de handleProceedEvolution:
  //   - 2+ → abre step de seleção de setor
  //   - 1  → auto-seleciona e dispara direto
  //   - 0  → segue com o fallback antigo; o dispatch retorna o erro claro de sempre
  const handleProceedWhatsapp = async () => {
    const setorIds: string[] = (colaborador?.setores_vinculados || []).map(s => s.setor_id)
    if (colaborador?.setor_id && !setorIds.includes(colaborador.setor_id)) {
      setorIds.push(colaborador.setor_id)
    }

    let candidatos: Array<{ id: string; nome: string }> = []
    if (setorIds.length > 0) {
      const [{ data: setoresLegado }, { data: canaisWhatsapp }] = await Promise.all([
        supabase.from('setores').select('id, nome, template_id, phone_number_id').in('id', setorIds),
        supabase
          .from('setor_canais')
          .select('setor_id, phone_number_id, template_id, setores(nome)')
          .in('setor_id', setorIds)
          .eq('tipo', 'whatsapp')
          .eq('ativo', true)
          .order('criado_em', { ascending: true }),
      ])
      const porSetor = new Map<string, { nome: string; templateId: string | null; phoneNumberId: string | null }>()
      ;(setoresLegado || []).forEach((s: any) => {
        porSetor.set(s.id, { nome: s.nome, templateId: s.template_id, phoneNumberId: s.phone_number_id })
      })
      // Se houver 2+ canais whatsapp ativos no mesmo setor, usa só o mais antigo
      // (mesmo critério do /api/whatsapp/dispatch) — por isso ignora setor_id repetido.
      const canalJaAplicado = new Set<string>()
      ;(canaisWhatsapp || []).forEach((c: any) => {
        if (canalJaAplicado.has(c.setor_id)) return
        canalJaAplicado.add(c.setor_id)
        const atual = porSetor.get(c.setor_id) || { nome: c.setores?.nome || 'Setor', templateId: null, phoneNumberId: null }
        porSetor.set(c.setor_id, {
          nome: atual.nome,
          templateId: c.template_id || atual.templateId,
          phoneNumberId: c.phone_number_id || atual.phoneNumberId,
        })
      })
      candidatos = Array.from(porSetor.entries())
        .filter(([, v]) => v.templateId && v.phoneNumberId)
        .map(([id, v]) => ({ id, nome: v.nome }))
    }

    if (candidatos.length > 1) {
      setDisparoSetoresWhatsapp(candidatos)
      setDisparoSetorWhatsappId('')
      setDisparoStep('setor_whatsapp')
      return
    }

    const setorId = candidatos[0]?.id
    if (setorId) setDisparoSetorWhatsappId(setorId)
    handleEnviarDisparo(setorId)
  }

  // Quando o canal Evolution é escolhido: sempre busca os setores do colab que
  // têm canal Evolution ativo.
  //   - 2+ → abre step de seleção de setor (com status real de cada instância)
  //   - 1  → auto-seleciona esse setor (sem mostrar step) e vai pra mensagem
  //   - 0  → vai pra mensagem com setorId vazio (dispatch vai falhar claro)
  // Sem o auto-select, o caminho de 1-setor caia no fallback `[0]` do array,
  // que pode ser um setor SEM Evolution e quebrar o disparo.
  const handleProceedEvolution = async () => {
    const setorIds: string[] = (colaborador?.setores_vinculados || []).map(s => s.setor_id)
    if (colaborador?.setor_id && !setorIds.includes(colaborador.setor_id)) {
      setorIds.push(colaborador.setor_id)
    }

    let canaisDedup: Array<{ setor_id: string; instancia: string; setores?: { nome?: string } | null }> = []
    if (setorIds.length > 0) {
      const { data: canais } = await supabase
        .from('setor_canais')
        .select('setor_id, instancia, setores(nome)')
        .in('setor_id', setorIds)
        .eq('tipo', 'evolution_api')
        .eq('ativo', true)
        .not('instancia', 'is', null)
      const seenSetores = new Set<string>()
      canaisDedup = (canais || []).filter((c: any) => {
        if (seenSetores.has(c.setor_id)) return false
        seenSetores.add(c.setor_id)
        return true
      }) as any
    }

    if (canaisDedup.length > 1) {
      const lista = canaisDedup.map((c: any) => ({
        id: c.setor_id as string,
        nome: c.setores?.nome || 'Setor',
        instancia: c.instancia as string,
        online: 'loading' as const,
      }))
      setDisparoSetoresEvolution(lista)
      setDisparoSetorEvolutionId('')
      setDisparoStep('setor_evolution')
      lista.forEach(async (item) => {
        try {
          const r = await fetch(`/api/evolution/instance/${encodeURIComponent(item.instancia)}/status`)
          const j = await r.json()
          const state = j?.instance?.state
          const status: 'online' | 'offline' | 'unknown' =
            (state === 'open' || state === 'connected') ? 'online'
              : (state === 'unknown' || state === 'not_found') ? 'unknown'
              : 'offline'
          setDisparoSetoresEvolution(prev => prev.map(s => s.id === item.id ? { ...s, online: status } : s))
        } catch {
          setDisparoSetoresEvolution(prev => prev.map(s => s.id === item.id ? { ...s, online: 'unknown' } : s))
        }
      })
      return
    }

    // 1 setor Evolution → auto-seleciona (evita fallback pro [0] que pode ser
    // um setor sem Evolution). 0 setores → segue com setorId vazio, dispatch
    // vai retornar erro claro de "nenhuma instância configurada".
    if (canaisDedup.length === 1) {
      setDisparoSetorEvolutionId(canaisDedup[0].setor_id)
    } else {
      setDisparoSetorEvolutionId('')
    }
    const defaultMsg = templates[0]?.conteudo || `Olá ${disparoCliente?.nome || ''}, como posso ajudar?`
    setDisparoMensagemEvolution(defaultMsg)
    setDisparoStep('mensagem_evolution')
  }

  // Determine next step after phone number is confirmed.
  //   - 2 canais (whatsapp + evolution) → step 'canal' pra atendente escolher
  //   - só Evolution → pula direto (handleProceedEvolution decide se mostra
  //     seletor de setor ou vai pra mensagem)
  //   - só WhatsApp Cloud → handleProceedWhatsapp decide se dispara direto ou
  //     mostra seletor de setor (colab com 2+ setores com WhatsApp oficial)
  //   - nada → toast de erro
  const handleDisparoConfirmPhone = async () => {
    const temWhatsapp = setorCanaisAtivos.includes('whatsapp')
    const temEvolution = setorCanaisAtivos.includes('evolution_api')

    if (temWhatsapp && temEvolution) {
      setDisparoStep('canal')
    } else if (temEvolution) {
      setDisparoCanalChoice('evolution_api')
      await handleProceedEvolution()
    } else if (temWhatsapp) {
      await handleProceedWhatsapp()
    } else {
      toast.error('Nenhum canal ativo neste setor. Configure WhatsApp ou Evolution em Canais de Atendimento.')
    }
  }

  // Handle canal choice and advance step
  const handleDisparoSelectCanal = async (canal: 'whatsapp' | 'evolution_api') => {
    setDisparoCanalChoice(canal)
    if (canal === 'evolution_api') {
      await handleProceedEvolution()
    } else {
      // WhatsApp oficial — resolve o setor certo antes de disparar
      await handleProceedWhatsapp()
    }
  }

  // Disparo via Evolution API
  const handleEnviarDisparoEvolution = async () => {
    if (!disparoCliente || !disparoTelefone || !colaborador || !disparoMensagemEvolution.trim()) {
      toast.error('Sessão sem dados completos ou mensagem vazia.')
      return
    }

    // Prioridade: setor escolhido manualmente > setor_id legado > primeiro vinculado
    const setorId = disparoSetorEvolutionId || colaborador.setor_id || colaborador.setores_vinculados?.[0]?.setor_id
    if (!setorId) {
      toast.error('Colaborador sem setor vinculado')
      return
    }

    setDisparoSending(true)
    try {
      const res = await fetch('/api/evolution/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clienteNome: disparoCliente.nome,
          clienteCnpj: disparoCliente.cnpj,
          clienteRegistro: disparoCliente.registro,
          telefone: disparoTelefone,
          setorId,
          mensagem: disparoMensagemEvolution,
        }),
      })
      const data = await res.json()
      if (data.warning) {
        // Ticket já existe para este cliente
        const atendenteInfo = data.atendente ? ` com o atendente ${data.atendente}` : ''
        toast.error(`Já existe um ticket #${data.ticketNumero || ''}${atendenteInfo} aberto para este cliente.`, { duration: 6000 })
        setDisparoSending(false)
        return
      }
      if (data.success) {
        toast.success(`Disparo enviado via Evolution! Ticket #${data.ticketNumero || ''} criado.`)
        setDisparoDialogOpen(false)
        resetDisparo()
        if (colaborador) fetchTickets(colaborador)
      } else {
        toast.error(data.error || 'Erro ao enviar disparo via Evolution')
      }
    } catch (error) {
      logError({
        tela: 'WorkDesk',
        error,
        componente: 'handleEnviarDisparoEvolution',
        metadata: { type: 'disparo_evolution_error', setorId: disparoSetorEvolutionId },
      })
      toast.error('Erro ao enviar disparo via Evolution')
    }
    setDisparoSending(false)
  }

  // Check if disparo ticket is locked (client hasn't replied after dispatch)
  const isDisparoLocked = (ticket: Ticket) => {
  if (!ticket.is_disparo || !ticket.disparo_em) return false
  const dispatchTime = new Date(ticket.disparo_em).getTime()
  // Check if there's any client message AFTER the dispatch time
  const hasClientReplyAfterDispatch = mensagens.some(
    m => m.remetente === 'cliente' && new Date(m.enviado_em).getTime() > dispatchTime
  )
  return !hasClientReplyAfterDispatch
  }

  // Check if encerrar is allowed for disparo tickets
  // Enabled when: client replied OR 12min timer expired
  const isDisparoEncerrarEnabled = (ticket: Ticket) => {
    if (!ticket.is_disparo || !ticket.disparo_em) return true
    const dispatchTime = new Date(ticket.disparo_em).getTime()
    // If client already replied after dispatch, always allow encerrar
    const hasClientReply = mensagens.some(
      m => m.remetente === 'cliente' && new Date(m.enviado_em).getTime() > dispatchTime
    )
    if (hasClientReply) return true
    // Otherwise, wait for 12min timer
    const now = Date.now()
    const twelveMin = 12 * 60 * 1000
    return (now - dispatchTime) >= twelveMin
  }

  // Copy to clipboard helper
  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast.success(`${label} copiado!`)
    }).catch(() => {
      toast.error('Erro ao copiar')
    })
  }

  // Common emojis
  const commonEmojis = ['😊', '👍', '🙏', '✅', '❌', '⏳', '📞', '💬', '🔔', '⚠️', '✨', '🎉']
  
const insertEmoji = (emoji: string) => {
    setMessageInput((prev) => prev + emoji)
    setShowEmojiPicker(false)
  }

  // Process template variables
  const processTemplateVariables = (message: string, ticketOverride?: Ticket) => {
    const templateTicket = ticketOverride ?? selectedTicket
    if (!templateTicket || !colaborador) return message

    const now = new Date()
    return message
      .replace(/\{\{cliente_nome\}\}/g, templateTicket.clientes.nome || '')
      .replace(/\{\{cliente_telefone\}\}/g, templateTicket.clientes.telefone || '')
      .replace(/\{\{cliente_cnpj\}\}/g, templateTicket.clientes.CNPJ || '')
      .replace(/\{\{atendente_nome\}\}/g, colaborador.nome || '')
      .replace(/\{\{setor_nome\}\}/g, templateTicket.setores?.nome || '')
      .replace(/\{\{ticket_id\}\}/g, `#${templateTicket.numero}`)
      .replace(/\{\{data_atual\}\}/g, now.toLocaleDateString('pt-BR'))
      .replace(/\{\{hora_atual\}\}/g, now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }))
  }

  // Handle input change for template detection
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
  const value = e.target.value
  setMessageInput(value)

  // Only check for template shortcuts when text starts with /
  if (value.startsWith('/') && value.length > 1) {
  const search = value.slice(1).toLowerCase()
  
  // Check for exact match - only replace when user types exactly /atalho
  const exactMatch = templates.find((t) => t.atalho.toLowerCase() === search)
  if (exactMatch) {
  const processedMessage = processTemplateVariables(exactMatch.mensagem)
  setMessageInput(processedMessage)
  setShowTemplates(false)
  return
  }
      
      // Otherwise show partial matches
      const matches = templates.filter((t) => t.atalho.toLowerCase().includes(search))
      setFilteredTemplates(matches)
      setShowTemplates(matches.length > 0)
    } else if (value === '/') {
      setFilteredTemplates(templates)
      setShowTemplates(templates.length > 0)
    } else {
      setShowTemplates(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templates])

  // Select a template
  const selectTemplate = (template: any) => {
    const processedMessage = processTemplateVariables(template.mensagem)
    setMessageInput(processedMessage)
    setShowTemplates(false)
  }

  // Handle file selection — validates each file and appends to the queue.
  // Oversized files are skipped with a per-file toast so the others still go.
  const handleFilesSelect = (files: File[]) => {
    const next: { id: string; file: File; preview: string }[] = []
    for (const file of files) {
      const isImage = file.type.startsWith('image/')
      const isVideo = file.type.startsWith('video/')
      const isAudio = file.type.startsWith('audio/')
      // Size limits: videos 50MB | images/audio 16MB | documents 100MB
      const maxSize = isVideo ? 50 * 1024 * 1024 : isImage || isAudio ? 16 * 1024 * 1024 : 100 * 1024 * 1024
      const maxLabel = isVideo ? '50MB' : isImage || isAudio ? '16MB' : '100MB'
      if (file.size > maxSize) {
        toast.error(`${file.name}: arquivo muito grande. Máximo ${maxLabel}.`)
        continue
      }
      const preview = isImage
        ? URL.createObjectURL(file)
        : isVideo
          ? `video:${file.name}`
          : `file:${file.name}`
      next.push({ id: crypto.randomUUID(), file, preview })
    }
    if (next.length) setAttachments((prev) => [...prev, ...next])
  }



  // Handle file input change
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length) handleFilesSelect(Array.from(files))
    // Reset so picking the same file(s) again still fires onChange
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // Handle paste event
  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) return

    const pasted: File[] = []
    for (const item of items) {
      if (item.type.startsWith('image/') || item.type === 'application/pdf') {
        const file = item.getAsFile()
        if (file) pasted.push(file)
      }
    }
    if (pasted.length) {
      e.preventDefault()
      handleFilesSelect(pasted)
    }
  }

  // Remove a single attachment from the queue
  const removeAttachment = (id: string) => {
    setAttachments((prev) => {
      const found = prev.find((a) => a.id === id)
      if (found?.preview.startsWith('blob:')) URL.revokeObjectURL(found.preview)
      return prev.filter((a) => a.id !== id)
    })
  }

  // Clear all selected files
  const clearSelectedFiles = () => {
    setAttachments((prev) => {
      prev.forEach((a) => { if (a.preview.startsWith('blob:')) URL.revokeObjectURL(a.preview) })
      return []
    })
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  // Voice recording (PTT) via opus-recorder. Records directly to ogg/opus
  // (the only format Meta Cloud API renders as a voice note, and Evolution
  // accepts as-is with encoding:true).
  const startRecording = async () => {
    if (attachments.length) {
      toast.error('Remova os arquivos selecionados antes de gravar áudio.')
      return
    }
    try {
      // Dynamic import — opus-recorder touches window/Worker on load.
      const mod: any = await import('opus-recorder')
      const Recorder: any = mod?.default ?? mod
      if (typeof Recorder !== 'function' || !Recorder.isRecordingSupported?.()) {
        toast.error('Seu navegador não suporta gravação de áudio Opus.')
        return
      }
      const rec = new Recorder({
        encoderPath: '/encoderWorker.min.js',
        encoderApplication: 2049, // VOIP — optimized for voice
        encoderFrameSize: 20,
        encoderSampleRate: 48000,
        numberOfChannels: 1,
        streamPages: false,
        rawOpus: false,
      })

      const chunks: Uint8Array[] = []
      rec.ondataavailable = (typedArray: Uint8Array) => {
        chunks.push(typedArray)
      }
      rec.onstop = () => {
        const total = chunks.reduce((s, c) => s + c.byteLength, 0)
        if (total < 200) {
          // Empty/aborted recording — discard silently.
          opusRecorderRef.current = null
          return
        }
        const merged = new Uint8Array(total)
        let offset = 0
        for (const c of chunks) {
          merged.set(c, offset)
          offset += c.byteLength
        }
        const blob = new Blob([merged], { type: 'audio/ogg' })
        const file = new File([blob], `gravacao-${Date.now()}.ogg`, { type: 'audio/ogg' })
        opusRecorderRef.current = null
        // Surface a preview so the attendant can listen back before committing
        // to send. Confirm sends via sendRecordedAudio(); discard via discardRecordedAudio().
        setRecordedAudio(file)
      }
      rec.onerror = (err: unknown) => {
        console.error('[workdesk] opus-recorder error:', err)
        toast.error('Erro durante a gravação.')
      }

      await rec.start()
      opusRecorderRef.current = rec
      setIsRecording(true)
      setRecordingDuration(0)
      const start = Date.now()
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration(Math.floor((Date.now() - start) / 1000))
      }, 250)
    } catch (err) {
      console.error('[workdesk] microphone error:', err)
      toast.error('Não foi possível acessar o microfone. Verifique as permissões.')
    }
  }

  const stopRecording = async () => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current)
      recordingTimerRef.current = null
    }
    const r = opusRecorderRef.current
    if (r) {
      try { await r.stop() } catch (e) { console.warn('stop error:', e) }
    }
    setIsRecording(false)
  }

  const cancelRecording = async () => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current)
      recordingTimerRef.current = null
    }
    const r = opusRecorderRef.current
    if (r) {
      r.onstop = () => {}
      try { await r.stop() } catch {}
    }
    opusRecorderRef.current = null
    setIsRecording(false)
    setRecordingDuration(0)
  }

  const discardRecordedAudio = () => {
    setRecordedAudio(null)
  }

  const sendRecordedAudio = async () => {
    const file = recordedAudio
    if (!file) return
    setRecordedAudio(null)
    await handleSendMessageRef.current?.(file)
  }

  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60)
    const r = s % 60
    return `${m}:${r.toString().padStart(2, '0')}`
  }



// Upload file directly from the browser to Vercel Blob.
  // Direct (client) upload bypasses the 4.5MB request-body limit of Vercel
  // serverless functions — files larger than that (e.g. an 8MB .zip) used to
  // fail with a generic "Upload failed". /api/upload now only mints the token.
  const uploadImage = async (file: File): Promise<string | null> => {
    try {
      // Infer a canonical MIME (browsers leave file.type empty for unknown
      // extensions like .xml/.cer) and keep the original extension so WhatsApp
      // clients show the right icon and the recipient OS can open it.
      const resolvedType = resolveMime(file.type, file.name)
      const extension = file.name.split('.').pop()?.toLowerCase() || 'bin'
      const pathname = `workdesk/${Date.now()}-${Math.random().toString(36).substring(7)}.${extension}`

      const blob = await upload(pathname, file, {
        access: 'public',
        handleUploadUrl: '/api/upload',
        contentType: resolvedType,
      })

      return blob.url
    } catch (error: any) {
      console.error('Error uploading file:', error)
      toast.error(error?.message || 'Erro ao enviar arquivo')
      return null
    }
  }

  const reflectStatusEnvioLocal = useCallback((
    messageId: string,
    status: Mensagem['status_envio'],
    erro: string | null,
    attemptAt?: string | null,
  ) => {
    setMensagens(prev => prev.map(m => (
      m.id === messageId
        ? {
            ...m,
            status_envio: status,
            erro_envio: erro,
            ...(attemptAt !== undefined ? { envio_tentativa_em: attemptAt } : {}),
          }
        : m
    )))
  }, [])

  const readStatusEnvio = useCallback(async (messageId: string) => {
    const { data, error } = await supabase
      .from('mensagens')
      .select('status_envio, erro_envio, envio_tentativa_em')
      .eq('id', messageId)
      .maybeSingle()

    if (error) {
      logError({
        tela: 'WorkDesk',
        error: `Falha ao reler status_envio: ${error.message}`,
        componente: 'readStatusEnvio',
        metadata: { messageId },
      })
      return null
    }
    return data as Pick<Mensagem, 'status_envio' | 'erro_envio' | 'envio_tentativa_em'> | null
  }, [supabase])

  const reconcileSendAfterNetworkFailure = useCallback(async (
    ticketId: string,
    messageId: string,
    fallbackError: string,
  ): Promise<boolean> => {
    let snapshot: Pick<Mensagem, 'status_envio' | 'erro_envio' | 'envio_tentativa_em'> | null = null

    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 500))
      snapshot = await readStatusEnvio(messageId)
      if (!snapshot || !['pendente', 'enviando'].includes(snapshot.status_envio || '')) break
      if (snapshot.status_envio === 'enviado') break
    }

    if (snapshot?.status_envio === 'pendente') {
      try {
        const response = await fetch('/api/mensagens/send-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ticketId,
            messageId,
            action: 'mark_indeterminate',
          }),
        })
        const result = await response.json().catch(() => null)
        if (response.ok && result?.status_envio) {
          snapshot = {
            status_envio: result.status_envio as Mensagem['status_envio'],
            erro_envio: result.erro_envio || fallbackError,
          }
        } else {
          snapshot = await readStatusEnvio(messageId)
        }
      } catch {
        snapshot = await readStatusEnvio(messageId)
      }
    }

    if (snapshot?.status_envio === 'enviado') {
      setPendingMessages((prev) => new Map(prev).set(messageId, 'sent'))
      setMessageErrors((prev) => {
        const next = new Map(prev)
        next.delete(messageId)
        return next
      })
      reflectStatusEnvioLocal(messageId, 'enviado', null)
      toast.success('Mensagem enviada')
      return true
    }

    if (snapshot?.status_envio === 'falhou') {
      const errorMessage = snapshot.erro_envio || fallbackError
      setPendingMessages((prev) => new Map(prev).set(messageId, 'error'))
      setMessageErrors((prev) => new Map(prev).set(messageId, errorMessage))
      reflectStatusEnvioLocal(messageId, 'falhou', errorMessage)
      toast.error(errorMessage)
      return false
    }

    if (snapshot?.status_envio === 'enviando') {
      setPendingMessages((prev) => new Map(prev).set(messageId, 'sending'))
      reflectStatusEnvioLocal(
        messageId,
        'enviando',
        null,
        snapshot.envio_tentativa_em,
      )
      toast.info('O envio ainda está sendo processado')
      return false
    }

    const errorMessage = snapshot?.erro_envio || fallbackError
    setPendingMessages((prev) => new Map(prev).set(messageId, 'error'))
    setMessageErrors((prev) => new Map(prev).set(messageId, errorMessage))

    reflectStatusEnvioLocal(
      messageId,
      snapshot?.status_envio === 'indeterminado' ? 'indeterminado' : (snapshot?.status_envio || null),
      errorMessage,
    )

    toast.error(errorMessage)
    return false
  }, [readStatusEnvio, reflectStatusEnvioLocal])

  useEffect(() => {
    const ticketId = selectedTicket?.id
    if (!ticketId) return

    const scheduleReconciliation = (
      message: Mensagem,
      claimKey: string,
      attempt: number,
      delay: number,
    ) => {
      if (staleSendTimersRef.current.has(claimKey)) return
      const timer = setTimeout(() => {
        staleSendTimersRef.current.delete(claimKey)
        void reconcileStaleSend(message, claimKey, attempt)
      }, Math.max(0, delay))
      staleSendTimersRef.current.set(claimKey, timer)
    }

    const scheduleRetry = (message: Mensagem, claimKey: string, attempt: number) => {
      if (attempt + 1 >= MAX_STALE_RECONCILE_ATTEMPTS) return
      const delay = Math.min(30_000 * (2 ** attempt), 5 * 60_000)
      scheduleReconciliation(message, claimKey, attempt + 1, delay)
    }

    async function reconcileStaleSend(
      message: Mensagem,
      claimKey: string,
      attempt: number,
    ) {
      try {
        const response = await fetch('/api/mensagens/send-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ticketId,
            messageId: message.id,
            action: 'mark_indeterminate',
          }),
        })
        const result = await response.json().catch(() => null)
        if (!response.ok || !result?.status_envio) {
          scheduleRetry(message, claimKey, attempt)
          return
        }

        const status = result.status_envio as Mensagem['status_envio']
        if (status === 'enviando' || status === 'pendente') {
          scheduleRetry(message, claimKey, attempt)
          return
        }

        const errorMessage = status === 'indeterminado'
          ? 'O envio foi interrompido e não pôde ser confirmado'
          : null
        reflectStatusEnvioLocal(message.id, status, errorMessage)

        setPendingMessages((prev) => {
          const next = new Map(prev)
          if (status === 'enviado') {
            next.set(message.id, 'sent')
          } else {
            next.set(message.id, 'error')
          }
          return next
        })
        setMessageErrors((prev) => {
          const next = new Map(prev)
          if (errorMessage) next.set(message.id, errorMessage)
          else next.delete(message.id)
          return next
        })
      } catch {
        scheduleRetry(message, claimKey, attempt)
      }
    }

    for (const message of mensagens) {
      const acceptedLegacySend =
        message.status_envio === 'pendente'
        && Boolean(message.whatsapp_message_id)
      const claimTimestamp = message.envio_tentativa_em
        ? Date.parse(message.envio_tentativa_em)
        : Number.NaN
      const orphanedInProgressSend =
        message.status_envio === 'enviando'
        && !Number.isFinite(claimTimestamp)
      const claimKey = acceptedLegacySend
        ? `${message.id}:accepted:${message.whatsapp_message_id}`
        : orphanedInProgressSend
          ? `${message.id}:orphan:${message.envio_tentativa_em || 'missing'}`
          : `${message.id}:${message.envio_tentativa_em}`
      for (const [scheduledKey, timer] of staleSendTimersRef.current) {
        if (scheduledKey.startsWith(`${message.id}:`) && scheduledKey !== claimKey) {
          clearTimeout(timer)
          staleSendTimersRef.current.delete(scheduledKey)
        }
      }
      if (
        message.ticket_id !== ticketId
        || reconciledStaleSendClaimsRef.current.has(claimKey)
      ) {
        continue
      }

      if (acceptedLegacySend) {
        reconciledStaleSendClaimsRef.current.add(claimKey)
        void reconcileStaleSend(message, claimKey, 0)
        continue
      }
      if (orphanedInProgressSend) {
        reconciledStaleSendClaimsRef.current.add(claimKey)
        void reconcileStaleSend(message, claimKey, 0)
        continue
      }
      if (message.status_envio !== 'enviando') {
        continue
      }

      const remaining = claimTimestamp + SEND_CLAIM_STALE_MS - Date.now() + 1_000
      reconciledStaleSendClaimsRef.current.add(claimKey)
      if (remaining <= 0) {
        void reconcileStaleSend(message, claimKey, 0)
      } else {
        scheduleReconciliation(message, claimKey, 0, remaining)
      }
    }
  }, [mensagens, reflectStatusEnvioLocal, selectedTicket?.id])

  useEffect(() => {
    return () => {
      for (const timer of staleSendTimersRef.current.values()) {
        clearTimeout(timer)
      }
      staleSendTimersRef.current.clear()
      reconciledStaleSendClaimsRef.current.clear()
    }
  }, [selectedTicket?.id])

  // Send message via WhatsApp API (optimistic update like WhatsApp).
  // `overrideFile` (e.g. from voice-note auto-send) bypasses the selectedFile state
  // so the recording fires immediately without an extra Send click, and the
  // textarea content is preserved (audio bypasses any typed text).
  const handleSendMessage = async (overrideFile?: File | null) => {
    const isAutoFile = !!overrideFile
    // Files to send, in order. Auto-send (voice note) carries a single file;
    // otherwise we send every queued attachment as its own message.
    const filesToSend: File[] = overrideFile ? [overrideFile] : attachments.map((a) => a.file)
    const rawMessage = isAutoFile ? '' : messageInput.trim()
    if ((!rawMessage && filesToSend.length === 0) || !selectedTicket || !colaborador) return

    // Capture ticket context at call-time (before any awaits).
    // This snapshot is used throughout the async flow so that if the user
    // switches to another ticket while the send is in progress, we never
    // corrupt the newly-selected ticket's state.
    const capturedTicketId = selectedTicket.id
    const capturedTicket = selectedTicket
    // Snapshot the reply target now, clear the UI bar. If the send fails,
    // the attendant can re-pick from the bubble — simpler than rolling back.
    const capturedReplyTo = replyingTo
    setReplyingTo(null)

    // Aplicar assinatura se ativa no setor e houver texto. The caption rides on
    // the FIRST message only (WhatsApp behaviour); extra files go captionless.
    const messageContent = (setorAssinaturaAtiva && rawMessage && colaborador?.nome)
      ? `*${colaborador.nome}:*\n\n${rawMessage}`
      : rawMessage

    // Clear input immediately (optimistic). Skip on auto-send — there's nothing
    // to clear (selectedFile wasn't set) and we want to preserve typed text.
    if (!isAutoFile) {
      setMessageInput('')
      clearSelectedFiles()
    }

    // Send in background
    try {
      // Determinar canal de envio pela última mensagem do ticket
      // Prioridade: discord_user_id (indicador mais confiável) > canal_envio > setor_canais > fallback
      let setorCanal = 'whatsapp'
      let phoneNumberId: string | null = null

      // 1. Busca a última mensagem do ticket (exceto sistema)
      //    Inclui discord_user_id — indicador definitivo de ticket Discord
      const { data: lastMsgData } = await supabase
        .from('mensagens')
        .select('canal_envio, phone_number_id, discord_user_id')
        .eq('ticket_id', capturedTicketId)
        .neq('remetente', 'sistema')
        .order('enviado_em', { ascending: false })
        .limit(1)

      const lastCanalEnvio = lastMsgData?.[0]?.canal_envio || null
      const lastPhoneNumberId = lastMsgData?.[0]?.phone_number_id || null
      const lastDiscordUserId = lastMsgData?.[0]?.discord_user_id || null

      // Também verificar se alguma mensagem do cliente tem discord_user_id (mais abrangente)
      const hasDiscordMsg = lastDiscordUserId || mensagens.some(m => m.discord_user_id)

      console.log('[workdesk] Canal detection — ticket:', capturedTicketId, {
        lastCanalEnvio,
        lastPhoneNumberId,
        lastDiscordUserId,
        hasDiscordMsg,
        setorCanalConfig,
      })

      if (hasDiscordMsg) {
        // Indicador definitivo: mensagem com discord_user_id = é Discord
        setorCanal = 'discord'
        phoneNumberId = null
        console.log('[workdesk] Canal detectado: DISCORD (via discord_user_id)')
      } else if (lastCanalEnvio === 'discord') {
        // Discord via canal_envio (caso esteja correto no banco)
        setorCanal = 'discord'
        phoneNumberId = null
        console.log('[workdesk] Canal detectado: DISCORD (via canal_envio)')
      } else if (lastCanalEnvio === 'evolutionapi' || lastCanalEnvio === 'evolution_api') {
        setorCanal = 'evolution_api'
        phoneNumberId = lastPhoneNumberId
      } else if (lastCanalEnvio === 'whatsapp') {
        setorCanal = 'whatsapp'
        phoneNumberId = lastPhoneNumberId
      } else if (lastPhoneNumberId) {
        // Evolution ou WhatsApp — cruzar phone_number_id com setor_canais
        // IMPORTANTE: busca em TODOS os setores (ticket pode ter sido transferido do setor original)
        if (lastPhoneNumberId) {
          const { data: evoCanal } = await supabase
            .from('setor_canais')
            .select('instancia')
            .eq('tipo', 'evolution_api')
            .eq('instancia', lastPhoneNumberId)
            .eq('ativo', true)
            .maybeSingle()

          if (evoCanal) {
            setorCanal = 'evolution_api'
            console.log('[workdesk] Canal detectado: EVOLUTION_API (instancia:', lastPhoneNumberId, ') [busca global de setores]')
          } else {
            setorCanal = 'whatsapp'
            console.log('[workdesk] Canal detectado: WHATSAPP (phone_number_id:', lastPhoneNumberId, ')')
          }
          phoneNumberId = lastPhoneNumberId
        } else {
          setorCanal = 'evolution_api'
          phoneNumberId = lastPhoneNumberId
          console.log('[workdesk] Canal detectado: EVOLUTION_API (sem phone_number_id confirmado)')
        }
      } else if (capturedTicket.setor_id) {
        // Sem indicadores nas mensagens — usar setorCanalConfig ou setor_canais
        if (setorCanalConfig === 'discord') {
          setorCanal = 'discord'
          phoneNumberId = null
          console.log('[workdesk] Canal detectado: DISCORD (via setorCanalConfig)')
        } else {
          const { data: canalAtivo } = await supabase
            .from('setor_canais')
            .select('tipo, instancia, phone_number_id')
            .eq('setor_id', capturedTicket.setor_id)
            .eq('ativo', true)
            .order('criado_em', { ascending: true })
            .limit(1)
            .maybeSingle()

          if (canalAtivo) {
            setorCanal = canalAtivo.tipo as typeof setorCanal
            phoneNumberId = canalAtivo.tipo === 'evolution_api'
              ? canalAtivo.instancia
              : canalAtivo.phone_number_id
            console.log('[workdesk] Canal detectado:', setorCanal.toUpperCase(), '(via setor_canais fallback)')
          } else {
            // Legacy fallback: campos diretos da tabela setores
            const { data: setorData } = await supabase
              .from('setores')
              .select('canal, phone_number_id, discord_bot_token')
              .eq('id', capturedTicket.setor_id)
              .single()
            setorCanal = setorData?.canal || 'whatsapp'
            phoneNumberId = setorData?.phone_number_id || null
            console.log('[workdesk] Canal detectado:', setorCanal.toUpperCase(), '(via setores legacy fallback)')
          }
        }
      }

      // Validate phone_number_id for WhatsApp/Evolution
      if ((setorCanal === 'whatsapp' || setorCanal === 'evolution_api') && !phoneNumberId) {
        console.warn('[workdesk] No phone_number_id found for ticket:', capturedTicketId)
        toast.error('Nao foi possivel determinar o canal de envio. Nenhum phone_number_id encontrado.')
        return
      }

      // Map canal_envio values for consistent use
      const canalEnvioValue = setorCanal === 'evolution_api' ? 'evolutionapi' : setorCanal

      // Sends one message (optional file + caption). Returns true on success.
      // Each call owns its own optimistic bubble, DB row and channel dispatch,
      // so a single failure marks only that message — the rest still go.
      const sendOne = async (
        file: File | null,
        caption: string,
        replyTo: typeof capturedReplyTo,
      ): Promise<boolean> => {
        const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`
        let currentMsgId = tempId
        const isImage = file?.type.startsWith('image/')
        const isVideo = file?.type.startsWith('video/')
        const isAudio = file?.type.startsWith('audio/')
        const hasFile = !!file
        const messageType = isImage ? 'imagem' : isVideo ? 'video' : isAudio ? 'audio' : hasFile ? 'documento' : 'texto'

        // Upload file if present
        let fileUrl: string | null = null
        if (hasFile && file) {
          fileUrl = await uploadImage(file) // uploadImage works for any file
          if (!fileUrl) {
            // Surface the failure as an errored bubble so it isn't lost silently.
            if (selectedTicketIdRef.current === capturedTicketId) {
              setMensagens((prev) => [...prev, {
                id: tempId, ticket_id: capturedTicketId, cliente_id: null,
                remetente: 'colaborador', conteudo: caption || file.name || '',
                tipo: messageType, enviado_em: new Date().toISOString(),
                url_imagem: null, media_type: file.type || null,
                reply_to_message_id: replyTo?.id || null, reply_parent: null,
              } as Mensagem])
            }
            setPendingMessages((prev) => new Map(prev).set(tempId, 'error'))
            setMessageErrors((prev) => new Map(prev).set(tempId, 'Falha ao enviar arquivo'))
            return false
          }
        }

        // Add optimistic message to UI
        const optimisticMessage: Mensagem = {
          id: tempId,
          ticket_id: capturedTicketId,
          cliente_id: null,
          remetente: 'colaborador',
          conteudo: caption || file?.name || '',
          tipo: messageType,
          enviado_em: new Date().toISOString(),
          url_imagem: fileUrl,
          media_type: file?.type || null,
          reply_to_message_id: replyTo?.id || null,
          reply_parent: replyTo
            ? { id: replyTo.id, conteudo: replyTo.conteudo, remetente: replyTo.remetente, tipo: replyTo.tipo }
            : null,
        }
        // Only update UI if user is still viewing this ticket
        if (selectedTicketIdRef.current === capturedTicketId) {
          // Quem envia quer ver o que enviou, mesmo tendo subido para reler.
          acompanhandoOFimRef.current = true
          setMensagens((prev) => [...prev, optimisticMessage])
        }
        setPendingMessages((prev) => new Map(prev).set(tempId, 'sending'))

        // Save message to Supabase
        const insertPayloadBase = {
          ticket_id: capturedTicketId,
          cliente_id: capturedTicket.cliente_id,
          remetente: 'colaborador',
          conteudo: caption || file?.name || '',
          tipo: messageType,
          url_imagem: fileUrl,
          media_type: file?.type || null,
          phone_number_id: phoneNumberId,
          canal_envio: canalEnvioValue,
          reply_to_message_id: replyTo?.id || null,
        }
        let statusEnvioSchemaDisponivel = true
        let { data: savedMsg, error: dbError } = await supabase
          .from('mensagens')
          .insert({ ...insertPayloadBase, status_envio: 'pendente' })
          .select()
          .single()

        // Coluna status_envio pode não existir neste ambiente (feature revertida/em
        // rollout) — nunca deixa isso impedir o envio da mensagem em si.
        if (dbError && ['42703', 'PGRST204'].includes(dbError.code || '')) {
          statusEnvioSchemaDisponivel = false
          ;({ data: savedMsg, error: dbError } = await supabase
            .from('mensagens')
            .insert(insertPayloadBase)
            .select()
            .single())
        }

        if (dbError || !savedMsg) {
          console.error('[v0] Error saving message to database:', dbError)
          setPendingMessages(prev => new Map(prev).set(tempId, 'error'))
          setMessageErrors(prev => new Map(prev).set(tempId, 'Erro ao salvar mensagem no banco'))
          return false
        }
        // Update optimistic message with real ID + canal_envio (para retry)
        setMensagens(prev => prev.map(m =>
          m.id === tempId
            ? {
                ...m,
                id: savedMsg.id,
                canal_envio: canalEnvioValue,
                phone_number_id: phoneNumberId || undefined,
                status_envio: statusEnvioSchemaDisponivel ? 'pendente' : null,
              }
            : m
        ))
        // Migrar chave de pendingMessages do tempId para o ID real — sem isso,
        // o estado de envio/erro não é encontrado pelo render (msg.id é o real agora)
        setPendingMessages(prev => {
          const n = new Map(prev)
          const v = n.get(tempId)
          if (v !== undefined) { n.set(savedMsg.id, v); n.delete(tempId) }
          return n
        })
        currentMsgId = savedMsg.id

        // Send via the appropriate channel API
        let sendUrl = '/api/whatsapp/send'
        try {
          let sendBody: Record<string, any> = {}

          if (setorCanal === 'discord') {
            sendUrl = '/api/discord/send'
            sendBody = {
              ticketId: capturedTicketId,
              message: caption,
              messageId: savedMsg.id,
              fileUrl: fileUrl,
              fileType: file?.type || null,
              fileName: file?.name || null,
            }
          } else if (setorCanal === 'evolution_api') {
            sendUrl = '/api/evolution/send'
            sendBody = {
              ticketId: capturedTicketId,
              message: caption,
              messageId: savedMsg.id,
              instanceName: phoneNumberId,
              fileUrl: fileUrl,
              fileType: file?.type || null,
              fileName: file?.name || null,
              replyToMessageId: replyTo?.id || null,
            }
          } else {
            sendBody = {
              recipientPhone: capturedTicket.clientes.telefone,
              message: caption,
              ticketId: capturedTicketId,
              phoneNumberId: phoneNumberId,
              fileUrl: fileUrl,
              fileType: file?.type || null,
              fileName: file?.name || null,
              messageId: savedMsg.id,
              replyToMessageId: replyTo?.id || null,
            }
          }

          const response = await fetch(sendUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(sendBody),
          })

          const result = await response.json()

          if (!response.ok) {
            console.warn('[workdesk] Send API failed:', result)
            logError({
              tela: 'WorkDesk',
              error: `Falha ao enviar mensagem (${response.status}): ${result?.error || 'desconhecido'}`,
              componente: 'sendMessage',
              metadata: { type: 'send_api_error', status: response.status, sendUrl, ticketId: selectedTicketIdRef.current, details: result?.details },
            })

            // Aviso especial para dispositivo offline (Evolution API)
            let userMsg: string
            if (result?.deviceOffline) {
              userMsg = '📱 Dispositivo desconectado! A mensagem não foi enviada porque o WhatsApp do dispositivo está offline.'
            } else {
              userMsg = parseSendErrorMessage(result)
            }

            const serverStatus = result?.status_envio as Mensagem['status_envio']
            if (
              result?.code === 'MESSAGE_SEND_IN_PROGRESS'
              || serverStatus === 'enviando'
            ) {
              await reconcileSendAfterNetworkFailure(capturedTicketId, currentMsgId, userMsg)
              return false
            }

            toast.error(userMsg, { duration: result?.deviceOffline ? 8000 : 6000 })
            setPendingMessages(prev => new Map(prev).set(currentMsgId, 'error'))
            setMessageErrors(prev => new Map(prev).set(currentMsgId, userMsg))
            if (serverStatus) {
              reflectStatusEnvioLocal(currentMsgId, serverStatus, result?.erro_envio || userMsg)
            }
            if (result?.code === 'TICKET_NOT_ACTIVE' && colaboradorCurrentRef.current) {
              void fetchTickets(colaboradorCurrentRef.current)
            }
            return false
          }
        } catch (sendError) {
          console.warn('[v0] Send request failed:', sendError)
          logError({
            tela: 'WorkDesk',
            error: sendError,
            componente: 'sendMessage',
            metadata: { type: 'send_network_error', sendUrl, ticketId: selectedTicketIdRef.current },
          })
          const userMsg = 'Erro de conexão ao enviar mensagem'
          if (!statusEnvioSchemaDisponivel) {
            toast.error(`${userMsg}. Verifique o histórico antes de tentar novamente.`)
            setPendingMessages(prev => new Map(prev).set(currentMsgId, 'error'))
            setMessageErrors(prev => new Map(prev).set(currentMsgId, userMsg))
            reflectStatusEnvioLocal(currentMsgId, null, userMsg)
            return false
          }
          return reconcileSendAfterNetworkFailure(capturedTicketId, currentMsgId, userMsg)
        }

        // Mark as sent — clear the sending/sent mark after 2s (never touch 'error').
        // A rota de envio já gravou 'enviado' no banco (fonte autoritativa); só refletimos localmente.
        setPendingMessages(prev => new Map(prev).set(currentMsgId, 'sent'))
        reflectStatusEnvioLocal(currentMsgId, 'enviado', null)
        setTimeout(() => {
          setPendingMessages(prev => {
            const n = new Map(prev)
            if (n.get(currentMsgId) !== 'error') n.delete(currentMsgId)
            return n
          })
        }, 2000)
        return true
      }

      // Dispatch: each file is its own message; the caption rides on the first
      // one only (and so does the reply context). Text-only sends one message.
      setUploadingFile(true)
      let anySent = false
      try {
        if (filesToSend.length > 0) {
          for (let i = 0; i < filesToSend.length; i++) {
            const ok = await sendOne(filesToSend[i], i === 0 ? messageContent : '', i === 0 ? capturedReplyTo : null)
            anySent = anySent || ok
          }
        } else {
          anySent = await sendOne(null, messageContent, capturedReplyTo)
        }
      } finally {
        setUploadingFile(false)
      }

      if (!anySent) return

      // Resposta enviada — zera o timer de urgência desse ticket.
      // O cliente agora "foi respondido"; nova rajada (se vier) começará do zero.
      setFirstUnreadAt((prev) => {
        if (!prev.has(capturedTicketId)) return prev
        const next = new Map(prev)
        next.delete(capturedTicketId)
        return next
      })

  // Update ticket's last message and move to top (like WhatsApp)
  const now = new Date().toISOString()
  setTickets((prev) => {
    const updated = prev.map((t) => 
      t.id === capturedTicketId
        ? { ...t, ultima_mensagem: messageContent || 'Arquivo enviado', ultima_mensagem_em: now, ultima_mensagem_remetente: 'colaborador' as const }
        : t
    )
    // Sort by ultima_mensagem_em descending (most recent first) —
    // ou por criado_em quando o setor travou a reordenação automática.
    return sortTicketsBySetorConfig(updated, travarOrdenacaoPorSetorRef.current)
  })
  
  // Auto start attendance if ticket is open
      if (capturedTicket.status === 'aberto') {
        const firstResponseAt = new Date().toISOString()
        const { data: startedTicket, error: updateError } = await supabase
          .from('tickets')
          .update({ 
            status: 'em_atendimento',
            primeira_resposta_em: firstResponseAt,
          })
          .eq('id', capturedTicketId)
          .eq('status', 'aberto')
          .eq('colaborador_id', colaborador.id)
          .select('id')
          .maybeSingle()
        
        if (!updateError && startedTicket) {
          setSelectedTicket(prev =>
            prev?.id === capturedTicketId
              ? { ...prev, status: 'em_atendimento', primeira_resposta_em: firstResponseAt }
              : prev
          )
          startTransition(() => {
            setTickets(prev =>
              prev.map(t =>
                t.id === capturedTicketId
                  ? { ...t, status: 'em_atendimento', primeira_resposta_em: firstResponseAt }
                  : t
              )
            )
          })
        } else if (!updateError && colaboradorCurrentRef.current) {
          void fetchTickets(colaboradorCurrentRef.current)
        }
      } else if (!capturedTicket.primeira_resposta_em) {
        await supabase
          .from('tickets')
          .update({ primeira_resposta_em: new Date().toISOString() })
          .eq('id', capturedTicketId)
          .eq('status', 'em_atendimento')
          .eq('colaborador_id', colaborador.id)
          .is('primeira_resposta_em', null)
      }
      
      // After 2 seconds, silently refresh to get real message IDs (sem loading
      // spinner). Per-message sending/sent cleanup already happened in sendOne.
      setTimeout(() => {
        if (selectedTicketIdRef.current === capturedTicketId) {
          fetchMensagens(capturedTicketId, capturedTicket.cliente_id, capturedTicket.criado_em, { silent: true })
        }
      }, 2000)

    } catch (error: any) {
      console.error('[workdesk] Unexpected error sending message:', error)
      toast.error('Erro inesperado ao enviar mensagem')
    }
  }
  // Keep the ref pointing at the latest handleSendMessage so the voice-note
  // recorder's onstop closure always invokes the up-to-date function.
  handleSendMessageRef.current = handleSendMessage

  // Reenvia uma mensagem que falhou. A mensagem já está persistida em `mensagens`
  // (o insert ocorre antes do send), então só reemitimos para o canal correto.
  const retrySendMessage = useCallback(async (msg: Mensagem) => {
    if (!selectedTicket) return
    // Restrições de retry: só a mensagem do ticket aberto atualmente, ativo, de saída
    // do colaborador, e sem outra tentativa já em andamento pra essa mesma mensagem.
    // (O servidor repete essas validações — isto é só feedback rápido na UI.)
    if (msg.ticket_id !== selectedTicket.id) {
      toast.error('Abra o ticket correspondente para reenviar esta mensagem')
      return
    }
    if (!['aberto', 'em_atendimento'].includes(selectedTicket.status)) {
      toast.error('Este ticket não está mais ativo — não é possível reenviar')
      return
    }
    if (msg.remetente !== 'colaborador') {
      return
    }
    if (retryingMessageIdsRef.current.has(msg.id)) {
      return
    }
    retryingMessageIdsRef.current.add(msg.id)

    const ticketPhone = selectedTicket.clientes?.telefone
    const canal = msg.canal_envio || 'whatsapp'
    const phoneNumberId = msg.phone_number_id || null

    setPendingMessages(prev => new Map(prev).set(msg.id, 'sending'))
    setMessageErrors(prev => { const n = new Map(prev); n.delete(msg.id); return n })

    let sendUrl = '/api/whatsapp/send'
    let sendBody: Record<string, any> = {}
    if (canal === 'discord') {
      sendUrl = '/api/discord/send'
      sendBody = {
        ticketId: msg.ticket_id,
        message: msg.conteudo,
        messageId: msg.id,
        retry: true,
        fileUrl: msg.url_imagem || null,
        fileType: msg.media_type || null,
        fileName: null,
        replyToMessageId: msg.reply_to_message_id || null,
      }
    } else if (canal === 'evolutionapi' || canal === 'evolution_api') {
      sendUrl = '/api/evolution/send'
      sendBody = {
        ticketId: msg.ticket_id,
        message: msg.conteudo,
        messageId: msg.id,
        retry: true,
        instanceName: phoneNumberId,
        fileUrl: msg.url_imagem || null,
        fileType: msg.media_type || null,
        fileName: null,
        replyToMessageId: msg.reply_to_message_id || null,
      }
    } else {
      sendBody = {
        recipientPhone: ticketPhone,
        message: msg.conteudo,
        ticketId: msg.ticket_id,
        phoneNumberId,
        fileUrl: msg.url_imagem || null,
        fileType: msg.media_type || null,
        messageId: msg.id,
        retry: true,
        replyToMessageId: msg.reply_to_message_id || null,
      }
    }

    try {
      const response = await fetch(sendUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sendBody),
      })
      const result = await response.json().catch(() => ({}))

      if (!response.ok) {
        const userMsg = result?.deviceOffline
          ? '📱 Dispositivo desconectado! Verifique a conexão do WhatsApp.'
          : parseSendErrorMessage(result)
        const serverStatus = result?.status_envio as Mensagem['status_envio']
        if (
          result?.code === 'MESSAGE_SEND_IN_PROGRESS'
          || serverStatus === 'enviando'
        ) {
          await reconcileSendAfterNetworkFailure(msg.ticket_id, msg.id, userMsg)
          return
        }

        toast.error(userMsg, { duration: 6000 })
        setPendingMessages(prev => new Map(prev).set(msg.id, 'error'))
        setMessageErrors(prev => new Map(prev).set(msg.id, userMsg))
        if (serverStatus) {
          reflectStatusEnvioLocal(msg.id, serverStatus, result?.erro_envio || userMsg)
        }
        if (result?.code === 'TICKET_NOT_ACTIVE' && colaboradorCurrentRef.current) {
          void fetchTickets(colaboradorCurrentRef.current)
        }
        return
      }

      setPendingMessages(prev => new Map(prev).set(msg.id, 'sent'))
      toast.success('Mensagem reenviada')
      reflectStatusEnvioLocal(msg.id, 'enviado', null)
    } catch (err) {
      const userMsg = 'Erro de conexão ao reenviar mensagem'
      await reconcileSendAfterNetworkFailure(msg.ticket_id, msg.id, userMsg)
    } finally {
      retryingMessageIdsRef.current.delete(msg.id)
    }
  }, [fetchTickets, reconcileSendAfterNetworkFailure, reflectStatusEnvioLocal, selectedTicket])

  const requestRetrySend = useCallback((msg: Mensagem) => {
    if (msg.status_envio === 'indeterminado') {
      setRetryConfirmationMessage(msg)
      return
    }
    void retrySendMessage(msg)
  }, [retrySendMessage])

  const confirmIndeterminateRetry = useCallback(() => {
    const message = retryConfirmationMessage
    setRetryConfirmationMessage(null)
    if (message) void retrySendMessage(message)
  }, [retryConfirmationMessage, retrySendMessage])

  // Handle Enter key to send message
  const handleKeyPress = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleSendMessage])

  // Get message icon based on type
  const getMessageIcon = (tipo: string) => {
    switch (tipo) {
      case 'imagem':
        return <ImageIcon className="h-4 w-4" />
      case 'audio':
        return <Mic className="h-4 w-4" />
      case 'video':
        return <Video className="h-4 w-4" />
      case 'documento':
        return <FileText className="h-4 w-4" />
      default:
        return null
    }
  }

  if (loading) {
    return (
      <div
        className="flex h-[calc(100svh-4rem)] flex-col overflow-hidden"
        aria-busy="true"
        aria-label="Carregando tickets"
      >
        <div className="flex flex-1 overflow-hidden w-full max-w-full">
          {/* Skeleton da coluna de tickets */}
          <aside className="shrink-0 border-r border-border bg-card h-full overflow-hidden flex flex-col w-full md:w-52 lg:w-60 xl:w-72">
            <div className="p-2 border-b border-border shrink-0 space-y-1.5">
              <div className="skeleton h-9 w-full rounded-md" />
              <div className="skeleton h-8 w-full rounded-md" />
            </div>
            <div className="stagger divide-y divide-border">
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="px-3 py-2.5 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="skeleton h-3 w-20 rounded-sm" />
                    <div className="skeleton h-4 w-5 rounded-full" />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="skeleton h-3.5 w-28 rounded-sm" />
                    <div className="skeleton h-2.5 w-10 rounded-sm" />
                  </div>
                  <div className="skeleton h-3 w-full rounded-sm" />
                </div>
              ))}
            </div>
          </aside>
          {/* Skeleton do painel de conversa (desktop) */}
          <div className="hidden md:flex flex-1 flex-col overflow-hidden">
            <div className="flex h-14 items-center gap-3 border-b border-border px-4 shrink-0">
              <div className="skeleton h-8 w-8 rounded-full" />
              <div className="space-y-1.5">
                <div className="skeleton h-3.5 w-32 rounded-sm" />
                <div className="skeleton h-2.5 w-20 rounded-sm" />
              </div>
            </div>
            <div className="flex flex-1 items-center justify-center">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent motion-reduce:animate-none" />
                Carregando tickets...
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100svh-4rem)] flex-col overflow-hidden">
      <div className="flex flex-1 overflow-hidden w-full max-w-full">
        {/* Ticket List Column - responsive width */}
        <aside className={cn(
          "anim-rise shrink-0 border-r border-border bg-card h-full overflow-hidden flex-col",
          // Mobile: full width quando nenhum ticket; esconde quando o chat está aberto
          // Tablet/desktop: largura fixa, sempre lado a lado com o chat
          selectedTicket ? "hidden md:flex" : "flex w-full",
          "md:w-52 md:flex lg:w-60 xl:w-72"
        )}>
          {/* Card de Fila: contador + botão "Puxar próximo".
              O botão ignora o limite max_tickets_per_agent do setor — usado quando
              o atendente quer pegar mais um ticket mesmo já estando no teto. */}
          <div className="p-2 border-b border-border shrink-0 space-y-1.5">
            <HoverCard openDelay={120} closeDelay={80}>
              <HoverCardTrigger asChild>
                <div
                  tabIndex={filaCount > 0 ? 0 : -1}
                  className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/40 px-2.5 py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className={cn(
                      'flex h-6 w-6 shrink-0 items-center justify-center rounded-full',
                      filaCount > 0
                        ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'
                        : 'bg-muted text-muted-foreground'
                    )}>
                      <Users className="h-3 w-3" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[9px] uppercase tracking-wider text-muted-foreground leading-none">
                        Em fila
                      </p>
                      <p className="text-xs font-semibold text-foreground leading-tight mt-0.5">
                        <span className="tabnums">{filaCount}</span> aguardando
                      </p>
                    </div>
                  </div>
                  {filaCount > 0 && (
                    <motion.span
                      key={filaCount}
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="tabnums flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-[10px] font-bold text-white"
                    >
                      {filaCount > 99 ? '99+' : filaCount}
                    </motion.span>
                  )}
                </div>
              </HoverCardTrigger>
              {filaCount > 0 && (
                <HoverCardContent align="start" side="right" className="w-64 p-3">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Aguardando por subsetor
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {filaPorSubsetor.map(({ rotulo, total }) => (
                      <li key={rotulo} className="flex items-baseline justify-between gap-3 text-xs">
                        <span className="min-w-0 truncate text-foreground">{rotulo}</span>
                        <span className="tabnums shrink-0 font-semibold text-amber-600 dark:text-amber-400">
                          {total}
                        </span>
                      </li>
                    ))}
                  </ul>
                </HoverCardContent>
              )}
            </HoverCard>
            <Button
              onClick={handlePuxarTicket}
              disabled={puxandoTicket || filaCount === 0}
              variant="outline"
              size="sm"
              className="w-full gap-2 h-8 text-xs border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 hover:text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300 dark:hover:bg-amber-500/20 disabled:opacity-50"
              title="Puxa o próximo ticket da fila ignorando o limite do setor"
            >
              {puxandoTicket ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
              {puxandoTicket ? 'Puxando...' : 'Puxar próximo'}
            </Button>
          </div>

          {/* Disparo Button - for WhatsApp and/or EvolutionAPI
              Enquanto setorCanaisAtivos não populou (carregando), confia no
              setorCanalConfig legado pra evitar "piscar" do botão (race
              entre setSetorCanalConfig e setSetorCanaisAtivos). */}
          {(setorCanaisAtivos.length > 0
              ? (setorCanaisAtivos.includes('whatsapp') || setorCanaisAtivos.includes('evolution_api'))
              : setorCanalConfig !== 'discord'
            ) && (
          <div className="p-2 border-b border-border shrink-0">
  <Button
  onClick={async () => {
    // Check dispatch limit before opening
    if (colaborador?.setor_id) {
      try {
        const res = await fetch(`/api/whatsapp/dispatch/count?setorId=${colaborador.setor_id}`)
        const data = await res.json()
        if (data.blocked) {
          setDisparoLimitBlocked(true)
          setDisparoLimitInfo(`Limite diario atingido (${data.used}/${data.limit})`)
          toast.error(`Limite de disparos atingido (${data.used}/${data.limit}). Tente novamente amanha.`)
          return
        }
        setDisparoLimitBlocked(false)
        setDisparoLimitInfo(data.limit > 0 ? `${data.used}/${data.limit} hoje` : '')
      } catch {
        // If check fails, allow dispatch anyway
      }
    }
    resetDisparo()
    setDisparoDialogOpen(true)
  }}
  className="w-full gap-2 bg-primary text-primary-foreground hover:bg-primary/90 h-8 text-xs"
  size="sm"
  >
  <Megaphone className="h-3.5 w-3.5" />
  Novo Disparo
            </Button>
          </div>
          )}
          {/* Subsetor Picker */}
          {subsetoresDisponiveis.length > 0 && (
            <div className="px-2 py-1.5 border-b border-border shrink-0">
              <Popover open={subsetorPickerOpen} onOpenChange={setSubsetorPickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-between h-8 text-xs px-2 font-normal hover:bg-muted/50"
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Layers className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate text-muted-foreground">
                        {meusSubsetorIds.length === 0
                          ? 'Nenhum subsetor'
                          : meusSubsetorIds.length === subsetoresDisponiveis.length
                          ? 'Todos subsetores'
                          : `${meusSubsetorIds.length} subsetor${meusSubsetorIds.length > 1 ? 'es' : ''}`}
                      </span>
                    </div>
                    <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-56 p-2" align="start">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">
                    Meus Subsetores
                  </p>
                  <div className="space-y-0.5">
                    {subsetoresDisponiveis.map((subsetor) => {
                      const isActive = meusSubsetorIds.includes(subsetor.id)
                      return (
                        <label
                          key={subsetor.id}
                          className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted cursor-pointer"
                        >
                          <Checkbox
                            checked={isActive}
                            disabled={togglingSubsetor}
                            onCheckedChange={() =>
                              toggleMeuSubsetor(subsetor.id, subsetor.setor_id || '')
                            }
                          />
                          <span className="text-sm">{subsetor.nome}</span>
                        </label>
                      )
                    })}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          )}

          <div className="flex-1 overflow-hidden">
            <TicketList
              tickets={filteredTickets}
              selectedTicket={selectedTicket}
              onSelectTicket={handleSelectTicket}
              statusFilter={statusFilter}
              setStatusFilter={setStatusFilter}
              prioridadeFilter={prioridadeFilter}
              setPrioridadeFilter={setPrioridadeFilter}
              subsetorFilter={subsetorFilter}
              setSubsetorFilter={setSubsetorFilter}
              subsetoresDisponiveis={subsetoresDisponiveis}
              searchTerm={searchTerm}
              setSearchTerm={setSearchTerm}
              unreadCounts={unreadCounts}
              firstUnreadAt={firstUnreadAt}
              setorCanal={setorCanalConfig}
              colaboradorEmail={colaborador?.email || ''}
            />
          </div>
        </aside>

        {/* Chat Area */}
        <main className={cn(
          "anim-rise flex-1 flex-col overflow-hidden",
          // Mobile: aparece quando há ticket selecionado (full width); senão, esconde
          // Desktop (md+): sempre visível ao lado da sidebar
          selectedTicket ? "flex w-full" : "hidden md:flex"
        )}>
          {selectedTicket ? (
            <>
              {/* Chat Header */}
              <div className="flex items-center justify-between border-b border-border bg-card px-3 py-2 gap-2">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {/* Back button — mobile only (volta pra lista de tickets) */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="md:hidden h-8 w-8 shrink-0"
                    onClick={() => { selectedTicketIdRef.current = null; setSelectedTicket(null) }}
                    title="Voltar para lista"
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </Button>
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <User className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-semibold truncate">{setorCanalConfig === 'discord' ? (selectedTicket.user_name_discord || selectedTicket.clientes.nome) : selectedTicket.clientes.nome}</span>
                    {isClientePrime(selectedTicket.clientes.prime) && (
                      <span className="ml-1.5 inline-flex items-center rounded-md bg-primary/10 px-1.5 py-0.5 align-middle text-[10px] font-semibold uppercase tracking-wide text-primary">
                        Prime
                      </span>
                    )}
                    <span className="tabnums font-mono hidden md:inline text-xs text-muted-foreground ml-1.5">#{selectedTicket.numero}</span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {/* Transfer Button — texto escondido em mobile (só ícone) */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setTransferDialogOpen(true)}
                    className="gap-1.5 bg-transparent px-2 md:px-3"
                  >
                    <ArrowRightLeft className="h-4 w-4" />
                    <span className="hidden md:inline">Transferir</span>
                  </Button>

  {/* Encerrar Button — texto escondido em mobile (só ícone) */}
  <Button
  variant="destructive"
  size="sm"
  onClick={handleAbrirEncerrar}
  disabled={selectedTicket?.is_disparo && !isDisparoEncerrarEnabled(selectedTicket)}
  className="gap-1.5 px-2 md:px-3"
  >
  <XCircle className="h-4 w-4" />
  <span className="hidden md:inline">Encerrar</span>
  </Button>

                  {/* Toggle Client Info Panel */}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowClientInfo(!showClientInfo)}
                    title={showClientInfo ? (setorCanalConfig === 'discord' ? 'Ocultar dados do colaborador' : 'Ocultar dados do cliente') : (setorCanalConfig === 'discord' ? 'Mostrar dados do colaborador' : 'Mostrar dados do cliente')}
                  >
                    {showClientInfo ? (
                      <PanelRightClose className="h-4 w-4" />
                    ) : (
                      <PanelRightOpen className="h-4 w-4" />
                    )}
                  </Button>
                  
                  {/* Close — redundante em mobile (back arrow já volta pra lista) */}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setSelectedTicket(null)
                      selectedTicketIdRef.current = null
                    }}
                    className="hidden md:inline-flex"
                  >
                    <X className="h-5 w-5" />
                  </Button>
                </div>
              </div>

              {/* Aviso de atendimento duplicado — o mesmo cliente pode ter dois
                  tickets abertos com atendentes diferentes, e sem isso ninguém
                  percebe que a conversa está partida. */}
              {outrosAtendimentosAbertos.length > 0 && (
                <div
                  role="status"
                  className="flex items-start gap-2 border-b border-amber-300 bg-amber-50 px-4 py-2 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200"
                >
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <p>
                    <span className="font-semibold">{rotuloDuplicidade(outrosAtendimentosAbertos.length)}.</span>{' '}
                    {outrosAtendimentesResumo} — confirme com quem está atendendo antes de responder.
                  </p>
                </div>
              )}

              {/* Messages */}
              <div className="flex-1 overflow-hidden">
                <div ref={messagesContainerRef} onScroll={handleMessagesScroll} className="h-full overflow-y-auto">
                  <div className="p-4">
                  {loadingMensagens ? (
                    <div className="flex h-full items-center justify-center">
                      <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    </div>
                  ) : mensagens.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground">
                      <MessageCircle className="mb-2 h-12 w-12 text-muted-foreground/40" />
                      <p className="text-sm font-medium tracking-tight text-foreground">Nenhuma mensagem ainda</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">As mensagens aparecerão aqui.</p>
                    </div>
) : (
                    <div className="space-y-4">
                      <AnimatePresence>
                        {(() => {
                          const currentTicketId = selectedTicket?.id
                          const idsContextoNexusOrfao = selecionarIdsContextoNexusOrfao(
                            mensagens,
                            selectedTicket?.criado_em,
                          )
                          const isCurrentTicketContext = (message: Mensagem) => (
                            currentTicketId
                              ? pertenceAoContextoDoTicket(message, currentTicketId, idsContextoNexusOrfao)
                              : false
                          )
                          // Garante que o ticket atual (incluindo a resposta tardia do Nexus)
                          // permaneça no fim, sem quebrar a ordem cronológica da conversa.
                          const mensagensOrdenadas = selectedTicket
                            ? [
                                ...mensagens.filter((m) => !isCurrentTicketContext(m)),
                                ...mensagens.filter(isCurrentTicketContext),
                              ]
                            : mensagens
                          const nexusConversationMessages = currentTicketId
                            ? mensagensOrdenadas.filter((m) => (
                                isCurrentTicketContext(m)
                                && isNexusMessage(m)
                              ))
                            : []
                          const firstNexusConversationMessageId = nexusConversationMessages[0]?.id
                          // Âncora do separador "Início do Ticket" e da rolagem inicial: a
                          // primeira mensagem do ticket que não é do Nexus. Uma resposta
                          // tardia do bot-nexus já vinculada ao ticket continua no bloco
                          // "Conversa com Nexus" e nunca vira essa âncora. Sem mensagem
                          // humana ainda, fica undefined — sem separador, com fallback de
                          // rolagem para o fim.
                          const inicioHumanoDoTicketId = nexusConversationMessages.length > 0 && currentTicketId
                            ? selecionarInicioHumanoDoTicket(mensagensOrdenadas, currentTicketId)
                            : undefined

                          let lastTicketId: string | null = null
                          return mensagensOrdenadas.map((msg, index) => {
                            const msgStatus = pendingMessages.get(msg.id)
                            // Sem entrada efêmera (ex: depois de um reload), cai pro status persistido no banco.
                            // 'indeterminado' = perdemos a resposta da API, não sabemos se o provedor recebeu.
                            const sendOutcome = computeSendOutcome(msgStatus, msg.status_envio)
                            const isFailedSend = sendOutcome === 'failed' || sendOutcome === 'indeterminate'
                            const messageTicketId = idsContextoNexusOrfao.has(msg.id)
                              ? currentTicketId
                              : msg.ticket_id
                            const isNewTicket = messageTicketId !== lastTicketId
                            const isCurrentTicket = messageTicketId === currentTicketId
                            const isPreviousTicket = !isCurrentTicket && isNewTicket
                            const canRetrySend = Boolean(
                              isFailedSend
                              && isCurrentTicket
                              && msg.remetente === 'colaborador'
                              && !msg.id.startsWith('temp-')
                              && selectedTicket
                              && ['aberto', 'em_atendimento'].includes(selectedTicket.status)
                              && ['falhou', 'indeterminado'].includes(msg.status_envio || '')
                            )
                            lastTicketId = messageTicketId

                            return (
                              <React.Fragment key={msg.id}>
                                {msg.id === firstNexusConversationMessageId && (
                                  <SeparadorConversaNexus quantidade={nexusConversationMessages.length} />
                                )}
                                {msg.id === inicioHumanoDoTicketId && (
                                  <div data-ticket-start className="scroll-mt-4">
                                    <SeparadorInicioTicket numero={selectedTicket?.numero} />
                                  </div>
                                )}
                                {/* Ticket separator for history */}
                                {isPreviousTicket && (
                                  <div className="flex items-center gap-3 py-3">
                                    <div className="flex-1 h-px bg-border" />
                                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-muted/50 border border-border text-xs text-muted-foreground">
                                      <History className="h-3 w-3" />
                                      <span>
                                        Atendimento anterior -{' '}
                                        {(msg.tickets?.criado_em || msg.enviado_em)
                                          ? new Date(msg.tickets?.criado_em || msg.enviado_em).toLocaleDateString('pt-BR', {
                                              day: '2-digit',
                                              month: '2-digit',
                                              year: '2-digit',
                                            })
                                          : 'Data desconhecida'}
                                      </span>
                                      {msg.tickets?.status === 'encerrado' && (
                                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-green-50 text-green-700 border-green-200">
                                          Finalizado
                                        </Badge>
                                      )}
                                    </div>
                                    <div className="flex-1 h-px bg-border" />
                                  </div>
                                )}
                                {/* Current ticket separator */}
                                {isNewTicket && isCurrentTicket && index > 0 && (
                                  <div className="flex items-center gap-3 py-3">
                                    <div className="flex-1 h-px bg-primary/30" />
                                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-primary/10 border border-primary/20 text-xs text-primary font-medium">
                                      <MessageCircle className="h-3 w-3" />
                                      <span>Atendimento atual</span>
                                    </div>
                                    <div className="flex-1 h-px bg-primary/30" />
                                  </div>
                                )}
                                {msg.remetente === 'supervisor' ? (
                                  <motion.div
                                    initial={{ opacity: 0, y: 5 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="flex justify-start"
                                  >
                                    <div className="max-w-[85%] rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 dark:border-amber-700 dark:bg-amber-950/30">
                                      <div className="mb-0.5 flex items-center gap-1 text-[10px] font-semibold text-amber-700 dark:text-amber-400">
                                        🔒 Mensagem do supervisor
                                      </div>
                                      {(() => {
                                        const _l = (msg.conteudo || '').split('\n')
                                        const _ult = _l[_l.length - 1]
                                        const _ass = _l.length > 1 && _ult.startsWith('— ')
                                        const _corpo = _ass ? _l.slice(0, -1).join('\n').trimEnd() : (msg.conteudo || '')
                                        return (
                                          <>
                                            <p className="whitespace-pre-wrap text-sm text-amber-900 dark:text-amber-200">{_corpo}</p>
                                            {_ass && <p className="mt-0.5 text-right text-[10px] italic text-amber-700/70 dark:text-amber-400/70">{_ult}</p>}
                                          </>
                                        )
                                      })()}
                                      {msg.enviado_em && (
                                        <p className="mt-1 text-right text-[10px] text-amber-700/70 dark:text-amber-400/70">
                                          {new Date(msg.enviado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                        </p>
                                      )}
                                    </div>
                                  </motion.div>
                                ) : msg.remetente === 'sistema' ? (
                                  <motion.div
                                    initial={{ opacity: 0, y: 5 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="flex justify-center"
                                  >
                                    <div className={cn(
                                      "flex items-center gap-2 px-4 py-2 rounded-lg border text-xs max-w-[90%]",
                                      msg.conteudo.startsWith('Transferido')
                                        ? "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300"
                                        : "bg-muted/80 border-border text-muted-foreground"
                                    )}>
                                      {msg.conteudo.startsWith('Transferido') ? (
                                        <ArrowRightLeft className="h-3.5 w-3.5 shrink-0 text-blue-600 dark:text-blue-400" />
                                      ) : (
                                        <Megaphone className="h-3.5 w-3.5 shrink-0 text-primary" />
                                      )}
                                      <span>{msg.conteudo}</span>
                                      {msg.enviado_em && (
                                        <span className="shrink-0 ml-1 opacity-60">
                                          {new Date(msg.enviado_em).toLocaleTimeString('pt-BR', {
                                            hour: '2-digit',
                                            minute: '2-digit',
                                          })}
                                        </span>
                                      )}
                                    </div>
                                  </motion.div>
                                ) : (
                                <motion.div
                                  initial={{ opacity: 0, y: 10 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  className={cn(
                                    'flex items-center gap-1.5 group/msg',
                                    isOutgoingMessage(msg.remetente) ? 'justify-end' : 'justify-start',
                                    !isCurrentTicket && 'opacity-60'
                                  )}
                                >
                                  {/* Reply button: shown LEFT of outgoing bubbles, RIGHT of incoming.
                                      Hidden until hover so it doesn't clutter the chat. */}
                                  {isOutgoingMessage(msg.remetente) && isCurrentTicket && !msg.id.startsWith('temp-') && (
                                    <button
                                      type="button"
                                      onClick={() => setReplyingTo(msg)}
                                      className="opacity-0 group-hover/msg:opacity-100 transition-opacity p-1 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground"
                                      title="Responder"
                                    >
                                      <CornerUpLeft className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                  {/* onRetry usa requestRetrySend, não retrySendMessage: com envio
                                      indeterminado ele pede confirmação antes, porque reenviar pode
                                      entregar a mesma mensagem duas vezes ao cliente. E canRetrySend
                                      limita o botão ao ticket atual e ainda ativo. */}
                                  <MensagemBubbleBox
                                    mensagem={msg}
                                    dataMsgId={msg.id}
                                    bubbleClassName="lg:max-w-[75%] lg:px-4 lg:py-2.5"
                                    sendOutcome={sendOutcome}
                                    erroEnvio={messageErrors.get(msg.id)}
                                    onRetry={canRetrySend ? requestRetrySend : undefined}
                                    replyPreview={msg.reply_parent && (
                                      <div
                                        className={cn(
                                          'mb-2 pl-2 pr-2 py-1.5 rounded border-l-4 cursor-pointer',
                                          isOutgoingMessage(msg.remetente)
                                            ? 'bg-white/15 border-white/70'
                                            : 'bg-foreground/5 border-violet-500',
                                        )}
                                        onClick={() => {
                                          const el = document.querySelector(`[data-msg-id="${msg.reply_parent!.id}"]`)
                                          el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                                        }}
                                        title="Ir para mensagem original"
                                      >
                                        <p className="text-[11px] font-semibold opacity-90">
                                          {msg.reply_parent.remetente === 'colaborador'
                                            ? 'Você'
                                            : (selectedTicket?.clientes?.nome || 'Cliente')}
                                        </p>
                                        <p className="text-xs opacity-80 line-clamp-2">
                                          {msg.reply_parent.tipo !== 'texto' && !msg.reply_parent.conteudo
                                            ? ({
                                                imagem: '📷 Imagem',
                                                audio: '🎤 Áudio',
                                                video: '📹 Vídeo',
                                                documento: '📎 Documento',
                                              } as Record<string, string>)[msg.reply_parent.tipo] || 'Mídia'
                                            : (msg.reply_parent.conteudo || '').replace(/^\*[^*\n]+:\*\s*\n*/, '').trim() || 'Mídia'}
                                        </p>
                                      </div>
                                    )}
                                    media={msg.url_imagem && (
                                      <MessageMedia
                                        url={msg.url_imagem}
                                        mediaType={msg.media_type}
                                        tipo={msg.tipo}
                                        conteudo={msg.conteudo}
                                        isOutgoing={isOutgoingMessage(msg.remetente)}
                                        mensagemId={msg.id}
                                        setorId={selectedTicket?.setor_id}
                                        setorIAAtivo={setorIAAtivo}
                                        onTranscricao={(id, text) => {
                                          setMensagens(prev => prev.map(m => m.id === id ? { ...m, conteudo: text } : m))
                                        }}
                                      />
                                    )}
                                  />
                                  {/* Right-side reply button for cliente messages */}
                                  {!isOutgoingMessage(msg.remetente) && isCurrentTicket && (
                                    <button
                                      type="button"
                                      onClick={() => setReplyingTo(msg)}
                                      className="opacity-0 group-hover/msg:opacity-100 transition-opacity p-1 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground"
                                      title="Responder"
                                    >
                                      <CornerUpLeft className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                </motion.div>
                                )}
                              </React.Fragment>
                            )
                          })
                        })()}
                      </AnimatePresence>
                    </div>
                  )}
                  </div>
                </div>
              </div>

  {/* Input Area */}
  <div className="border-t border-border bg-card p-3">
  {/* Disparo locked warning */}
  {selectedTicket?.is_disparo && isDisparoLocked(selectedTicket) && (
  <div className="mb-3 p-3 rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800">
  <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300">
  <Lock className="h-4 w-4" />
  <span className="text-sm font-medium">Aguardando resposta do cliente</span>
  </div>
  <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
  O template foi enviado. O chat sera liberado quando o cliente responder.
  </p>
  {selectedTicket.disparo_em && (
  <DisparoTimer dispatchTime={selectedTicket.disparo_em} />
  )}
  </div>
  )}
  {/* 24h Window Expired Warning */}
  {isWindowExpired && !(selectedTicket?.is_disparo && isDisparoLocked(selectedTicket)) && (
  <div className="mb-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800">
  <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
  <AlertTriangle className="h-4 w-4" />
  <span className="text-sm font-medium">Janela de 24 horas expirada</span>
  </div>
  <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
  A ultima mensagem foi ha mais de 24 horas. Encerre este ticket e aguarde um novo contato do cliente.
  </p>
  </div>
  )}

                {/* Template Suggestions */}
                {showTemplates && filteredTemplates.length > 0 && (
                  <div className="mb-2 max-h-48 overflow-y-auto rounded-lg border bg-background shadow-lg">
                    {filteredTemplates.map((template) => (
                      <button
                        key={template.id}
                        onClick={() => selectTemplate(template)}
                        className="w-full px-3 py-2 text-left hover:bg-muted transition-colors border-b last:border-b-0"
                      >
                        <div className="flex items-center gap-2">
                          <code className="text-xs font-semibold text-primary">/{template.atalho}</code>
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                          {template.mensagem}
                        </p>
                      </button>
                    ))}
                  </div>
                )}

{/* Emoji Picker */}
                  {showEmojiPicker && (
                    <div className="mb-2 flex flex-wrap gap-1 rounded-lg border bg-muted/50 p-2">
                      {commonEmojis.map((emoji) => (
                        <button
                          key={emoji}
                          onClick={() => insertEmoji(emoji)}
                          className="rounded p-1.5 text-lg hover:bg-secondary transition-colors"
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Hidden file input */}
<input
  type="file"
  multiple
  ref={fileInputRef}
  onChange={handleFileInputChange}
  accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.xml,.json,.csv,.zip,.rar,.7z,.tar,.gz,.cer,.crt,.pem,.p12,.pfx,.key"
  className="hidden"
  />

{/* File Preview */}
                    {attachments.length > 0 && (
                      <div className="mb-2 p-2 bg-muted/30 rounded-lg border flex flex-wrap gap-2">
                        {attachments.map((att) => (
                          <div key={att.id} className="relative inline-block">
  {att.preview.startsWith('file:') ? (
  (() => { const { icon: FIcon, color, bg, border } = getFileInfo(att.file.name.split('.').pop() || '', att.file.type); return (
  <div className={cn('flex items-center gap-2 px-3 py-2 rounded border', bg, border)}>
    <FIcon className={cn('h-6 w-6', color)} />
    <span className="text-sm text-foreground max-w-[200px] truncate">{att.file.name}</span>
  </div>) })()
  ) : att.preview.startsWith('video:') ? (
  <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 dark:bg-blue-950/30 rounded border border-blue-200 dark:border-blue-800">
  <Video className="h-6 w-6 text-blue-600" />
  <span className="text-sm text-foreground max-w-[200px] truncate">{att.file.name}</span>
  </div>
  ) : (
  <img
  src={att.preview}
  alt="Preview"
  className="max-h-32 rounded object-contain"
  />
  )}
  <Button
                            variant="destructive"
                            size="icon"
                            className="absolute -right-2 -top-2 h-5 w-5"
                            onClick={() => removeAttachment(att.id)}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Recorded audio preview — listen before sending */}
                    {recordedAudio && recordedAudioUrl && (
                      <div className="mb-2 p-2 bg-violet-50 dark:bg-violet-950/20 rounded-lg border border-violet-200 dark:border-violet-800/50 flex items-center gap-2">
                        <Mic className="h-5 w-5 text-violet-600 shrink-0" />
                        <audio src={recordedAudioUrl} controls className="flex-1 h-9" />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                          onClick={discardRecordedAudio}
                          title="Descartar gravação"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          className="h-8 w-8 shrink-0"
                          onClick={sendRecordedAudio}
                          disabled={uploadingFile}
                          title="Enviar áudio"
                        >
                          {uploadingFile ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        </Button>
                      </div>
                    )}

                    {/* Reply preview — shown when attendant picked a message to quote */}
                    {replyingTo && (
                      <div className="mb-2 p-2 rounded-lg border-l-4 border-violet-500 bg-violet-50/60 dark:bg-violet-950/20 flex items-start gap-2">
                        <CornerUpLeft className="h-4 w-4 text-violet-600 shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-violet-700 dark:text-violet-300">
                            {replyingTo.remetente === 'colaborador' ? 'Você' : (selectedTicket?.clientes?.nome || 'Cliente')}
                          </p>
                          <p className="text-xs text-muted-foreground line-clamp-2">
                            {replyingTo.tipo !== 'texto' && !replyingTo.conteudo
                              ? ({
                                  imagem: '📷 Imagem',
                                  audio: '🎤 Áudio',
                                  video: '📹 Vídeo',
                                  documento: '📎 Documento',
                                } as Record<string, string>)[replyingTo.tipo] || 'Mídia'
                              : (replyingTo.conteudo || '').replace(/^\*[^*\n]+:\*\s*\n*/, '').trim() || 'Mídia'}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 shrink-0"
                          onClick={() => setReplyingTo(null)}
                          title="Cancelar resposta"
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}

                  <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                        className="shrink-0 hidden md:inline-flex"
                      >
                        <Smile className="h-5 w-5 text-muted-foreground" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
  onClick={() => fileInputRef.current?.click()}
  className="shrink-0"
  disabled={isWindowExpired || isRecording || !!recordedAudio || (selectedTicket?.is_disparo === true && isDisparoLocked(selectedTicket))}
                      >
                        <ImageIcon className="h-5 w-5 text-muted-foreground" />
                      </Button>
                      {isRecording ? (
                        <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
                          <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                          <span className="text-sm font-mono text-red-700 dark:text-red-300 tabular-nums min-w-[2.5rem]">
                            {formatDuration(recordingDuration)}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={cancelRecording}
                            className="h-6 w-6"
                            title="Descartar gravação"
                          >
                            <X className="h-3.5 w-3.5 text-red-600" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={stopRecording}
                            className="h-6 w-6"
                            title="Parar e anexar"
                          >
                            <Check className="h-3.5 w-3.5 text-green-600" />
                          </Button>
                        </div>
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={startRecording}
                          className="shrink-0"
                          disabled={isWindowExpired || attachments.length > 0 || !!recordedAudio || (selectedTicket?.is_disparo === true && isDisparoLocked(selectedTicket))}
                          title="Gravar áudio"
                        >
                          <Mic className="h-5 w-5 text-muted-foreground" />
                        </Button>
                      )}
                      {setorIAAtivo && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={handleMelhorarIA}
                          disabled={!messageInput.trim() || melhorandoIA || isWindowExpired}
                          className="shrink-0"
                          title="Melhorar com IA"
                        >
                          {melhorandoIA ? (
                            <Loader2 className="h-5 w-5 animate-spin text-primary" />
                          ) : (
                            <Sparkles className="h-5 w-5 text-primary" />
                          )}
                        </Button>
                      )}
                      <div className="relative flex-1">
                  <textarea
                  ref={messageTextareaRef}
                  value={messageInput}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyPress}
                  onPaste={handlePaste}
                  placeholder={(selectedTicket?.is_disparo && isDisparoLocked(selectedTicket)) ? 'Aguardando resposta do cliente...' : isWindowExpired ? 'Janela expirada - Encerre o ticket' : 'Digite / para atalhos...'}
                  className="w-full resize-none overflow-y-auto rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={isWindowExpired || (selectedTicket?.is_disparo === true && isDisparoLocked(selectedTicket))}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  data-gramm="false"
                  data-gramm_editor="false"
                  data-enable-grammarly="false"
                  data-ms-editor="false"
                  rows={1}
                  style={{ minHeight: '36px', maxHeight: '120px' }}
                  />
                      </div>
                      <Button
                        size="icon"
                        onClick={() => handleSendMessage()}
                        disabled={(!messageInput.trim() && attachments.length === 0) || isWindowExpired || uploadingFile || (selectedTicket?.is_disparo === true && isDisparoLocked(selectedTicket))}
                        className="shrink-0"
                      >
                      {uploadingFile ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                      </Button>
                  </div>
                </div>
            </>
          ) : (
            <div className="flex h-full flex-col items-center justify-center px-6 text-center text-muted-foreground">
              <MessageCircle className="mb-4 h-12 w-12 text-muted-foreground/40" />
              <h2 className="text-xl font-semibold tracking-tight text-foreground">Selecione um ticket</h2>
              <p className="mt-1 max-w-xs text-sm text-muted-foreground">Escolha um ticket na lista para iniciar o atendimento.</p>
              <p className="mt-3 text-xs text-muted-foreground">
                Dica: pressione <kbd className="kbd">Ctrl K</kbd> para buscar.
              </p>
            </div>
          )}
        </main>

{/* Client Info Sidebar — mobile: full-screen overlay; desktop: coluna lateral */}
        {selectedTicket && (
          <aside className={cn(
            "shrink-0 border-l border-border bg-card overflow-y-auto transition-all duration-200",
            // Largura desktop
            "lg:w-64 xl:w-72",
            // Mobile: overlay full-screen começando ABAIXO do header global (h-16 = 64px).
            // z-30 fica embaixo do header sticky (z-40) sem cobri-lo.
            "max-md:fixed max-md:top-16 max-md:inset-x-0 max-md:bottom-0 max-md:z-30 max-md:w-full",
            showClientInfo ? "block lg:block" : "hidden"
          )}>
            {/* Header fechar (mobile only) */}
            <div className="md:hidden sticky top-0 z-20 flex items-center justify-between border-b border-border bg-card px-3 py-2">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setShowClientInfo(false)}
                title="Fechar"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <span className="text-sm font-semibold">Informações</span>
              <span className="w-8" />
            </div>
            {/* Tabs Informações / Histórico — sticky no topo da sidebar */}
            <div className="sticky top-0 z-10 bg-card border-b border-border">
              <div className="flex">
                <button
                  type="button"
                  onClick={() => setInfoTab('info')}
                  className={cn(
                    'flex-1 text-xs font-medium py-2 px-3 transition-colors border-b-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                    infoTab === 'info'
                      ? 'text-primary border-primary'
                      : 'text-muted-foreground border-transparent hover:text-foreground'
                  )}
                >
                  Informações
                </button>
                <button
                  type="button"
                  onClick={() => setInfoTab('historico')}
                  className={cn(
                    'flex-1 text-xs font-medium py-2 px-3 transition-colors border-b-2 flex items-center justify-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                    infoTab === 'historico'
                      ? 'text-primary border-primary'
                      : 'text-muted-foreground border-transparent hover:text-foreground'
                  )}
                >
                  Histórico
                  {ticketHistory.length > 0 && (
                    <span className="text-[9px] bg-muted px-1.5 py-0 rounded-full font-normal">
                      {ticketHistory.length}
                    </span>
                  )}
                </button>
              </div>
            </div>
            <div className="p-4">
              {infoTab === 'info' && (setorCanalConfig === 'discord' ? (
              <>
              {/* Header Dados do Colaborador */}
              <h3 className="text-xs font-semibold text-foreground flex items-center gap-1.5 mb-2">
                <User className="h-3.5 w-3.5" />
                Dados do Colaborador
              </h3>

              {/* Dados compactos */}
              <div className="rounded-lg border bg-muted/30 divide-y divide-border">
                {/* Nome Discord */}
                <div className="flex items-center px-2.5 py-1.5">
                  <label className="w-16 shrink-0 text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                    Nome
                  </label>
                  <p className="text-xs font-medium text-foreground break-words flex-1">
                    {selectedTicket.user_name_discord || '—'}
                  </p>
                  {selectedTicket.user_name_discord && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 shrink-0"
                      onClick={() => copyToClipboard(selectedTicket.user_name_discord || '', 'Nome Discord')}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  )}
                </div>

                {/* Discord ID */}
                <div className="flex items-center px-2.5 py-1.5">
                  <label className="w-16 shrink-0 text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                    ID
                  </label>
                  {(() => {
                    const lastClientMsg = mensagens.filter(m => m.remetente === 'cliente' && m.discord_user_id).pop()
                    const discordId = lastClientMsg?.discord_user_id || null
                    return (
                      <>
                        <p className="text-xs font-mono text-foreground break-all flex-1">
                          {discordId || '—'}
                        </p>
                        {discordId && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5 shrink-0"
                            onClick={() => copyToClipboard(discordId, 'Discord ID')}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        )}
                      </>
                    )
                  })()}
                </div>
              </div>

              </>
              ) : (
              <>
              {/* Header Dados do Cliente */}
              <div className="flex items-center justify-between mb-2">
                <button
                  type="button"
                  onClick={() => toggleSection('cliente')}
                  className="text-xs font-semibold text-foreground flex items-center gap-1.5 hover:opacity-80 transition-opacity"
                >
                  <User className="h-3.5 w-3.5" />
                  Dados do Cliente
                  <ChevronDown className={cn('h-3 w-3 transition-transform', collapsedSections.cliente && '-rotate-90')} />
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0"
                      aria-label="Mais opções do cliente"
                      title="Mais opções"
                    >
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-40">
                    <DropdownMenuItem onClick={handleAbrirEditarCliente} className="gap-2">
                      <Pencil className="h-3.5 w-3.5 text-amber-600" />
                      Editar
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        setEncerrarAposVinculoCliente(false)
                        setSelecionarClienteCnpj('')
                        setSelecionarClienteData(null)
                        setSelecionarClienteDialogOpen(true)
                      }}
                      className="gap-2"
                    >
                      <Search className="h-3.5 w-3.5 text-primary" />
                      {clienteTemCNPJ ? 'Trocar' : 'Selecionar'}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Campo linha: label + valor + copy */}
              {!collapsedSections.cliente && (
              <div className="rounded-lg border border-border bg-muted/30 divide-y divide-border overflow-hidden text-[11px]">
                {/* Nome */}
                <div className="flex items-center justify-between px-2.5 py-1.5 gap-2">
                  <span className="text-muted-foreground shrink-0 w-16">Nome</span>
                  <span className="font-medium text-foreground flex-1 text-right truncate">
                    {selectedTicket.clientes.nome || '—'}
                  </span>
                  {selectedTicket.clientes.nome && (
                    <button
                      type="button"
                      onClick={() => copyToClipboard(selectedTicket.clientes.nome, 'Nome')}
                      className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                  )}
                </div>

                {/* Telefone */}
                <div className="flex items-center justify-between px-2.5 py-1.5 gap-2">
                  <span className="text-muted-foreground shrink-0 w-16">Telefone</span>
                  <span className="font-medium text-foreground flex-1 text-right truncate">
                    {selectedTicket.clientes.telefone ? formatPhone(selectedTicket.clientes.telefone) : '—'}
                  </span>
                  {selectedTicket.clientes.telefone && (
                    <button
                      type="button"
                      onClick={() => copyToClipboard(telefoneSemDDI(selectedTicket.clientes.telefone), 'Telefone')}
                      className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                  )}
                </div>

                {/* Sistema — vem de clientes.software (sincronização externa, somente leitura) */}
                <div className="flex items-center justify-between px-2.5 py-1.5 gap-2">
                  <span className="text-muted-foreground shrink-0 w-16">Sistema</span>
                  <span className="font-medium text-foreground flex-1 text-right truncate">
                    {formatSistemaCliente(selectedTicket.clientes.software) || '—'}
                  </span>
                </div>

                {/* Prime — vem de clientes.prime (somente leitura); "—" quando não informado */}
                <div className="flex items-center justify-between px-2.5 py-1.5 gap-2">
                  <span className="text-muted-foreground shrink-0 w-16">Prime</span>
                  <span
                    className={cn(
                      'flex-1 text-right truncate',
                      isClientePrime(selectedTicket.clientes.prime)
                        ? 'font-semibold text-primary'
                        : 'font-medium text-foreground',
                    )}
                  >
                    {formatPrimeCliente(selectedTicket.clientes.prime)}
                  </span>
                </div>

                {/* Registro */}
                <div className="flex items-center justify-between px-2.5 py-1.5 gap-2">
                  <span className="text-muted-foreground shrink-0 w-16">Registro</span>
                  <span className="font-medium text-foreground flex-1 text-right truncate">
                    {selectedTicket.clientes.Registro || '—'}
                  </span>
                  {selectedTicket.clientes.Registro && (
                    <button
                      type="button"
                      onClick={() => copyToClipboard(selectedTicket.clientes.Registro!, 'Registro')}
                      className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                  )}
                </div>

                {/* CNPJ ou CPF (cliente MEI) — o rótulo segue o documento cadastrado */}
                <div className="flex items-center justify-between px-2.5 py-1.5 gap-2">
                  <span className="text-muted-foreground shrink-0 w-16">
                    {selectedTicket.clientes.CNPJ ? rotuloDocumento(selectedTicket.clientes.CNPJ) : 'CNPJ'}
                  </span>
                  <span className="font-medium text-foreground flex-1 text-right truncate">
                    {selectedTicket.clientes.CNPJ ? formatDocumento(selectedTicket.clientes.CNPJ) : '—'}
                  </span>
                  {selectedTicket.clientes.CNPJ && (
                    <button
                      type="button"
                      onClick={() => copyToClipboard(selectedTicket.clientes.CNPJ!.replace(/\D/g, ''), rotuloDocumento(selectedTicket.clientes.CNPJ))}
                      className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                  )}
                </div>

                {/* PDV */}
                <div className="flex items-center justify-between px-2.5 py-1.5 gap-2">
                  <span className="text-muted-foreground shrink-0 w-16">PDV</span>
                  <span className="font-medium text-foreground flex-1 text-right truncate">
                    {selectedTicket.clientes.PDV || '—'}
                  </span>
                </div>

                {/* Cliente Desde */}
                {selectedTicket.clientes.created_at && (
                  <div className="flex items-center justify-between px-2.5 py-1.5 gap-2">
                    <span className="text-muted-foreground shrink-0 w-16">Desde</span>
                    <span className="font-medium text-foreground flex-1 text-right">
                      {format(new Date(selectedTicket.clientes.created_at), 'dd/MM/yyyy', { locale: ptBR })}
                    </span>
                  </div>
                )}
              </div>
              )}

              {/* Verificar MDM — consulta o agente de gestão de máquinas pelo CNPJ do cliente.
                  Sempre visível: sem CNPJ cadastrado, o popover orienta a preencher em Editar
                  em vez de esconder a ação inteira. */}
              <Popover open={mdmPopoverOpen} onOpenChange={handleMdmPopoverChange}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      'w-full mt-2 h-8 text-xs gap-2',
                      mdmResult && !mdmResult.hasMdm && 'border-amber-400/50 text-amber-700 hover:bg-amber-100 dark:text-amber-200 dark:hover:bg-amber-900/40',
                    )}
                  >
                    {mdmResult && !mdmResult.hasMdm ? (
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    ) : (
                      <img src="/softcom-mdm-logo.png" alt="" className="h-3.5 w-3.5 shrink-0 rounded-sm" />
                    )}
                    {mdmResult && !mdmResult.hasMdm ? 'MDM não configurado' : 'Verificar MDM'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-72 text-xs">
                  {!clienteTemCNPJ && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-200">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        <p>Cliente sem CNPJ cadastrado.</p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 w-full justify-center text-[10px] px-2 gap-1"
                        onClick={() => {
                          setMdmPopoverOpen(false)
                          handleAbrirEditarCliente()
                        }}
                      >
                        <Pencil className="h-3 w-3" />
                        Preencher CNPJ em Editar
                      </Button>
                    </div>
                  )}
                  {clienteTemCNPJ && mdmLoading && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Consultando MDM...
                      </div>
                    )}
                    {clienteTemCNPJ && !mdmLoading && mdmError && (
                      <p className="text-destructive">{mdmError}</p>
                    )}
                    {clienteTemCNPJ && !mdmLoading && !mdmError && mdmResult && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="font-semibold text-foreground">
                            {mdmResult.hasMdm ? 'MDM instalado' : 'Sem MDM instalado'}
                          </p>
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 shrink-0">
                            {mdmResult.totalMachines} {mdmResult.totalMachines === 1 ? 'máquina' : 'máquinas'}
                          </Badge>
                        </div>
                        {mdmResult.machines.length > 0 && (
                          <div className="rounded-lg border border-border divide-y divide-border overflow-hidden">
                            {mdmResult.machines.map((maquina) => (
                              <div key={maquina.clientId} className="flex items-center justify-between px-2.5 py-1.5 gap-2">
                                <div className="min-w-0">
                                  <p className="font-medium text-foreground truncate">{maquina.hostname}</p>
                                  <p className="text-[11px] text-muted-foreground truncate">
                                    {maquina.hasMdm ? `MDM v${maquina.mdmVersion}` : 'sem MDM'}
                                    {maquina.lastInventory && (
                                      ` · ${formatDistanceToNow(new Date(maquina.lastInventory), { locale: ptBR, addSuffix: true })}`
                                    )}
                                  </p>
                                </div>
                                <span className={cn(
                                  'shrink-0 flex items-center gap-1 text-[10px]',
                                  maquina.online ? 'text-green-500' : 'text-muted-foreground',
                                )}>
                                  <span className={cn('h-1.5 w-1.5 rounded-full', maquina.online ? 'bg-green-500' : 'bg-muted-foreground/50')} />
                                  {maquina.online ? 'Online' : 'Offline'}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                        {mdmResult.hasMdm && (
                          <Button
                            asChild
                            variant="outline"
                            size="sm"
                            className="h-6 w-full justify-center text-[10px] px-2 gap-1"
                          >
                            <a
                              href={buildMdmCampanhaUrl(selectedTicket.clientes.CNPJ)}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <ExternalLink className="h-3 w-3" />
                              Abrir campanha de instalação
                            </a>
                          </Button>
                        )}
                        {!mdmResult.hasMdm && (
                          <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-2 text-[11px] text-amber-900 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200">
                            <div className="flex items-center gap-1.5">
                              <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                              <p>
                                {mdmResult.totalMachines === 0
                                  ? 'Nenhuma máquina no MDM configurada para este CNPJ.'
                                  : 'Nenhuma máquina com o agente instalado.'}
                              </p>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-6 w-full justify-center text-[10px] px-2 gap-1 border-amber-400/50 text-amber-700 hover:bg-amber-100 dark:text-amber-200 dark:hover:bg-amber-900/40"
                              onClick={fetchMdmStatus}
                              disabled={mdmLoading}
                            >
                              <RefreshCw className={cn('h-3 w-3', mdmLoading && 'animate-spin')} />
                              Verificar novamente
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </PopoverContent>
                </Popover>
              </>
              ))}

              {/* Ticket Info Section */}
              {infoTab === 'info' && (
              <div className="mt-4 pt-4 border-t border-border">
                <button
                  type="button"
                  onClick={() => toggleSection('ticket')}
                  className="w-full text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5 hover:opacity-80 transition-opacity"
                >
                  <MessageCircle className="h-3.5 w-3.5" />
                  Info do Ticket
                  <ChevronDown className={cn('h-3 w-3 ml-auto transition-transform', collapsedSections.ticket && '-rotate-90')} />
                </button>

                {!collapsedSections.ticket && (
                <div className="rounded-lg border border-border bg-muted/30 divide-y divide-border overflow-hidden text-[11px]">
                  {/* Número */}
                  <div className="flex items-center justify-between px-2.5 py-1.5 gap-2">
                    <span className="text-muted-foreground shrink-0 w-16">Número</span>
                    <span className="tabnums font-mono font-bold text-foreground flex-1 text-right select-all">
                      #{selectedTicket.numero}
                    </span>
                  </div>

                  {/* Prioridade — só aparece se urgente */}
                  {selectedTicket.prioridade === 'urgente' && (
                    <div className="flex items-center justify-between px-2.5 py-1.5 gap-2">
                      <span className="text-muted-foreground shrink-0 w-16">Prioridade</span>
                      <Badge
                        variant="outline"
                        className="text-[10px] px-1.5 py-0 h-4 border-red-300 text-red-600"
                      >
                        Urgente
                      </Badge>
                    </div>
                  )}

                  {/* Canal */}
                  <div className="flex items-center justify-between px-2.5 py-1.5 gap-2">
                    <span className="text-muted-foreground shrink-0 w-16">Canal</span>
                    <span className="font-medium text-foreground capitalize">{selectedTicket.canal}</span>
                  </div>

                  {/* Criado em */}
                  <div className="flex items-center justify-between px-2.5 py-1.5 gap-2">
                    <span className="text-muted-foreground shrink-0 w-16">Criado em</span>
                    <span className="font-medium text-foreground">
                      {new Date(selectedTicket.criado_em).toLocaleDateString('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                        year: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>

                  {/* Aberto há */}
                  <div className="flex items-center justify-between px-2.5 py-1.5 gap-2">
                    <span className="text-muted-foreground shrink-0 w-16">Aberto</span>
                    <span className="font-medium text-foreground">
                      {formatDistanceToNow(new Date(selectedTicket.criado_em), {
                        locale: ptBR,
                        addSuffix: true,
                      })}
                    </span>
                  </div>

                  {/* 1ª resposta */}
                  {selectedTicket.primeira_resposta_em && (
                    <div className="flex items-center justify-between px-2.5 py-1.5 gap-2">
                      <span className="text-muted-foreground shrink-0 w-16">1ª resposta</span>
                      <span className="font-medium text-foreground">
                        {formatDistanceToNow(new Date(selectedTicket.primeira_resposta_em), {
                          locale: ptBR,
                          addSuffix: true,
                        })}
                      </span>
                    </div>
                  )}
                </div>
                )}

                {/* Botão: Abrir ticket no sistema Softcom — sempre visível,
                    mesmo quando a seção "Info do Ticket" está colapsada. */}
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="w-full mt-3 h-8 text-xs gap-2 border-primary/40 text-primary hover:bg-primary/10"
                >
                  <a href={buildOcorrenciaRapidaUrl(selectedTicket)} target="_blank" rel="noopener noreferrer">
                    <Ticket className="h-3.5 w-3.5" />
                    Abrir ticket
                  </a>
                </Button>
              </div>
              )}

              {/* Histórico de Atendimentos — aba inteira */}
              {infoTab === 'historico' && (
              <div>
                <h3 className="text-xs font-semibold text-foreground mb-3 flex items-center gap-1.5">
                  <History className="h-3.5 w-3.5" />
                  Histórico de Atendimentos
                  {ticketHistory.length > 0 && (
                    <span className="text-[10px] font-normal text-muted-foreground">
                      ({ticketHistory.length})
                    </span>
                  )}
                </h3>

                {loadingHistory ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground px-2.5 py-1.5">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Carregando…
                  </div>
                ) : ticketHistory.length === 0 ? (
                  <div className="text-xs text-muted-foreground px-2.5 py-2 rounded-md border border-dashed border-border">
                    Nenhum atendimento anterior
                  </div>
                ) : (
                  <div className="rounded-lg border border-border bg-muted/30 divide-y divide-border overflow-hidden text-xs max-h-72 overflow-y-auto">
                    {ticketHistory.map((h) => {
                      const refDate = h.encerrado_em || h.criado_em
                      const isEncerrado = h.status === 'encerrado'
                      return (
                        <button
                          key={h.id}
                          type="button"
                          onClick={() => abrirHistoricoConversa(h)}
                          title="Abrir conversa"
                          className="w-full text-left px-2.5 py-2 flex flex-col gap-0.5 hover:bg-accent/60 transition-colors cursor-pointer"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="tabnums font-mono font-semibold text-foreground">#{h.numero ?? '?'}</span>
                            <span
                              className={cn(
                                'text-[9px] uppercase px-1.5 py-0 rounded',
                                isEncerrado
                                  ? 'bg-muted text-muted-foreground'
                                  : h.status === 'em_atendimento'
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : 'bg-blue-100 text-blue-700',
                              )}
                            >
                              {isEncerrado ? 'Encerrado' : h.status === 'em_atendimento' ? 'Atendendo' : 'Aberto'}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-muted-foreground truncate">
                              {h.colaborador_nome || 'Sem atendente'}
                            </span>
                            <span className="text-[10px] text-muted-foreground shrink-0">
                              {new Date(refDate).toLocaleDateString('pt-BR', {
                                day: '2-digit',
                                month: '2-digit',
                                year: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
              )}

              {/* Nexus AI Section */}
              {infoTab === 'info' && setorNexusAtivo && (
              <div className="mt-4 pt-4 border-t border-border">
                <div className="flex items-center gap-2 mb-3">
                  <svg width="87" height="16" viewBox="0 0 87 16" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-4 w-auto">
                    <path d="M15.744 12.36L14.736 12.768V-4.62532e-05H17.928V15.528H14.736L2.18401 3.26395L3.19201 2.85595V15.528H8.22544e-06V-4.62532e-05H3.19201L15.744 12.36ZM32.0968 11.568H35.1208C34.9928 12.384 34.6488 13.112 34.0888 13.752C33.5448 14.392 32.8008 14.896 31.8568 15.264C30.9128 15.632 29.7608 15.816 28.4008 15.816C26.8808 15.816 25.5368 15.576 24.3688 15.096C23.2008 14.6 22.2888 13.888 21.6328 12.96C20.9768 12.032 20.6488 10.912 20.6488 9.59995C20.6488 8.28795 20.9688 7.16795 21.6088 6.23995C22.2488 5.29595 23.1368 4.57595 24.2728 4.07995C25.4248 3.58395 26.7688 3.33595 28.3048 3.33595C29.8728 3.33595 31.1768 3.58395 32.2168 4.07995C33.2568 4.57595 34.0248 5.32795 34.5208 6.33595C35.0328 7.32795 35.2488 8.59995 35.1688 10.152H23.7928C23.8728 10.76 24.0968 11.312 24.4648 11.808C24.8488 12.304 25.3608 12.696 26.0008 12.984C26.6568 13.272 27.4328 13.416 28.3288 13.416C29.3208 13.416 30.1448 13.248 30.8008 12.912C31.4728 12.56 31.9048 12.112 32.0968 11.568ZM28.1608 5.71195C27.0088 5.71195 26.0728 5.96795 25.3528 6.47995C24.6328 6.97595 24.1688 7.59195 23.9608 8.32795H32.0728C31.9928 7.52795 31.6088 6.89595 30.9208 6.43195C30.2488 5.95195 29.3288 5.71195 28.1608 5.71195ZM50.4634 3.59995L44.2714 10.248L39.8074 15.528H35.9914L42.4474 8.54395L46.6714 3.59995H50.4634ZM35.9914 3.59995H39.8074L44.3194 8.49595L50.7994 15.528H46.9834L42.3514 10.32L35.9914 3.59995ZM66.5248 15.528H63.4048V3.59995H66.5248V15.528ZM63.5728 9.79195L63.5968 10.608C63.5648 10.832 63.4848 11.16 63.3568 11.592C63.2288 12.008 63.0288 12.456 62.7568 12.936C62.5008 13.416 62.1648 13.88 61.7488 14.328C61.3328 14.76 60.8208 15.12 60.2128 15.408C59.6048 15.68 58.8848 15.816 58.0528 15.816C57.3968 15.816 56.7488 15.736 56.1088 15.576C55.4848 15.416 54.9168 15.152 54.4048 14.784C53.8928 14.4 53.4848 13.888 53.1808 13.248C52.8768 12.608 52.7248 11.8 52.7248 10.824V3.59995H55.8448V10.296C55.8448 11.064 55.9648 11.672 56.2048 12.12C56.4608 12.552 56.8288 12.856 57.3088 13.032C57.7888 13.208 58.3568 13.296 59.0128 13.296C59.8768 13.296 60.6208 13.112 61.2448 12.744C61.8688 12.36 62.3728 11.896 62.7568 11.352C63.1568 10.808 63.4288 10.288 63.5728 9.79195ZM68.8854 11.568H71.7654C71.9414 12.112 72.3014 12.56 72.8454 12.912C73.4054 13.248 74.1334 13.416 75.0294 13.416C75.6374 13.416 76.1094 13.36 76.4454 13.248C76.7814 13.136 77.0134 12.976 77.1414 12.768C77.2694 12.544 77.3334 12.296 77.3334 12.024C77.3334 11.688 77.2294 11.432 77.0214 11.256C76.8134 11.064 76.4934 10.912 76.0614 10.8C75.6294 10.688 75.0774 10.584 74.4054 10.488C73.7334 10.376 73.0854 10.24 72.4614 10.08C71.8374 9.91995 71.2854 9.71195 70.8054 9.45595C70.3254 9.18395 69.9414 8.84795 69.6534 8.44795C69.3814 8.03195 69.2454 7.52795 69.2454 6.93595C69.2454 6.35995 69.3814 5.84795 69.6534 5.39995C69.9414 4.95195 70.3334 4.57595 70.8294 4.27195C71.3414 3.96795 71.9334 3.73595 72.6054 3.57595C73.2934 3.41595 74.0294 3.33595 74.8134 3.33595C75.9974 3.33595 76.9814 3.51195 77.7654 3.86395C78.5494 4.19995 79.1334 4.67995 79.5174 5.30395C79.9174 5.91195 80.1174 6.61595 80.1174 7.41595H77.3574C77.2294 6.82395 76.9734 6.39995 76.5894 6.14395C76.2054 5.87195 75.6134 5.73595 74.8134 5.73595C74.0294 5.73595 73.4374 5.85595 73.0374 6.09595C72.6374 6.33595 72.4374 6.66395 72.4374 7.07995C72.4374 7.41595 72.5574 7.67995 72.7974 7.87195C73.0534 8.04795 73.4214 8.19195 73.9014 8.30395C74.3974 8.41595 75.0134 8.53595 75.7494 8.66395C76.3734 8.79195 76.9654 8.93595 77.5254 9.09595C78.1014 9.25595 78.6134 9.46395 79.0614 9.71995C79.5094 9.95995 79.8614 10.288 80.1174 10.704C80.3894 11.104 80.5254 11.616 80.5254 12.24C80.5254 13.008 80.3014 13.656 79.8534 14.184C79.4214 14.712 78.7974 15.12 77.9814 15.408C77.1654 15.68 76.1894 15.816 75.0534 15.816C74.0454 15.816 73.1734 15.712 72.4374 15.504C71.7174 15.28 71.1174 15 70.6374 14.664C70.1574 14.312 69.7814 13.944 69.5094 13.56C69.2534 13.16 69.0774 12.784 68.9814 12.432C68.8854 12.08 68.8534 11.792 68.8854 11.568Z" fill="currentColor"/>
                    <path d="M86.5363 12.792V15.528H82.9123V12.792H86.5363Z" fill="#FF6B00"/>
                  </svg>
                  <div className="h-4 w-px bg-border" />
                  <span className="text-[10px] text-muted-foreground">Assistente IA</span>
                </div>

                {!nexusResponse && !nexusLoading && !nexusProductPicker && (
                  <button
                    onClick={() => setNexusProductPicker(true)}
                    className="w-full flex items-center justify-center gap-2 rounded-lg border border-primary/20 bg-primary/5 hover:bg-primary/10 px-3 py-2.5 text-xs font-medium text-primary transition-colors"
                  >
                    <Search className="h-3.5 w-3.5" />
                    Ajuda com o Nexus?
                  </button>
                )}

                {nexusProductPicker && !nexusLoading && (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground text-center">Qual o software do cliente?</p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleNexusAjuda('softshop')}
                        className="flex-1 rounded-lg border border-primary/20 bg-primary/5 hover:bg-primary/10 px-3 py-2 text-xs font-medium text-primary transition-colors"
                      >
                        Softshop
                      </button>
                      <button
                        onClick={() => handleNexusAjuda('softcomshop')}
                        className="flex-1 rounded-lg border border-primary/20 bg-primary/5 hover:bg-primary/10 px-3 py-2 text-xs font-medium text-primary transition-colors"
                      >
                        Softcomshop
                      </button>
                    </div>
                    <button
                      onClick={() => setNexusProductPicker(false)}
                      className="w-full text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Cancelar
                    </button>
                  </div>
                )}

                {nexusLoading && (
                  <div className="flex items-center justify-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-4 text-xs text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    Consultando Nexus...
                  </div>
                )}

                {nexusResponse && !nexusLoading && (
                  <div className="space-y-2">
                    <div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-xs leading-relaxed text-foreground max-h-48 overflow-y-auto whitespace-pre-wrap">
                      {nexusResponse}
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <button
                        onClick={() => {
                          setMessageInput(nexusResponse)
                          setNexusResponse(null)
                        }}
                        className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                      >
                        <Send className="h-3 w-3" />
                        Enviar ao cliente
                      </button>
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => { setNexusResponse(null); setNexusProductPicker(true) }}
                          className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-border px-2 py-1.5 text-[11px] text-muted-foreground hover:bg-muted/50 transition-colors"
                        >
                          <Zap className="h-3 w-3" />
                          Consultar novamente
                        </button>
                        <button
                          onClick={() => setNexusResponse(null)}
                          className="flex-1 flex items-center justify-center rounded-lg border border-border px-2 py-1.5 text-[11px] text-muted-foreground hover:bg-muted/50 transition-colors"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
            </div>
          </aside>
        )}
      </div>

      {/* Mobile Chat Sheet */}
      <Sheet open={!!selectedTicket && mobileDrawerOpen} onOpenChange={() => setMobileDrawerOpen(false)}>
        <SheetContent side="right" className="w-full p-0 sm:max-w-full">
          <SheetTitle className="sr-only">Chat do Ticket</SheetTitle>
          {selectedTicket && (
            <div className="flex h-full flex-col">
              {/* Chat Header */}
              <div className="flex items-center justify-between border-b border-border bg-card px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary">
                    <User className="h-5 w-5 text-secondary-foreground" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-sm font-semibold truncate">{setorCanalConfig === 'discord' ? (selectedTicket.user_name_discord || selectedTicket.clientes.nome) : selectedTicket.clientes.nome}</span>
                    {isClientePrime(selectedTicket.clientes.prime) && (
                      <span className="ml-1.5 inline-flex items-center rounded-md bg-primary/10 px-1.5 py-0.5 align-middle text-[10px] font-semibold uppercase tracking-wide text-primary">
                        Prime
                      </span>
                    )}
                    <span className="tabnums font-mono hidden md:inline text-xs text-muted-foreground ml-1.5">#{selectedTicket.numero}</span>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
onClick={() => {
                        setSelectedTicket(null)
                        selectedTicketIdRef.current = null
                        setMobileDrawerOpen(false)
                      }}
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>

              {/* Messages */}
              <ScrollArea className="flex-1 p-4" viewportRef={mobileMessagesViewportRef}>
                {mensagens.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground">
                    <MessageCircle className="mb-2 h-12 w-12 text-muted-foreground/40" />
                    <p className="text-sm font-medium tracking-tight text-foreground">Nenhuma mensagem ainda</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">As mensagens aparecerão aqui.</p>
                  </div>
) : (
                      <div className="space-y-4">
                        {(() => {
                          const currentTicketId = selectedTicket?.id
                          const idsContextoNexusOrfao = selecionarIdsContextoNexusOrfao(
                            mensagens,
                            selectedTicket?.criado_em,
                          )
                          const isCurrentTicketContext = (message: Mensagem) => (
                            currentTicketId
                              ? pertenceAoContextoDoTicket(message, currentTicketId, idsContextoNexusOrfao)
                              : false
                          )
                          // Garante que o ticket atual e o seu contexto Nexus apareçam por último.
                          const mensagensOrdenadas = selectedTicket
                            ? [
                                ...mensagens.filter((m) => !isCurrentTicketContext(m)),
                                ...mensagens.filter(isCurrentTicketContext),
                              ]
                            : mensagens
                          const nexusConversationMessages = currentTicketId
                            ? mensagensOrdenadas.filter((m) => (
                                isCurrentTicketContext(m) && isNexusMessage(m)
                              ))
                            : []
                          const firstNexusConversationMessageId = nexusConversationMessages[0]?.id
                          const inicioHumanoDoTicketId = nexusConversationMessages.length > 0 && currentTicketId
                            ? selecionarInicioHumanoDoTicket(mensagensOrdenadas, currentTicketId)
                            : undefined

                          let lastTicketId: string | null = null
                          return mensagensOrdenadas.map((msg, index) => {
                            const msgStatus = pendingMessages.get(msg.id)
                            // Sem entrada efêmera (ex: depois de um reload), cai pro status persistido no banco.
                            // 'indeterminado' = perdemos a resposta da API, não sabemos se o provedor recebeu.
                            const sendOutcome = computeSendOutcome(msgStatus, msg.status_envio)
                            const isFailedSend = sendOutcome === 'failed' || sendOutcome === 'indeterminate'
                            const messageTicketId = idsContextoNexusOrfao.has(msg.id)
                              ? currentTicketId
                              : msg.ticket_id
                            const isNewTicket = messageTicketId !== lastTicketId
                            const isCurrentTicket = messageTicketId === currentTicketId
                            const isPreviousTicket = !isCurrentTicket && isNewTicket
                            const canRetrySend = Boolean(
                              isFailedSend
                              && isCurrentTicket
                              && msg.remetente === 'colaborador'
                              && !msg.id.startsWith('temp-')
                              && selectedTicket
                              && ['aberto', 'em_atendimento'].includes(selectedTicket.status)
                              && ['falhou', 'indeterminado'].includes(msg.status_envio || '')
                            )
                            lastTicketId = messageTicketId

                            return (
                              <React.Fragment key={msg.id}>
                                {msg.id === firstNexusConversationMessageId && (
                                  <SeparadorConversaNexus quantidade={nexusConversationMessages.length} />
                                )}
                                {msg.id === inicioHumanoDoTicketId && (
                                  <div data-ticket-start className="scroll-mt-4">
                                    <SeparadorInicioTicket numero={selectedTicket?.numero} />
                                  </div>
                                )}
                                {/* Ticket separator for history */}
                                {isPreviousTicket && (
                                  <div className="flex items-center gap-2 py-2">
                                    <div className="flex-1 h-px bg-border" />
                                    <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/50 border border-border text-[10px] text-muted-foreground">
                                      <History className="h-2.5 w-2.5" />
                                      <span>
                                        {(msg.tickets?.criado_em || msg.enviado_em)
                                          ? new Date(msg.tickets?.criado_em || msg.enviado_em).toLocaleDateString('pt-BR', {
                                              day: '2-digit',
                                              month: '2-digit',
                                            })
                                          : '?'}
                                      </span>
                                    </div>
                                    <div className="flex-1 h-px bg-border" />
                                  </div>
                                )}
                                {/* Current ticket separator */}
                                {isNewTicket && isCurrentTicket && index > 0 && (
                                  <div className="flex items-center gap-2 py-2">
                                    <div className="flex-1 h-px bg-primary/30" />
                                    <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-primary/10 border border-primary/20 text-[10px] text-primary font-medium">
                                      <MessageCircle className="h-2.5 w-2.5" />
                                      <span>Atual</span>
                                    </div>
                                    <div className="flex-1 h-px bg-primary/30" />
                                  </div>
                                )}
                                <MensagemBubble
                                  mensagem={msg}
                                  dimmed={!isCurrentTicket}
                                  sendOutcome={sendOutcome}
                                  erroEnvio={messageErrors.get(msg.id)}
                                  onRetry={canRetrySend ? requestRetrySend : undefined}
                                  media={msg.url_imagem && (
                                    <MessageMedia
                                      url={msg.url_imagem}
                                      mediaType={msg.media_type}
                                      tipo={msg.tipo}
                                      conteudo={msg.conteudo}
                                      isOutgoing={isOutgoingMessage(msg.remetente)}
                                      mensagemId={msg.id}
                                      setorId={selectedTicket?.setor_id}
                                      setorIAAtivo={setorIAAtivo}
                                      onTranscricao={(id, text) => {
                                        setMensagens(prev => prev.map(m => m.id === id ? { ...m, conteudo: text } : m))
                                      }}
                                    />
                                  )}
                                />
                              </React.Fragment>
                            )
                          })
                        })()}
                      </div>
                    )}
                  </ScrollArea>

            {/* Input Area Mobile */}
            <div className="border-t border-border bg-card p-3 space-y-2">
              {selectedTicket.status === 'aberto' && (
                <Button
                  onClick={handleMarcarEmAtendimento}
                  className="w-full bg-green-600 hover:bg-green-700 text-white gap-2"
                >
                    <CheckCircle className="h-4 w-4" />
                    ✨ Iniciar Atendimento
                  </Button>
                )}
                
{/* File Preview Mobile */}
                    {attachments.length > 0 && (
                      <div className="mb-2 p-2 bg-muted/30 rounded-lg border flex flex-wrap gap-2">
                        {attachments.map((att) => (
                          <div key={att.id} className="relative inline-block">
  {att.preview.startsWith('file:') ? (
  (() => { const { icon: FIcon, color, bg, border } = getFileInfo(att.file.name.split('.').pop() || '', att.file.type); return (
  <div className={cn('flex items-center gap-2 px-2 py-1.5 rounded border', bg, border)}>
    <FIcon className={cn('h-5 w-5', color)} />
    <span className="text-xs text-foreground max-w-[100px] truncate">{att.file.name}</span>
  </div>) })()
  ) : att.preview.startsWith('video:') ? (
  <div className="flex items-center gap-2 px-2 py-1.5 bg-blue-50 dark:bg-blue-950/30 rounded border border-blue-200 dark:border-blue-800">
  <Video className="h-5 w-5 text-blue-600" />
  <span className="text-xs text-foreground max-w-[100px] truncate">{att.file.name}</span>
  </div>
  ) : (
  <img
  src={att.preview}
  alt="Preview"
  className="max-h-16 max-w-[120px] rounded-lg border object-cover"
  />
  )}
  <button
                            type="button"
                            onClick={() => removeAttachment(att.id)}
                            className="absolute -top-2 -right-2 rounded-full bg-destructive text-destructive-foreground p-1"
                          >
                            <X className="h-3 w-3" />
                          </button>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                        className="shrink-0 hidden md:inline-flex"
                      >
                        <Smile className="h-5 w-5 text-muted-foreground" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => fileInputRef.current?.click()}
                        className="shrink-0"
                      >
                        <ImageIcon className="h-5 w-5 text-muted-foreground" />
                      </Button>
                  <textarea
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  onKeyDown={handleKeyPress}
                  onPaste={handlePaste}
                  placeholder="Mensagem..."
                  className="flex-1 resize-none overflow-y-auto rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  data-gramm="false"
                  data-gramm_editor="false"
                  data-enable-grammarly="false"
                  data-ms-editor="false"
                  rows={1}
                  style={{ minHeight: '36px', maxHeight: '120px' }}
                  />
                      <Button
                        size="icon"
                        onClick={() => handleSendMessage()}
                        disabled={(!messageInput.trim() && attachments.length === 0) || uploadingFile}
                        className="shrink-0"
                      >
                  {uploadingFile ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                
                {selectedTicket.status === 'em_atendimento' && (
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => setTransferDialogOpen(true)}
                      className="flex-1 gap-1 bg-transparent"
                    >
                      <ArrowRightLeft className="h-4 w-4" />
                      Transferir
                    </Button>
                    <Button 
                      variant="destructive"
                      size="sm"
                      onClick={handleAbrirEncerrar}
                      className="flex-1 gap-1"
                    >
                      <XCircle className="h-4 w-4" />
                      Encerrar
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Conversa de atendimento anterior (somente leitura) */}
      <Dialog open={!!historicoConversa} onOpenChange={(open) => { if (!open) setHistoricoConversa(null) }}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col gap-0 p-0 overflow-hidden">
          <DialogHeader className="border-b px-5 py-3">
            <DialogTitle className="flex items-center gap-2 text-base">
              <History className="h-4 w-4" />
              Atendimento #{historicoConversa?.numero ?? '?'}
            </DialogTitle>
            <DialogDescription>
              {historicoConversa?.colaborador_nome || 'Sem atendente'}
              {historicoConversa && (
                <> · {new Date(historicoConversa.encerrado_em || historicoConversa.criado_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</>
              )}
            </DialogDescription>
          </DialogHeader>
          <div ref={historicoScrollRef} className="flex-1 overflow-y-auto space-y-2 bg-muted/20 px-4 py-4">
            {historicoConversaLoading ? (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando conversa…
              </div>
            ) : historicoConversaMsgs.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                Nenhuma mensagem nesta conversa.
              </div>
            ) : (
              historicoConversaMsgs.map((m) => {
                if (m.remetente === 'sistema') {
                  return (
                    <div key={m.id} className="flex justify-center">
                      <span className="rounded-full bg-muted px-3 py-1 text-[11px] text-muted-foreground">{m.conteudo}</span>
                    </div>
                  )
                }
                const outgoing = !isClientMessage(m.remetente)
                const isImage = !!m.url_imagem && (m.tipo === 'imagem' || (m.media_type || '').startsWith('image'))
                return (
                  <div key={m.id} className={cn('flex', outgoing ? 'justify-end' : 'justify-start')}>
                    <div className={cn(
                      'max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow-sm',
                      outgoing ? 'bg-primary text-primary-foreground' : 'border bg-background',
                    )}>
                      {m.url_imagem && (
                        isImage ? (
                          <a href={m.url_imagem} target="_blank" rel="noopener noreferrer">
                            <img src={m.url_imagem} alt="anexo" className="mb-1 max-h-60 rounded-lg object-contain" />
                          </a>
                        ) : (
                          <a href={getFileDownloadUrl(m.url_imagem)} download className="mb-1 flex items-center gap-1.5 underline opacity-90">📎 Anexo</a>
                        )
                      )}
                      {m.conteudo && (
                        <TextoMensagem conteudo={m.conteudo} className="whitespace-pre-wrap break-words" />
                      )}
                      <div className={cn('mt-1 text-right text-[10px]', outgoing ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
                        {new Date(m.enviado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Encerrar Dialog */}
      <AlertDialog open={encerrarDialogOpen} onOpenChange={setEncerrarDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>⚠️ Encerrar ticket?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja encerrar este ticket? O cliente será notificado e o ticket
              será movido para o histórico.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {/* Classificação do atendimento */}
          <div className="space-y-2 py-1">
            <Label className="flex items-center gap-1.5">
              <Tag className="h-4 w-4" />
              Tipo de atendimento
              {tiposEncerramento.length > 0 && <span className="text-destructive">*</span>}
            </Label>
            {loadingTiposEncerramento ? (
              <p className="text-sm text-muted-foreground py-2">Carregando tipos...</p>
            ) : tiposEncerramento.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Nenhum tipo de atendimento cadastrado para este setor.
              </p>
            ) : (
              <Select value={selectedTipoEncerramento} onValueChange={setSelectedTipoEncerramento}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o tipo de atendimento..." />
                </SelectTrigger>
                <SelectContent>
                  {tiposEncerramento.map((tipo) => (
                    <SelectItem key={tipo.id} value={tipo.id}>{tipo.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmarEncerrar}
              disabled={tiposEncerramento.length > 0 && !selectedTipoEncerramento}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              ✅ Confirmar Encerramento
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={retryConfirmationMessage !== null}
        onOpenChange={(open) => {
          if (!open) setRetryConfirmationMessage(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reenviar mensagem não confirmada?</AlertDialogTitle>
            <AlertDialogDescription>
              O provedor pode ter recebido esta mensagem mesmo sem a confirmação chegar ao WorkDesk.
              Reenviar pode entregar o mesmo conteúdo duas vezes ao cliente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmIndeterminateRetry}>
              Reenviar mesmo assim
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>


      {/* Transferência — fluxo compartilhado com o painel de monitoramento */}
      <TransferirTicketDialog
        open={transferDialogOpen}
        onOpenChange={setTransferDialogOpen}
        ticket={selectedTicket}
        colaborador={colaborador}
        tela="WorkDesk"
        onTransferStart={(ticketId) => {
          // Marca ANTES do POST para o realtime não trazer o ticket de volta,
          // e some com ele da lista na hora para dar retorno imediato.
          transferringTicketIdsRef.current.add(ticketId)
          setTickets((prev) => prev.filter((t) => t.id !== ticketId))
          setSelectedTicket(null)
          selectedTicketIdRef.current = null
          setMobileDrawerOpen(false)
          setMensagens([])
        }}
        onTransferSuccess={({ ticketId }) => {
          // Espera o eco do realtime passar antes de liberar a guarda.
          setTimeout(() => transferringTicketIdsRef.current.delete(ticketId), 5000)
        }}
        onTransferError={(ticketId) => {
          transferringTicketIdsRef.current.delete(ticketId)
          if (colaborador) fetchTickets(colaborador)
        }}
      />

      {/* Disparo Dialog */}
      <Dialog open={disparoDialogOpen} onOpenChange={(open) => { setDisparoDialogOpen(open); if (!open) resetDisparo() }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Megaphone className="h-5 w-5 text-primary" />
              Novo Disparo
              {disparoLimitInfo && (
                <Badge variant="outline" className="ml-2 text-xs font-normal">
                  {disparoLimitInfo}
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription className={cn(!disparoDescricao && 'sr-only')}>
              {disparoDescricao || 'Novo disparo de mensagem'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Steps 1 & 2: documento + telefone (hidden after choosing canal) */}
            {(disparoStep === 'documento' || disparoStep === 'telefone') && (
              <>
                {/* Step 1: CNPJ ou CPF (MEI) */}
                <div className="space-y-2">
                  <Label>CNPJ ou CPF do Cliente</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="00.000.000/0000-00 ou 000.000.000-00"
                      value={disparoDocumento}
                      onChange={(e) => setDisparoDocumento(formatDocumentoInput(e.target.value))}
                      onKeyDown={(e) => e.key === 'Enter' && handleDocumentoLookup()}
                      inputMode="numeric"
                      autoComplete="off"
                      spellCheck={false}
                      disabled={disparoLoading || disparoStep === 'telefone'}
                    />
                    <Button
                      onClick={handleDocumentoLookup}
                      disabled={!isDocumentoValido(disparoDocumento) || disparoLoading || disparoStep === 'telefone'}
                      size="sm"
                      className="shrink-0"
                    >
                      {disparoLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Search className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>

                {/* Client data found */}
                {disparoCliente && (
                  <div className="rounded-lg border border-border bg-muted/50 p-3 space-y-1.5">
                    <p className="text-sm font-medium text-foreground">{disparoCliente.nome}</p>
                    {disparoCliente.cnpj && (
                      <p className="text-xs text-muted-foreground">{rotuloDocumento(disparoCliente.cnpj)}: {formatDocumento(disparoCliente.cnpj)}</p>
                    )}
                    {disparoCliente.registro && (
                      <p className="text-xs text-muted-foreground">Registro: {disparoCliente.registro}</p>
                    )}
                    {disparoCliente.telefone && (
                      <p className="text-xs text-muted-foreground">Telefone: {formatPhone(disparoCliente.telefone)}</p>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-[10px] px-2"
                      onClick={() => { setDisparoCliente(null); setDisparoStep('documento'); setDisparoTelefone('') }}
                    >
                      Trocar cliente
                    </Button>
                  </div>
                )}

                {/* Step 2: Phone number */}
                {disparoStep === 'telefone' && (
                  <div className="space-y-2">
                    <Label>Telefone do cliente (com DDD)</Label>
                    <Input
                      placeholder="(83) 9 9999-9999"
                      value={disparoTelefone}
                      onChange={(e) => handleDisparoTelefoneChange(e.target.value)}
                    />
                  </div>
                )}

                {/* Advance button — "Próximo" quando vai pro step canal,
                    "Enviar Disparo" quando vai disparar direto (caso só
                    WhatsApp Cloud esteja ativo no setor) */}
                {disparoStep === 'telefone' && (
                  <Button
                    onClick={handleDisparoConfirmPhone}
                    disabled={!disparoCliente || disparoTelefone.replace(/\D/g, '').length < 10 || disparoSending}
                    className="w-full gap-2"
                  >
                    {disparoSending ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Enviando...
                      </>
                    ) : setorCanaisAtivos.includes('whatsapp') && !setorCanaisAtivos.includes('evolution_api') ? (
                      <>
                        <Send className="h-4 w-4" />
                        Enviar Disparo
                      </>
                    ) : (
                      <>
                        Próximo
                        <ChevronRight className="h-4 w-4" />
                      </>
                    )}
                  </Button>
                )}
              </>
            )}

            {/* Step 3: Canal selection (when both WhatsApp + Evolution active) */}
            {disparoStep === 'canal' && (
              <div className="space-y-3">
                {/* Client summary */}
                <div className="rounded-lg border border-border bg-muted/50 p-3 space-y-0.5">
                  <p className="text-sm font-medium">{disparoCliente?.nome}</p>
                  <p className="text-xs text-muted-foreground">{formatPhone(disparoTelefone)}</p>
                </div>

                <Label className="text-sm font-medium">Escolha o canal de envio</Label>

                <div className={cn(
                  'grid gap-3',
                  setorCanaisAtivos.includes('whatsapp') && setorCanaisAtivos.includes('evolution_api')
                    ? 'grid-cols-2'
                    : 'grid-cols-1',
                )}>
                  {/* WhatsApp Oficial — só se setor tem WhatsApp Cloud ativo */}
                  {setorCanaisAtivos.includes('whatsapp') && (
                    <button
                      onClick={() => handleDisparoSelectCanal('whatsapp')}
                      disabled={disparoSending}
                      className="flex flex-col items-center gap-2 rounded-xl border-2 border-green-200 bg-green-50 dark:bg-green-950/30 dark:border-green-800 p-4 hover:border-green-400 hover:bg-green-100 dark:hover:bg-green-900/40 transition-all"
                    >
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500 text-white text-lg font-bold">
                        W
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-semibold text-green-700 dark:text-green-400">WhatsApp</p>
                        <p className="text-[10px] text-muted-foreground">Oficial (template)</p>
                      </div>
                    </button>
                  )}

                  {/* Evolution (WhatsApp não oficial) — só se setor tem Evolution ativo */}
                  {setorCanaisAtivos.includes('evolution_api') && (
                    <button
                      onClick={() => handleDisparoSelectCanal('evolution_api')}
                      disabled={disparoSending}
                      className="flex flex-col items-center gap-2 rounded-xl border-2 border-blue-200 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-800 p-4 hover:border-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-all"
                    >
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-500 text-white">
                        <Zap className="h-5 w-5" />
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-semibold text-blue-700 dark:text-blue-400">Não Oficial</p>
                        <p className="text-[10px] text-muted-foreground">Evolution API</p>
                      </div>
                    </button>
                  )}
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-muted-foreground"
                  onClick={() => setDisparoStep('telefone')}
                >
                  ← Voltar
                </Button>
              </div>
            )}

            {/* Step 3.5: Seleção de setor (apenas quando colab atende 2+ setores Evolution) */}
            {disparoStep === 'setor_evolution' && (
              <div className="space-y-3">
                <div className="rounded-lg border border-border bg-muted/50 p-3 space-y-0.5">
                  <p className="text-sm font-medium">{disparoCliente?.nome}</p>
                  <p className="text-xs text-muted-foreground">{formatPhone(disparoTelefone)}</p>
                </div>

                <Label className="text-sm font-medium">De qual setor enviar?</Label>

                <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                  {disparoSetoresEvolution.map(s => {
                    const isSelected = disparoSetorEvolutionId === s.id
                    const badge =
                      s.online === 'loading'
                        ? { label: 'verificando…', cls: 'bg-muted text-muted-foreground' }
                        : s.online === 'online'
                        ? { label: 'conectado', cls: 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400' }
                        : s.online === 'offline'
                        ? { label: 'offline', cls: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400' }
                        : { label: 'desconhecido', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400' }
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setDisparoSetorEvolutionId(s.id)}
                        disabled={s.online === 'offline'}
                        className={cn(
                          'w-full flex items-center justify-between gap-3 rounded-lg border-2 p-3 text-left transition-all',
                          isSelected
                            ? 'border-primary bg-primary/5'
                            : 'border-border bg-background hover:bg-muted/50',
                          s.online === 'offline' && 'opacity-50 cursor-not-allowed',
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{s.nome}</p>
                          <p className="text-[11px] text-muted-foreground truncate">{s.instancia}</p>
                        </div>
                        <span className={cn('shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium', badge.cls)}>
                          {s.online === 'loading' && <Loader2 className="h-2.5 w-2.5 animate-spin" />}
                          {badge.label}
                        </span>
                      </button>
                    )
                  })}
                  {disparoSetoresEvolution.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-4">
                      Nenhum setor com Evolution ativo.
                    </p>
                  )}
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => setDisparoStep(setorCanaisAtivos.includes('whatsapp') ? 'canal' : 'telefone')}
                  >
                    ← Voltar
                  </Button>
                  <Button
                    size="sm"
                    className="flex-1 gap-2"
                    disabled={!disparoSetorEvolutionId}
                    onClick={() => {
                      const defaultMsg = templates[0]?.conteudo || `Olá ${disparoCliente?.nome || ''}, como posso ajudar?`
                      setDisparoMensagemEvolution(defaultMsg)
                      setDisparoStep('mensagem_evolution')
                    }}
                  >
                    Próximo
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            {/* Step 3.5b: Seleção de setor (apenas quando colab atende 2+ setores com WhatsApp oficial configurado) */}
            {disparoStep === 'setor_whatsapp' && (
              <div className="space-y-3">
                <div className="rounded-lg border border-border bg-muted/50 p-3 space-y-0.5">
                  <p className="text-sm font-medium">{disparoCliente?.nome}</p>
                  <p className="text-xs text-muted-foreground">{formatPhone(disparoTelefone)}</p>
                </div>

                <Label className="text-sm font-medium">De qual setor enviar?</Label>

                <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                  {disparoSetoresWhatsapp.map(s => {
                    const isSelected = disparoSetorWhatsappId === s.id
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setDisparoSetorWhatsappId(s.id)}
                        className={cn(
                          'w-full flex items-center justify-between gap-3 rounded-lg border-2 p-3 text-left transition-all',
                          isSelected
                            ? 'border-primary bg-primary/5'
                            : 'border-border bg-background hover:bg-muted/50',
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{s.nome}</p>
                        </div>
                      </button>
                    )
                  })}
                  {disparoSetoresWhatsapp.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-4">
                      Nenhum setor com WhatsApp oficial ativo.
                    </p>
                  )}
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => setDisparoStep(setorCanaisAtivos.includes('evolution_api') ? 'canal' : 'telefone')}
                  >
                    ← Voltar
                  </Button>
                  <Button
                    size="sm"
                    className="flex-1 gap-2"
                    disabled={!disparoSetorWhatsappId || disparoSending}
                    onClick={() => handleEnviarDisparo(disparoSetorWhatsappId)}
                  >
                    {disparoSending ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Enviando...
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4" />
                        Enviar Disparo
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}

            {/* Step 4: Evolution message editor */}
            {disparoStep === 'mensagem_evolution' && (
              <div className="space-y-3">
                {/* Client summary */}
                <div className="rounded-lg border border-border bg-muted/50 p-3 space-y-0.5">
                  <p className="text-sm font-medium">{disparoCliente?.nome}</p>
                  <p className="text-xs text-muted-foreground">{formatPhone(disparoTelefone)}</p>
                  <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                    <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 dark:bg-blue-900/40 px-2 py-0.5 text-[10px] font-medium text-blue-700 dark:text-blue-400">
                      <Zap className="h-2.5 w-2.5" />
                      Evolution API
                    </span>
                    {disparoSetorEvolutionId && (() => {
                      const s = disparoSetoresEvolution.find(x => x.id === disparoSetorEvolutionId)
                      return s ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                          {s.nome}
                        </span>
                      ) : null
                    })()}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Mensagem de abertura</Label>
                  <textarea
                    className="w-full min-h-[120px] resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder="Digite a mensagem..."
                    value={disparoMensagemEvolution}
                    onChange={(e) => setDisparoMensagemEvolution(e.target.value)}
                  />
                  <p className="text-[10px] text-muted-foreground">
                    O ticket será criado e atribuído a você imediatamente. Você poderá enviar mais mensagens sem aguardar a resposta do cliente.
                  </p>
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => {
                      if (disparoSetoresEvolution.length > 1) {
                        setDisparoStep('setor_evolution')
                      } else {
                        setDisparoStep(setorCanaisAtivos.includes('whatsapp') ? 'canal' : 'telefone')
                      }
                    }}
                  >
                    ← Voltar
                  </Button>
                  <Button
                    onClick={handleEnviarDisparoEvolution}
                    disabled={!disparoMensagemEvolution.trim() || disparoSending}
                    className="flex-1 gap-2"
                  >
                    {disparoSending ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Enviando...
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4" />
                        Enviar
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog: Cliente Não Informado ao Encerrar */}
      <AlertDialog open={clienteNaoInformadoDialogOpen} onOpenChange={setClienteNaoInformadoDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <User className="h-5 w-5 text-amber-500" />
              Cliente não informado
            </AlertDialogTitle>
            <AlertDialogDescription>
              Este ticket não possui um cliente com CNPJ/CPF vinculado. Deseja informar o cliente antes de encerrar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setClienteNaoInformadoDialogOpen(false)
                setEncerrarAposVinculoCliente(false)
                handleEncerrarTicket()
              }}
            >
              Não, encerrar assim
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setClienteNaoInformadoDialogOpen(false)
                setEncerrarAposVinculoCliente(true)
                setSelecionarClienteCnpj('')
                setSelecionarClienteData(null)
                setSelecionarClienteDialogOpen(true)
              }}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Sim, informar cliente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog: Selecionar Cliente por CNPJ */}
      <Dialog
        open={selecionarClienteDialogOpen}
        onOpenChange={(open) => {
          setSelecionarClienteDialogOpen(open)
          if (!open) {
            setSelecionarClienteCnpj('')
            setSelecionarClienteData(null)
            setEncerrarAposVinculoCliente(false)
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Search className="h-5 w-5 text-primary" />
              Selecionar Cliente
            </DialogTitle>
            <DialogDescription>
              Informe o CNPJ ou o CPF (cliente MEI) para buscar e vincular um cliente a este ticket.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* CNPJ ou CPF Input */}
            <div className="space-y-2">
              <Label htmlFor="selecionar-cliente-cnpj">CNPJ ou CPF do Cliente</Label>
              <div className="flex gap-2">
                <Input
                  id="selecionar-cliente-cnpj"
                  name="cliente-cnpj"
                  placeholder="00.000.000/0000-00 ou 000.000.000-00"
                  value={selecionarClienteCnpj}
                  onChange={(e) => setSelecionarClienteCnpj(formatDocumentoInput(e.target.value))}
                  onKeyDown={(e) => e.key === 'Enter' && handleSelecionarClienteCnpjLookup()}
                  inputMode="numeric"
                  autoComplete="off"
                  spellCheck={false}
                  disabled={selecionarClienteLoading || vinculandoCliente || !!selecionarClienteData}
                />
                <Button
                  onClick={handleSelecionarClienteCnpjLookup}
                  disabled={!isDocumentoValido(selecionarClienteCnpj) || selecionarClienteLoading || vinculandoCliente || !!selecionarClienteData}
                  size="sm"
                  className="shrink-0"
                >
                  {selecionarClienteLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            {/* Cliente encontrado */}
            {selecionarClienteData && (
              <div className="rounded-lg border border-border bg-muted/50 p-3 space-y-1.5">
                <p className="text-sm font-semibold text-foreground">{selecionarClienteData.nome}</p>
                {selecionarClienteData.CNPJ && (
                  <p className="text-xs text-muted-foreground">{rotuloDocumento(selecionarClienteData.CNPJ)}: {formatDocumento(selecionarClienteData.CNPJ)}</p>
                )}
                {selecionarClienteData.Registro && (
                  <p className="text-xs text-muted-foreground">Registro: {selecionarClienteData.Registro}</p>
                )}
                {selecionarClienteData.telefone && (
                  <p className="text-xs text-muted-foreground">Telefone: {formatPhone(selecionarClienteData.telefone)}</p>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[10px] px-2 mt-1"
                  disabled={vinculandoCliente}
                  onClick={() => { setSelecionarClienteData(null); setSelecionarClienteCnpj('') }}
                >
                  Trocar cliente
                </Button>
              </div>
            )}

            {/* Ações */}
            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setSelecionarClienteDialogOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                className="flex-1"
                disabled={!selecionarClienteData || vinculandoCliente}
                onClick={handleConfirmarSelecionarCliente}
              >
                {vinculandoCliente ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Vinculando…
                  </>
                ) : 'Vincular Cliente'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog: Editar Dados do Cliente */}
      <Dialog open={editarClienteDialogOpen} onOpenChange={setEditarClienteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5 text-amber-500" />
              Editar Dados do Cliente
            </DialogTitle>
            <DialogDescription>
              Edite os dados do cliente vinculado a este ticket.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Nome</Label>
              <Input
                value={editarClienteForm.nome}
                onChange={(e) => setEditarClienteForm((f) => ({ ...f, nome: e.target.value }))}
                placeholder="Nome do cliente"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1">
                Telefone
                <Lock className="h-3 w-3 text-muted-foreground" />
              </Label>
              <Input
                value={editarClienteForm.telefone}
                readOnly
                className="bg-muted text-muted-foreground cursor-not-allowed"
                placeholder="5511999999999"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">CNPJ</Label>
              <Input
                value={editarClienteForm.CNPJ}
                onChange={(e) => setEditarClienteForm((f) => ({ ...f, CNPJ: e.target.value }))}
                placeholder="00.000.000/0000-00"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Registro</Label>
                <Input
                  value={editarClienteForm.Registro}
                  onChange={(e) => setEditarClienteForm((f) => ({ ...f, Registro: e.target.value }))}
                  placeholder="Registro"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">PDV</Label>
                <Input
                  value={editarClienteForm.PDV}
                  onChange={(e) => setEditarClienteForm((f) => ({ ...f, PDV: e.target.value }))}
                  placeholder="PDV"
                />
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setEditarClienteDialogOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                className="flex-1 gap-1.5"
                disabled={editarClienteLoading || !editarClienteForm.nome.trim()}
                onClick={handleSalvarEditarCliente}
              >
                {editarClienteLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Salvar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  )
}

// Ticket List Component
function TicketList({
  tickets,
  selectedTicket,
  onSelectTicket,
  statusFilter,
  setStatusFilter,
  prioridadeFilter,
  setPrioridadeFilter,
  subsetorFilter,
  setSubsetorFilter,
  subsetoresDisponiveis,
  searchTerm,
  setSearchTerm,
  unreadCounts,
  firstUnreadAt,
  setorCanal,
  colaboradorEmail,
}: {
  tickets: Ticket[]
  selectedTicket: Ticket | null
  onSelectTicket: (ticket: Ticket) => void
  statusFilter: string
  setStatusFilter: (v: string) => void
  prioridadeFilter: string
  setPrioridadeFilter: (v: string) => void
  subsetorFilter: string
  setSubsetorFilter: (v: string) => void
  subsetoresDisponiveis: Subsetor[]
  searchTerm: string
  setSearchTerm: (v: string) => void
  unreadCounts: Map<string, number>
  firstUnreadAt: Map<string, string>
  setorCanal: 'whatsapp' | 'discord' | 'evolution_api'
  colaboradorEmail: string
}) {
  // Tick every 30s to re-evaluate wait times
  const [, setTick] = useState(0)
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 30000)
    return () => clearInterval(interval)
  }, [])

  const [filtersOpen, setFiltersOpen] = useState(false)

  // Check if any filter is active (non-default)
  const hasActiveFilter = statusFilter !== 'todos' || prioridadeFilter !== 'todos' || subsetorFilter !== 'todos'

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Filters Toggle */}
      <div className="shrink-0 border-b border-border px-4 py-2">
        <button
          type="button"
          onClick={() => setFiltersOpen(!filtersOpen)}
          className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors w-full py-1 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Filter className="h-3 w-3" />
          <span>Filtros</span>
          {(hasActiveFilter || searchTerm) && (
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
          )}
          <ChevronDown className={cn('h-3 w-3 ml-auto transition-transform', filtersOpen && 'rotate-180')} />
        </button>
        {filtersOpen && (
          <div className="space-y-2 pt-2 pb-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={setorCanal === 'discord' ? "Buscar colaborador..." : "Buscar cliente..."}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 h-8 text-xs"
              />
            </div>
            <div className="flex gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="flex-1 h-8 text-xs">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="aberto">Aberto</SelectItem>
                  <SelectItem value="em_atendimento">Em Atendimento</SelectItem>
                </SelectContent>
              </Select>
              <Select value={prioridadeFilter} onValueChange={setPrioridadeFilter}>
                <SelectTrigger className="flex-1 h-8 text-xs">
                  <SelectValue placeholder="Prioridade" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todas</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="urgente">Urgente</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {subsetoresDisponiveis.length > 0 && (
              <Select value={subsetorFilter} onValueChange={setSubsetorFilter}>
                <SelectTrigger className="w-full h-8 text-xs">
                  <SelectValue placeholder="Subsetor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos Subsetores</SelectItem>
                  <SelectItem value="sem_subsetor">Sem Subsetor</SelectItem>
                  {subsetoresDisponiveis.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )}
      </div>

      {/* Ticket List */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {tickets.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center px-4 text-center text-muted-foreground">
            <MessageCircle className="mb-2 h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm font-medium tracking-tight text-foreground">Nenhum ticket encontrado</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Ajuste os filtros ou aguarde a fila.</p>
          </div>
        ) : (
          <div className="stagger divide-y divide-border">
            {tickets.map((ticket) => {
              const unreadCount = unreadCounts.get(ticket.id) || 0
              // "Aguardando" = suporte falou por último e espera o cliente.
              // Só conta resposta real do suporte (colaborador/bot), NÃO notas
              // internas de sistema/supervisor — senão um ticket recém-transferido
              // (última msg = "sistema") apareceria como "Sem resposta"/SLA estourado.
              const ultimoRemetente = ticket.ultima_mensagem_remetente
              const isWaitingResponse = !!ultimoRemetente && (ultimoRemetente === 'colaborador' || isBotMessage(ultimoRemetente))
              const isSelected = selectedTicket?.id === ticket.id

              // Check if ticket exceeded wait time (last msg from collaborator, no client response)
              const tempoEspera = ticket.setores?.tempo_espera_minutos || 0
              let isExpiredWait = false
              if (tempoEspera > 0 && isWaitingResponse && ticket.ultima_mensagem_em && ticket.status !== 'encerrado') {
                const lastMsgTime = new Date(ticket.ultima_mensagem_em).getTime()
                const elapsed = Date.now() - lastMsgTime
                isExpiredWait = elapsed > tempoEspera * 60 * 1000
              }
              
              return (
                <motion.div
                  key={ticket.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelectTicket(ticket)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelectTicket(ticket) }}
                  className={cn(
                    'w-full px-3 py-2.5 text-left transition-colors border-l-3 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                    isSelected
                      ? 'bg-primary/10 border-l-primary'
                      : isExpiredWait
                      ? 'bg-amber-50 dark:bg-amber-950/30 border-l-amber-500'
                      : 'border-l-transparent hover:bg-muted/50'
                  )}
                >
                  <div className="flex flex-col gap-1">
                    {/* Row 1: Status / Indicador de Resposta - Unread Badge - Ticket Icon */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {ticket.prioridade === 'urgente' && (
                          <AlertTriangle className="h-3 w-3 text-red-500 shrink-0" />
                        )}
                        {/* Status: ponto-sinal + rótulo (laranja = ao vivo / precisa de ação) */}
                        {isExpiredWait ? (
                          <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-foreground">
                            <span className="signal-dot signal-dot--pulse" aria-hidden="true" />
                            Sem resposta
                          </span>
                        ) : ticket.ultima_mensagem_remetente === 'cliente' ? (
                          <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-foreground">
                            <span className="signal-dot signal-dot--pulse" aria-hidden="true" />
                            Cliente respondeu
                          </span>
                        ) : isWaitingResponse && unreadCount === 0 ? (
                          <span className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" aria-hidden="true" />
                            Aguardando
                          </span>
                        ) : (
                          <span className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" aria-hidden="true" />
                            {ticket.status === 'aberto' ? 'Aberto' : 'Atendendo'}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {/* Unread badge */}
                        {unreadCount > 0 && (
                          <span className="tabnums flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                            {unreadCount > 99 ? '99+' : unreadCount}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Row 2: Nome do Cliente + Tempo. Se há unread, o tempo
                        é o da PRIMEIRA não-lida (mostra urgência real). Senão,
                        usa o da última mensagem. Esconde antes de 1 min. */}
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <p className={cn(
                          "text-sm font-medium line-clamp-1 min-w-0",
                          isSelected ? "text-primary" : "text-foreground"
                        )}>
                          {setorCanal === 'discord' ? (ticket.user_name_discord || ticket.clientes.nome) : ticket.clientes.nome}
                        </p>
                        {/* Selo Prime já na lista: o atendente precisa saber a
                            prioridade antes de escolher qual ticket abrir. */}
                        {isClientePrime(ticket.clientes?.prime) && (
                          <span
                            className="shrink-0 rounded bg-primary/10 px-1 py-px text-[9px] font-bold uppercase tracking-wide text-primary"
                            title="Cliente Prime"
                          >
                            Prime
                          </span>
                        )}
                      </span>
                      {(() => {
                        const firstUnread = firstUnreadAt.get(ticket.id)
                        const isClientWaiting = ticket.ultima_mensagem_remetente === 'cliente'
                        // Timer emerald (urgência): cliente foi o último a falar
                        // E temos o âncora da primeira msg sem resposta. Conta o
                        // tempo TOTAL aguardando — não zera quando o atendente
                        // só abre o ticket; só zera quando ele responde.
                        if (firstUnread && isClientWaiting) {
                          const elapsedMs = Date.now() - new Date(firstUnread).getTime()
                          const label = elapsedMs < 60_000
                            ? 'agora'
                            : formatDistanceToNow(new Date(firstUnread), { locale: ptBR, addSuffix: true })
                          return (
                            <span className="tabnums text-[10px] shrink-0 text-primary font-medium">
                              {label}
                            </span>
                          )
                        }
                        // Sem urgência (colab já respondeu) — só mostra o
                        // tempo da última msg após 1 min, em cinza neutro.
                        const ref = ticket.ultima_mensagem_em || ticket.criado_em
                        const elapsedMs = Date.now() - new Date(ref).getTime()
                        if (elapsedMs < 60_000) return null
                        return (
                          <span className="tabnums text-[10px] shrink-0 text-muted-foreground">
                            {formatDistanceToNow(new Date(ref), { locale: ptBR, addSuffix: true })}
                          </span>
                        )
                      })()}
                    </div>

                    {/* Row 3: Prévia da última mensagem (WhatsApp-like) */}
                    {ticket.ultima_mensagem && ticket.ultima_mensagem !== 'Sem mensagens' && (() => {
                      const tipo = ticket.ultima_mensagem_tipo
                      const raw = ticket.ultima_mensagem || ''
                      // Strip signature prefix like *Joellyton - PEV:*\n\n
                      const cleaned = raw.replace(/^\*[^*\n]+:\*\s*\n*/, '').trim()
                      // For media, prefer a friendly label unless there's a real caption.
                      // Audio recordings store the filename as conteudo — show "Áudio" instead.
                      const looksLikeFilename = /\.[a-z0-9]{2,5}$/i.test(cleaned)
                      const mediaLabel: Record<string, { icon: string; label: string }> = {
                        audio: { icon: '🎤', label: 'Áudio' },
                        imagem: { icon: '📷', label: 'Imagem' },
                        video: { icon: '📹', label: 'Vídeo' },
                        documento: { icon: '📎', label: 'Documento' },
                      }
                      const isMedia = tipo && tipo !== 'texto' && mediaLabel[tipo]
                      let preview = cleaned
                      let prefix = ''
                      if (isMedia) {
                        const m = mediaLabel[tipo!]
                        prefix = `${m.icon} `
                        // Show the caption when it exists and isn't just a filename
                        preview = cleaned && !looksLikeFilename ? cleaned : m.label
                      }
                      return (
                        <p className={cn(
                          "text-xs line-clamp-1 min-w-0",
                          unreadCount > 0 ? "text-foreground/90 font-medium" : "text-muted-foreground"
                        )}>
                          {ticket.ultima_mensagem_remetente === 'colaborador' && (
                            <span className="opacity-70">Você: </span>
                          )}
                          {prefix}{preview}
                        </p>
                      )
                    })()}
                  </div>
                </motion.div>
              )
            })}
          </div>
        )}
  </div>
  </div>
  )
}
