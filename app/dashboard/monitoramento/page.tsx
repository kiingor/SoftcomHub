'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import { useColaborador, useSetores } from '@/lib/hooks/use-data'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Activity,
  RefreshCw,
  Search,
  Filter,
  Clock,
  User,
  AlertCircle,
  Eye,
  MessageCircle,
  X,
  ArrowRightLeft,
  Megaphone,
  Loader2,
  History,
  Check,
  XCircle,
} from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

function formatMs(ms: number) {
  const hours = Math.floor(ms / (1000 * 60 * 60))
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60))
  const seconds = Math.floor((ms % (1000 * 60)) / 1000)
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
}

function formatDuration(startDate: string | null, endDate: string | Date | null) {
  if (!startDate) return '00:00:00'
  const start = new Date(startDate).getTime()
  const end = endDate ? new Date(endDate).getTime() : Date.now()
  const diffMs = Math.max(0, end - start)
  return formatMs(diffMs)
}

function formatPhone(phone: string | null) {
  if (!phone) return '—'
  // Remove country code 55 from the start
  let num = phone.replace(/\D/g, '')
  if (num.startsWith('55') && num.length > 11) {
    num = num.slice(2)
  }
  // Format as (XX) XXXXX-XXXX or (XX) XXXX-XXXX
  if (num.length === 11) {
    return `(${num.slice(0, 2)}) ${num.slice(2, 7)}-${num.slice(7)}`
  }
  if (num.length === 10) {
    return `(${num.slice(0, 2)}) ${num.slice(2, 6)}-${num.slice(6)}`
  }
  return num
}

export default function MonitoramentoPage() {
  const supabase = createClient()
  const { data: colaborador } = useColaborador()
  const { data: setoresAcessiveis = [] } = useSetores(colaborador?.id, colaborador?.is_master)
  const setorIdsAcessiveis = setoresAcessiveis.map((s: any) => s.id)

  const [tagFilter, setTagFilter] = useState<string>('all')

  // Extrair tags únicas dos setores acessíveis
  const tagsDisponiveis = useMemo(() => {
    const tagMap = new Map<string, { id: string; nome: string; cor: string }>()
    setoresAcessiveis.forEach((s: any) => {
      if (s.tags) {
        tagMap.set(s.tags.id, { id: s.tags.id, nome: s.tags.nome, cor: s.tags.cor })
      }
    })
    return Array.from(tagMap.values()).sort((a, b) => a.nome.localeCompare(b.nome))
  }, [setoresAcessiveis])

  // Setores filtrados por tag
  const setoresFiltradosPorTag = useMemo(() => {
    if (tagFilter === 'all') return setoresAcessiveis
    return setoresAcessiveis.filter((s: any) => s.tags?.id === tagFilter)
  }, [setoresAcessiveis, tagFilter])

  const setorIdsFiltrados = useMemo(() => {
    return setoresFiltradosPorTag.map((s: any) => s.id)
  }, [setoresFiltradosPorTag])
  const [setorFilter, setSetorFilter] = useState<string>('all')
  const [subsetorFilter, setSubsetorFilter] = useState<string>('all')
  const [subsetoresDisponiveis, setSubsetoresDisponiveis] = useState<{id: string, nome: string}[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [atendenteFilter, setAtendenteFilter] = useState<string>('all')
  const [filtrosAtendenteOpen, setFiltrosAtendenteOpen] = useState(false)
  const [filtroAtendenteSearch, setFiltroAtendenteSearch] = useState('')
  const [activeTab, setActiveTab] = useState('em-andamento')
  const [searchAtendente, setSearchAtendente] = useState('')
  const [, setTick] = useState(0)

  // Helper: verifica se atendente está online (confia no is_online do banco)
  const isAtendenteOnline = useCallback((atendente: any): boolean => {
    return !!(atendente?.is_online && atendente?.ativo)
  }, [])

  // Conversation panel state
  const [selectedTicket, setSelectedTicket] = useState<any>(null)
  const [conversationMessages, setConversationMessages] = useState<any[]>([])
  const [ticketHistory, setTicketHistory] = useState<any[]>([])
  const [historyMessages, setHistoryMessages] = useState<Record<string, any[]>>({})
  const [expandedHistory, setExpandedHistory] = useState<string | null>(null)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [conversationTab, setConversationTab] = useState<'conversa' | 'historico'>('conversa')

  // Transfer & finalize state
  const [encerrarDialogOpen, setEncerrarDialogOpen] = useState(false)
  const [transferDialogOpen, setTransferDialogOpen] = useState(false)
  const [transferLoading, setTransferLoading] = useState(false)
  const [atendentesDisponiveis, setAtendentesDisponiveis] = useState<any[]>([])
  const [setoresTransfer, setSetoresTransfer] = useState<any[]>([])
  const [selectedSetorTransfer, setSelectedSetorTransfer] = useState<string>('all')
  const [selectedAtendenteTransfer, setSelectedAtendenteTransfer] = useState<string>('all')

  // Tick every second for live times
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(interval)
  }, [])

  // Fetch subsetores when setor filter changes
  useEffect(() => {
    async function fetchSubsetores() {
      const targetSetorIds = setorFilter !== 'all' ? [setorFilter] : setorIdsFiltrados
      if (targetSetorIds.length === 0) {
        setSubsetoresDisponiveis([])
        return
      }
      const { data } = await supabase
        .from('subsetores')
        .select('id, nome')
        .in('setor_id', targetSetorIds)
        .eq('ativo', true)
        .order('nome')
      setSubsetoresDisponiveis(data || [])
      setSubsetorFilter('all') // Reset subsetor filter when setor changes
    }
    if (colaborador && setorIdsFiltrados.length > 0) {
      fetchSubsetores()
    }
  }, [setorFilter, tagFilter, colaborador, setorIdsFiltrados.length, supabase])

  // Fetch monitoring data
  const { data, isLoading, mutate } = useSWR(
    colaborador && setorIdsFiltrados.length > 0
      ? ['dashboard-monitoramento', setorIdsFiltrados.join(','), setorFilter, tagFilter]
      : null,
    async () => {
      const targetSetorIds = setorFilter !== 'all' ? [setorFilter] : setorIdsFiltrados

      // Fetch active tickets (aberto + em_atendimento) across all accessible setores
      let ticketsQuery = supabase
        .from('tickets')
        .select('*, clientes(nome, telefone), colaboradores(id, nome, is_online, pausa_atual_id), setores(id, nome), subsetores(id, nome)')
        .in('setor_id', targetSetorIds)
        .in('status', ['aberto', 'em_atendimento'])
      const { data: ticketsAtivos } = await ticketsQuery

      // Fetch today's tickets (for stats)
      const now = new Date()
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
      const { data: ticketsHoje } = await supabase
        .from('tickets')
        .select('id, status, criado_em, primeira_resposta_em, encerrado_em')
        .in('setor_id', targetSetorIds)
        .gte('criado_em', startOfDay)

      // Separate count queries to avoid Supabase 1000-row default limit
      const { count: countRecebidos } = await supabase
        .from('tickets')
        .select('*', { count: 'exact', head: true })
        .in('setor_id', targetSetorIds)
        .gte('criado_em', startOfDay)

      const { count: countResolvidos } = await supabase
        .from('tickets')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'encerrado')
        .in('setor_id', targetSetorIds)
        .gte('criado_em', startOfDay)

      // Fetch atendentes across all accessible setores
      let atendentesQuery = supabase
        .from('colaboradores_setores')
        .select('colaborador_id, colaboradores(id, nome, is_online, ativo, pausa_atual_id, last_heartbeat)')
        .in('setor_id', targetSetorIds)
      const { data: atendentesData } = await atendentesQuery

      // Deduplicate atendentes (same person can be in multiple setores)
      const atendentesMap = new Map()
      for (const a of atendentesData || []) {
        const colab = (a as any).colaboradores
        if (colab && !atendentesMap.has(colab.id)) {
          atendentesMap.set(colab.id, colab)
        }
      }
      const atendentes = Array.from(atendentesMap.values())

      const tickets = ticketsAtivos || []
      const todayTickets = ticketsHoje || []

      // Calculate stats
      const ticketsNaFila = tickets.filter((t: any) => t.status === 'aberto')
      const ticketsEmAtendimento = tickets.filter((t: any) => t.status === 'em_atendimento')
      const ticketsFinalizados = todayTickets.filter((t: any) => t.status === 'encerrado')

      // Max times
      const nowMs = Date.now()

      // Online = is_online true, ativo, e sem pausa
      const atendentesOnline = atendentes.filter((c: any) => c.is_online && c.ativo && !c.pausa_atual_id)
      const atendentesEmPausa = atendentes.filter((c: any) => c.pausa_atual_id && c.ativo)
      let maxTempoFila = 0
      let maxTempoResposta = 0

      for (const ticket of ticketsNaFila) {
        if (ticket.criado_em) {
          const tempoFila = nowMs - new Date(ticket.criado_em).getTime()
          if (tempoFila > maxTempoFila) maxTempoFila = tempoFila
        }
      }

      for (const ticket of ticketsEmAtendimento) {
        if (ticket.criado_em && !ticket.primeira_resposta_em) {
          const tempoResposta = nowMs - new Date(ticket.criado_em).getTime()
          if (tempoResposta > maxTempoResposta) maxTempoResposta = tempoResposta
        }
      }

      // Average first response time
      const withFirstResp = todayTickets.filter((t: any) => t.primeira_resposta_em)
      let avgFirstResp = 0
      if (withFirstResp.length > 0) {
        const total = withFirstResp.reduce((sum: number, t: any) => {
          return sum + (new Date(t.primeira_resposta_em).getTime() - new Date(t.criado_em).getTime())
        }, 0)
        avgFirstResp = total / withFirstResp.length
      }

      // Average resolution time
      const resolved = todayTickets.filter((t: any) => t.encerrado_em)
      let avgResolution = 0
      if (resolved.length > 0) {
        const total = resolved.reduce((sum: number, t: any) => {
          return sum + (new Date(t.encerrado_em).getTime() - new Date(t.criado_em).getTime())
        }, 0)
        avgResolution = total / resolved.length
      }

      return {
        tickets,
        atendentes,
        stats: {
          total: tickets.length,
          naFila: ticketsNaFila.length,
          emAtendimento: ticketsEmAtendimento.length,
          finalizados: ticketsFinalizados.length,
          tempoMaximoFila: formatMs(maxTempoFila),
          tempoMaximoResposta: formatMs(maxTempoResposta),
        },
        atendentesStats: {
          online: atendentesOnline.length,
          pausa: atendentesEmPausa.length,
          offline: atendentes.filter((c: any) => !c.is_online && c.ativo && !c.pausa_atual_id).length,
        },
        temposHoje: {
          tempoMedioPrimeiraResposta: formatMs(avgFirstResp),
          tempoMedioResolucao: formatMs(avgResolution),
          totalRecebidos: countRecebidos || 0,
          totalResolvidos: countResolvidos || 0,
        },
      }
    },
    { revalidateOnFocus: false, refreshInterval: 5000 },
  )

  const stats = data?.stats || { total: 0, naFila: 0, emAtendimento: 0, finalizados: 0, tempoMaximoFila: '00:00:00', tempoMaximoResposta: '00:00:00' }
  const atendentesStats = data?.atendentesStats || { online: 0, pausa: 0, offline: 0 }
  const temposHoje = data?.temposHoje || { tempoMedioPrimeiraResposta: '00:00:00', tempoMedioResolucao: '00:00:00', totalRecebidos: 0, totalResolvidos: 0 }
  const tickets = data?.tickets || []
  const atendentesRaw: any[] = data?.atendentes || []

  // Tickets em andamento
  // Lista de atendentes únicos para o filtro
  const atendentesUnicos = useMemo(() => {
    const map = new Map<string, string>()
    tickets.forEach((t: any) => {
      if (t.colaborador_id && t.colaboradores?.nome) {
        map.set(t.colaborador_id, t.colaboradores.nome)
      }
    })
    return Array.from(map.entries()).map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome))
  }, [tickets])

  const ticketsEmAndamento = useMemo(() => {
    return tickets
      .filter((t: any) => t.status === 'em_atendimento' || (t.status === 'aberto' && t.colaborador_id))
      .filter((t: any) => {
        // Filtro por atendente
        if (atendenteFilter !== 'all' && t.colaborador_id !== atendenteFilter) return false
        // Filtro de subsetor
        if (subsetorFilter !== 'all') {
          if (subsetorFilter === 'sem_subsetor') {
            if (t.subsetor_id) return false
          } else {
            if (t.subsetor_id !== subsetorFilter) return false
          }
        }
        if (!searchTerm) return true
        const contato = t.clientes?.nome || t.clientes?.telefone || ''
        const numero = String(t.numero ?? t.id?.slice(0, 8) ?? '')
        return contato.toLowerCase().includes(searchTerm.toLowerCase()) || numero.includes(searchTerm)
      })
      .map((t: any) => ({
        id: t.id,
        cliente_id: t.cliente_id,
        setor_id: t.setor_id,
        colaborador_id: t.colaborador_id,
        setores: t.setores,
        colaboradores: t.colaboradores,
        numero: t.numero ?? null,
        // Tempo na fila = criado_em → atribuido_em (tempo sem atendente)
        // Se atribuido_em não foi registrado mas já tem colaborador, o dado não está disponível
        tempoNaFila: t.atribuido_em
          ? formatDuration(t.criado_em, t.atribuido_em)
          : t.colaborador_id
            ? '—'
            : formatDuration(t.criado_em, null),
        tempoPrimeiraResposta: t.primeira_resposta_em ? formatDuration(t.criado_em, t.primeira_resposta_em) : null,
        // Tempo de atendimento = atribuido_em (ou criado_em como fallback) → agora
        tempoAtendimento: t.colaborador_id ? formatDuration(t.atribuido_em || t.criado_em, null) : '00:00:00',
        contato: t.clientes?.nome || t.clientes?.telefone || 'Desconhecido',
        telefone: t.clientes?.telefone || null,
        canal: t.canal || 'whatsapp',
        setor: t.setores?.nome || '-',
        subsetor: t.subsetores?.nome || null,
        atendente: t.colaboradores?.nome || null,
        status: t.status,
        primeira_resposta_em: t.primeira_resposta_em,
      }))
  }, [tickets, searchTerm, subsetorFilter, atendenteFilter])

  // Tickets aguardando
  const ticketsAguardando = useMemo(() => {
    return tickets
      .filter((t: any) => t.status === 'aberto' && !t.colaborador_id)
      .filter((t: any) => {
        // Filtro de subsetor
        if (subsetorFilter !== 'all') {
          if (subsetorFilter === 'sem_subsetor') {
            if (t.subsetor_id) return false
          } else {
            if (t.subsetor_id !== subsetorFilter) return false
          }
        }
        if (!searchTerm) return true
        const contato = t.clientes?.nome || t.clientes?.telefone || ''
        return contato.toLowerCase().includes(searchTerm.toLowerCase())
      })
      // Aguardando não tem colaborador, então "Meus" mostra vazio (sem atribuição ainda)
      .map((t: any) => ({
        id: t.id,
        cliente_id: t.cliente_id,
        numero: t.numero ?? null,
        contato: t.clientes?.nome || t.clientes?.telefone || 'Desconhecido',
        telefone: t.clientes?.telefone || null,
        canal: t.canal || 'whatsapp',
        setor: t.setores?.nome || '-',
        subsetor: t.subsetores?.nome || null,
        tempoEspera: formatDuration(t.criado_em, null),
        criado_em: t.criado_em,
      }))
  }, [tickets, searchTerm, subsetorFilter])

  // Atendentes list for the Atendentes tab
  const atendentesLista = useMemo(() => {
    const ticketCountPorAtendente = new Map<string, number>()
    tickets.forEach((t: any) => {
      if (t.colaborador_id && (t.status === 'em_atendimento' || t.status === 'aberto')) {
        ticketCountPorAtendente.set(t.colaborador_id, (ticketCountPorAtendente.get(t.colaborador_id) || 0) + 1)
      }
    })
    return atendentesRaw
      .filter((a: any) => {
        if (!searchAtendente) return true
        return a.nome?.toLowerCase().includes(searchAtendente.toLowerCase())
      })
      .map((a: any) => ({
        ...a,
        ticketsAtivos: ticketCountPorAtendente.get(a.id) || 0,
      }))
      .sort((a: any, b: any) => {
        // Ordem: Online primeiro → Pausa → Offline, e dentro de cada grupo por nome
        const order = (x: any) => {
          if (x.is_online && !x.pausa_atual_id) return 0 // Online
          if (x.pausa_atual_id) return 1                  // Em pausa
          return 2                                         // Offline
        }
        return order(a) - order(b) || a.nome?.localeCompare(b.nome)
      })
  }, [atendentesRaw, tickets, searchAtendente])

  // Open conversation panel
  const openConversation = async (ticket: any) => {
    setSelectedTicket(ticket)
    setConversationTab('conversa')
    setLoadingMessages(true)
    setLoadingHistory(true)

    try {
      // Fetch messages for this ticket
      const { data: messages } = await supabase
        .from('mensagens')
        .select('*')
        .eq('ticket_id', ticket.id)
        .order('enviado_em', { ascending: true })

      setConversationMessages(messages || [])
    } catch {
      setConversationMessages([])
    } finally {
      setLoadingMessages(false)
    }

    // Fetch ticket history for same client
    try {
      const { data: history } = await supabase
        .from('tickets')
        .select('*, colaboradores(nome), setores(nome)')
        .eq('cliente_id', ticket.cliente_id)
        .neq('id', ticket.id)
        .order('criado_em', { ascending: false })
        .limit(20)

      setTicketHistory(history || [])
    } catch {
      setTicketHistory([])
    } finally {
      setLoadingHistory(false)
    }
  }

  const closeConversation = () => {
    setSelectedTicket(null)
    setConversationMessages([])
    setTicketHistory([])
    setHistoryMessages({})
    setExpandedHistory(null)
  }

  const loadHistoryMessages = async (ticketId: string) => {
    if (historyMessages[ticketId]) {
      setExpandedHistory(expandedHistory === ticketId ? null : ticketId)
      return
    }
    setExpandedHistory(ticketId)
    const { data: msgs } = await supabase
      .from('mensagens')
      .select('*')
      .eq('ticket_id', ticketId)
      .order('enviado_em', { ascending: true })
    setHistoryMessages(prev => ({ ...prev, [ticketId]: msgs || [] }))
  }

  // Encerrar ticket
  const handleEncerrarTicket = async () => {
    if (!selectedTicket) return
    try {
      // Fetch setor config for closing message
      const { data: setor } = await supabase
        .from('setores')
        .select('mensagem_finalizacao')
        .eq('id', selectedTicket.setor_id)
        .single()

      // Send closing message if configured
      if (setor?.mensagem_finalizacao) {
        // Fetch client data for template variables
        const { data: cliente } = await supabase
          .from('clientes')
          .select('nome, telefone, CNPJ')
          .eq('id', selectedTicket.cliente_id)
          .single()

        // Process template variables
        const now = new Date()
        const processedMessage = setor.mensagem_finalizacao
          .replace(/\{\{cliente_nome\}\}/g, cliente?.nome || '')
          .replace(/\{\{cliente_telefone\}\}/g, cliente?.telefone || '')
          .replace(/\{\{cliente_cnpj\}\}/g, cliente?.CNPJ || '')
          .replace(/\{\{atendente_nome\}\}/g, selectedTicket.atendente || '')
          .replace(/\{\{setor_nome\}\}/g, selectedTicket.setores?.nome || '')
          .replace(/\{\{ticket_id\}\}/g, selectedTicket.numero ? `#${selectedTicket.numero}` : '')
          .replace(/\{\{data_atual\}\}/g, now.toLocaleDateString('pt-BR'))
          .replace(/\{\{hora_atual\}\}/g, now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }))

        // Detect channel from last message
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

        let setorCanal = 'whatsapp'
        let phoneNumberId: string | null = lastPhoneNumberId

        if (lastDiscordUserId || lastCanalEnvio === 'discord') {
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

        // Send closing message via the appropriate channel
        try {
          if (setorCanal === 'discord') {
            await fetch('/api/discord/send', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ticketId: selectedTicket.id, message: processedMessage }),
            })
          } else if (setorCanal === 'evolution_api' && phoneNumberId && cliente?.telefone) {
            await fetch('/api/evolution/send', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ticketId: selectedTicket.id, message: processedMessage, instanceName: phoneNumberId }),
            })
          } else if (setorCanal === 'whatsapp' && phoneNumberId && cliente?.telefone) {
            await fetch('/api/whatsapp/send', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ recipientPhone: cliente.telefone, message: processedMessage, ticketId: selectedTicket.id, phoneNumberId }),
            })
          }
        } catch (err) {
          console.error('[Encerrar] Erro ao enviar mensagem de finalização:', err)
        }
      }

      await supabase
        .from('tickets')
        .update({ status: 'encerrado', encerrado_em: new Date().toISOString() })
        .eq('id', selectedTicket.id)

      try {
        await fetch('/api/webhooks/dispatch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ticketId: selectedTicket.id, evento: 'ticket_encerrado' }),
        })
      } catch (err) {
        console.error('[Webhook] dispatch error:', err)
      }

      toast.success('Ticket encerrado')
      setEncerrarDialogOpen(false)
      closeConversation()
      mutate()
    } catch {
      toast.error('Erro ao encerrar ticket')
    }
  }

  // Open transfer dialog and fetch data
  const openTransferDialog = async () => {
    setTransferDialogOpen(true)
    setSelectedSetorTransfer('all')
    setSelectedAtendenteTransfer('all')
    setAtendentesDisponiveis([])
    setSetoresTransfer([])

    const currentSetorId = selectedTicket?.setor_id
    if (!currentSetorId) return

    // Fetch destination setores configured for this setor
    const { data: destinosData } = await supabase
      .from('setor_destinos_transferencia')
      .select('setor_destino_id, setores:setor_destino_id(id, nome)')
      .eq('setor_origem_id', currentSetorId)

    if (destinosData && destinosData.length > 0) {
      const destinos = destinosData.map((d: any) => d.setores).filter(Boolean).sort((a: any, b: any) => a.nome.localeCompare(b.nome))
      setSetoresTransfer(destinos)
    }

    // Fetch atendentes from same setor
    const { data: csData } = await supabase
      .from('colaboradores_setores')
      .select('colaborador_id')
      .eq('setor_id', currentSetorId)

    if (csData && csData.length > 0) {
      const ids = csData.map((cs: any) => cs.colaborador_id)
      const { data: colabData } = await supabase
        .from('colaboradores')
        .select('id, nome, is_online, ativo, last_heartbeat')
        .in('id', ids)
        .eq('ativo', true)
        .neq('id', selectedTicket?.colaborador_id || '')

      setAtendentesDisponiveis(colabData || [])
    }
  }

  // Fetch atendentes when destination setor changes
  const handleSetorTransferChange = async (setorId: string) => {
    setSelectedSetorTransfer(setorId)
    setSelectedAtendenteTransfer('all')

    const { data: csData } = await supabase
      .from('colaboradores_setores')
      .select('colaborador_id')
      .eq('setor_id', setorId)

    if (csData && csData.length > 0) {
      const ids = csData.map((cs: any) => cs.colaborador_id)
      const { data: colabData } = await supabase
        .from('colaboradores')
        .select('id, nome, is_online, ativo, last_heartbeat')
        .in('id', ids)
        .eq('ativo', true)
      setAtendentesDisponiveis(colabData || [])
    } else {
      setAtendentesDisponiveis([])
    }
  }

  // Execute transfer
  const handleTransferTicket = async () => {
    if (!selectedTicket) return
    setTransferLoading(true)

    const res = await fetch('/api/tickets/transferir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ticket_id: selectedTicket.id,
        setor_id: selectedSetorTransfer !== 'all' ? selectedSetorTransfer : undefined,
        colaborador_id: selectedAtendenteTransfer !== 'all' ? selectedAtendenteTransfer : null,
        from_colaborador_nome: selectedTicket.colaboradores?.nome || 'Desconhecido',
        from_setor_nome: selectedTicket.setores?.nome || 'Desconhecido',
      }),
    })

    const result = await res.json()

    if (!res.ok) {
      toast.error(result.error || 'Erro ao transferir ticket')
      setTransferLoading(false)
      return
    }

    if (result.queued) {
      toast.info('Atendente no limite de tickets — ticket adicionado à fila de espera')
    } else {
      toast.success('Ticket transferido com sucesso')
    }

    setTransferDialogOpen(false)
    setTransferLoading(false)

    // Se o ticket foi para a fila (sem atendente), acionar distribuição imediata
    if (selectedAtendenteTransfer === 'all') {
      fetch('/api/tickets/auto-assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }).catch(() => {})
    }

    closeConversation()
    mutate()
  }


  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-foreground">Monitoramento</h1>
          <div className="flex items-center gap-1.5 rounded-full bg-green-500/10 px-2.5 py-1">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
            </span>
            <span className="text-xs font-medium text-green-600 dark:text-green-400">Ao vivo</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {tagsDisponiveis.length > 0 && (
            <Select value={tagFilter} onValueChange={(val) => {
              setTagFilter(val)
              setSetorFilter('all')
              setSubsetorFilter('all')
            }}>
              <SelectTrigger className="w-40 bg-card">
                <SelectValue placeholder="Todas as tags" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as tags</SelectItem>
                {tagsDisponiveis.map((tag) => (
                  <SelectItem key={tag.id} value={tag.id}>
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: tag.cor || '#888' }} />
                      {tag.nome}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={setorFilter} onValueChange={setSetorFilter}>
            <SelectTrigger className="w-48 bg-card">
              <SelectValue placeholder="Todos os setores" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os setores</SelectItem>
              {setoresFiltradosPorTag.map((s: any) => (
                <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {subsetoresDisponiveis.length > 0 && (
            <Select value={subsetorFilter} onValueChange={setSubsetorFilter}>
              <SelectTrigger className="w-44 bg-card">
                <SelectValue placeholder="Todos subsetores" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos subsetores</SelectItem>
                <SelectItem value="sem_subsetor">Sem subsetor</SelectItem>
                {subsetoresDisponiveis.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Popover open={filtrosAtendenteOpen} onOpenChange={setFiltrosAtendenteOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  "gap-2 bg-transparent",
                  atendenteFilter !== 'all' && "border-primary text-primary"
                )}
              >
                <User className="h-4 w-4" />
                {atendenteFilter !== 'all'
                  ? (atendentesUnicos.find(a => a.id === atendenteFilter)?.nome || 'Atendente')
                  : 'Atendente'
                }
                {atendenteFilter !== 'all' && (
                  <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">1</Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-3" align="end" onCloseAutoFocus={() => setFiltroAtendenteSearch('')}>
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Filtrar por atendente</p>
                <input
                  type="text"
                  placeholder="Buscar atendente..."
                  value={filtroAtendenteSearch}
                  onChange={(e) => setFiltroAtendenteSearch(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  autoFocus
                />
                <div className="space-y-1 max-h-[280px] overflow-y-auto">
                  {!filtroAtendenteSearch && (
                    <button
                      onClick={() => { setAtendenteFilter('all'); setFiltrosAtendenteOpen(false) }}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted",
                        atendenteFilter === 'all' && "font-medium text-primary"
                      )}
                    >
                      <Check className={cn("h-3.5 w-3.5", atendenteFilter !== 'all' && "invisible")} />
                      Todos os atendentes
                    </button>
                  )}
                  {atendentesUnicos
                    .filter(a => !filtroAtendenteSearch || a.nome.toLowerCase().includes(filtroAtendenteSearch.toLowerCase()))
                    .map((a) => (
                    <button
                      key={a.id}
                      onClick={() => { setAtendenteFilter(a.id); setFiltrosAtendenteOpen(false) }}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted",
                        atendenteFilter === a.id && "font-medium text-primary"
                      )}
                    >
                      <Check className={cn("h-3.5 w-3.5", atendenteFilter !== a.id && "invisible")} />
                      {a.nome}
                    </button>
                  ))}
                  {atendentesUnicos.length === 0 && (
                    <p className="px-2 py-1.5 text-xs text-muted-foreground">Nenhum atendente ativo</p>
                  )}
                  {filtroAtendenteSearch && atendentesUnicos.filter(a => a.nome.toLowerCase().includes(filtroAtendenteSearch.toLowerCase())).length === 0 && (
                    <p className="px-2 py-1.5 text-xs text-muted-foreground">Nenhum resultado para &quot;{filtroAtendenteSearch}&quot;</p>
                  )}
                </div>
              </div>
            </PopoverContent>
          </Popover>
          <Button variant="outline" size="sm" onClick={() => mutate()} className="gap-2 bg-transparent">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Stats Cards Row 1 */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-[2fr_1fr]">
        {/* Atendimentos em tempo real */}
        <Card className="glass-card-elevated rounded-2xl border-0 border-l-4 border-l-primary">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Atendimentos em tempo real
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-3 text-center sm:grid-cols-6">
              <div className="space-y-1">
                <p className="text-2xl font-bold text-foreground tabular-nums">{stats.total}</p>
                <p className="text-xs text-muted-foreground">Total</p>
              </div>
              <div className="space-y-1">
                <p className="text-2xl font-bold text-orange-500 tabular-nums">{stats.naFila}</p>
                <p className="text-xs text-muted-foreground">Na fila</p>
              </div>
              <div className="space-y-1">
                <p className="text-2xl font-bold text-primary tabular-nums">{stats.emAtendimento}</p>
                <p className="text-xs text-muted-foreground">Em atend.</p>
              </div>
              <div className="space-y-1">
                <p className="text-2xl font-bold text-green-500 tabular-nums">{stats.finalizados}</p>
                <p className="text-xs text-muted-foreground">Finalizados</p>
              </div>
              <div className="space-y-1">
                <p className="text-xl font-bold text-foreground tabular-nums whitespace-nowrap">{stats.tempoMaximoFila}</p>
                <p className="text-xs text-muted-foreground">Max. fila</p>
              </div>
              <div className="space-y-1">
                <p className="text-xl font-bold text-foreground tabular-nums whitespace-nowrap">{stats.tempoMaximoResposta}</p>
                <p className="text-xs text-muted-foreground">Max. resp.</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Status dos atendentes */}
        <Card className="glass-card-elevated rounded-2xl border-0">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Status dos atendentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex justify-around text-center gap-2">
              <div className="space-y-1">
                <p className="text-2xl font-bold text-green-500 tabular-nums">{atendentesStats.online}</p>
                <div className="flex items-center justify-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-green-500" />
                  <p className="text-xs text-muted-foreground">Online</p>
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-2xl font-bold text-amber-500 tabular-nums">{atendentesStats.pausa}</p>
                <div className="flex items-center justify-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-yellow-500" />
                  <p className="text-xs text-muted-foreground">Pausa</p>
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-2xl font-bold text-muted-foreground tabular-nums">{atendentesStats.offline}</p>
                <div className="flex items-center justify-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-gray-400" />
                  <p className="text-xs text-muted-foreground">Offline</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Stats Cards Row 2 */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="glass-card-elevated rounded-2xl border-0">
          <CardContent className="pt-6">
            <div className="text-center space-y-1">
              <p className="text-xs text-muted-foreground">Tempo med. 1a resposta</p>
              <p className="text-2xl font-bold text-foreground">{temposHoje.tempoMedioPrimeiraResposta}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="glass-card-elevated rounded-2xl border-0">
          <CardContent className="pt-6">
            <div className="text-center space-y-1">
              <p className="text-xs text-muted-foreground">Tempo med. resolucao</p>
              <p className="text-2xl font-bold text-foreground">{temposHoje.tempoMedioResolucao}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="glass-card-elevated rounded-2xl border-0">
          <CardContent className="pt-6">
            <div className="text-center space-y-1">
              <p className="text-xs text-muted-foreground">Tickets recebidos (Hoje)</p>
              <p className="text-2xl font-bold text-foreground">{temposHoje.totalRecebidos}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="glass-card-elevated rounded-2xl border-0">
          <CardContent className="pt-6">
            <div className="text-center space-y-1">
              <p className="text-xs text-muted-foreground">Tickets resolvidos (Hoje)</p>
              <p className="text-2xl font-bold text-green-500">{temposHoje.totalResolvidos}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Monitoramento Detalhado */}
      <Card className="glass-card-elevated rounded-2xl border-0">
        <CardHeader className="pb-0">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-lg">Monitoramento detalhado</CardTitle>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar pelo N do ticket ou contato"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-64 pl-9 h-9 rounded-2xl glass-input"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          {/* Tabs + Filtro de colaborador */}
          <div className="border-b border-border mb-4">
            <div className="flex items-end justify-between gap-2">
              <div className="flex gap-0">
                <button
                  onClick={() => setActiveTab('em-andamento')}
                  className={cn(
                    "px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px",
                    activeTab === 'em-andamento'
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"
                  )}
                >
                  Em andamento
                  {ticketsEmAndamento.length > 0 && (
                    <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-[10px]">
                      {ticketsEmAndamento.length}
                    </Badge>
                  )}
                </button>
                <button
                  onClick={() => setActiveTab('aguardando')}
                  className={cn(
                    "px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px",
                    activeTab === 'aguardando'
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"
                  )}
                >
                  Aguardando atendimento
                  {ticketsAguardando.length > 0 && (
                    <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-[10px]">
                      {ticketsAguardando.length}
                    </Badge>
                  )}
                </button>
                <button
                  onClick={() => setActiveTab('atendentes')}
                  className={cn(
                    "px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px",
                    activeTab === 'atendentes'
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"
                  )}
                >
                  Atendentes
                  {atendentesRaw.length > 0 && (
                    <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-[10px]">
                      {atendentesRaw.length}
                    </Badge>
                  )}
                </button>
              </div>

            </div>
          </div>

          {/* Tab Content */}
          <div className="min-h-[300px]">
            {/* Em Andamento Tab */}
            {activeTab === 'em-andamento' && (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">1ª Resposta</TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tempo atend.</TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ticket</TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Número</TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Contato</TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Setor / Subsetor</TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Atendente</TableHead>
                      <TableHead className="text-xs w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      Array.from({ length: 5 }).map((_, i) => (
                        <TableRow key={i}>
                          <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-8" /></TableCell>
                        </TableRow>
                      ))
                    ) : ticketsEmAndamento.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="h-32 text-center">
                          <div className="flex flex-col items-center justify-center text-muted-foreground">
                            <AlertCircle className="mb-2 h-8 w-8" />
                            <p>Nenhum atendimento em andamento</p>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      ticketsEmAndamento.map((ticket: any) => {
                        const aguardandoResposta = ticket.status === 'em_atendimento' && !ticket.primeira_resposta_em
                        return (
                          <TableRow
                            key={ticket.id}
                            className={cn(
                              aguardandoResposta && "bg-yellow-50/50 dark:bg-yellow-950/20"
                            )}
                          >
                            <TableCell>
                              {aguardandoResposta ? (
                                <Badge variant="outline" className="bg-yellow-100 dark:bg-yellow-900/50 text-yellow-800 dark:text-yellow-200 border-yellow-300 dark:border-yellow-700 text-[10px]">
                                  <Clock className="mr-1 h-3 w-3" />
                                  Aguardando...
                                </Badge>
                              ) : (
                                <span className="text-sm tabular-nums text-foreground">{ticket.tempoPrimeiraResposta || '00:00:00'}</span>
                              )}
                            </TableCell>
                            <TableCell className="text-sm tabular-nums text-foreground">{ticket.tempoAtendimento}</TableCell>
                            <TableCell className="text-sm tabular-nums text-foreground font-medium">
                              {ticket.numero ? `#${ticket.numero}` : '—'}
                            </TableCell>
                            <TableCell className="text-sm text-foreground">
                              {ticket.canal === 'discord' ? '—' : formatPhone(ticket.telefone)}
                            </TableCell>
                            <TableCell className="text-sm text-foreground max-w-[140px]">
                              <div className="flex items-center gap-1">
                                <User className="h-3 w-3 text-muted-foreground shrink-0" />
                                <span className="truncate" title={ticket.contato}>{ticket.contato}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-sm text-foreground">
                              {ticket.setor}
                              {ticket.subsetor && (
                                <span className="text-muted-foreground"> / {ticket.subsetor}</span>
                              )}
                            </TableCell>
                            <TableCell className="text-sm text-foreground">
                              {ticket.atendente ? (
                                <div className="flex items-center gap-1.5">
                                  <span className={cn(
                                    'h-2 w-2 shrink-0 rounded-full',
                                    ticket.colaboradores?.is_online && !ticket.colaboradores?.pausa_atual_id
                                      ? 'bg-green-500'
                                      : ticket.colaboradores?.pausa_atual_id
                                        ? 'bg-yellow-500'
                                        : 'bg-gray-400'
                                  )} />
                                  {ticket.atendente}
                                </div>
                              ) : '-'}
                            </TableCell>
                            <TableCell>
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openConversation(ticket)}>
                                <MessageCircle className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        )
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Atendentes Tab */}
            {activeTab === 'atendentes' && (
              <div className="space-y-4">
                <div className="relative max-w-xs">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Buscar atendente..."
                    value={searchAtendente}
                    onChange={(e) => setSearchAtendente(e.target.value)}
                    className="pl-9 h-9 rounded-2xl glass-input"
                  />
                </div>
                {isLoading ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <Skeleton key={i} className="h-20 rounded-xl" />
                    ))}
                  </div>
                ) : atendentesLista.length === 0 ? (
                  <div className="flex h-32 flex-col items-center justify-center text-muted-foreground">
                    <AlertCircle className="mb-2 h-8 w-8" />
                    <p>{searchAtendente ? 'Nenhum atendente encontrado' : 'Nenhum atendente neste setor'}</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {atendentesLista.map((atendente: any) => {
                      const isOnline = isAtendenteOnline(atendente) && !atendente.pausa_atual_id
                      const isPausa = !!atendente.pausa_atual_id
                      return (
                        <div
                          key={atendente.id}
                          className="flex items-center gap-3 rounded-xl border bg-card/60 px-4 py-3 transition-colors hover:bg-muted/40"
                        >
                          <span
                            className={cn(
                              'h-3 w-3 shrink-0 rounded-full',
                              isOnline ? 'bg-green-500' : isPausa ? 'bg-yellow-500' : 'bg-gray-400'
                            )}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-foreground">{atendente.nome}</p>
                            <p className={cn(
                              'text-xs',
                              isOnline ? 'text-green-600 dark:text-green-400' : isPausa ? 'text-yellow-600 dark:text-yellow-400' : 'text-muted-foreground'
                            )}>
                              {isOnline ? 'Online' : isPausa ? 'Em pausa' : 'Offline'}
                            </p>
                          </div>
                          {atendente.ticketsAtivos > 0 && (
                            <Badge variant="secondary" className="shrink-0 text-[10px]">
                              {atendente.ticketsAtivos} {atendente.ticketsAtivos === 1 ? 'ticket' : 'tickets'}
                            </Badge>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Aguardando Tab */}
            {activeTab === 'aguardando' && (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tempo de espera</TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ticket</TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Número</TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Contato</TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Setor / Subsetor</TableHead>
                      <TableHead className="text-xs w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      Array.from({ length: 3 }).map((_, i) => (
                        <TableRow key={i}>
                          <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-8" /></TableCell>
                        </TableRow>
                      ))
                    ) : ticketsAguardando.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="h-32 text-center">
                          <div className="flex flex-col items-center justify-center text-muted-foreground">
                            <AlertCircle className="mb-2 h-8 w-8" />
                            <p>Nenhum ticket aguardando</p>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      ticketsAguardando.map((ticket: any) => (
                        <TableRow key={ticket.id} className="bg-orange-50/50 dark:bg-orange-950/20">
                          <TableCell className="text-sm tabular-nums text-orange-600 font-medium">{ticket.tempoEspera}</TableCell>
                          <TableCell className="text-sm tabular-nums text-foreground font-medium">
                            {ticket.numero ? `#${ticket.numero}` : '—'}
                          </TableCell>
                          <TableCell className="text-sm text-foreground">
                            {ticket.canal === 'discord' ? '—' : formatPhone(ticket.telefone)}
                          </TableCell>
                          <TableCell className="text-sm text-foreground">
                            <div className="flex items-center gap-1">
                              <User className="h-3 w-3 text-muted-foreground shrink-0" />
                              {ticket.contato}
                            </div>
                          </TableCell>
                          <TableCell className="text-xs text-foreground">
                            {ticket.setor}
                            {ticket.subsetor && (
                              <span className="text-muted-foreground"> / {ticket.subsetor}</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openConversation(ticket)}>
                              <MessageCircle className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Encerrar Dialog */}
      <AlertDialog open={encerrarDialogOpen} onOpenChange={setEncerrarDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>⚠️ Encerrar ticket?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja encerrar este ticket? O ticket será movido para o histórico.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleEncerrarTicket}
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
                <Select value={selectedAtendenteTransfer} onValueChange={setSelectedAtendenteTransfer}>
                  <SelectTrigger>
                    <SelectValue placeholder="Escolha um atendente..." />
                  </SelectTrigger>
                  <SelectContent>
                    {atendentesDisponiveis.map((atendente) => {
                      const online = isAtendenteOnline(atendente)
                      return (
                        <SelectItem key={atendente.id} value={atendente.id} disabled={!online}>
                          <div className="flex items-center gap-2">
                            <span className={cn('h-2 w-2 rounded-full', online ? 'bg-green-500' : 'bg-gray-400')} />
                            <span className={!online ? 'text-muted-foreground' : ''}>{atendente.nome}</span>
                            {!online && <span className="text-xs text-muted-foreground">(Offline)</span>}
                          </div>
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
                {atendentesDisponiveis.length === 0 && (
                  <p className="text-sm text-muted-foreground">Nenhum outro atendente neste setor.</p>
                )}
                {atendentesDisponiveis.length > 0 && !atendentesDisponiveis.some((a) => isAtendenteOnline(a)) && (
                  <p className="text-sm text-amber-600">Todos os atendentes estão offline.</p>
                )}
              </div>
              <Button
                onClick={handleTransferTicket}
                disabled={
                  !selectedAtendenteTransfer ||
                  selectedAtendenteTransfer === 'all' ||
                  transferLoading ||
                  !isAtendenteOnline(atendentesDisponiveis.find((a) => a.id === selectedAtendenteTransfer))
                }
                className="w-full"
              >
                {transferLoading ? 'Transferindo...' : 'Transferir para Atendente'}
              </Button>
              {selectedAtendenteTransfer && selectedAtendenteTransfer !== 'all' && !isAtendenteOnline(atendentesDisponiveis.find((a) => a.id === selectedAtendenteTransfer)) && (
                <p className="text-sm text-destructive">Este atendente está offline. Selecione um atendente online.</p>
              )}
            </TabsContent>

            <TabsContent value="setor" className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label>Selecione o setor de destino</Label>
                <Select value={selectedSetorTransfer} onValueChange={handleSetorTransferChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Escolha um setor..." />
                  </SelectTrigger>
                  <SelectContent>
                    {setoresTransfer.length === 0 ? (
                      <div className="p-3 text-sm text-muted-foreground text-center">
                        Nenhum setor habilitado para transferência. Configure em Configurações do Setor.
                      </div>
                    ) : (
                      setoresTransfer.map((setor) => (
                        <SelectItem key={setor.id} value={setor.id}>{setor.nome}</SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              {selectedSetorTransfer !== 'all' && (
                <div className="space-y-2">
                  <Label>Atribuir a um atendente (opcional)</Label>
                  <Select value={selectedAtendenteTransfer} onValueChange={setSelectedAtendenteTransfer}>
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
                      {atendentesDisponiveis.map((atendente) => {
                        const online = isAtendenteOnline(atendente)
                        return (
                          <SelectItem key={atendente.id} value={atendente.id} disabled={!online}>
                            <div className="flex items-center gap-2">
                              <span className={cn('h-2 w-2 rounded-full', online ? 'bg-green-500' : 'bg-gray-400')} />
                              <span className={!online ? 'text-muted-foreground' : ''}>{atendente.nome}</span>
                              {!online && <span className="text-xs text-muted-foreground">(Offline)</span>}
                            </div>
                          </SelectItem>
                        )
                      })}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {selectedSetorTransfer !== 'all' && atendentesDisponiveis.length > 0 && !atendentesDisponiveis.some((a) => isAtendenteOnline(a)) && (
                <p className="text-sm text-blue-600 bg-blue-50 p-2 rounded-md">
                  Nenhum atendente online neste setor. O ticket irá para a fila e será atribuído automaticamente quando alguém ficar online.
                </p>
              )}

              <Button
                onClick={handleTransferTicket}
                disabled={!selectedSetorTransfer || selectedSetorTransfer === 'all' || transferLoading}
                className="w-full"
              >
                {transferLoading ? 'Transferindo...' : 'Transferir para Setor'}
              </Button>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Conversation Slide-out Panel */}
      {selectedTicket && (
        <div className="fixed inset-y-0 right-0 z-50 w-full max-w-lg">
          <div className="fixed inset-0 bg-black/20 backdrop-blur-sm" onClick={closeConversation} />

          <div className="absolute inset-0 flex flex-col bg-background shadow-xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div>
                <h2 className="font-semibold">Ticket #{selectedTicket.numero}</h2>
                <p className="text-sm text-muted-foreground">
                  {selectedTicket.contato} - {selectedTicket.setor}
                </p>
              </div>
              <Button variant="ghost" size="icon" onClick={closeConversation}>
                <X className="h-5 w-5" />
              </Button>
            </div>

            {/* Tabs */}
            <div className="border-b">
              <div className="flex">
                <button
                  onClick={() => setConversationTab('conversa')}
                  className={cn(
                    "flex-1 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors",
                    conversationTab === 'conversa'
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  )}
                >
                  <MessageCircle className="inline h-3.5 w-3.5 mr-1.5" />
                  Conversa
                </button>
                <button
                  onClick={() => setConversationTab('historico')}
                  className={cn(
                    "flex-1 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors",
                    conversationTab === 'historico'
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  )}
                >
                  <History className="inline h-3.5 w-3.5 mr-1.5" />
                  Historico ({ticketHistory.length})
                </button>
              </div>
            </div>

            {/* Action Buttons */}
            {(selectedTicket.status === 'em_atendimento' || selectedTicket.status === 'aberto') && (
              <div className="flex gap-2 border-b px-4 py-2">
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

            {/* Tab Content */}
            <div className="flex-1 overflow-y-auto">
              {/* Conversa Tab */}
              {conversationTab === 'conversa' && (
                <div className="p-4 space-y-3">
                  {loadingMessages ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : conversationMessages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                      <MessageCircle className="mb-2 h-8 w-8" />
                      <p>Nenhuma mensagem ainda</p>
                    </div>
                  ) : (
                    conversationMessages.map((msg: any) => (
                      msg.remetente === 'sistema' ? (
                        <div key={msg.id} className="flex justify-center">
                          <div className={cn(
                            "flex items-center gap-2 px-3 py-1.5 rounded-lg border text-[11px] max-w-[90%]",
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
                            <span className="shrink-0 ml-1 opacity-60">
                              {new Date(msg.enviado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div
                          key={msg.id}
                          className={cn(
                            "flex",
                            msg.remetente === 'cliente' ? "justify-start" : "justify-end"
                          )}
                        >
                          <div
                            className={cn(
                              "max-w-[80%] rounded-lg px-3 py-2 text-sm",
                              msg.remetente === 'cliente'
                                ? "bg-muted"
                                : msg.remetente === 'bot'
                                ? "bg-blue-100 dark:bg-blue-900/30"
                                : "bg-primary text-primary-foreground"
                            )}
                          >
                            {msg.url_imagem && (msg.tipo === 'imagem' || msg.media_type?.startsWith('image/')) && (
                              <img src={msg.url_imagem} alt="" className="max-w-full rounded mb-1" />
                            )}
                            <p className="break-words">{msg.conteudo}</p>
                            <p className={cn(
                              "text-[10px] mt-1",
                              msg.remetente === 'cliente' ? "text-muted-foreground" : "opacity-70"
                            )}>
                              {new Date(msg.enviado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                        </div>
                      )
                    ))
                  )}
                </div>
              )}

              {/* Historico Tab */}
              {conversationTab === 'historico' && (
                <div className="p-4 space-y-3">
                  {loadingHistory ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : ticketHistory.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                      <History className="mb-2 h-8 w-8" />
                      <p>Nenhum atendimento anterior</p>
                    </div>
                  ) : (
                    ticketHistory.map((ticket: any) => (
                      <div key={ticket.id} className="border rounded-lg overflow-hidden">
                        <button
                          onClick={() => loadHistoryMessages(ticket.id)}
                          className="w-full px-3 py-2.5 text-left hover:bg-muted/50 transition-colors"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Badge
                                variant={ticket.status === 'encerrado' ? 'secondary' : 'default'}
                                className="text-[10px] px-1.5 h-5"
                              >
                                {ticket.status === 'encerrado' ? 'Encerrado' : ticket.status === 'em_atendimento' ? 'Em atendimento' : 'Aberto'}
                              </Badge>
                              <span className="text-xs font-mono font-medium">#{ticket.numero}</span>
                            </div>
                            <span className="text-[10px] text-muted-foreground">
                              {new Date(ticket.criado_em).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                              {' '}
                              {new Date(ticket.criado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground">
                            <span>{ticket.setores?.nome || '-'}</span>
                            <span>-</span>
                            <span>{ticket.colaboradores?.nome || 'Sem atendente'}</span>
                          </div>
                        </button>

                        {/* Expanded messages */}
                        {expandedHistory === ticket.id && (
                          <div className="border-t bg-muted/30 px-3 py-2 space-y-2 max-h-64 overflow-y-auto">
                            {!historyMessages[ticket.id] ? (
                              <div className="flex justify-center py-2">
                                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                              </div>
                            ) : historyMessages[ticket.id].length === 0 ? (
                              <p className="text-xs text-muted-foreground text-center py-2">Sem mensagens</p>
                            ) : (
                              historyMessages[ticket.id].map((msg: any) => (
                                msg.remetente === 'sistema' ? (
                                  <div key={msg.id} className="flex justify-center">
                                    <div className={cn(
                                      "flex items-center gap-1.5 px-2 py-1 rounded text-[10px]",
                                      msg.conteudo.startsWith('Transferido')
                                        ? "bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300"
                                        : "bg-muted text-muted-foreground"
                                    )}>
                                      {msg.conteudo.startsWith('Transferido') ? (
                                        <ArrowRightLeft className="h-2.5 w-2.5 shrink-0" />
                                      ) : (
                                        <Megaphone className="h-2.5 w-2.5 shrink-0" />
                                      )}
                                      <span>{msg.conteudo}</span>
                                      <span className="opacity-60">
                                        {new Date(msg.enviado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                      </span>
                                    </div>
                                  </div>
                                ) : (
                                  <div
                                    key={msg.id}
                                    className={cn(
                                      "flex",
                                      msg.remetente === 'cliente' ? "justify-start" : "justify-end"
                                    )}
                                  >
                                    <div
                                      className={cn(
                                        "max-w-[80%] rounded px-2 py-1 text-[11px]",
                                        msg.remetente === 'cliente'
                                          ? "bg-background border"
                                          : "bg-primary/80 text-primary-foreground"
                                      )}
                                    >
                                      <p className="break-words">{msg.conteudo}</p>
                                      <p className="text-[9px] mt-0.5 opacity-60">
                                        {new Date(msg.enviado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                      </p>
                                    </div>
                                  </div>
                                )
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
