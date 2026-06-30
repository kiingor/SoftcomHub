'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import useSWR from 'swr'
import { Bot, Building2, ChevronLeft, ChevronRight, CircleSlash, Headset, Layers, MessageCircle, RefreshCw, Search, Ticket, User, X } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { useColaborador, useSetores } from '@/lib/hooks/use-data'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { MessageMediaPreview } from '@/components/chat/message-media-preview'
import { TextoMensagem } from '@/components/chat/texto-mensagem'
import { cn } from '@/lib/utils'

const NEXUS_BOT_VISIBILITY_MINUTES = Number(process.env.NEXT_PUBLIC_NEXUS_BOT_VISIBILITY_MINUTES || 10)
const NEXUS_MESSAGE_LOOKBACK_MINUTES = Number(process.env.NEXT_PUBLIC_NEXUS_MESSAGE_LOOKBACK_MINUTES || 60)
const NEXUS_CLIENT_REMETENTE = 'cliente-nexus'
const NEXUS_BOT_REMETENTE = 'bot-nexus'
// Intervalo sem mensagens que separa um atendimento do próximo (novo contato).
const NEXUS_SESSION_GAP_MINUTES = Number(process.env.NEXT_PUBLIC_NEXUS_SESSION_GAP_MINUTES || 40)
const NEXUS_ATENDIMENTOS_PAGE_SIZE = 12

type NexusConversation = {
  clienteKey: string
  clienteId: string | null
  contato: string
  telefone: string | null
  setorId: string
  setorNome: string
  lastMessageAt: string
  lastBotMessageAt: string
  lastRemetente: string
  messages: any[]
}

function formatPhone(phone: string | null) {
  if (!phone) return '-'
  let num = phone.replace(/\D/g, '')
  if (num.startsWith('55') && num.length > 11) num = num.slice(2)
  if (num.length === 11) return `(${num.slice(0, 2)}) ${num.slice(2, 7)}-${num.slice(7)}`
  if (num.length === 10) return `(${num.slice(0, 2)}) ${num.slice(2, 6)}-${num.slice(6)}`
  return num
}

// Tempo decorrido desde a última mensagem (recência).
function formatRelativeTime(date: string | null) {
  if (!date) return 'sem horario'
  const diffMs = Math.max(0, Date.now() - new Date(date).getTime())
  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 1) return 'agora'
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ${minutes % 60}min`
}

// Duração da conversa do bot (1ª → última mensagem) no formato HH:MM:SS,
// igual ao "tempo de atendimento" do monitoramento e da tela do setor.
function formatDuration(messages: any[]) {
  if (!messages || messages.length === 0) return '00:00:00'
  const start = messages[0]?.enviado_em
  const end = messages[messages.length - 1]?.enviado_em
  if (!start || !end) return '00:00:00'
  const ms = Math.max(0, new Date(end).getTime() - new Date(start).getTime())
  const hours = Math.floor(ms / 3_600_000)
  const minutes = Math.floor((ms % 3_600_000) / 60_000)
  const seconds = Math.floor((ms % 60_000) / 1000)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
}

type AtendimentoDesfecho = 'no_bot' | 'ticket' | 'encerrada'

type NexusAtendimento = NexusConversation & {
  desfecho: AtendimentoDesfecho
  ticket: { numero: number | null; status: string; atendente: string | null } | null
}

// O drawer é compartilhado entre as abas: aceita uma conversa ao vivo ou um
// atendimento (que carrega desfecho/ticket).
type SelectedConversation = NexusConversation & {
  desfecho?: AtendimentoDesfecho
  ticket?: NexusAtendimento['ticket']
}

function DesfechoBadge({ atendimento }: { atendimento: NexusAtendimento }) {
  if (atendimento.desfecho === 'ticket') {
    const ticket = atendimento.ticket
    const statusLabel = ticket?.status === 'encerrado'
      ? 'Encerrado'
      : ticket?.status === 'em_atendimento'
      ? 'Em atendimento'
      : 'Aberto'
    return (
      <div className="flex flex-col gap-0.5">
        <Badge variant="outline" className="w-fit gap-1 rounded-md border-border text-[10px] font-medium text-foreground">
          <Ticket className="h-3 w-3 text-muted-foreground" />
          Ticket{ticket?.numero ? <span className="font-mono tabnums"> #{ticket.numero}</span> : ''} · {statusLabel}
        </Badge>
        {ticket?.atendente && <span className="pl-1 text-[10px] text-muted-foreground">{ticket.atendente}</span>}
      </div>
    )
  }

  if (atendimento.desfecho === 'no_bot') {
    return (
      <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
        <span className="signal-dot" aria-hidden="true" />
        Ainda no bot
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <CircleSlash className="h-3.5 w-3.5 shrink-0" />
      Encerrada sem ticket
    </div>
  )
}

// Botão "Abrir ticket" com escolha de destino: lista os setores permitidos para
// transferência (setor_destinos_transferencia) a partir do setor da conversa;
// se não houver nenhum, oferece os subsetores do setor atual.
function AbrirTicketButton({
  conversation,
  opening,
  onConfirm,
  variant,
}: {
  conversation: NexusConversation
  opening: boolean
  onConfirm: (conversation: NexusConversation, destino: { setorId: string; subsetorId: string | null }) => void
  variant: 'row' | 'drawer'
}) {
  const supabase = useMemo(() => createClient(), [])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [tipo, setTipo] = useState<'setor' | 'subsetor' | 'atual'>('atual')
  const [options, setOptions] = useState<{ id: string; nome: string }[]>([])

  const loadOptions = async () => {
    setLoading(true)
    try {
      const { data: destinos } = await supabase
        .from('setor_destinos_transferencia')
        .select('setor_destino_id, setores:setor_destino_id(id, nome)')
        .eq('setor_origem_id', conversation.setorId)

      const setoresDestino = (destinos || [])
        .map((d: any) => d.setores)
        .filter(Boolean)
        .sort((a: any, b: any) => a.nome.localeCompare(b.nome))

      if (setoresDestino.length > 0) {
        // Sempre inclui o setor atual como primeira opção (sem duplicar).
        setTipo('setor')
        setOptions([
          { id: conversation.setorId, nome: conversation.setorNome },
          ...setoresDestino.filter((s: any) => s.id !== conversation.setorId),
        ])
        return
      }

      const { data: subs } = await supabase
        .from('subsetores')
        .select('id, nome')
        .eq('setor_id', conversation.setorId)
        .order('nome')

      if (subs && subs.length > 0) {
        setTipo('subsetor')
        setOptions(subs)
      } else {
        setTipo('atual')
        setOptions([])
      }
    } finally {
      setLoading(false)
    }
  }

  const escolher = (destino: { setorId: string; subsetorId: string | null }) => {
    setOpen(false)
    onConfirm(conversation, destino)
  }

  const label = opening ? 'Abrindo...' : 'Abrir ticket'
  const triggerButton =
    variant === 'drawer' ? (
      <Button size="sm" className="h-8 gap-1.5" disabled={opening}>
        <Headset className="h-4 w-4" />
        {label}
      </Button>
    ) : (
      <Button variant="outline" size="sm" className="h-7 gap-1 text-[11px]" disabled={opening}>
        <Headset className="h-3.5 w-3.5" />
        {label}
      </Button>
    )

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) loadOptions() }}>
      <PopoverTrigger asChild>{triggerButton}</PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-2">
        {loading ? (
          <div className="flex items-center justify-center py-4">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-primary" />
          </div>
        ) : tipo === 'setor' ? (
          <div className="space-y-0.5">
            <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Abrir ticket no setor</p>
            {options.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => escolher({ setorId: s.id, subsetorId: null })}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">{s.nome}</span>
                {s.id === conversation.setorId && (
                  <Badge variant="secondary" className="ml-auto h-4 shrink-0 px-1 text-[9px]">atual</Badge>
                )}
              </button>
            ))}
          </div>
        ) : tipo === 'subsetor' ? (
          <div className="space-y-0.5">
            <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Escolha o subsetor</p>
            {options.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => escolher({ setorId: conversation.setorId, subsetorId: s.id })}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Layers className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">{s.nome}</span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => escolher({ setorId: conversation.setorId, subsetorId: null })}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Sem subsetor (setor atual)
            </button>
          </div>
        ) : (
          <div className="space-y-2 p-1">
            <p className="text-xs text-muted-foreground">Sem setor de transferência configurado para este setor.</p>
            <Button
              size="sm"
              className="w-full gap-1.5"
              onClick={() => escolher({ setorId: conversation.setorId, subsetorId: null })}
            >
              <Headset className="h-4 w-4" />
              Abrir no setor atual
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

const RANGE_OPTIONS = [
  { value: 'hoje', label: 'Hoje' },
  { value: '24h', label: 'Ultimas 24h' },
  { value: '7d', label: 'Ultimos 7 dias' },
] as const

type RangeValue = (typeof RANGE_OPTIONS)[number]['value']

function rangeToSince(range: RangeValue): string {
  if (range === 'hoje') {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    return start.toISOString()
  }
  const hours = range === '24h' ? 24 : 24 * 7
  return new Date(Date.now() - hours * 3600_000).toISOString()
}

// Resolve os setores com IA acessíveis e devolve um mapeador mensagem→setor
// pelo canal (phone_number_id / instancia). Compartilhado pelos fetchers
// "ao vivo" e "atendimentos" para não duplicar a resolução.
async function loadNexusSetores(
  supabase: ReturnType<typeof createClient>,
  setorIds: string[],
) {
  const { data: setoresIaData } = await supabase
    .from('setores')
    .select('id, nome, assistente_ia, setor_canais(tipo, ativo, instancia, phone_number_id)')
    .in('id', setorIds)
    .eq('assistente_ia', true)

  const setoresIa = setoresIaData || []
  // Mapa único de identificador de canal → setor. O identificador do canal pode
  // estar em `phone_number_id` (WhatsApp Cloud API) OU em `instancia` (Evolution
  // API). Na MENSAGEM, ambos os casos chegam na coluna `phone_number_id` (a tabela
  // mensagens não tem coluna `instancia`). Por isso indexamos os dois sob a mesma
  // chave crua — sem prefixo — pra o lookup da mensagem cruzar com qualquer um.
  const channelSetores = new Map<string, { id: string; nome: string }>()

  for (const setor of setoresIa as any[]) {
    for (const canal of setor.setor_canais || []) {
      if (!canal.ativo) continue
      if (canal.phone_number_id) channelSetores.set(canal.phone_number_id, setor)
      if (canal.instancia) channelSetores.set(canal.instancia, setor)
    }
  }

  const resolveSetor = (message: any): { id: string; nome: string } | null => {
    const canalId = message.phone_number_id
    if (canalId) {
      // Tem identificador de canal: só atribui se casar com um setor carregado.
      // Se não casar, a mensagem é de OUTRO setor — não pode cair no fallback
      // (senão, ao filtrar por 1 setor, tudo seria atribuído a ele).
      return channelSetores.get(canalId) ?? null
    }
    // Sem identificador de canal: fallback só quando há exatamente 1 setor.
    return setoresIa.length === 1 ? setoresIa[0] : null
  }

  return { setoresIa, resolveSetor }
}

export default function NexusPage() {
  const supabase = createClient()
  const { data: colaborador } = useColaborador()
  const { data: setoresAcessiveis = [] } = useSetores(colaborador?.id, colaborador?.is_master)
  const [tagFilter, setTagFilter] = useState('all')
  const [setorFilter, setSetorFilter] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [activeTab, setActiveTab] = useState<'ao-vivo' | 'atendimentos'>('ao-vivo')
  const [rangeFilter, setRangeFilter] = useState<RangeValue>('hoje')
  const [desfechoFilter, setDesfechoFilter] = useState<'all' | AtendimentoDesfecho>('all')
  const [atendimentosPage, setAtendimentosPage] = useState(0)
  const [selectedConversation, setSelectedConversation] = useState<SelectedConversation | null>(null)
  const [openingKey, setOpeningKey] = useState<string | null>(null)
  const conversationScrollRef = useRef<HTMLDivElement>(null)

  const tagsDisponiveis = useMemo(() => {
    const tags = new Map<string, { id: string; nome: string; cor: string }>()
    setoresAcessiveis.forEach((setor: any) => {
      if (setor.tags) tags.set(setor.tags.id, setor.tags)
    })
    return Array.from(tags.values()).sort((a, b) => a.nome.localeCompare(b.nome))
  }, [setoresAcessiveis])

  const setoresFiltradosPorTag = useMemo(() => {
    if (tagFilter === 'all') return setoresAcessiveis
    return setoresAcessiveis.filter((setor: any) => setor.tags?.id === tagFilter)
  }, [setoresAcessiveis, tagFilter])

  const setorIdsFiltrados = useMemo(() => {
    const setores = setorFilter === 'all'
      ? setoresFiltradosPorTag
      : setoresFiltradosPorTag.filter((setor: any) => setor.id === setorFilter)
    return setores.map((setor: any) => setor.id)
  }, [setorFilter, setoresFiltradosPorTag])

  const { data, isLoading, mutate } = useSWR(
    colaborador && setorIdsFiltrados.length > 0
      ? ['dashboard-nexus', setorIdsFiltrados.join(','), tagFilter, setorFilter]
      : null,
    async () => {
      const activeSince = new Date(Date.now() - NEXUS_BOT_VISIBILITY_MINUTES * 60000).toISOString()
      const lookbackSince = new Date(
        Date.now() - Math.max(NEXUS_MESSAGE_LOOKBACK_MINUTES, NEXUS_BOT_VISIBILITY_MINUTES) * 60000,
      ).toISOString()

      const { setoresIa, resolveSetor } = await loadNexusSetores(supabase, setorIdsFiltrados)

      const { data: messages } = setoresIa.length > 0
        ? await supabase
            .from('mensagens')
            .select('*, clientes(id, nome, telefone)')
            .is('ticket_id', null)
            .in('remetente', [NEXUS_CLIENT_REMETENTE, NEXUS_BOT_REMETENTE])
            .gte('enviado_em', lookbackSince)
            .order('enviado_em', { ascending: true })
            .limit(500)
        : { data: [] }

      const nexusMessages = messages || []
      const clienteIds = new Set<string>()
      const telefones = new Set<string>()

      for (const message of nexusMessages) {
        if (message.cliente_id) clienteIds.add(message.cliente_id)
        const telefone = (message as any).clientes?.telefone
        if (telefone) telefones.add(telefone)
      }

      const clientesPorTelefone = telefones.size > 0
        ? await supabase
            .from('clientes')
            .select('id, telefone')
            .in('telefone', Array.from(telefones))
        : { data: [] }

      const telefonePorClienteId = new Map<string, string>()
      for (const cliente of clientesPorTelefone.data || []) {
        clienteIds.add(cliente.id)
        if (cliente.telefone) telefonePorClienteId.set(cliente.id, cliente.telefone)
      }

      const ticketsAtivos = clienteIds.size > 0
        ? await supabase
            .from('tickets')
            .select('cliente_id')
            .in('cliente_id', Array.from(clienteIds))
            .in('status', ['aberto', 'em_atendimento'])
        : { data: [] }

      const clientesComTicketAtivo = new Set<string>()
      const telefonesComTicketAtivo = new Set<string>()
      for (const ticket of ticketsAtivos.data || []) {
        if (!ticket.cliente_id) continue
        clientesComTicketAtivo.add(ticket.cliente_id)
        const telefone = telefonePorClienteId.get(ticket.cliente_id)
        if (telefone) telefonesComTicketAtivo.add(telefone)
      }

      const ocorrenciasPorCliente = clienteIds.size > 0
        ? await supabase
            .from('nexus_ocorrencias')
            .select('cliente_id, telefone')
            .in('cliente_id', Array.from(clienteIds))
            .eq('status', 'aberta')
            .gte('criado_em', lookbackSince)
        : { data: [] }

      const ocorrenciasPorTelefone = telefones.size > 0
        ? await supabase
            .from('nexus_ocorrencias')
            .select('cliente_id, telefone')
            .in('telefone', Array.from(telefones))
            .eq('status', 'aberta')
            .gte('criado_em', lookbackSince)
        : { data: [] }

      const clientesComOcorrencia = new Set<string>()
      const telefonesComOcorrencia = new Set<string>()
      const ocorrenciasRecentes = [...(ocorrenciasPorCliente.data || []), ...(ocorrenciasPorTelefone.data || [])]
      for (const ocorrencia of ocorrenciasRecentes) {
        if (ocorrencia.cliente_id) clientesComOcorrencia.add(ocorrencia.cliente_id)
        if (ocorrencia.telefone) telefonesComOcorrencia.add(ocorrencia.telefone)
      }

      const groups = new Map<string, Omit<NexusConversation, 'setorId' | 'setorNome' | 'lastBotMessageAt'>>()
      for (const message of nexusMessages) {
        const cliente = (message as any).clientes
        if (message.cliente_id && clientesComTicketAtivo.has(message.cliente_id)) continue
        if (cliente?.telefone && telefonesComTicketAtivo.has(cliente.telefone)) continue
        if (message.cliente_id && clientesComOcorrencia.has(message.cliente_id)) continue
        if (cliente?.telefone && telefonesComOcorrencia.has(cliente.telefone)) continue

        const clienteKey = message.cliente_id || cliente?.telefone || message.id
        const current = groups.get(clienteKey)

        groups.set(clienteKey, {
          clienteKey,
          clienteId: message.cliente_id,
          contato: cliente?.nome || cliente?.telefone || 'Cliente sem nome',
          telefone: cliente?.telefone || null,
          lastMessageAt: message.enviado_em,
          lastRemetente: message.remetente,
          messages: [...(current?.messages || []), message],
        })
      }

      const conversations = Array.from(groups.values())
        .map((conversation): NexusConversation | null => {
          const setor = conversation.messages.map(resolveSetor).find(Boolean)
          if (!setor) return null

          const lastBotMessage = [...conversation.messages].reverse().find((message) => message.remetente === NEXUS_BOT_REMETENTE)
          return {
            ...conversation,
            setorId: setor.id,
            setorNome: setor.nome,
            lastBotMessageAt: lastBotMessage?.enviado_em || '',
          }
        })
        .filter((conversation): conversation is NexusConversation => Boolean(conversation))
        .filter((conversation) => conversation.lastBotMessageAt >= activeSince)
        .sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime())

      return { conversations, ocorrenciasAbertas: ocorrenciasRecentes.length, setoresIa }
    },
    { revalidateOnFocus: false, refreshInterval: 30000 },
  )

  // "Atendimentos": histórico de TODAS as conversas do bot no período, com
  // desfecho (ainda no bot / virou ticket / encerrada sem ticket). Só busca
  // quando a aba está ativa para não pesar a tela ao vivo.
  const {
    data: atendimentosData,
    isLoading: atendimentosLoading,
    mutate: mutateAtendimentos,
  } = useSWR(
    activeTab === 'atendimentos' && colaborador && setorIdsFiltrados.length > 0
      ? ['dashboard-nexus-atendimentos', setorIdsFiltrados.join(','), rangeFilter]
      : null,
    async () => {
      const since = rangeToSince(rangeFilter)
      const activeSince = new Date(Date.now() - NEXUS_BOT_VISIBILITY_MINUTES * 60000).toISOString()
      const { setoresIa, resolveSetor } = await loadNexusSetores(supabase, setorIdsFiltrados)

      if (setoresIa.length === 0) return { atendimentos: [] as NexusAtendimento[] }

      // Mensagens do bot no período — SEM filtro de ticket_id (as que viraram
      // ticket já têm ticket_id e continuam sendo do bot).
      // Paginação real: percorre TODAS as mensagens Nexus do período em lotes
      // (o PostgREST devolve no máx. ~1000 por request). Carrega da mais recente
      // para a mais antiga e, no fim, reordena ascendente para o agrupamento.
      // Sem isso, com volume alto (milhares/dia) o período era cortado e os
      // atendimentos de hoje sumiam.
      const CHUNK = 1000
      const MAX_LOTES = 30 // teto de segurança (~30k mensagens)
      const lotesDesc: any[] = []
      for (let i = 0; i < MAX_LOTES; i += 1) {
        const { data: lote } = await supabase
          .from('mensagens')
          .select('*, clientes(id, nome, telefone)')
          .in('remetente', [NEXUS_CLIENT_REMETENTE, NEXUS_BOT_REMETENTE])
          .gte('enviado_em', since)
          .order('enviado_em', { ascending: false })
          .range(i * CHUNK, i * CHUNK + CHUNK - 1)
        if (!lote || lote.length === 0) break
        lotesDesc.push(...lote)
        if (lote.length < CHUNK) break
        if (i === MAX_LOTES - 1) {
          console.warn(`[Nexus] período com >${MAX_LOTES * CHUNK} mensagens — exibindo as mais recentes`)
        }
      }
      const nexusMessages = lotesDesc.reverse()

      // 1. Agrupa as mensagens por cliente (já vêm ordenadas asc).
      const porCliente = new Map<string, { clienteId: string | null; contato: string; telefone: string | null; messages: any[] }>()
      for (const message of nexusMessages) {
        const cliente = (message as any).clientes
        const ref = message.cliente_id || cliente?.telefone || message.id
        const atual = porCliente.get(ref)
        if (atual) {
          atual.messages.push(message)
        } else {
          porCliente.set(ref, {
            clienteId: message.cliente_id,
            contato: cliente?.nome || cliente?.telefone || 'Cliente sem nome',
            telefone: cliente?.telefone || null,
            messages: [message],
          })
        }
      }

      // 2. Divide cada cliente em sessões (atendimentos distintos): nova sessão
      //    quando muda o ticket_id ou há um intervalo grande entre mensagens.
      //    Resolve o caso de "mesmo cliente entrou em contato 2x" (uma virou
      //    ticket, outra foi resolvida pelo bot) aparecer como um só.
      type Sessao = {
        clienteKey: string
        clienteId: string | null
        contato: string
        telefone: string | null
        ticketId: string | null
        messages: any[]
      }
      const gapMs = NEXUS_SESSION_GAP_MINUTES * 60000
      const sessoes: Sessao[] = []
      for (const cliente of porCliente.values()) {
        let atual: Sessao | null = null
        for (const message of cliente.messages) {
          const ticketId = message.ticket_id || null
          const anterior = atual ? atual.messages[atual.messages.length - 1] : null
          const gap = anterior ? new Date(message.enviado_em).getTime() - new Date(anterior.enviado_em).getTime() : 0
          if (!atual || ticketId !== atual.ticketId || gap > gapMs) {
            atual = {
              clienteKey: `${cliente.clienteId || cliente.telefone || 'x'}::${message.id}`,
              clienteId: cliente.clienteId,
              contato: cliente.contato,
              telefone: cliente.telefone,
              ticketId,
              messages: [],
            }
            sessoes.push(atual)
          }
          atual.messages.push(message)
        }
      }

      const ticketIds = new Set<string>()
      for (const sessao of sessoes) {
        if (sessao.ticketId) ticketIds.add(sessao.ticketId)
      }

      // 3. Tickets das sessões (pelo ticket_id das próprias mensagens) + atendentes.
      const ticketsData = ticketIds.size > 0
        ? await supabase
            .from('tickets')
            .select('id, numero, status, colaborador_id')
            .in('id', Array.from(ticketIds))
        : { data: [] }

      const ticketsById = new Map<string, any>()
      const colaboradorIds = new Set<string>()
      for (const ticket of ticketsData.data || []) {
        ticketsById.set(ticket.id, ticket)
        if (ticket.colaborador_id) colaboradorIds.add(ticket.colaborador_id)
      }

      const colaboradorNomes = new Map<string, string>()
      if (colaboradorIds.size > 0) {
        const { data: colabs } = await supabase
          .from('colaboradores')
          .select('id, nome')
          .in('id', Array.from(colaboradorIds))
        for (const colab of colabs || []) colaboradorNomes.set(colab.id, colab.nome)
      }

      // 4. Classifica cada sessão pelo desfecho.
      const atendimentos = sessoes
        .map((sessao): NexusAtendimento | null => {
          const setor = sessao.messages.map(resolveSetor).find(Boolean)
          if (!setor) return null

          const lastBotMessage = [...sessao.messages].reverse().find((m) => m.remetente === NEXUS_BOT_REMETENTE)
          const lastBotMessageAt = lastBotMessage?.enviado_em || ''
          const lastMessageAt = sessao.messages[sessao.messages.length - 1]?.enviado_em || ''
          const lastRemetente = sessao.messages[sessao.messages.length - 1]?.remetente || ''

          const ticket = sessao.ticketId ? ticketsById.get(sessao.ticketId) : null

          // "Ainda no bot" = houve atividade recente (de qualquer remetente),
          // sem ticket. Usa lastMessageAt, não lastBotMessageAt — senão uma
          // sessão onde o cliente acabou de falar e o bot ainda não respondeu
          // cairia em "Encerrada".
          let desfecho: AtendimentoDesfecho
          if (ticket) desfecho = 'ticket'
          else if (lastMessageAt && lastMessageAt >= activeSince) desfecho = 'no_bot'
          else desfecho = 'encerrada'

          return {
            clienteKey: sessao.clienteKey,
            clienteId: sessao.clienteId,
            contato: sessao.contato,
            telefone: sessao.telefone,
            setorId: setor.id,
            setorNome: setor.nome,
            lastMessageAt,
            lastRemetente,
            lastBotMessageAt,
            messages: sessao.messages,
            desfecho,
            ticket: ticket
              ? {
                  numero: ticket.numero ?? null,
                  status: ticket.status,
                  atendente: ticket.colaborador_id ? colaboradorNomes.get(ticket.colaborador_id) || null : null,
                }
              : null,
          }
        })
        .filter((atendimento): atendimento is NexusAtendimento => Boolean(atendimento))
        .sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime())

      return { atendimentos }
    },
    { revalidateOnFocus: false },
  )

  const conversationsRaw: NexusConversation[] = data?.conversations || []
  const selectedConversationKey = selectedConversation
    ? `${selectedConversation.setorId}-${selectedConversation.clienteKey}`
    : null

  const handleAbrirTicket = async (
    conversation: NexusConversation,
    destino?: { setorId: string; subsetorId: string | null },
  ) => {
    const key = `${conversation.setorId}-${conversation.clienteKey}`
    setOpeningKey(key)
    try {
      const res = await fetch('/api/nexus/abrir-ticket', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clienteId: conversation.clienteId,
          telefone: conversation.telefone,
          setorId: destino?.setorId || conversation.setorId,
          subsetorId: destino?.subsetorId ?? null,
        }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Falha ao abrir o ticket')

      const atribuicao = result.colaboradorNome
        ? `atribuído a ${result.colaboradorNome}`
        : 'aguardando atribuição na fila'
      toast.success(
        result.jaExistia
          ? `Já havia ticket aberto para ${conversation.contato} (${atribuicao}).`
          : `Ticket aberto para ${conversation.contato} — ${atribuicao}.`,
      )

      if (selectedConversationKey === key) setSelectedConversation(null)
      mutate()
      mutateAtendimentos()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao abrir o ticket')
    } finally {
      setOpeningKey(null)
    }
  }

  const conversations = useMemo(() => {
    const query = searchTerm.trim().toLowerCase()
    if (!query) return conversationsRaw

    return conversationsRaw.filter((conversation) => (
      conversation.contato.toLowerCase().includes(query) ||
      formatPhone(conversation.telefone).toLowerCase().includes(query) ||
      conversation.setorNome.toLowerCase().includes(query)
    ))
  }, [conversationsRaw, searchTerm])

  const atendimentosRaw: NexusAtendimento[] = atendimentosData?.atendimentos || []
  const atendimentosFiltrados = useMemo(() => {
    const query = searchTerm.trim().toLowerCase()
    return atendimentosRaw.filter((atendimento) => {
      if (desfechoFilter !== 'all' && atendimento.desfecho !== desfechoFilter) return false
      if (!query) return true
      return (
        atendimento.contato.toLowerCase().includes(query) ||
        formatPhone(atendimento.telefone).toLowerCase().includes(query) ||
        atendimento.setorNome.toLowerCase().includes(query)
      )
    })
  }, [atendimentosRaw, searchTerm, desfechoFilter])

  const totalPaginasAtendimentos = Math.max(1, Math.ceil(atendimentosFiltrados.length / NEXUS_ATENDIMENTOS_PAGE_SIZE))
  const paginaAtendimentos = Math.min(atendimentosPage, totalPaginasAtendimentos - 1)
  const atendimentos = atendimentosFiltrados.slice(
    paginaAtendimentos * NEXUS_ATENDIMENTOS_PAGE_SIZE,
    paginaAtendimentos * NEXUS_ATENDIMENTOS_PAGE_SIZE + NEXUS_ATENDIMENTOS_PAGE_SIZE,
  )

  // Volta para a primeira página quando os filtros mudam.
  useEffect(() => {
    setAtendimentosPage(0)
  }, [searchTerm, desfechoFilter, rangeFilter, setorFilter, tagFilter, activeTab])

  useEffect(() => {
    const channel = supabase
      .channel('dashboard-nexus-mensagens')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'mensagens' },
        (payload) => {
          const row = (payload.new || payload.old) as { ticket_id?: string | null } | null
          if (row?.ticket_id === null) mutate()
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [mutate, supabase])

  useEffect(() => {
    // Mantém o drawer sincronizado com os dados ao vivo. Na aba de atendimentos
    // (histórico) não sincroniza, senão zeraria uma conversa que não está na
    // lista ao vivo.
    if (activeTab !== 'ao-vivo' || !selectedConversationKey) return
    const updated = conversationsRaw.find((conversation) => (
      `${conversation.setorId}-${conversation.clienteKey}` === selectedConversationKey
    ))
    setSelectedConversation(updated || null)
  }, [conversationsRaw, selectedConversationKey, activeTab])

  useEffect(() => {
    if (!selectedConversation || !conversationScrollRef.current) return
    const el = conversationScrollRef.current
    el.scrollTop = el.scrollHeight
  }, [selectedConversation])

  // Trava a rolagem da página enquanto o drawer está aberto — senão a tabela de
  // Atendimentos (longa) rola atrás e atrapalha a usabilidade do chat.
  useEffect(() => {
    if (!selectedConversation) return
    const original = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = original }
  }, [selectedConversation])

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Nexus IA</h1>
          <div className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1">
            <span className="signal-dot signal-dot--pulse" aria-hidden="true" />
            <span className="text-xs font-medium text-primary">Ao vivo</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {tagsDisponiveis.length > 0 && (
            <Select value={tagFilter} onValueChange={(value) => {
              setTagFilter(value)
              setSetorFilter('all')
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
              {setoresFiltradosPorTag.map((setor: any) => (
                <SelectItem key={setor.id} value={setor.id}>{setor.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            aria-label="Atualizar"
            title="Atualizar"
            onClick={() => (activeTab === 'ao-vivo' ? mutate() : mutateAtendimentos())}
            className="gap-2 bg-transparent"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Abas: Ao vivo (monitoramento) x Atendimentos (histórico com desfecho) */}
      <div className="flex flex-wrap items-center gap-1 border-b border-border">
        <button
          type="button"
          onClick={() => setActiveTab('ao-vivo')}
          className={cn(
            'relative rounded-t-md px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            activeTab === 'ao-vivo' ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          Ao vivo
          {activeTab === 'ao-vivo' && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" />}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('atendimentos')}
          className={cn(
            'relative rounded-t-md px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            activeTab === 'atendimentos' ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          Atendimentos
          {activeTab === 'atendimentos' && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" />}
        </button>
        {activeTab === 'atendimentos' && (
          <div className="ml-auto flex items-center gap-2 pb-1">
            <Select value={desfechoFilter} onValueChange={(value) => setDesfechoFilter(value as 'all' | AtendimentoDesfecho)}>
              <SelectTrigger className="h-8 w-44 bg-card">
                <SelectValue placeholder="Desfecho" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os desfechos</SelectItem>
                <SelectItem value="ticket">Virou ticket</SelectItem>
                <SelectItem value="no_bot">Ainda no bot</SelectItem>
                <SelectItem value="encerrada">Encerrada sem ticket</SelectItem>
              </SelectContent>
            </Select>
            <Select value={rangeFilter} onValueChange={(value) => setRangeFilter(value as RangeValue)}>
              <SelectTrigger className="h-8 w-40 bg-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RANGE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {activeTab === 'ao-vivo' && (
      <>
      <div className="stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="glass-card-elevated rounded-lg shadow-none">
          <CardContent className="pt-6">
            <div className="space-y-1 text-center">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Conversas ativas</p>
              <p className="text-3xl font-semibold tracking-tight tabular-nums text-primary">{conversations.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="glass-card-elevated rounded-lg shadow-none">
          <CardContent className="pt-6">
            <div className="space-y-1 text-center">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Setores IA no filtro</p>
              <p className="text-3xl font-semibold tracking-tight tabular-nums text-foreground">{data?.setoresIa?.length || 0}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="glass-card-elevated rounded-lg shadow-none">
          <CardContent className="pt-6">
            <div className="space-y-1 text-center">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Ocorrencias abertas</p>
              <p className="text-3xl font-semibold tracking-tight tabular-nums text-foreground">{data?.ocorrenciasAbertas || 0}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="glass-card-elevated rounded-lg shadow-none">
          <CardContent className="pt-6">
            <div className="space-y-1 text-center">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Tempo visivel apos bot</p>
              <p className="text-3xl font-semibold tracking-tight tabular-nums text-foreground">{NEXUS_BOT_VISIBILITY_MINUTES} min</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="anim-rise glass-card-elevated rounded-lg shadow-none">
        <CardHeader className="pb-0">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-lg font-semibold tracking-tight">Atendimentos do bot sem ticket</CardTitle>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar contato, numero ou setor"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                className="h-9 w-72 rounded-md pl-9 pr-14 glass-input"
              />
              <kbd className="kbd pointer-events-none absolute right-2 top-1/2 -translate-y-1/2" aria-hidden="true">Ctrl K</kbd>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tempo de atendimento</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ultima mensagem</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Contato</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Numero</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ultimo envio</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Mensagens</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="stagger">
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, index) => (
                    <TableRow key={index}>
                      <TableCell><div className="skeleton h-4 w-20" /></TableCell>
                      <TableCell><div className="skeleton h-4 w-16" /></TableCell>
                      <TableCell><div className="skeleton h-4 w-36" /></TableCell>
                      <TableCell><div className="skeleton h-4 w-24" /></TableCell>
                      <TableCell><div className="skeleton h-4 w-20" /></TableCell>
                      <TableCell><div className="skeleton h-4 w-16" /></TableCell>
                      <TableCell><div className="skeleton h-4 w-8" /></TableCell>
                    </TableRow>
                  ))
                ) : conversations.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-40 text-center">
                      <div className="flex flex-col items-center justify-center gap-1">
                        <Bot className="mb-1 h-8 w-8 text-muted-foreground/60" />
                        <p className="text-sm font-medium tracking-tight text-foreground">Nenhuma conversa ao vivo</p>
                        <p className="text-xs text-muted-foreground">Conversas do bot sem ticket aparecem aqui assim que chegam.</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  conversations.map((conversation) => (
                    <TableRow key={`${conversation.setorId}-${conversation.clienteKey}`}>
                      <TableCell className="text-sm font-medium tabular-nums text-foreground">
                        {formatDuration(conversation.messages)}
                      </TableCell>
                      <TableCell className="text-sm tabular-nums text-muted-foreground">
                        {formatRelativeTime(conversation.lastMessageAt)}
                      </TableCell>
                      <TableCell className="text-sm text-foreground max-w-[200px]">
                        <div className="flex items-center gap-1">
                          <User className="h-3 w-3 text-muted-foreground shrink-0" />
                          <span className="truncate" title={conversation.contato}>{conversation.contato}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm tabular-nums text-foreground">{formatPhone(conversation.telefone)}</TableCell>
                      <TableCell>
                        <Badge
                          variant={conversation.lastRemetente === NEXUS_CLIENT_REMETENTE ? 'secondary' : 'outline'}
                          className="text-[10px]"
                        >
                          {conversation.lastRemetente === NEXUS_CLIENT_REMETENTE ? 'Cliente' : 'Nexus'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm tabular-nums text-foreground">{conversation.messages.length}</TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <AbrirTicketButton
                            conversation={conversation}
                            opening={openingKey === `${conversation.setorId}-${conversation.clienteKey}`}
                            onConfirm={handleAbrirTicket}
                            variant="row"
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Ver conversa"
                            className="h-7 w-7"
                            onClick={() => setSelectedConversation(conversation)}
                          >
                            <MessageCircle className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      </>
      )}

      {activeTab === 'atendimentos' && (
        <Card className="anim-rise glass-card-elevated rounded-lg shadow-none">
          <CardHeader className="pb-0">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="text-lg font-semibold tracking-tight">Atendimentos do bot</CardTitle>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar contato, numero ou setor"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  className="h-9 w-full rounded-md pl-9 pr-14 glass-input sm:w-72"
                />
                <kbd className="kbd pointer-events-none absolute right-2 top-1/2 -translate-y-1/2" aria-hidden="true">Ctrl K</kbd>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tempo de atendimento</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Contato</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Numero</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Desfecho</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Mensagens</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="stagger">
                  {atendimentosLoading ? (
                    Array.from({ length: 5 }).map((_, index) => (
                      <TableRow key={index}>
                        <TableCell><div className="skeleton h-4 w-20" /></TableCell>
                        <TableCell><div className="skeleton h-4 w-36" /></TableCell>
                        <TableCell><div className="skeleton h-4 w-24" /></TableCell>
                        <TableCell><div className="skeleton h-4 w-28" /></TableCell>
                        <TableCell><div className="skeleton h-4 w-12" /></TableCell>
                        <TableCell><div className="skeleton h-4 w-20" /></TableCell>
                      </TableRow>
                    ))
                  ) : atendimentos.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-40 text-center">
                        <div className="flex flex-col items-center justify-center gap-1">
                          <Bot className="mb-1 h-8 w-8 text-muted-foreground/60" />
                          <p className="text-sm font-medium tracking-tight text-foreground">Nenhum atendimento no periodo</p>
                          <p className="text-xs text-muted-foreground">Ajuste o intervalo ou o filtro de desfecho para ver mais.</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    atendimentos.map((atendimento) => {
                      const key = `${atendimento.setorId}-${atendimento.clienteKey}`
                      return (
                        <TableRow key={key}>
                          <TableCell className="text-sm font-medium tabular-nums text-foreground">
                            {formatDuration(atendimento.messages)}
                          </TableCell>
                          <TableCell className="text-sm text-foreground max-w-[200px]">
                            <div className="flex items-center gap-1">
                              <User className="h-3 w-3 text-muted-foreground shrink-0" />
                              <span className="truncate" title={atendimento.contato}>{atendimento.contato}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm tabular-nums text-foreground">{formatPhone(atendimento.telefone)}</TableCell>
                          <TableCell>
                            <DesfechoBadge atendimento={atendimento} />
                          </TableCell>
                          <TableCell className="text-sm tabular-nums text-foreground">{atendimento.messages.length}</TableCell>
                          <TableCell>
                            <div className="flex items-center justify-end gap-1">
                              {atendimento.desfecho !== 'ticket' && (
                                <AbrirTicketButton
                                  conversation={atendimento}
                                  opening={openingKey === key}
                                  onConfirm={handleAbrirTicket}
                                  variant="row"
                                />
                              )}
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label="Ver conversa"
                                className="h-7 w-7"
                                onClick={() => setSelectedConversation(atendimento)}
                              >
                                <MessageCircle className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })
                  )}
                </TableBody>
              </Table>
            </div>

            {!atendimentosLoading && atendimentosFiltrados.length > 0 && (
              <div className="flex flex-col gap-2 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs tabular-nums text-muted-foreground">
                  {atendimentosFiltrados.length} atendimento{atendimentosFiltrados.length > 1 ? 's' : ''}
                  {' · '}pagina {paginaAtendimentos + 1} de {totalPaginasAtendimentos}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1"
                    disabled={paginaAtendimentos === 0}
                    onClick={() => setAtendimentosPage((p) => Math.max(0, p - 1))}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Anterior
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1"
                    disabled={paginaAtendimentos >= totalPaginasAtendimentos - 1}
                    onClick={() => setAtendimentosPage((p) => Math.min(totalPaginasAtendimentos - 1, p + 1))}
                  >
                    Proxima
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {selectedConversation && (
        <div className="fixed inset-y-0 right-0 z-50 w-full max-w-lg">
          <div className="fixed inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setSelectedConversation(null)} />

          <div className="anim-rise absolute inset-0 flex flex-col border-l border-border bg-background shadow-xl">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Bot className="h-4 w-4 text-primary" />
                  <h2 className="truncate font-semibold tracking-tight">Nexus IA</h2>
                  {selectedConversation.ticket ? (
                    <Badge variant="outline" className="gap-1 rounded-md border-border text-[10px] text-foreground">
                      <Ticket className="h-3 w-3 text-muted-foreground" />
                      Ticket{selectedConversation.ticket.numero ? <span className="font-mono tabnums"> #{selectedConversation.ticket.numero}</span> : ''}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px]">Sem ticket</Badge>
                  )}
                </div>
                <p className="truncate text-sm text-muted-foreground">
                  {selectedConversation.contato} - {selectedConversation.setorNome}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {!selectedConversation.ticket && (
                  <AbrirTicketButton
                    conversation={selectedConversation}
                    opening={openingKey === `${selectedConversation.setorId}-${selectedConversation.clienteKey}`}
                    onConfirm={handleAbrirTicket}
                    variant="drawer"
                  />
                )}
                <Button variant="ghost" size="icon" onClick={() => setSelectedConversation(null)}>
                  <X className="h-5 w-5" />
                </Button>
              </div>
            </div>

            <div className="border-b px-4 py-2">
              <div className="grid grid-cols-4 gap-2 text-center text-xs">
                <div>
                  <p className="font-semibold tabular-nums text-foreground">{formatPhone(selectedConversation.telefone)}</p>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Numero</p>
                </div>
                <div>
                  <p className="font-semibold tabular-nums text-foreground">{formatDuration(selectedConversation.messages)}</p>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Tempo de atendimento</p>
                </div>
                <div>
                  <p className="font-semibold tabular-nums text-foreground">{formatRelativeTime(selectedConversation.lastMessageAt)}</p>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Ultima mensagem</p>
                </div>
                <div>
                  <p className="font-semibold tabular-nums text-foreground">{selectedConversation.messages.length}</p>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Mensagens</p>
                </div>
              </div>
            </div>

            <div ref={conversationScrollRef} className="flex-1 overflow-y-auto overscroll-contain">
              <div className="p-4 space-y-3">
                {selectedConversation.messages.map((message: any) => (
                  <div
                    key={message.id}
                    className={cn("flex", message.remetente === NEXUS_CLIENT_REMETENTE ? "justify-start" : "justify-end")}
                  >
                    <div
                      className={cn(
                        "max-w-[80%] rounded-lg px-3 py-2 text-sm",
                        message.remetente === NEXUS_CLIENT_REMETENTE
                          ? "bg-muted text-foreground"
                          : "border border-border bg-card text-foreground",
                      )}
                    >
                      <MessageMediaPreview
                        url={message.url_imagem}
                        mediaType={message.media_type}
                        tipo={message.tipo}
                        conteudo={message.conteudo}
                      />
                      <TextoMensagem conteudo={message.conteudo} className="whitespace-pre-wrap" />
                      <div className="mt-1 flex items-center justify-between gap-2 text-[10px] opacity-70">
                        <span>{message.remetente === NEXUS_CLIENT_REMETENTE ? 'Cliente' : 'Nexus'}</span>
                        <span className="tabular-nums">
                          {new Date(message.enviado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
