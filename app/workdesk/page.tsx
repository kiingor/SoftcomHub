'use client'

import React from "react"

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { motion, AnimatePresence } from 'framer-motion'
import { formatDistanceToNow, format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import {
  MessageCircle,
  Clock,
  AlertTriangle,
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
  Check,
  CheckCheck,
  ArrowRightLeft,
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
  Music,
  Play,
  FileIcon,
  Layers,
  ChevronDown,
  FileArchive,
  FileCode,
  FileSpreadsheet,
  ShieldCheck,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
import { Checkbox } from '@/components/ui/checkbox'
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
  created_at?: string
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
  mensagens_nao_lidas?: number
  is_disparo?: boolean
  disparo_em?: string | null
  user_name_discord?: string | null
}

interface Mensagem {
  id: string
  ticket_id: string
  cliente_id: string | null
  remetente: 'cliente' | 'colaborador' | 'bot' | 'sistema'
  conteudo: string
  tipo: 'texto' | 'imagem' | 'audio' | 'video' | 'documento'
  enviado_em: string
  phone_number_id?: string
  whatsapp_message_id?: string
  discord_user_id?: string | null
  url_imagem?: string | null
  media_type?: string | null
  // For history display
  tickets?: {
    id: string
    status: string
    criado_em: string
    encerrado_em: string | null
  }
}

// Helper to check if message is from the support side (colaborador or bot)
const isOutgoingMessage = (remetente: string) => {
  const r = remetente?.toLowerCase?.()?.trim?.() || ''
  return r === 'colaborador' || r === 'bot'
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

// Format CNPJ
const formatCNPJ = (cnpj: string) => {
  const cleaned = cnpj.replace(/\D/g, '')
  if (cleaned.length === 14) {
    return `${cleaned.slice(0, 2)}.${cleaned.slice(2, 5)}.${cleaned.slice(5, 8)}/${cleaned.slice(8, 12)}-${cleaned.slice(12)}`
  }
  return cnpj
}

// ─── MessageMedia Component ───────────────────────────────────────────────────
// Renderiza mídia de mensagem baseado no media_type (MIME) com fallback no tipo
interface MessageMediaProps {
  url: string
  mediaType?: string | null
  tipo?: string
  conteudo?: string
  isOutgoing: boolean
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

function MessageMedia({ url, mediaType, tipo, conteudo, isOutgoing }: MessageMediaProps) {
  const urlLower = url.toLowerCase().split('?')[0]
  const ext = urlLower.split('.').pop() || ''

  // Determina o tipo real pela ordem: media_type MIME > tipo do banco > extensão da URL
  const isImage = mediaType?.startsWith('image/') || (tipo === 'imagem' && !mediaType)
    || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext)
  const isVideo = mediaType?.startsWith('video/') || tipo === 'video'
    || ['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(ext)
  const isAudio = mediaType?.startsWith('audio/') || tipo === 'audio'
    || ['mp3', 'ogg', 'wav', 'aac', 'm4a', 'opus'].includes(ext)

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
          href={url}
          download={fileName}
          target="_blank"
          rel="noreferrer"
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
      <div className={cn(
        'mb-2 flex items-center gap-2 rounded-xl px-3 py-2',
        isOutgoing ? 'bg-white/15' : 'bg-muted/60'
      )}>
        <Music className="h-4 w-4 shrink-0 opacity-70" />
        <audio controls className="flex-1 h-8 min-w-0" preload="metadata" style={{ height: '32px' }}>
          <source src={url} type={mediaType || 'audio/ogg'} />
        </audio>
        <a
          href={url}
          download={fileName}
          target="_blank"
          rel="noreferrer"
          className={cn(
            'shrink-0 rounded p-1 transition-colors',
            isOutgoing ? 'hover:bg-white/20 text-white' : 'hover:bg-muted text-foreground'
          )}
          title="Baixar áudio"
        >
          <Download className="h-3.5 w-3.5" />
        </a>
      </div>
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

  // Qualquer outro arquivo com URL → card de download
  const { icon: Icon, label, color, bg, border } = getFileInfo(ext, mediaType)
  return (
    <a
      href={url}
      download={fileName}
      target="_blank"
      rel="noreferrer"
      className={cn(
        'mb-2 flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors hover:opacity-80',
        bg, border
      )}
    >
      <Icon className={cn('h-6 w-6 shrink-0', color)} />
      <div className="flex flex-col min-w-0 flex-1">
        <span className="text-sm font-medium text-foreground truncate">{fileName}</span>
        <span className="text-[10px] text-muted-foreground">{label} · Clique para baixar</span>
      </div>
      <Download className="h-4 w-4 text-muted-foreground shrink-0" />
    </a>
  )
}
// ──────────────────────────────────────────────────────────────────────────────

// Disparo Timer Component
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
          isOutgoing ? 'text-primary-foreground' : 'text-blue-500 dark:text-blue-400'
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {part}
      </a>
    ) : (
      part
    )
  )
}

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
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null)
  const selectedTicketIdRef = useRef<string | null>(null)
  const previousTicketIdsRef = useRef<Set<string>>(new Set())
  const [mensagens, setMensagens] = useState<Mensagem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMensagens, setLoadingMensagens] = useState(false)
  const [sendingMessage, setSendingMessage] = useState(false) // Declared sendingMessage variable
  const messagesEndRef = useRef<HTMLDivElement>(null)
  
  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('todos')
  const [prioridadeFilter, setPrioridadeFilter] = useState<string>('todos')
  const [subsetorFilter, setSubsetorFilter] = useState<string>('todos')
  const [searchTerm, setSearchTerm] = useState('')
  const [subsetoresDisponiveis, setSubsetoresDisponiveis] = useState<Subsetor[]>([])
  
  // Mobile
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false)
  
  // Dialog
  const [encerrarDialogOpen, setEncerrarDialogOpen] = useState(false)
  const [transferDialogOpen, setTransferDialogOpen] = useState(false)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [showClientInfo, setShowClientInfo] = useState(false)
  
  // Transfer data
  const [setores, setSetores] = useState<any[]>([])
  const [atendentesDisponiveis, setAtendentesDisponiveis] = useState<any[]>([])
  const [selectedSetorTransfer, setSelectedSetorTransfer] = useState<string>('all') // Updated default value
  const [selectedAtendenteTransfer, setSelectedAtendenteTransfer] = useState<string>('all') // Updated default value
  const [transferLoading, setTransferLoading] = useState(false)
  
  // Message input
  const [messageInput, setMessageInput] = useState('')
  const [pendingMessages, setPendingMessages] = useState<Map<string, 'sending' | 'sent' | 'error'>>(new Map())
  
  // File upload (images and PDFs)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [filePreview, setFilePreview] = useState<string | null>(null)
  const [uploadingFile, setUploadingFile] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  
  // Templates
  const [templates, setTemplates] = useState<any[]>([])
  const [showTemplates, setShowTemplates] = useState(false)
  const [filteredTemplates, setFilteredTemplates] = useState<any[]>([])
  
  // 24h window check
  const [isWindowExpired, setIsWindowExpired] = useState(false)
  const [lastMessageTime, setLastMessageTime] = useState<Date | null>(null)
  
  // Disparo state
  const [disparoDialogOpen, setDisparoDialogOpen] = useState(false)
  const [disparoCnpj, setDisparoCnpj] = useState('')
  const [disparoTelefone, setDisparoTelefone] = useState('')
  const [disparoCliente, setDisparoCliente] = useState<any>(null)
  const [disparoLoading, setDisparoLoading] = useState(false)
  const [disparoSending, setDisparoSending] = useState(false)
  const [disparoStep, setDisparoStep] = useState<'cnpj' | 'telefone' | 'canal' | 'mensagem_evolution'>('cnpj')
  const [disparoLimitBlocked, setDisparoLimitBlocked] = useState(false)
  const [disparoLimitInfo, setDisparoLimitInfo] = useState('')
  const [disparoCanalChoice, setDisparoCanalChoice] = useState<'whatsapp' | 'evolution_api'>('whatsapp')
  const [disparoMensagemEvolution, setDisparoMensagemEvolution] = useState('')
  const [setorCanalConfig, setSetorCanalConfig] = useState<'whatsapp' | 'discord' | 'evolution_api'>('whatsapp')
  const [setorCanaisAtivos, setSetorCanaisAtivos] = useState<string[]>([])
  
  // Unread messages tracking
  const [unreadCounts, setUnreadCounts] = useState<Map<string, number>>(new Map())

  // Ticket iframe popup
  const [ticketIframeTicket, setTicketIframeTicket] = useState<Ticket | null>(null)

  // Selecionar cliente dialog
  const [selecionarClienteDialogOpen, setSelecionarClienteDialogOpen] = useState(false)
  const [selecionarClienteCnpj, setSelecionarClienteCnpj] = useState('')
  const [selecionarClienteData, setSelecionarClienteData] = useState<any>(null)
  const [selecionarClienteLoading, setSelecionarClienteLoading] = useState(false)
  const [clienteNaoInformadoDialogOpen, setClienteNaoInformadoDialogOpen] = useState(false)

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
  // Fetch setor canal config
  const sId = colab.setor_id || colab.setores_vinculados?.[0]?.setor_id
  if (sId) {
    const { data: setorInfo } = await supabase.from('setores').select('canal').eq('id', sId).single()
    if (setorInfo?.canal) setSetorCanalConfig(setorInfo.canal)
    // Fetch active channels for this setor (for disparo multi-canal)
    const { data: canaisAtivos } = await supabase
      .from('setor_canais')
      .select('tipo')
      .eq('setor_id', sId)
      .eq('ativo', true)
    if (canaisAtivos && canaisAtivos.length > 0) {
      setSetorCanaisAtivos(canaisAtivos.map((c: any) => c.tipo))
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
  }, [supabase])

// Fetch tickets - colaborador only sees tickets assigned to them
  const fetchTickets = useCallback(async (colab: Colaborador) => {
    let query = supabase
      .from('tickets')
      .select('*, numero, clientes(*), setores(id, nome, cor, canal, tempo_espera_minutos), subsetores(id, nome)')
      .in('status', ['aberto', 'em_atendimento'])
      .order('criado_em', { ascending: false })

    // ALWAYS filter by colaborador_id - each atendente only sees their own tickets
    // Even users with can_see_all_tickets should use the dashboard for viewing all
    query = query.eq('colaborador_id', colab.id)

    const { data } = await query

    if (data) {
      // Fetch last message for each ticket
      const ticketsWithMessages = await Promise.all(
        data.map(async (ticket) => {
          const { data: lastMsg } = await supabase
            .from('mensagens')
            .select('conteudo, enviado_em, remetente')
            .eq('ticket_id', ticket.id)
            .order('enviado_em', { ascending: false })
            .limit(1)
            .single()

          return {
            ...ticket,
            ultima_mensagem: lastMsg?.conteudo || 'Sem mensagens',
            ultima_mensagem_em: lastMsg?.enviado_em || ticket.criado_em,
            ultima_mensagem_remetente: lastMsg?.remetente || null,
          }
        })
      )
      // Sort by ultima_mensagem_em descending (most recent first, like WhatsApp)
      const sortedTickets = ticketsWithMessages.sort((a, b) => 
        new Date(b.ultima_mensagem_em || b.criado_em).getTime() - 
        new Date(a.ultima_mensagem_em || a.criado_em).getTime()
      )
      setTickets(sortedTickets)

      // Keep selectedTicket data in sync without losing focus
      if (selectedTicketIdRef.current) {
        const updatedSelected = sortedTickets.find((t) => t.id === selectedTicketIdRef.current)
        if (updatedSelected) {
          setSelectedTicket(updatedSelected)
        }
      }
    }
  }, [supabase])

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

// Fetch messages for selected ticket (including client history from last 7 days)
  const fetchMensagens = useCallback(
    async (ticketId: string, clienteId: string) => {
      setLoadingMensagens(true)

      // Calculate date 7 days ago
      const sevenDaysAgo = new Date()
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

      // Query 1: All messages from current ticket (by ticket_id — always reliable even if cliente_id changed)
      const { data: ticketMsgs } = await supabase
        .from('mensagens')
        .select('*, tickets(id, status, criado_em, encerrado_em)')
        .eq('ticket_id', ticketId)
        .order('enviado_em', { ascending: true, nullsFirst: false })

      // Query 2: Messages from client's OTHER tickets in the last 7 days (history)
      const { data: historyMsgs } = await supabase
        .from('mensagens')
        .select('*, tickets(id, status, criado_em, encerrado_em)')
        .eq('cliente_id', clienteId)
        .neq('ticket_id', ticketId)
        .gte('enviado_em', sevenDaysAgo.toISOString())
        .order('enviado_em', { ascending: true, nullsFirst: false })

      // Merge and sort chronologically
      const merged = [...(ticketMsgs || []), ...(historyMsgs || [])]
      merged.sort((a, b) => {
        if (!a.enviado_em) return -1
        if (!b.enviado_em) return 1
        return new Date(a.enviado_em).getTime() - new Date(b.enviado_em).getTime()
      })

      const data = merged.length > 0 ? merged : null

      if (data) {
        setMensagens(data)

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
      }
      setLoading(false)
    }
    init()
  }, [fetchColaborador, fetchTickets, fetchSubsetoresDisponiveis, fetchMeusSubsetores])

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
      .subscribe()

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

  // Load messages only when a DIFFERENT ticket is selected (by ID)
  // This prevents re-fetching when ticket data refreshes but same ticket is open
  const selectedTicketId = selectedTicket?.id || null
  const selectedClienteId = selectedTicket?.cliente_id || null
  useEffect(() => {
  if (selectedTicketId && selectedClienteId) {
  fetchMensagens(selectedTicketId, selectedClienteId)
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTicketId])

  // Scroll to bottom when messages change
  useEffect(() => {
    if (mensagens.length > 0 && !loadingMensagens) {
      scrollToBottom()
    }
  }, [mensagens, loadingMensagens, scrollToBottom])

// Real-time subscription for tickets
  // Track known ticket IDs to detect truly new arrivals
  const knownTicketIdsRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    knownTicketIdsRef.current = new Set(tickets.map(t => t.id))
  }, [tickets])

  useEffect(() => {
    if (!colaborador) return

    const channel = supabase
      .channel('tickets-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'tickets',
        },
        (payload) => {
          const newTicket = payload.new as any
          
          // Only notify if ticket is assigned to THIS colaborador
          if (newTicket.colaborador_id === colaborador.id) {
            playAlert('new_ticket')
            toast.info('Novo ticket recebido!')
            fetchTickets(colaborador)
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'tickets',
        },
        (payload) => {
          const updatedTicket = payload.new as any
          const oldTicket = payload.old as any

          if (updatedTicket.colaborador_id === colaborador.id) {
            // If ticket was closed (encerrado) by another session/tab, close the panel
            if (updatedTicket.status === 'encerrado' && selectedTicketIdRef.current === updatedTicket.id) {
              setSelectedTicket(null)
              selectedTicketIdRef.current = null
              setMobileDrawerOpen(false)
              setMensagens([])
            }
            // Ticket was just assigned/transferred TO this colaborador
            const isNew = !knownTicketIdsRef.current.has(updatedTicket.id)
            if (isNew || (oldTicket.colaborador_id && oldTicket.colaborador_id !== colaborador.id)) {
              playAlert('new_ticket')
              toast.info('Novo ticket recebido!')
            }
            fetchTickets(colaborador)
          } else if (oldTicket.colaborador_id === colaborador.id) {
            // Ticket was transferred AWAY from this colaborador
            setTickets((prev) => prev.filter((t) => t.id !== updatedTicket.id))
            if (selectedTicketIdRef.current === updatedTicket.id) {
              setSelectedTicket(null)
              selectedTicketIdRef.current = null
            }
          } else {
            // Other update on a ticket we own (status change, etc)
            if (knownTicketIdsRef.current.has(updatedTicket.id)) {
              fetchTickets(colaborador)
            }
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [colaborador, fetchTickets, supabase, playAlert])

  // Heartbeat to refresh colaborador data periodically (but NOT to control online/offline status)
  // The online/offline status is GLOBAL and controlled only by explicit user action
  useEffect(() => {
    if (!colaborador?.id) return

    let isActive = true
    const colaboradorId = colaborador.id

    // ── BroadcastChannel para coordenação entre abas ──────────────────────────
    // Se o usuário tiver mais de uma aba do workdesk aberta, a aba remanescente
    // re-afirma o status online quando outra aba fechar.
    const bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('workdesk_presence') : null

    if (bc) {
      bc.onmessage = (event: MessageEvent) => {
        if (event.data?.type === 'tab_closing' && event.data?.colaboradorId === colaboradorId) {
          // Outra aba está fechando — re-afirma online se esta aba estiver ativa
          if (isActive && colaborador.is_online) {
            supabase
              .from('colaboradores')
              .update({ is_online: true, last_heartbeat: new Date().toISOString() })
              .eq('id', colaboradorId)
              .then(() => {})
          }
        }
      }
    }

    // ── Heartbeat a cada 30s — mantém last_heartbeat atualizado ──────────────
    const sendHeartbeat = () => {
      if (!isActive) return
      fetch('/api/colaborador/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ colaboradorId }),
      }).catch(() => {})
    }

    const heartbeatInterval = setInterval(sendHeartbeat, 30000)
    sendHeartbeat() // imediato ao montar

    // ── Atualiza status local quando aba fica visível ─────────────────────────
    const refreshColaboradorStatus = async () => {
      if (!isActive) return
      try {
        const { data } = await supabase
          .from('colaboradores')
          .select('is_online')
          .eq('id', colaboradorId)
          .single()
        if (data) {
          setColaborador((prev) => (prev ? { ...prev, is_online: data.is_online } : null))
        }
      } catch {
        // Silently ignore
      }
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isActive) {
        refreshColaboradorStatus()
        sendHeartbeat()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    // ── beforeunload / pagehide — marca offline ao fechar o navegador/aba ─────
    const handlePageClose = () => {
      // Avisa outras abas que esta está fechando
      bc?.postMessage({ type: 'tab_closing', colaboradorId })

      // Envia sinal de offline via sendBeacon (funciona mesmo durante unload)
      const payload = JSON.stringify({ colaboradorId, setOffline: true })
      navigator.sendBeacon('/api/colaborador/heartbeat', payload)
    }

    window.addEventListener('beforeunload', handlePageClose)
    window.addEventListener('pagehide', handlePageClose)

    return () => {
      isActive = false
      clearInterval(heartbeatInterval)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('beforeunload', handlePageClose)
      window.removeEventListener('pagehide', handlePageClose)
      bc?.close()
    }
  }, [colaborador?.id, colaborador?.is_online, supabase])

  // Periodic queue processor - check for unassigned tickets every 30 seconds
  useEffect(() => {
    if (!colaborador?.is_online) return

    const colaboradorRef = colaborador

    // Call auto-assign when colaborador comes online
    const triggerAutoAssign = async () => {
      try {
        await fetch('/api/tickets/auto-assign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ colaboradorId: colaboradorRef.id }),
        })
      } catch (error) {
        console.error('Error triggering auto-assign:', error)
      }
    }

    // Polling independente: atualiza os tickets do atendente a cada 15s
    // Garante que tickets atribuídos via queue (por outro processo) apareçam mesmo sem Realtime
    const pollTickets = () => fetchTickets(colaboradorRef)

    // Trigger immediately when online
    triggerAutoAssign()
    pollTickets()

    const autoAssignInterval = setInterval(triggerAutoAssign, 30000)
    const pollInterval = setInterval(pollTickets, 15000)

    return () => {
      clearInterval(autoAssignInterval)
      clearInterval(pollInterval)
    }
  }, [colaborador?.id, colaborador?.is_online, fetchTickets])

// Real-time subscription for messages of current ticket
  // Stable refs for realtime subscription
  const selectedTicketIdRef2 = selectedTicket?.id
  const selectedClienteIdRef = selectedTicket?.cliente_id

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
          event: 'INSERT',
          schema: 'public',
          table: 'mensagens',
          filter: `cliente_id=eq.${selectedClienteIdRef}`,
        },
        handleNewMessage
      )
      .subscribe()

    // Fallback polling every 10s to catch any missed messages
    const pollInterval = setInterval(async () => {
      if (!selectedTicketIdRef2) return
      const sevenDaysAgo = new Date()
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

      // Same two-query approach as fetchMensagens — ticket_id first (always reliable)
      const { data: ticketMsgs } = await supabase
        .from('mensagens')
        .select('*, tickets(id, status, criado_em, encerrado_em)')
        .eq('ticket_id', selectedTicketIdRef2)
        .order('enviado_em', { ascending: true, nullsFirst: false })

      const { data: historyMsgs } = selectedClienteIdRef
        ? await supabase
            .from('mensagens')
            .select('*, tickets(id, status, criado_em, encerrado_em)')
            .eq('cliente_id', selectedClienteIdRef)
            .neq('ticket_id', selectedTicketIdRef2)
            .gte('enviado_em', sevenDaysAgo.toISOString())
            .order('enviado_em', { ascending: true, nullsFirst: false })
        : { data: [] }

      const merged = [...(ticketMsgs || []), ...(historyMsgs || [])]
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

    return () => {
      supabase.removeChannel(channel)
      clearInterval(pollInterval)
    }
  }, [selectedTicketIdRef2, selectedClienteIdRef, supabase])

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

          // Increment unread count only if NOT viewing this ticket
          if (!isViewingThisTicket) {
            setUnreadCounts((prev) => {
              const newMap = new Map(prev)
              const current = newMap.get(newMessage.ticket_id) || 0
              newMap.set(newMessage.ticket_id, current + 1)
              return newMap
            })
          }

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
          setTickets((prev) => {
            const updated = prev.map((t) => 
              t.id === newMessage.ticket_id 
                ? { ...t, ultima_mensagem: newMessage.conteudo, ultima_mensagem_em: newMessage.enviado_em, ultima_mensagem_remetente: newMessage.remetente }
                : t
            )
            return updated.sort((a, b) => 
              new Date(b.ultima_mensagem_em || b.criado_em).getTime() - 
              new Date(a.ultima_mensagem_em || a.criado_em).getTime()
            )
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [colaborador, supabase, playAlert])

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
  const handleSelectTicket = (ticket: Ticket) => {
    const isSameTicket = selectedTicketIdRef.current === ticket.id

    // Update ref immediately so in-flight sends know the ticket changed
    selectedTicketIdRef.current = ticket.id
    setSelectedTicket(ticket)

    if (!isSameTicket) {
      // Clear messages only when switching to a DIFFERENT ticket — prevents flash of old
      // conversation while new messages load. Re-clicking the same ticket must NOT clear
      // messages because the useEffect won't re-fire (selectedTicketId didn't change).
      setMensagens([])
      // Also clear the typed message so each ticket starts clean
      setMessageInput('')
      setShowTemplates(false)
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
    }
    // Clear unread count for this ticket
    setUnreadCounts((prev) => {
      const newMap = new Map(prev)
      newMap.delete(ticket.id)
      return newMap
    })
  }

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

    setSelectedTicket((prev) =>
      prev ? { ...prev, status: 'em_atendimento', colaborador_id: colaborador.id } : null
    )
    
    if (colaborador) {
      fetchTickets(colaborador)
    }
  }

  // Encerrar ticket
const handleEncerrarTicket = async () => {
    if (!selectedTicket || !colaborador) return

    try {
      // Fetch the setor to get finalization message
      const { data: setor } = await supabase
        .from('setores')
        .select('mensagem_finalizacao')
        .eq('id', selectedTicket.setor_id)
        .single()

      // Se há mensagem de finalização, detectar o canal correto e enviar
      if (setor?.mensagem_finalizacao && !isWindowExpired) {
        // Detectar canal pela última mensagem (mesma lógica do handleSendMessage)
        const { data: lastMsgData } = await supabase
          .from('mensagens')
          .select('canal_envio, phone_number_id, discord_user_id')
          .eq('ticket_id', selectedTicket.id)
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
        } else if (lastCanalEnvio === 'evolutionapi' || lastPhoneNumberId) {
          if (lastPhoneNumberId) {
            const { data: evoCanal } = await supabase
              .from('setor_canais')
              .select('instancia')
              .eq('tipo', 'evolution_api')
              .eq('instancia', lastPhoneNumberId)
              .eq('ativo', true)
              .maybeSingle()
            setorCanal = evoCanal ? 'evolution_api' : 'whatsapp'
            phoneNumberId = lastPhoneNumberId
          } else {
            setorCanal = 'evolution_api'
          }
        } else if (selectedTicket.setor_id) {
          // Fallback: buscar canal ativo do setor
          const { data: canalAtivo } = await supabase
            .from('setor_canais')
            .select('tipo, instancia, phone_number_id')
            .eq('setor_id', selectedTicket.setor_id)
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

        const processedMessage = processTemplateVariables(setor.mensagem_finalizacao)

        if (setorCanal === 'evolution_api' && phoneNumberId && selectedTicket.clientes.telefone) {
          await fetch('/api/evolution/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ticketId: selectedTicket.id,
              message: processedMessage,
              instanceName: phoneNumberId,
            }),
          })
        } else if (setorCanal === 'whatsapp' && phoneNumberId && selectedTicket.clientes.telefone) {
          await fetch('/api/whatsapp/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              recipientPhone: selectedTicket.clientes.telefone,
              message: processedMessage,
              ticketId: selectedTicket.id,
              phoneNumberId: phoneNumberId,
            }),
          })
        }
        // Discord: não envia mensagem de finalização (sem suporte a DM de encerramento)
      }

      // Update ticket status
      await supabase
        .from('tickets')
        .update({
          status: 'encerrado',
          encerrado_em: new Date().toISOString(),
        })
.eq('id', selectedTicket.id)

      // Dispatch webhook (await to ensure it completes before UI changes)
      try {
        await fetch('/api/webhooks/dispatch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ticketId: selectedTicket.id,
            evento: 'ticket_encerrado',
          }),
        })
      } catch (err) {
        console.error('[Webhook] dispatch error:', err)
      }

      setSelectedTicket(null)
      selectedTicketIdRef.current = null
      setEncerrarDialogOpen(false)
      setMobileDrawerOpen(false)
      setMensagens([])

      if (colaborador) {
        fetchTickets(colaborador)
      }
    } catch (error) {
      console.error('Error closing ticket:', error)
    }
  }

  // Helper: cliente tem CNPJ informado
  const clienteTemCNPJ = !!(selectedTicket?.clientes?.CNPJ)

  // Confirmar encerrar — verifica cliente antes
  const handleConfirmarEncerrar = () => {
    setEncerrarDialogOpen(false)
    if (!clienteTemCNPJ) {
      setClienteNaoInformadoDialogOpen(true)
    } else {
      handleEncerrarTicket()
    }
  }

  // Buscar cliente por CNPJ (painel de seleção)
  const handleSelecionarClienteCnpjLookup = async () => {
    if (!selecionarClienteCnpj.trim()) return
    setSelecionarClienteLoading(true)
    setSelecionarClienteData(null)
    try {
      const res = await fetch('/api/clientes/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cnpj: selecionarClienteCnpj.replace(/\D/g, '') }),
      })
      const data = await res.json()
      if (data.source === 'not_found') {
        toast.error('Cliente não encontrado com este CNPJ')
      } else if (data.cliente) {
        setSelecionarClienteData(data.cliente)
        toast.success(`Cliente encontrado: ${data.cliente.nome}`)
      }
    } catch {
      toast.error('Erro ao buscar cliente')
    } finally {
      setSelecionarClienteLoading(false)
    }
  }

  // Confirmar vínculo do cliente ao ticket
  const handleConfirmarSelecionarCliente = async () => {
    if (!selecionarClienteData || !selectedTicket) return
    try {
      const { error } = await supabase
        .from('tickets')
        .update({ cliente_id: selecionarClienteData.id })
        .eq('id', selectedTicket.id)
      if (error) throw error

      // Atualiza apenas o estado local — sem fetchTickets para não resetar a conversa
      // Preserva o telefone original do ticket (número de quem está conversando)
      const telefoneOriginal = selectedTicket.clientes?.telefone
      const updatedCliente = {
        ...selecionarClienteData,
        telefone: telefoneOriginal ?? selecionarClienteData.telefone,
      }
      setSelectedTicket((prev) =>
        prev ? { ...prev, cliente_id: updatedCliente.id, clientes: updatedCliente } : null
      )
      setTickets((prev) =>
        prev.map((t) =>
          t.id === selectedTicket.id
            ? { ...t, cliente_id: updatedCliente.id, clientes: updatedCliente }
            : t
        )
      )

      toast.success('Cliente vinculado ao ticket!')
      setSelecionarClienteDialogOpen(false)
      setSelecionarClienteCnpj('')
      setSelecionarClienteData(null)
    } catch {
      toast.error('Erro ao vincular cliente')
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

  // Open transfer dialog and fetch data
  const openTransferDialog = async () => {
    setTransferDialogOpen(true)
    setSelectedSetorTransfer('all')
    setSelectedAtendenteTransfer('all')

    // Fetch apenas os setores configurados como destino de transferência para o setor atual
    const currentSetorId = selectedTicket?.setor_id
    if (currentSetorId) {
      const { data: destinosData } = await supabase
        .from('setor_destinos_transferencia')
        .select('setor_destino_id, setores:setor_destino_id(id, nome)')
        .eq('setor_origem_id', currentSetorId)

      if (destinosData && destinosData.length > 0) {
        const setoresDestino = destinosData
          .map((d: any) => d.setores)
          .filter(Boolean)
          .sort((a: any, b: any) => a.nome.localeCompare(b.nome))
        setSetores(setoresDestino)
      } else {
        // Sem configuração: mostra mensagem vazia (não exibe todos)
        setSetores([])
      }
    } else {
      setSetores([])
    }

    // Fetch available atendentes from same setor via colaboradores_setores
    if (selectedTicket?.setor_id) {
      // First get all colaborador_ids for this setor
      const { data: colaboradoresSetores, error: csError } = await supabase
        .from('colaboradores_setores')
        .select('colaborador_id')
        .eq('setor_id', selectedTicket.setor_id)

      if (csError) {
        console.error('[v0] Error fetching colaboradores_setores:', csError)
      }

      if (colaboradoresSetores && colaboradoresSetores.length > 0) {
        const colaboradorIds = colaboradoresSetores.map((cs) => cs.colaborador_id)
        
        // Then fetch the actual colaboradores
        const { data: colaboradoresData, error: colabError } = await supabase
          .from('colaboradores')
          .select('id, nome, is_online, ativo')
          .in('id', colaboradorIds)
          .eq('ativo', true)
          .neq('id', colaborador?.id || '')

        if (colabError) {
          console.error('[v0] Error fetching colaboradores:', colabError)
        }

        if (colaboradoresData) {
          // Marcar quais atendentes atendem o subsetor do ticket
          let finalAtendentes: any[] = colaboradoresData.map((a: any) => ({ ...a, handlesSubsetor: false }))
          if (selectedTicket?.subsetor_id) {
            const { data: subColab } = await supabase
              .from('colaboradores_subsetores')
              .select('colaborador_id')
              .eq('subsetor_id', selectedTicket.subsetor_id)
            const subColabIds = new Set(subColab?.map((s: any) => s.colaborador_id) || [])
            finalAtendentes = finalAtendentes.map((a: any) => ({ ...a, handlesSubsetor: subColabIds.has(a.id) }))
            // Atendentes do subsetor primeiro
            finalAtendentes.sort((a: any, b: any) => Number(b.handlesSubsetor) - Number(a.handlesSubsetor))
          }
          setAtendentesDisponiveis(finalAtendentes)
        }
      } else {
        setAtendentesDisponiveis([])
      }
    }
  }

  // Fetch atendentes when setor changes
  const handleSetorChange = async (setorId: string) => {
    setSelectedSetorTransfer(setorId)
    setSelectedAtendenteTransfer('all')

    // First get all colaborador_ids for this setor
    const { data: colaboradoresSetores } = await supabase
      .from('colaboradores_setores')
      .select('colaborador_id')
      .eq('setor_id', setorId)

    if (colaboradoresSetores && colaboradoresSetores.length > 0) {
      const colaboradorIds = colaboradoresSetores.map((cs) => cs.colaborador_id)

      // Then fetch the actual colaboradores
      const { data: colaboradoresData } = await supabase
        .from('colaboradores')
        .select('id, nome, is_online, ativo')
        .in('id', colaboradorIds)
        .eq('ativo', true)

      if (colaboradoresData) {
        let finalAtendentes: any[] = colaboradoresData.map((a: any) => ({ ...a, handlesSubsetor: false }))
        if (selectedTicket?.subsetor_id) {
          const { data: subColab } = await supabase
            .from('colaboradores_subsetores')
            .select('colaborador_id')
            .eq('subsetor_id', selectedTicket.subsetor_id)
          const subColabIds = new Set(subColab?.map((s: any) => s.colaborador_id) || [])
          finalAtendentes = finalAtendentes.map((a: any) => ({ ...a, handlesSubsetor: subColabIds.has(a.id) }))
          finalAtendentes.sort((a: any, b: any) => Number(b.handlesSubsetor) - Number(a.handlesSubsetor))
        }
        setAtendentesDisponiveis(finalAtendentes)
      }
    } else {
      setAtendentesDisponiveis([])
    }
  }

  // Transfer ticket
  const handleTransferTicket = async () => {
    if (!selectedTicket) return

    setTransferLoading(true)

    const updateData: any = {}

    if (selectedSetorTransfer !== 'all') {
      updateData.setor_id = selectedSetorTransfer
    }

    if (selectedAtendenteTransfer !== 'all') {
      // Verify atendente is online before transferring - fetch fresh status from DB
      const { data: atendenteData } = await supabase
        .from('colaboradores')
        .select('id, is_online')
        .eq('id', selectedAtendenteTransfer)
        .single()

      if (!atendenteData?.is_online) {
        toast.error('Este atendente esta offline. Selecione um atendente online.')
        setTransferLoading(false)
        return
      }

      updateData.colaborador_id = selectedAtendenteTransfer
      updateData.status = 'em_atendimento'
    } else {
      updateData.colaborador_id = null
      updateData.status = 'aberto'
    }

    const { error } = await supabase
      .from('tickets')
      .update(updateData)
      .eq('id', selectedTicket.id)

    if (error) {
      toast.error('Erro ao transferir ticket')
      setTransferLoading(false)
      return
    }

    // Insert system message for transfer log in chat
    const fromColabName = colaborador?.nome || 'Desconhecido'
    const fromSetorName = selectedTicket.setores?.nome || 'Desconhecido'

    // Resolve target setor name
    const targetSetorId = selectedSetorTransfer && selectedSetorTransfer !== 'all' ? selectedSetorTransfer : selectedTicket.setor_id
    const toSetorName = setores.find((s: any) => s.id === targetSetorId)?.nome || fromSetorName

    // Resolve target atendente name
    const targetAtendenteId = selectedAtendenteTransfer && selectedAtendenteTransfer !== 'all' ? selectedAtendenteTransfer : null
    const toColabName = targetAtendenteId
      ? atendentesDisponiveis.find((a: any) => a.id === targetAtendenteId)?.nome || 'Aguardando atendente'
      : 'Aguardando atendente'

    const transferContent = `Transferido de ${fromColabName} - ${fromSetorName} >> ${toColabName} - ${toSetorName}`

    const { error: msgError } = await supabase.from('mensagens').insert({
      ticket_id: selectedTicket.id,
      cliente_id: selectedTicket.cliente_id,
      remetente: 'sistema',
      conteudo: transferContent,
      tipo: 'texto',
      enviado_em: new Date().toISOString(),
    })
    if (msgError) {
      console.error('[v0] Erro ao inserir mensagem de transferencia:', msgError)
    }

    toast.success('Ticket transferido com sucesso')
    setTransferDialogOpen(false)

    // Remove ticket from local state immediately (even if can_see_all_tickets)
    const transferredTicketId = selectedTicket.id
    setTickets((prev) => prev.filter((t) => t.id !== transferredTicketId))
    setSelectedTicket(null)
    selectedTicketIdRef.current = null
    setMobileDrawerOpen(false)
    setMensagens([])
    setTransferLoading(false)
  }

  // Disparo - CNPJ lookup
  const handleCnpjLookup = async () => {
    if (!disparoCnpj.trim()) return
    setDisparoLoading(true)
    setDisparoCliente(null)
    try {
      const res = await fetch('/api/clientes/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cnpj: disparoCnpj.replace(/\D/g, '') }),
      })
      const data = await res.json()
      if (data.source === 'not_found') {
        toast.error('Cliente nao encontrado com este CNPJ')
      } else if (data.cliente) {
        setDisparoCliente(data.cliente)
        if (data.cliente.telefone) {
          setDisparoTelefone(data.cliente.telefone)
        }
        setDisparoStep('telefone')
        toast.success(`Cliente encontrado: ${data.cliente.nome}`)
      }
    } catch {
      toast.error('Erro ao buscar cliente')
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
  const handleEnviarDisparo = async () => {
    if (!disparoCliente || !disparoTelefone || !colaborador) return
    
    // Get setor_id from colaborador
    const setorId = colaborador.setor_id || colaborador.setores_vinculados?.[0]?.setor_id
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
      if (data.success) {
        toast.success(`Disparo enviado! Ticket #${data.ticketNumero || ''} criado.`)
        setDisparoDialogOpen(false)
        resetDisparo()
        // Refresh tickets
        if (colaborador) fetchTickets(colaborador)
      } else {
        toast.error(data.error || 'Erro ao enviar disparo')
      }
    } catch {
      toast.error('Erro ao enviar disparo')
    }
    setDisparoSending(false)
  }

  // Reset disparo modal
  const resetDisparo = () => {
    setDisparoCnpj('')
    setDisparoTelefone('')
    setDisparoCliente(null)
    setDisparoStep('cnpj')
    setDisparoCanalChoice('whatsapp')
    setDisparoMensagemEvolution('')
  }

  // Determine next step after phone number is confirmed
  const handleDisparoConfirmPhone = () => {
    const temWhatsapp = setorCanaisAtivos.includes('whatsapp') || setorCanalConfig === 'whatsapp'
    const temEvolution = setorCanaisAtivos.includes('evolution_api')

    if (temWhatsapp && temEvolution) {
      // Both configured — let user choose
      setDisparoStep('canal')
    } else if (temEvolution) {
      // Only Evolution — skip channel selection
      setDisparoCanalChoice('evolution_api')
      // Pre-load first template as default message
      const defaultMsg = templates[0]?.conteudo || `Olá ${disparoCliente?.nome || ''}, como posso ajudar?`
      setDisparoMensagemEvolution(defaultMsg)
      setDisparoStep('mensagem_evolution')
    } else {
      // Only WhatsApp (or fallback) — existing send flow
      handleEnviarDisparo()
    }
  }

  // Handle canal choice and advance step
  const handleDisparoSelectCanal = (canal: 'whatsapp' | 'evolution_api') => {
    setDisparoCanalChoice(canal)
    if (canal === 'evolution_api') {
      const defaultMsg = templates[0]?.conteudo || `Olá ${disparoCliente?.nome || ''}, como posso ajudar?`
      setDisparoMensagemEvolution(defaultMsg)
      setDisparoStep('mensagem_evolution')
    } else {
      // WhatsApp oficial — existing flow
      handleEnviarDisparo()
    }
  }

  // Disparo via Evolution API
  const handleEnviarDisparoEvolution = async () => {
    if (!disparoCliente || !disparoTelefone || !colaborador || !disparoMensagemEvolution.trim()) return

    const setorId = colaborador.setor_id || colaborador.setores_vinculados?.[0]?.setor_id
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
      if (data.success) {
        toast.success(`Disparo enviado via Evolution! Ticket #${data.ticketNumero || ''} criado.`)
        setDisparoDialogOpen(false)
        resetDisparo()
        if (colaborador) fetchTickets(colaborador)
      } else {
        toast.error(data.error || 'Erro ao enviar disparo via Evolution')
      }
    } catch {
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
  const processTemplateVariables = (message: string) => {
    if (!selectedTicket || !colaborador) return message

    const now = new Date()
    return message
      .replace(/\{\{cliente_nome\}\}/g, selectedTicket.clientes.nome || '')
      .replace(/\{\{cliente_telefone\}\}/g, selectedTicket.clientes.telefone || '')
      .replace(/\{\{cliente_cnpj\}\}/g, selectedTicket.clientes.CNPJ || '')
      .replace(/\{\{atendente_nome\}\}/g, colaborador.nome || '')
      .replace(/\{\{setor_nome\}\}/g, selectedTicket.setores?.nome || '')
      .replace(/\{\{ticket_id\}\}/g, `#${selectedTicket.numero}`)
      .replace(/\{\{data_atual\}\}/g, now.toLocaleDateString('pt-BR'))
      .replace(/\{\{hora_atual\}\}/g, now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }))
  }

  // Handle input change for template detection
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
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

  // Handle file selection (images, videos and PDFs)
  const handleFileSelect = (file: File) => {
    const isImage = file.type.startsWith('image/')
    const isVideo = file.type.startsWith('video/')
    const isAudio = file.type.startsWith('audio/')
    // Size limits: videos 50MB | images/audio 16MB | documents 100MB
    const maxSize = isVideo ? 50 * 1024 * 1024 : isImage || isAudio ? 16 * 1024 * 1024 : 100 * 1024 * 1024
    const maxLabel = isVideo ? '50MB' : isImage || isAudio ? '16MB' : '100MB'
    if (file.size > maxSize) {
      toast.error(`Arquivo muito grande. Máximo ${maxLabel}.`)
      return
    }
    setSelectedFile(file)
    if (isImage) {
      const reader = new FileReader()
      reader.onloadend = () => setFilePreview(reader.result as string)
      reader.readAsDataURL(file)
    } else if (isVideo) {
      setFilePreview(`video:${file.name}`)
    } else {
      // Audio, documents, and any other file — generic preview with filename
      setFilePreview(`file:${file.name}`)
    }
  }



  // Handle file input change
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      handleFileSelect(file)
    }
  }

  // Handle paste event
  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) return

    for (const item of items) {
      if (item.type.startsWith('image/') || item.type === 'application/pdf') {
        e.preventDefault()
        const file = item.getAsFile()
        if (file) {
          handleFileSelect(file)
        }
        break
      }
    }
  }

  // Clear selected file
  const clearSelectedFile = () => {
    setSelectedFile(null)
    setFilePreview(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }



// Upload file to Vercel Blob (images and PDFs)
  const uploadImage = async (file: File): Promise<string | null> => {
    const formData = new FormData()
    formData.append('file', file)
    
    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Upload failed' }))
        throw new Error(errorData.error || 'Upload failed')
      }
      
      const data = await response.json()
      return data.url
    } catch (error: any) {
      console.error('Error uploading file:', error)
      toast.error(error?.message || 'Erro ao enviar arquivo')
      return null
    }
  }

  // Send message via WhatsApp API (optimistic update like WhatsApp)
  const handleSendMessage = async () => {
    if ((!messageInput.trim() && !selectedFile) || !selectedTicket || !colaborador) return

    // Capture ticket context at call-time (before any awaits).
    // This snapshot is used throughout the async flow so that if the user
    // switches to another ticket while the send is in progress, we never
    // corrupt the newly-selected ticket's state.
    const capturedTicketId = selectedTicket.id
    const capturedTicket = selectedTicket
    
const tempId = `temp-${Date.now()}`
    const messageContent = messageInput.trim()
    const fileToUpload = selectedFile
    const hasFile = !!fileToUpload
  const isImage = fileToUpload?.type.startsWith('image/')
  const isVideo = fileToUpload?.type.startsWith('video/')
  const isAudio = fileToUpload?.type.startsWith('audio/')

    // Clear input immediately (optimistic)
    setMessageInput('')
    clearSelectedFile()
    
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
      } else if (lastCanalEnvio === 'evolutionapi' || lastPhoneNumberId) {
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
        console.error('[workdesk] No phone_number_id found for ticket:', capturedTicketId)
        setPendingMessages((prev) => new Map(prev).set(tempId, 'error'))
        toast.error('Nao foi possivel determinar o canal de envio. Nenhum phone_number_id encontrado.')
        return
      }

      // Map canal_envio values for consistent use
      const canalEnvioValue = setorCanal === 'evolution_api' ? 'evolutionapi' : setorCanal

      // Upload file if present
      let fileUrl: string | null = null
      if (hasFile && fileToUpload) {
        setUploadingFile(true)
        fileUrl = await uploadImage(fileToUpload) // uploadImage works for any file
        setUploadingFile(false)

        if (!fileUrl) {
          setPendingMessages((prev) => new Map(prev).set(tempId, 'error'))
          return
        }
      }

      // Determine message type
      const messageType = isImage ? 'imagem' : isVideo ? 'video' : isAudio ? 'audio' : hasFile ? 'documento' : 'texto'

      // Add optimistic message to UI
      const optimisticMessage: Mensagem = {
        id: tempId,
        ticket_id: capturedTicketId,
        cliente_id: null,
        remetente: 'colaborador',
  conteudo: messageContent || fileToUpload?.name || '',
  tipo: messageType,
  enviado_em: new Date().toISOString(),
  url_imagem: fileUrl,
  media_type: fileToUpload?.type || null,
  }
  // Only update UI if user is still viewing this ticket
  if (selectedTicketIdRef.current === capturedTicketId) {
    setMensagens((prev) => [...prev, optimisticMessage])
  }
  setPendingMessages((prev) => new Map(prev).set(tempId, 'sending'))

  // Save message to Supabase
  const { data: savedMsg, error: dbError } = await supabase
  .from('mensagens')
  .insert({
  ticket_id: capturedTicketId,
  cliente_id: capturedTicket.cliente_id,
  remetente: 'colaborador',
  conteudo: messageContent || fileToUpload?.name || '',
          tipo: messageType,
          url_imagem: fileUrl,
          media_type: fileToUpload?.type || null,
          phone_number_id: phoneNumberId,
          canal_envio: canalEnvioValue,
        })
        .select()
        .single()

      if (dbError || !savedMsg) {
        console.error('[v0] Error saving message to database:', dbError)
        setPendingMessages(prev => new Map(prev).set(tempId, 'error'))
        return
      }
      // Update optimistic message with real ID
      setMensagens(prev => prev.map(m => 
        m.id === tempId ? { ...m, id: savedMsg.id } : m
      ))

      // Send via the appropriate channel API
      try {
        let sendUrl = '/api/whatsapp/send'
        let sendBody: Record<string, any> = {}

        if (setorCanal === 'discord') {
          sendUrl = '/api/discord/send'
          sendBody = {
            ticketId: capturedTicketId,
            message: messageContent,
            messageId: savedMsg.id,
            fileUrl: fileUrl,
            fileType: fileToUpload?.type || null,
            fileName: fileToUpload?.name || null,
          }
        } else if (setorCanal === 'evolution_api') {
          sendUrl = '/api/evolution/send'
          sendBody = {
            ticketId: capturedTicketId,
            message: messageContent,
            messageId: savedMsg.id,
            instanceName: phoneNumberId,
            fileUrl: fileUrl,
            fileType: fileToUpload?.type || null,
            fileName: fileToUpload?.name || null,
          }
        } else {
          sendBody = {
            recipientPhone: capturedTicket.clientes.telefone,
            message: messageContent,
            ticketId: capturedTicketId,
            phoneNumberId: phoneNumberId,
            fileUrl: fileUrl,
            fileType: fileToUpload?.type || null,
            messageId: savedMsg.id,
          }
        }

        console.log(`[workdesk] Enviando via ${setorCanal.toUpperCase()} → ${sendUrl}`, sendBody)

        const response = await fetch(sendUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(sendBody),
        })
        
        const result = await response.json()
        
        console.log(`[workdesk] Resposta ${sendUrl} (status ${response.status}):`, result)

        if (!response.ok) {
          console.error('[workdesk] Send API failed:', result)
          const errorMsg = result?.details?.message || result?.error || 'Erro ao enviar mensagem'
          toast.error(errorMsg)
          setPendingMessages(prev => new Map(prev).set(tempId, 'error'))
          return
        }
      } catch (sendError) {
        console.error('[v0] Send request failed:', sendError)
        toast.error('Erro de conexao ao enviar mensagem')
        setPendingMessages(prev => new Map(prev).set(tempId, 'error'))
        return
      }
      
// Mark as sent
  setPendingMessages(prev => new Map(prev).set(tempId, 'sent'))
  
  // Update ticket's last message and move to top (like WhatsApp)
  const now = new Date().toISOString()
  setTickets((prev) => {
    const updated = prev.map((t) => 
      t.id === capturedTicketId
        ? { ...t, ultima_mensagem: messageContent || 'Arquivo enviado', ultima_mensagem_em: now, ultima_mensagem_remetente: 'colaborador' as const }
        : t
    )
    // Sort by ultima_mensagem_em descending (most recent first)
    return updated.sort((a, b) => 
      new Date(b.ultima_mensagem_em || b.criado_em).getTime() - 
      new Date(a.ultima_mensagem_em || a.criado_em).getTime()
    )
  })
  
  // Auto start attendance if ticket is open
      if (capturedTicket.status === 'aberto') {
        const { error: updateError } = await supabase
          .from('tickets')
          .update({ 
            status: 'em_atendimento',
            colaborador_id: colaborador.id,
            primeira_resposta_em: new Date().toISOString()
          })
          .eq('id', capturedTicketId)
        
        if (!updateError) {
          // Only update displayed ticket if user is still viewing this one
          setSelectedTicket(prev => prev?.id === capturedTicketId ? { ...prev, status: 'em_atendimento', colaborador_id: colaborador.id, primeira_resposta_em: new Date().toISOString() } : prev)
          
          // Refresh ticket list to show updated status
          fetchTickets(colaborador)
        }
      } else if (!capturedTicket.primeira_resposta_em) {
        // Update first response time if not already set
        await supabase
          .from('tickets')
          .update({ primeira_resposta_em: new Date().toISOString() })
          .eq('id', capturedTicketId)
      }
      
      // After 2 seconds, refresh to get real message ID (only if still viewing this ticket)
      setTimeout(() => {
        if (selectedTicketIdRef.current === capturedTicketId) {
          fetchMensagens(capturedTicketId, capturedTicket.cliente_id)
        }
        setPendingMessages(prev => {
          const newMap = new Map(prev)
          newMap.delete(tempId)
          return newMap
        })
      }, 2000)
      
    } catch (error: any) {
      setPendingMessages(prev => new Map(prev).set(tempId, 'error'))
    }
  }
  
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
      <div className="flex h-[calc(100svh-4rem)] items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-muted-foreground">Carregando tickets...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100svh-4rem)] flex-col overflow-hidden">
      <div className="flex flex-1 overflow-hidden w-full max-w-full">
        {/* Ticket List Column - responsive width */}
        <aside className="w-52 shrink-0 border-r border-white/30 dark:border-white/8 bg-white/55 dark:bg-white/4 backdrop-blur-xl lg:w-60 xl:w-72 h-full overflow-hidden flex flex-col">
          {/* Disparo Button - for WhatsApp and/or EvolutionAPI */}
          {(setorCanaisAtivos.includes('whatsapp') || setorCanaisAtivos.includes('evolution_api') ||
            (setorCanalConfig !== 'discord' && setorCanalConfig !== 'evolution_api')) && (
          <div className="p-2 border-b border-white/30 dark:border-white/8 shrink-0">
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
            <div className="px-2 py-1.5 border-b border-white/30 dark:border-white/8 shrink-0">
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
              setorCanal={setorCanalConfig}
              colaboradorEmail={colaborador?.email || ''}
              onOpenTicketIframe={(ticket) => setTicketIframeTicket(ticket)}
            />
          </div>
        </aside>

        {/* Chat Area */}
        <main className="hidden flex-1 flex-col overflow-hidden md:flex">
          {selectedTicket ? (
            <>
              {/* Chat Header */}
              <div className="flex items-center justify-between border-b border-white/30 dark:border-white/8 bg-white/70 dark:bg-white/5 backdrop-blur-xl px-3 py-2 gap-2">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-primary/10">
                    <User className="h-4 w-4 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-xs font-sans font-bold text-muted-foreground shrink-0">#{selectedTicket.numero}</span>
                      <h2 className="text-xs font-semibold text-foreground truncate max-w-[180px]">{setorCanalConfig === 'discord' ? (selectedTicket.user_name_discord || selectedTicket.clientes.nome) : selectedTicket.clientes.nome}</h2>
                    </div>
                    <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                      {selectedTicket.setores && (
                        <Badge
                          variant="outline"
                          className="text-[9px] px-1 py-0 font-medium"
                          style={{
                            borderColor: selectedTicket.setores.cor || '#6b7280',
                            color: selectedTicket.setores.cor || '#6b7280',
                          }}
                        >
                          {selectedTicket.setores.nome}
                        </Badge>
                      )}
                      <Badge
                        variant={selectedTicket.status === 'aberto' ? 'default' : 'secondary'}
                        className={cn(
                          'text-[9px] px-1 py-0',
                          selectedTicket.status === 'aberto' && 'bg-blue-100 text-blue-700',
                          selectedTicket.status === 'em_atendimento' && 'bg-yellow-100 text-yellow-700'
                        )}
                      >
                        {selectedTicket.status === 'aberto' ? 'Aberto' : 'Atendendo'}
                      </Badge>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {/* Transfer Button */}
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={openTransferDialog}
                    className="gap-1.5 bg-transparent"
                  >
                    <ArrowRightLeft className="h-4 w-4" />
                    Transferir
                  </Button>
                  
  {/* Encerrar Button */}
  <Button
  variant="destructive"
  size="sm"
  onClick={() => setEncerrarDialogOpen(true)}
  disabled={selectedTicket?.is_disparo && !isDisparoEncerrarEnabled(selectedTicket)}
  className="gap-1.5"
  >
  <XCircle className="h-4 w-4" />
  Encerrar
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
                  
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setSelectedTicket(null)
                      selectedTicketIdRef.current = null
                    }}
                  >
                    <X className="h-5 w-5" />
                  </Button>
                </div>
              </div>

              {/* Chat Info Bar */}
              <div className="flex items-center justify-between border-b border-white/30 dark:border-white/8 bg-white/40 dark:bg-white/3 backdrop-blur-sm px-4 py-2 text-xs text-muted-foreground">
                <div className="flex items-center gap-4">
                  <span className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      Aberto{' '}
                      {formatDistanceToNow(new Date(selectedTicket.criado_em), {
                        locale: ptBR,
                        addSuffix: true,
                      })}
                    </span>
                    {selectedTicket.primeira_resposta_em && (
                      <span className="flex items-center gap-1">
                        <CheckCircle className="h-3.5 w-3.5 text-green-600" />
                        Primeira resposta{' '}
                        {formatDistanceToNow(new Date(selectedTicket.primeira_resposta_em), {
                          locale: ptBR,
                          addSuffix: true,
                        })}
                      </span>
                    )}
                  </div>
                </div>

              {/* Messages */}
              <div className="flex-1 overflow-hidden">
                <div ref={messagesContainerRef} className="h-full overflow-y-auto">
                  <div className="p-4">
                  {loadingMensagens ? (
                    <div className="flex h-full items-center justify-center">
                      <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    </div>
                  ) : mensagens.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
                      <MessageCircle className="mb-2 h-12 w-12 opacity-50" />
                      <p>Nenhuma mensagem ainda</p>
                    </div>
) : (
                    <div className="space-y-4">
                      <AnimatePresence>
                        {(() => {
                          // Garante que mensagens do ticket atual sempre venham por último,
                          // evitando que mensagens recebidas via real-time de outros tickets
                          // apareçam depois do ticket atual e sejam classificadas como "anteriores".
                          const mensagensOrdenadas = selectedTicket
                            ? [
                                ...mensagens.filter((m) => m.ticket_id !== selectedTicket.id),
                                ...mensagens.filter((m) => m.ticket_id === selectedTicket.id),
                              ]
                            : mensagens

                          let lastTicketId: string | null = null
                          return mensagensOrdenadas.map((msg, index) => {
                            const msgStatus = pendingMessages.get(msg.id)
                            const isNewTicket = msg.ticket_id !== lastTicketId
                            const isCurrentTicket = msg.ticket_id === selectedTicket?.id
                            const isPreviousTicket = !isCurrentTicket && isNewTicket
                            lastTicketId = msg.ticket_id

                            return (
                              <React.Fragment key={msg.id}>
                                {/* Ticket separator for history */}
                                {isPreviousTicket && (
                                  <div className="flex items-center gap-3 py-3">
                                    <div className="flex-1 h-px bg-border" />
                                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/50 border border-border text-xs text-muted-foreground">
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
                                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-xs text-primary font-medium">
                                      <MessageCircle className="h-3 w-3" />
                                      <span>Atendimento atual</span>
                                    </div>
                                    <div className="flex-1 h-px bg-primary/30" />
                                  </div>
                                )}
                                {msg.remetente === 'sistema' ? (
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
                                    'flex',
                                    isOutgoingMessage(msg.remetente) ? 'justify-end' : 'justify-start',
                                    !isCurrentTicket && 'opacity-60'
                                  )}
                                >
                                  <div
                                    className={cn(
                                      'max-w-[85%] lg:max-w-[75%] rounded-2xl px-3 py-2 lg:px-4 lg:py-2.5 break-all overflow-hidden',
                                      isOutgoingMessage(msg.remetente)
                                        ? 'bg-primary text-primary-foreground rounded-br-md'
                                        : 'bg-secondary text-secondary-foreground rounded-bl-md',
                                      msgStatus === 'error' && 'bg-red-500 text-white'
                                    )}
                                  >
                        {msg.url_imagem && (
                          <MessageMedia
                            url={msg.url_imagem}
                            mediaType={msg.media_type}
                            tipo={msg.tipo}
                            conteudo={msg.conteudo}
                            isOutgoing={isOutgoingMessage(msg.remetente)}
                          />
                        )}
                        {msg.tipo !== 'texto' && !msg.url_imagem && (
                          <div className="mb-1 flex items-center gap-1 text-xs opacity-70">
                            {getMessageIcon(msg.tipo)}
                            <span className="capitalize">{msg.tipo}</span>
                          </div>
                        )}
                        {msg.conteudo && msg.tipo !== 'documento' && msg.tipo !== 'audio' && msg.tipo !== 'video' && !msg.url_imagem?.toLowerCase().endsWith('.pdf') && <p className="text-sm whitespace-pre-wrap">{renderTextWithLinks(msg.conteudo, isOutgoingMessage(msg.remetente))}</p>}
                                    <div className="mt-1 flex items-center justify-end gap-1 text-[10px] opacity-60">
                                      <span>
                                        {new Date(msg.enviado_em).toLocaleTimeString('pt-BR', {
                                          hour: '2-digit',
                                          minute: '2-digit',
                                        })}
                                      </span>
                                      {isOutgoingMessage(msg.remetente) && (
                                        <>
                                          {msgStatus === 'sending' && <Clock className="h-3 w-3 animate-pulse" />}
                                          {msgStatus === 'sent' && <Check className="h-3 w-3" />}
                                          {msgStatus === 'error' && <AlertTriangle className="h-3 w-3" />}
                                          {!msgStatus && <CheckCheck className="h-3 w-3" />}
                                        </>
                                      )}
                                    </div>
                                  </div>
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
  <div className="border-t border-white/30 dark:border-white/8 bg-white/70 dark:bg-white/5 backdrop-blur-xl p-3">
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
  ref={fileInputRef}
  onChange={handleFileInputChange}
  accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.xml,.json,.csv,.zip,.rar,.7z,.tar,.gz,.cer,.crt,.pem,.p12,.pfx,.key"
  className="hidden"
  />

{/* File Preview */}
                    {filePreview && (
                      <div className="mb-2 p-2 bg-muted/30 rounded-lg border">
                        <div className="relative inline-block">
  {filePreview.startsWith('file:') ? (
  (() => { const { icon: FIcon, label, color, bg, border } = getFileInfo(filePreview.replace('file:', '').split('.').pop() || '', selectedFile?.type); return (
  <div className={cn('flex items-center gap-2 px-3 py-2 rounded border', bg, border)}>
    <FIcon className={cn('h-6 w-6', color)} />
    <span className="text-sm text-foreground max-w-[200px] truncate">{filePreview.replace('file:', '')}</span>
  </div>) })()
  ) : filePreview.startsWith('video:') ? (
  <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 dark:bg-blue-950/30 rounded border border-blue-200 dark:border-blue-800">
  <Video className="h-6 w-6 text-blue-600" />
  <span className="text-sm text-foreground">{filePreview.replace('video:', '')}</span>
  </div>
  ) : (
  <img
  src={filePreview || '/placeholder.svg'}
  alt="Preview"
  className="max-h-32 rounded object-contain"
  />
  )}
  <Button
                            variant="destructive"
                            size="icon"
                            className="absolute -right-2 -top-2 h-5 w-5"
                            onClick={clearSelectedFile}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    )}

                  <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                        className="shrink-0"
                      >
                        <Smile className="h-5 w-5 text-muted-foreground" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
  onClick={() => fileInputRef.current?.click()}
  className="shrink-0"
  disabled={isWindowExpired || (selectedTicket?.is_disparo === true && isDisparoLocked(selectedTicket))}
                      >
                        <ImageIcon className="h-5 w-5 text-muted-foreground" />
                      </Button>
                      <div className="relative flex-1">
                  <Input
                  value={messageInput}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyPress}
                  onPaste={handlePaste}
                  placeholder={(selectedTicket?.is_disparo && isDisparoLocked(selectedTicket)) ? 'Aguardando resposta do cliente...' : isWindowExpired ? 'Janela expirada - Encerre o ticket' : 'Digite / para atalhos...'}
                  className="w-full"
                  disabled={isWindowExpired || (selectedTicket?.is_disparo === true && isDisparoLocked(selectedTicket))}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  />
                      </div>
                      <Button
                        size="icon"
                        onClick={handleSendMessage}
                        disabled={(!messageInput.trim() && !selectedFile) || isWindowExpired || uploadingFile || (selectedTicket?.is_disparo === true && isDisparoLocked(selectedTicket))}
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
            <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
              <div className="text-6xl mb-4">{'💬'}</div>
              <h2 className="text-xl font-semibold">Selecione um ticket</h2>
              <p className="mt-1 text-sm">Escolha um ticket na lista para iniciar o atendimento</p>
            </div>
          )}
        </main>

{/* Client Info Sidebar */}
        {selectedTicket && (
          <aside className={cn(
            "w-56 shrink-0 border-l border-white/30 dark:border-white/8 bg-white/55 dark:bg-white/4 backdrop-blur-xl overflow-y-auto transition-all duration-200 lg:w-64 xl:w-72",
            showClientInfo ? "hidden xl:block" : "hidden"
          )}>
            <div className="p-4">
              {setorCanalConfig === 'discord' ? (
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
                <h3 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5" />
                  Dados do Cliente
                </h3>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 text-[10px] px-2 gap-1 border-primary/40 text-primary hover:bg-primary/10"
                  onClick={() => {
                    setSelecionarClienteCnpj('')
                    setSelecionarClienteData(null)
                    setSelecionarClienteDialogOpen(true)
                  }}
                >
                  <Search className="h-3 w-3" />
                  {clienteTemCNPJ ? 'Trocar cliente' : 'Selecionar cliente'}
                </Button>
              </div>

              {/* Campo linha: label + valor + copy */}
              <div className="rounded-lg border border-border bg-muted/30 divide-y divide-border overflow-hidden text-xs">
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
                      onClick={() => copyToClipboard(selectedTicket.clientes.telefone!, 'Telefone')}
                      className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                  )}
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

                {/* CNPJ */}
                <div className="flex items-center justify-between px-2.5 py-1.5 gap-2">
                  <span className="text-muted-foreground shrink-0 w-16">CNPJ</span>
                  <span className="font-medium text-foreground flex-1 text-right truncate">
                    {selectedTicket.clientes.CNPJ ? formatCNPJ(selectedTicket.clientes.CNPJ) : '—'}
                  </span>
                  {selectedTicket.clientes.CNPJ && (
                    <button
                      type="button"
                      onClick={() => copyToClipboard(selectedTicket.clientes.CNPJ!.replace(/\D/g, ''), 'CNPJ')}
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
              </>
              )}

              {/* Ticket Info Section */}
              <div className="mt-4 pt-4 border-t border-border">
                <h3 className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
                  <MessageCircle className="h-3.5 w-3.5" />
                  Info do Ticket
                </h3>

                <div className="rounded-lg border border-border bg-muted/30 divide-y divide-border overflow-hidden text-xs">
                  {/* Número */}
                  <div className="flex items-center justify-between px-2.5 py-1.5 gap-2">
                    <span className="text-muted-foreground shrink-0 w-16">Número</span>
                    <span className="font-bold text-foreground flex-1 text-right select-all">
                      #{selectedTicket.numero}
                    </span>
                  </div>

                  {/* Prioridade */}
                  <div className="flex items-center justify-between px-2.5 py-1.5 gap-2">
                    <span className="text-muted-foreground shrink-0 w-16">Prioridade</span>
                    <Badge
                      variant="outline"
                      className={cn(
                        'text-[10px] px-1.5 py-0 h-4',
                        selectedTicket.prioridade === 'urgente' && 'border-red-300 text-red-600'
                      )}
                    >
                      {selectedTicket.prioridade === 'urgente' ? 'Urgente' : 'Normal'}
                    </Badge>
                  </div>

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
                </div>
              </div>
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
              <div className="flex items-center justify-between border-b border-white/30 dark:border-white/8 bg-white/70 dark:bg-white/5 backdrop-blur-xl px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary">
                    <User className="h-5 w-5 text-secondary-foreground" />
                  </div>
                  <div>
                    <h2 className="font-semibold text-foreground">{setorCanalConfig === 'discord' ? (selectedTicket.user_name_discord || selectedTicket.clientes.nome) : selectedTicket.clientes.nome}</h2>
                    <Badge
                      variant={selectedTicket.status === 'aberto' ? 'default' : 'secondary'}
                      className={cn(
                        'text-[10px] px-1.5 py-0',
                        selectedTicket.status === 'aberto' && 'bg-blue-100 text-blue-700',
                        selectedTicket.status === 'em_atendimento' && 'bg-yellow-100 text-yellow-700'
                      )}
                    >
                      {selectedTicket.status === 'aberto' ? 'Aberto' : 'Atendendo'}
                    </Badge>
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
              <ScrollArea className="flex-1 p-4">
                {mensagens.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
                    <MessageCircle className="mb-2 h-12 w-12 opacity-50" />
                    <p>Nenhuma mensagem ainda</p>
                  </div>
) : (
                      <div className="space-y-4">
                        {(() => {
                          // Garante que mensagens do ticket atual sempre venham por último (mobile)
                          const mensagensOrdenadas = selectedTicket
                            ? [
                                ...mensagens.filter((m) => m.ticket_id !== selectedTicket.id),
                                ...mensagens.filter((m) => m.ticket_id === selectedTicket.id),
                              ]
                            : mensagens

                          let lastTicketId: string | null = null
                          return mensagensOrdenadas.map((msg, index) => {
                            const msgStatus = pendingMessages.get(msg.id)
                            const isNewTicket = msg.ticket_id !== lastTicketId
                            const isCurrentTicket = msg.ticket_id === selectedTicket?.id
                            const isPreviousTicket = !isCurrentTicket && isNewTicket
                            lastTicketId = msg.ticket_id

                            return (
                              <React.Fragment key={msg.id}>
                                {/* Ticket separator for history */}
                                {isPreviousTicket && (
                                  <div className="flex items-center gap-2 py-2">
                                    <div className="flex-1 h-px bg-border" />
                                    <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-muted/50 border border-border text-[10px] text-muted-foreground">
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
                                    <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-primary/10 border border-primary/20 text-[10px] text-primary font-medium">
                                      <MessageCircle className="h-2.5 w-2.5" />
                                      <span>Atual</span>
                                    </div>
                                    <div className="flex-1 h-px bg-primary/30" />
                                  </div>
                                )}
                                {msg.remetente === 'sistema' ? (
                                  <div className="flex justify-center">
                                    <div className={cn(
                                      "flex items-center gap-2 px-3 py-1.5 rounded-lg border text-[10px] max-w-[90%]",
                                      msg.conteudo.startsWith('Transferido')
                                        ? "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300"
                                        : "bg-muted/80 border-border text-muted-foreground"
                                    )}>
                                      {msg.conteudo.startsWith('Transferido') ? (
                                        <ArrowRightLeft className="h-3 w-3 shrink-0 text-blue-600 dark:text-blue-400" />
                                      ) : (
                                        <Megaphone className="h-3 w-3 shrink-0 text-primary" />
                                      )}
                                      <span>{msg.conteudo}</span>
                                      {msg.enviado_em && (
                                        <span className="shrink-0 ml-1 opacity-60">
                                          {new Date(msg.enviado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                ) : (
                                <div
                                  className={cn(
                                    'flex',
                                    isOutgoingMessage(msg.remetente) ? 'justify-end' : 'justify-start',
                                    !isCurrentTicket && 'opacity-70'
                                  )}
                                >
                                  <div
                                    className={cn(
'max-w-[85%] rounded-2xl px-3 py-2 break-all overflow-hidden',
                    isOutgoingMessage(msg.remetente)
                      ? 'bg-primary text-primary-foreground rounded-br-md'
                      : 'bg-secondary text-secondary-foreground rounded-bl-md',
                    msgStatus === 'error' && 'bg-red-500 text-white'
                                    )}
                                  >
                  {msg.url_imagem && (
                    <MessageMedia
                      url={msg.url_imagem}
                      mediaType={msg.media_type}
                      tipo={msg.tipo}
                      conteudo={msg.conteudo}
                      isOutgoing={isOutgoingMessage(msg.remetente)}
                    />
                  )}
                  {msg.conteudo && msg.tipo !== 'documento' && msg.tipo !== 'audio' && msg.tipo !== 'video' && !msg.url_imagem?.toLowerCase().endsWith('.pdf') && <p className="text-sm whitespace-pre-wrap">{msg.conteudo}</p>}
                                    <div className="mt-1 flex items-center justify-end gap-1 text-[10px] opacity-60">
                                      <span>
                                        {new Date(msg.enviado_em).toLocaleTimeString('pt-BR', {
                                          hour: '2-digit',
                                          minute: '2-digit',
                                        })}
                                      </span>
                                      {isOutgoingMessage(msg.remetente) && (
                                        <>
                                          {msgStatus === 'sending' && <Clock className="h-3 w-3 animate-pulse" />}
                                          {msgStatus === 'sent' && <Check className="h-3 w-3" />}
                                          {msgStatus === 'error' && <AlertTriangle className="h-3 w-3" />}
                                          {!msgStatus && <CheckCheck className="h-3 w-3" />}
                                        </>
                                      )}
                                    </div>
                                  </div>
                                </div>
                                )}
                              </React.Fragment>
                            )
                          })
                        })()}
                      </div>
                    )}
                  </ScrollArea>

            {/* Input Area Mobile */}
            <div className="border-t border-white/30 dark:border-white/8 bg-white/70 dark:bg-white/5 backdrop-blur-xl p-3 space-y-2">
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
                    {filePreview && (
                      <div className="mb-2 p-2 bg-muted/30 rounded-lg border">
                        <div className="relative inline-block">
  {filePreview.startsWith('file:') ? (
  (() => { const { icon: FIcon, label, color, bg, border } = getFileInfo(filePreview.replace('file:', '').split('.').pop() || '', selectedFile?.type); return (
  <div className={cn('flex items-center gap-2 px-2 py-1.5 rounded border', bg, border)}>
    <FIcon className={cn('h-5 w-5', color)} />
    <span className="text-xs text-foreground max-w-[100px] truncate">{filePreview.replace('file:', '')}</span>
  </div>) })()
  ) : filePreview.startsWith('video:') ? (
  <div className="flex items-center gap-2 px-2 py-1.5 bg-blue-50 dark:bg-blue-950/30 rounded border border-blue-200 dark:border-blue-800">
  <Video className="h-5 w-5 text-blue-600" />
  <span className="text-xs text-foreground">{filePreview.replace('video:', '')}</span>
  </div>
  ) : (
  <img
  src={filePreview || "/placeholder.svg"}
  alt="Preview"
  className="max-h-16 max-w-[120px] rounded-lg border object-cover"
  />
  )}
  <button
                            type="button"
                            onClick={clearSelectedFile}
                            className="absolute -top-2 -right-2 rounded-full bg-destructive text-destructive-foreground p-1"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                        className="shrink-0"
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
                  <Input
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  onKeyDown={handleKeyPress}
                  onPaste={handlePaste}
                  placeholder="Mensagem..."
                  className="flex-1"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  />
                      <Button
                        size="icon"
                        onClick={handleSendMessage}
                        disabled={(!messageInput.trim() && !selectedFile) || uploadingFile}
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
                      onClick={openTransferDialog}
                      className="flex-1 gap-1 bg-transparent"
                    >
                      <ArrowRightLeft className="h-4 w-4" />
                      Transferir
                    </Button>
                    <Button 
                      variant="destructive" 
                      size="sm"
                      onClick={() => setEncerrarDialogOpen(true)}
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
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmarEncerrar}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              ✅ Confirmar Encerramento
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Transfer Dialog */}
      <Dialog open={transferDialogOpen} onOpenChange={setTransferDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightLeft className="h-5 w-5" />
              Transferir Ticket
            </DialogTitle>
            <DialogDescription>
              Transfira este ticket para outro setor ou atendente.
            </DialogDescription>
          </DialogHeader>
          
          <Tabs defaultValue="atendente" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="atendente">👤 Atendente</TabsTrigger>
              <TabsTrigger value="setor">🏢 Setor</TabsTrigger>
            </TabsList>
            
<TabsContent value="atendente" className="space-y-4 pt-4">
                    <div className="space-y-2">
                      <Label>Selecione um atendente do setor atual</Label>
                      <Select
                        value={selectedAtendenteTransfer}
                        onValueChange={setSelectedAtendenteTransfer}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Escolha um atendente..." />
                        </SelectTrigger>
                        <SelectContent>
                          {atendentesDisponiveis.map((atendente) => (
                            <SelectItem
                              key={atendente.id}
                              value={atendente.id}
                              disabled={!atendente.is_online}
                            >
                              <div className="flex items-center gap-2 w-full">
                                <span
                                  className={cn(
                                    'h-2 w-2 rounded-full shrink-0',
                                    atendente.is_online ? 'bg-green-500' : 'bg-gray-400'
                                  )}
                                />
                                <span className={cn('flex-1', !atendente.is_online ? 'text-muted-foreground' : '')}>
                                  {atendente.nome}
                                </span>
                                {atendente.handlesSubsetor && selectedTicket?.subsetor_id && (
                                  <Badge variant="secondary" className="text-[10px] h-4 px-1 ml-auto shrink-0">
                                    {selectedTicket.subsetores?.nome}
                                  </Badge>
                                )}
                                {!atendente.is_online && (
                                  <span className="text-xs text-muted-foreground">(Offline)</span>
                                )}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {atendentesDisponiveis.length === 0 && (
                        <p className="text-sm text-muted-foreground">
                          Nenhum outro atendente neste setor.
                        </p>
                      )}
                      {atendentesDisponiveis.length > 0 &&
                        !atendentesDisponiveis.some((a) => a.is_online) && (
                          <p className="text-sm text-amber-600">
                            Todos os atendentes estao offline.
                          </p>
                        )}
                    </div>

  <Button
  onClick={handleTransferTicket}
  disabled={
  !selectedAtendenteTransfer ||
  selectedAtendenteTransfer === 'all' ||
  transferLoading ||
  !atendentesDisponiveis.find((a) => a.id === selectedAtendenteTransfer)?.is_online
  }
  className="w-full"
  >
  {transferLoading ? 'Transferindo...' : 'Transferir para Atendente'}
  </Button>
  {selectedAtendenteTransfer && selectedAtendenteTransfer !== 'all' && !atendentesDisponiveis.find((a) => a.id === selectedAtendenteTransfer)?.is_online && (
  <p className="text-sm text-destructive">
  Este atendente esta offline. Selecione um atendente online.
  </p>
  )}
  </TabsContent>
  
  <TabsContent value="setor" className="space-y-4 pt-4">
                    <div className="space-y-2">
                      <Label>Selecione o setor de destino</Label>
                      <Select value={selectedSetorTransfer} onValueChange={handleSetorChange}>
                        <SelectTrigger>
                          <SelectValue placeholder="Escolha um setor..." />
                        </SelectTrigger>
                        <SelectContent>
                          {setores.length === 0 ? (
                            <div className="p-3 text-sm text-muted-foreground text-center">
                              Nenhum setor habilitado para transferência. Configure em Configurações do Setor.
                            </div>
                          ) : (
                            setores.map((setor) => (
                              <SelectItem key={setor.id} value={setor.id}>
                                {setor.nome}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                      {setores.length === 0 && (
                        <p className="text-sm text-muted-foreground">
                          Nenhum setor habilitado. Configure os destinos em Configurações do Setor.
                        </p>
                      )}
                    </div>

                    {selectedSetorTransfer !== 'all' && (
                      <div className="space-y-2">
                        <Label>Atribuir a um atendente (opcional)</Label>
                        <Select
                          value={selectedAtendenteTransfer}
                          onValueChange={setSelectedAtendenteTransfer}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Deixar na fila do setor..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">
                              <div className="flex items-center gap-2">
                                <span className="h-2 w-2 rounded-full bg-blue-500" />
                                Deixar na fila (atribuir automaticamente)
                              </div>
                            </SelectItem>
                            {atendentesDisponiveis.map((atendente) => (
                              <SelectItem
                                key={atendente.id}
                                value={atendente.id}
                                disabled={!atendente.is_online}
                              >
                                <div className="flex items-center gap-2">
                                  <span
                                    className={cn(
                                      'h-2 w-2 rounded-full',
                                      atendente.is_online ? 'bg-green-500' : 'bg-gray-400'
                                    )}
                                  />
                                  <span className={!atendente.is_online ? 'text-muted-foreground' : ''}>
                                    {atendente.nome}
                                  </span>
                                  {!atendente.is_online && (
                                    <span className="text-xs text-muted-foreground">(Offline)</span>
                                  )}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {selectedSetorTransfer !== 'all' &&
                      atendentesDisponiveis.length > 0 &&
                      !atendentesDisponiveis.some((a) => a.is_online) && (
                        <p className="text-sm text-blue-600 bg-blue-50 p-2 rounded-md">
                          Nenhum atendente online neste setor. O ticket ira para a fila e sera
                          atribuido automaticamente quando alguem ficar online.
                        </p>
                      )}

                    <Button
                      onClick={handleTransferTicket}
                      disabled={
                        !selectedSetorTransfer || selectedSetorTransfer === 'all' || transferLoading
                      }
                      className="w-full"
                    >
                      {transferLoading ? 'Transferindo...' : 'Transferir para Setor'}
                    </Button>
                  </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

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
            <DialogDescription>
              {disparoStep === 'canal'
                ? 'Escolha por qual canal deseja enviar o disparo.'
                : disparoStep === 'mensagem_evolution'
                ? 'Escreva a mensagem de abertura para o atendimento via WhatsApp não oficial.'
                : 'Informe o CNPJ do cliente para iniciar um atendimento.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Steps 1 & 2: CNPJ + Phone (hidden after choosing canal) */}
            {(disparoStep === 'cnpj' || disparoStep === 'telefone') && (
              <>
                {/* Step 1: CNPJ */}
                <div className="space-y-2">
                  <Label>CNPJ do Cliente</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="00.000.000/0000-00"
                      value={disparoCnpj}
                      onChange={(e) => setDisparoCnpj(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleCnpjLookup()}
                      disabled={disparoLoading || disparoStep === 'telefone'}
                    />
                    <Button
                      onClick={handleCnpjLookup}
                      disabled={!disparoCnpj.trim() || disparoLoading || disparoStep === 'telefone'}
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
                      <p className="text-xs text-muted-foreground">CNPJ: {formatCNPJ(disparoCliente.cnpj)}</p>
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
                      onClick={() => { setDisparoCliente(null); setDisparoStep('cnpj'); setDisparoTelefone('') }}
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

                {/* Advance button */}
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
                    ) : (setorCanaisAtivos.includes('whatsapp') && setorCanaisAtivos.includes('evolution_api')) ? (
                      <>
                        Próximo
                        <ChevronRight className="h-4 w-4" />
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4" />
                        Enviar Disparo
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

                <div className="grid grid-cols-2 gap-3">
                  {/* WhatsApp Oficial */}
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

                  {/* Evolution (WhatsApp não oficial) */}
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

            {/* Step 4: Evolution message editor */}
            {disparoStep === 'mensagem_evolution' && (
              <div className="space-y-3">
                {/* Client summary */}
                <div className="rounded-lg border border-border bg-muted/50 p-3 space-y-0.5">
                  <p className="text-sm font-medium">{disparoCliente?.nome}</p>
                  <p className="text-xs text-muted-foreground">{formatPhone(disparoTelefone)}</p>
                  <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 dark:bg-blue-900/40 px-2 py-0.5 text-[10px] font-medium text-blue-700 dark:text-blue-400">
                    <Zap className="h-2.5 w-2.5" />
                    Evolution API
                  </span>
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
                    onClick={() => setDisparoStep(setorCanaisAtivos.includes('whatsapp') ? 'canal' : 'telefone')}
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
              Este ticket não possui um cliente com CNPJ vinculado. Deseja informar o cliente antes de encerrar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setClienteNaoInformadoDialogOpen(false)
                handleEncerrarTicket()
              }}
            >
              Não, encerrar assim
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setClienteNaoInformadoDialogOpen(false)
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
          if (!open) { setSelecionarClienteCnpj(''); setSelecionarClienteData(null) }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Search className="h-5 w-5 text-primary" />
              Selecionar Cliente
            </DialogTitle>
            <DialogDescription>
              Informe o CNPJ para buscar e vincular um cliente a este ticket.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* CNPJ Input */}
            <div className="space-y-2">
              <Label>CNPJ do Cliente</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="00.000.000/0000-00"
                  value={selecionarClienteCnpj}
                  onChange={(e) => setSelecionarClienteCnpj(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSelecionarClienteCnpjLookup()}
                  disabled={selecionarClienteLoading || !!selecionarClienteData}
                />
                <Button
                  onClick={handleSelecionarClienteCnpjLookup}
                  disabled={!selecionarClienteCnpj.trim() || selecionarClienteLoading || !!selecionarClienteData}
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
                {selecionarClienteData.cnpj && (
                  <p className="text-xs text-muted-foreground">CNPJ: {formatCNPJ(selecionarClienteData.cnpj)}</p>
                )}
                {selecionarClienteData.registro && (
                  <p className="text-xs text-muted-foreground">Registro: {selecionarClienteData.registro}</p>
                )}
                {selecionarClienteData.telefone && (
                  <p className="text-xs text-muted-foreground">Telefone: {formatPhone(selecionarClienteData.telefone)}</p>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[10px] px-2 mt-1"
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
                disabled={!selecionarClienteData}
                onClick={handleConfirmarSelecionarCliente}
              >
                Vincular Cliente
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Ticket Iframe Popup */}
      {ticketIframeTicket && colaborador && (
        <div
          className="fixed inset-x-0 bottom-0 z-[200] flex items-start justify-center bg-black/60 backdrop-blur-sm px-4 pb-4 pt-4"
          style={{ top: 64 }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setTicketIframeTicket(null)
          }}
        >
          <div className="relative w-full max-w-[96vw] rounded-2xl overflow-hidden shadow-2xl border border-white/20 bg-background flex flex-col" style={{ height: 'calc(100vh - 88px)' }}>
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-white/70 dark:bg-white/5 backdrop-blur-xl shrink-0">
              <div className="flex items-center gap-1.5">
                <Ticket className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-semibold">
                  Ticket #{ticketIframeTicket.numero} — {ticketIframeTicket.clientes.nome}
                </span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => setTicketIframeTicket(null)}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>

            {/* iFrame */}
            <iframe
              src={`https://ticket.softcom.solutions/?email=${encodeURIComponent(colaborador.email)}&open_ticket=${ticketIframeTicket.numero}`}
              className="w-full flex-1 border-0"
              title={`Ticket #${ticketIframeTicket.numero}`}
              allow="clipboard-read; clipboard-write"
            />
          </div>
        </div>
      )}
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
  setorCanal,
  colaboradorEmail,
  onOpenTicketIframe,
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
  setorCanal: 'whatsapp' | 'discord' | 'evolution_api'
  colaboradorEmail: string
  onOpenTicketIframe: (ticket: Ticket) => void
}) {
  // Tick every 30s to re-evaluate wait times
  const [, setTick] = useState(0)
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 30000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Filters */}
      <div className="shrink-0 space-y-3 border-b border-white/30 dark:border-white/8 p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={setorCanal === 'discord' ? "Buscar colaborador..." : "Buscar cliente..."}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="flex-1">
              <Filter className="mr-2 h-4 w-4" />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="aberto">Aberto</SelectItem>
              <SelectItem value="em_atendimento">Em Atendimento</SelectItem>
            </SelectContent>
          </Select>
          <Select value={prioridadeFilter} onValueChange={setPrioridadeFilter}>
            <SelectTrigger className="flex-1">
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
            <SelectTrigger className="w-full">
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

      {/* Ticket List */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {tickets.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center text-muted-foreground">
            <MessageCircle className="mb-2 h-8 w-8 opacity-50" />
            <p className="text-sm">Nenhum ticket encontrado</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {tickets.map((ticket) => {
              const unreadCount = unreadCounts.get(ticket.id) || 0
              const isWaitingResponse = ticket.ultima_mensagem_remetente && isOutgoingMessage(ticket.ultima_mensagem_remetente)
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
                  whileHover={{ backgroundColor: isSelected ? undefined : 'rgba(0,0,0,0.02)' }}
                  onClick={() => onSelectTicket(ticket)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelectTicket(ticket) }}
                  className={cn(
                    'w-full px-3 py-2.5 text-left transition-colors border-l-3 cursor-pointer',
                    isSelected 
                      ? 'bg-primary/10 border-l-primary'
                      : isExpiredWait
                      ? 'bg-amber-50 dark:bg-amber-950/30 border-l-amber-500'
                      : 'border-l-transparent hover:bg-muted/50'
                  )}
                >
                  <div className="flex flex-col gap-1">
                    {/* Row 1: #numero - Status Tags - Unread Badge - Ticket Icon */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className={cn(
                          "text-xs font-semibold shrink-0",
                          isSelected ? "text-primary" : "text-foreground"
                        )}>
                          #{ticket.numero}
                        </span>
                        {ticket.prioridade === 'urgente' && (
                          <AlertTriangle className="h-3 w-3 text-red-500 shrink-0" />
                        )}
                        <span className="text-muted-foreground">-</span>
                        {/* Status badges */}
                        {isExpiredWait ? (
                          <Badge className="text-[9px] px-1.5 py-0 h-4 bg-amber-500 text-white border-0 animate-pulse">
                            Sem resposta
                          </Badge>
                        ) : isWaitingResponse && unreadCount === 0 ? (
                          <Badge className="text-[9px] px-1.5 py-0 h-4 bg-amber-100 text-amber-700 border-0">
                            Aguardando
                          </Badge>
                        ) : (
                          <Badge
                            className={cn(
                              'text-[9px] px-1.5 py-0 h-4 border-0',
                              ticket.status === 'aberto' && 'bg-blue-100 text-blue-700',
                              ticket.status === 'em_atendimento' && 'bg-emerald-100 text-emerald-700'
                            )}
                          >
                            {ticket.status === 'aberto' ? 'Aberto' : 'Atendendo'}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {/* Unread badge */}
                        {unreadCount > 0 && (
                          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                            {unreadCount > 99 ? '99+' : unreadCount}
                          </span>
                        )}
                        {/* Ticket Iframe Button */}
                        <button
                          type="button"
                          title="Abrir detalhes do ticket"
                          onClick={(e) => {
                            e.stopPropagation()
                            onOpenTicketIframe(ticket)
                          }}
                          className="flex h-7 w-7 items-center justify-center rounded-md text-primary opacity-70 hover:opacity-100 hover:bg-primary/10 transition-all"
                        >
                          <Ticket className="h-5 w-5" />
                        </button>
                      </div>
                    </div>
                    
                    {/* Row 2: Nome do Cliente */}
                    <p className={cn(
                      "text-sm font-medium line-clamp-1",
                      isSelected ? "text-primary" : "text-foreground"
                    )}>
  {setorCanal === 'discord' ? (ticket.user_name_discord || ticket.clientes.nome) : ticket.clientes.nome}
  </p>
  
  {/* Row 3: Tempo */}
                    <span className="text-[10px] text-muted-foreground">
                      {formatDistanceToNow(new Date(ticket.ultima_mensagem_em || ticket.criado_em), {
                        locale: ptBR,
                        addSuffix: true,
                      })}
                    </span>
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
