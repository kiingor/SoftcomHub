'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Loader2,
  LogOut,
  Headphones,
  ShoppingCart,
  CreditCard,
  MessageCircle,
  HelpCircle,
  UserPlus,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { InputArea } from './InputArea'

// Ícones por tipo de atendimento (espelham o Roteamento do setor)
const TIPO_ICON: Record<string, typeof HelpCircle> = {
  suporte: Headphones,
  comercial: ShoppingCart,
  financeiro: CreditCard,
  ouvidoria: MessageCircle,
}

type Step = 'setor' | 'form' | 'empresa' | 'criando' | 'chat'

interface SetorOpcao {
  id: string
  nome: string
  tipo?: string
}

interface Empresa {
  id: number
  nome: string
  razaoSocial: string
  cnpj: string
  cidade: string
  uf: string
  contato: { ddd: string; telefone: string } | null
}

interface Bubble {
  id: string
  lado: 'left' | 'right'
  texto: string
}

interface LiveMsg {
  id: string
  remetente: 'cliente-widget' | 'colaborador'
  conteudo: string
  tipo: string
  enviado_em: string
}

// Mensagens otimistas (aparecem na hora; some quando o polling confirma).
interface Pendente {
  id: string
  texto: string
  status: 'enviando' | 'falhou'
}

interface SessionData {
  token: string
  ticket_id: string
  nome: string
}

const STORAGE = (k: string) => `widget_conv_${k}`
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
const typingDelay = (texto: string) =>
  Math.min(1600, Math.max(650, 400 + texto.length * 18))

const horaFmt = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' })
const formatHora = (iso?: string) => {
  if (!iso) return undefined
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? undefined : horaFmt.format(d)
}

function maskTelefone(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 2) return d
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

function maskCnpj(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 14)
  let r = d
  if (d.length > 2) r = `${d.slice(0, 2)}.${d.slice(2)}`
  if (d.length > 5) r = `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`
  if (d.length > 8) r = `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`
  if (d.length > 12)
    r = `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
  return r
}

const SESSAO_EXPIRADA = 'Sua sessão expirou — vamos começar de novo 🙂'
const SAUDACAO = 'Olá! 👋 Com qual área você quer falar?'

export function WidgetRoot({ widgetKey }: { widgetKey: string }) {
  const [step, setStep] = useState<Step>('setor')
  const [bubbles, setBubbles] = useState<Bubble[]>([])
  const [setores, setSetores] = useState<SetorOpcao[]>([])
  const [setoresLoading, setSetoresLoading] = useState(true)
  const [setoresErro, setSetoresErro] = useState(false)
  const [botTyping, setBotTyping] = useState(false)

  // seleção + formulário
  const [selSetor, setSelSetor] = useState<SetorOpcao | null>(null)
  const [nome, setNome] = useState('')
  const [telefone, setTelefone] = useState('')
  const [cnpj, setCnpj] = useState('')
  const [formErr, setFormErr] = useState<string | null>(null)
  const [naoCliente, setNaoCliente] = useState(false)
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [buscando, setBuscando] = useState(false)
  const dados = useRef<{
    setor_id?: string
    nome?: string
    telefone?: string
    cnpj?: string
  }>({})
  const nomeRef = useRef<HTMLInputElement>(null)
  const telRef = useRef<HTMLInputElement>(null)
  const cnpjRef = useRef<HTMLInputElement>(null)

  // chat ao vivo
  const [session, setSession] = useState<SessionData | null>(null)
  const [live, setLive] = useState<LiveMsg[]>([])
  const [pendentes, setPendentes] = useState<Pendente[]>([])
  const [atendente, setAtendente] = useState<string | null>(null)
  const [emAtendimento, setEmAtendimento] = useState(false)
  const [encerrado, setEncerrado] = useState(false)
  const [joinNotice, setJoinNotice] = useState<string | null>(null)
  const [confirmClose, setConfirmClose] = useState(false)
  const [busy, setBusy] = useState(false)
  const prevAtendente = useRef<string | null>(null)
  const pollInicial = useRef(true)

  const idRef = useRef(0)
  const scrollRef = useRef<HTMLDivElement>(null)

  const pushUser = (texto: string) =>
    setBubbles((b) => [...b, { id: String(++idRef.current), lado: 'right', texto }])

  const pushBot = useCallback(async (texto: string) => {
    setBotTyping(true)
    await sleep(typingDelay(texto))
    setBotTyping(false)
    setBubbles((b) => [...b, { id: String(++idRef.current), lado: 'left', texto }])
  }, [])

  const carregarSetores = useCallback(async () => {
    setSetoresLoading(true)
    setSetoresErro(false)
    try {
      const res = await fetch(
        `/api/widget/setores?widget_key=${encodeURIComponent(widgetKey)}`,
      )
      if (!res.ok) throw new Error()
      const data = await res.json()
      setSetores(data.setores || [])
    } catch {
      setSetores([])
      setSetoresErro(true)
    } finally {
      setSetoresLoading(false)
    }
  }, [widgetKey])

  // Volta o widget ao início (novo atendimento / sessão expirada).
  const resetParaInicio = useCallback(
    (mensagem: string) => {
      localStorage.removeItem(STORAGE(widgetKey))
      setSession(null)
      setLive([])
      setPendentes([])
      prevAtendente.current = null
      pollInicial.current = true
      dados.current = {}
      setAtendente(null)
      setEmAtendimento(false)
      setEncerrado(false)
      setJoinNotice(null)
      setConfirmClose(false)
      setSelSetor(null)
      setNaoCliente(false)
      setNome('')
      setTelefone('')
      setCnpj('')
      setEmpresas([])
      setFormErr(null)
      setBubbles([{ id: `r-${++idRef.current}`, lado: 'left', texto: mensagem }])
      setStep('setor')
      carregarSetores()
    },
    [widgetKey, carregarSetores],
  )

  // ----- início: retoma sessão OU saúda e pede o setor -----
  useEffect(() => {
    carregarSetores()

    const saved = localStorage.getItem(STORAGE(widgetKey))
    if (saved) {
      try {
        const s = JSON.parse(saved) as SessionData
        if (s.token && s.ticket_id) {
          setSession(s)
          setBubbles([
            {
              id: 'resume',
              lado: 'left',
              texto: `Oi de novo${s.nome ? `, ${s.nome.split(' ')[0]}` : ''}! 👋 Estamos retomando seu atendimento.`,
            },
          ])
          setStep('chat')
          return
        }
      } catch {}
    }

    ;(async () => {
      setBotTyping(true)
      await sleep(900)
      setBotTyping(false)
      setBubbles([{ id: 'greet', lado: 'left', texto: SAUDACAO }])
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widgetKey])

  // Auto-scroll só quando o usuário já está perto do fim (não rouba leitura).
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const perto = el.scrollHeight - el.scrollTop - el.clientHeight < 140
    if (!perto) return
    const reduz =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    el.scrollTo({ top: el.scrollHeight, behavior: reduz ? 'auto' : 'smooth' })
  }, [bubbles, live, pendentes, joinNotice, step, botTyping, empresas])

  // Foco no primeiro campo ao abrir o formulário.
  useEffect(() => {
    if (step === 'form' && !botTyping) nomeRef.current?.focus()
  }, [step, botTyping])

  // ----- 1) escolha do setor -----
  const escolherSetor = async (s: SetorOpcao) => {
    setNaoCliente(false)
    setSelSetor(s)
    pushUser(s.nome)
    setStep('form')
    await pushBot('Perfeito! Agora é só preencher seus dados 👇')
  }

  // ----- 1b) prospect: "ainda não sou cliente" -> vai para o Comercial -----
  const escolherNaoCliente = async () => {
    const comercial = setores.find((s) => s.tipo === 'comercial') || setores[0]
    if (!comercial) return
    setNaoCliente(true)
    setSelSetor(comercial)
    setCnpj('')
    pushUser('Ainda não sou cliente')
    setStep('form')
    await pushBot(
      'Que bom ter você por aqui! 😊 É só deixar seu nome e telefone que nosso time comercial entra em contato.',
    )
  }

  // ----- 2) envia o formulário -----
  const submitForm = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    setFormErr(null)
    if (!selSetor) return setFormErr('Selecione uma área.')
    if (!nome.trim()) {
      setFormErr('Informe seu nome.')
      nomeRef.current?.focus()
      return
    }

    const telDigits = telefone.replace(/\D/g, '')
    const cnpjDigits = cnpj.replace(/\D/g, '')

    if (naoCliente) {
      if (telDigits.length < 10) {
        setFormErr('Informe um telefone com DDD para o comercial te chamar.')
        telRef.current?.focus()
        return
      }
      dados.current = {
        setor_id: selSetor.id,
        nome: nome.trim(),
        telefone: telefone.trim(),
        cnpj: undefined,
      }
      pushUser(`${nome.trim()} • ${telefone.trim()}`)
      await criarAtendimento()
      return
    }

    if (telDigits.length >= 10) {
      dados.current = {
        setor_id: selSetor.id,
        nome: nome.trim(),
        telefone: telefone.trim(),
        cnpj: cnpjDigits || undefined,
      }
      pushUser(`${nome.trim()} • ${telefone.trim()}`)
      await criarAtendimento()
      return
    }

    if (cnpjDigits.length >= 8) {
      await buscarEmpresas(cnpjDigits)
      return
    }

    setFormErr('Informe um telefone com DDD ou um CNPJ.')
    telRef.current?.focus()
  }

  const buscarEmpresas = async (q: string) => {
    setStep('empresa')
    setBuscando(true)
    setEmpresas([])
    try {
      const res = await fetch(
        `/api/widget/buscar-cliente?widget_key=${encodeURIComponent(widgetKey)}&q=${encodeURIComponent(q)}`,
      )
      const data = await res.json()
      setEmpresas(data.empresas || [])
    } catch {
      setEmpresas([])
    } finally {
      setBuscando(false)
    }
  }

  const selecionarEmpresa = async (emp: Empresa) => {
    const tel = emp.contato
      ? `${emp.contato.ddd || ''}${emp.contato.telefone || ''}`.replace(/\D/g, '')
      : ''
    dados.current = {
      setor_id: selSetor!.id,
      nome: nome.trim() || emp.nome,
      telefone: tel.length >= 10 ? tel : undefined,
      cnpj: (emp.cnpj || cnpj).replace(/\D/g, '') || undefined,
    }
    pushUser(emp.nome)
    await criarAtendimento()
  }

  const criarAtendimento = async () => {
    setStep('criando')
    setBusy(true)
    try {
      const authRes = await fetch('/api/widget/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: dados.current.nome,
          telefone: dados.current.telefone,
          cnpj: dados.current.cnpj,
          setor_id: dados.current.setor_id,
        }),
      })
      if (!authRes.ok) throw new Error('auth')
      const auth = await authRes.json()

      const ticketRes = await fetch('/api/widget/tickets/criar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${auth.token}`,
        },
        body: JSON.stringify({ widget_key: widgetKey }),
      })
      if (!ticketRes.ok) throw new Error('ticket')
      const ticket = await ticketRes.json()

      const s: SessionData = {
        token: auth.token,
        ticket_id: ticket.ticket_id,
        nome: dados.current.nome || '',
      }
      setSession(s)
      pollInicial.current = true
      localStorage.setItem(STORAGE(widgetKey), JSON.stringify(s))

      setStep('chat')
      await pushBot(
        'Prontinho! ✅ Você está na fila. Assim que um atendente assumir, ele responde por aqui. Pode já deixar sua dúvida abaixo. 😊',
      )
    } catch {
      setStep('form')
      setFormErr('Tivemos um problema ao registrar. Pode tentar de novo?')
    } finally {
      setBusy(false)
    }
  }

  // ----- chat ao vivo (polling) -----
  const poll = useCallback(async () => {
    if (!session) return
    try {
      const res = await fetch(
        `/api/widget/messages/${session.ticket_id}?offset=0&limit=50`,
        { headers: { Authorization: `Bearer ${session.token}` } },
      )
      if (res.status === 401) {
        resetParaInicio(SESSAO_EXPIRADA)
        return
      }
      if (!res.ok) return
      const data = await res.json()
      setLive(data.mensagens || [])
      const nome: string | null = data.ticket?.atendente_nome || null
      setAtendente(nome)
      setEmAtendimento(!!data.ticket?.em_atendimento)
      setEncerrado(data.ticket?.status === 'encerrado')
      // Só anuncia "entrou no atendimento" numa transição real (não no 1º poll/retomada).
      if (nome && prevAtendente.current === null && !pollInicial.current) {
        setJoinNotice(`${nome} entrou no atendimento`)
        setTimeout(() => setJoinNotice(null), 6000)
      }
      prevAtendente.current = nome
      pollInicial.current = false
    } catch {}
  }, [session, resetParaInicio])

  useEffect(() => {
    if (step !== 'chat' || !session || encerrado) return
    poll()
    const t = setInterval(poll, 3000)
    return () => clearInterval(t)
  }, [step, session, poll, encerrado])

  const enviarMensagem = async (conteudo: string) => {
    if (!session || encerrado) return
    const tmpId = `tmp-${++idRef.current}`
    setPendentes((p) => [...p, { id: tmpId, texto: conteudo, status: 'enviando' }])
    setBusy(true)
    try {
      const res = await fetch('/api/widget/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({ ticket_id: session.ticket_id, conteudo, tipo: 'texto' }),
      })
      if (res.status === 401) {
        resetParaInicio(SESSAO_EXPIRADA)
        return
      }
      if (!res.ok) throw new Error()
      await poll() // traz a mensagem real do servidor
      setPendentes((p) => p.filter((m) => m.id !== tmpId)) // remove a otimista
    } catch {
      // Nunca descarta em silêncio: marca como falha com opção de reenviar.
      setPendentes((p) =>
        p.map((m) => (m.id === tmpId ? { ...m, status: 'falhou' } : m)),
      )
    } finally {
      setBusy(false)
    }
  }

  const reenviar = (m: Pendente) => {
    setPendentes((p) => p.filter((x) => x.id !== m.id))
    enviarMensagem(m.texto)
  }

  // ----- encerrar -----
  const encerrarAtendimento = async () => {
    setConfirmClose(false)
    if (session) {
      try {
        await fetch('/api/widget/tickets/encerrar', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.token}`,
          },
          body: JSON.stringify({ ticket_id: session.ticket_id }),
        })
      } catch {}
    }
    localStorage.removeItem(STORAGE(widgetKey))
    setEncerrado(true)
    await pushBot('Atendimento encerrado. Obrigado pelo contato! 💙')
  }

  const novoAtendimento = () => resetParaInicio(SAUDACAO)

  // ----- header -----
  const headerTitle =
    step === 'chat'
      ? encerrado
        ? 'Atendimento encerrado'
        : atendente || 'Aguardando atendente'
      : 'Atendimento'
  const headerSub =
    step === 'chat'
      ? encerrado
        ? 'Obrigado pelo contato'
        : emAtendimento
          ? 'Atendente'
          : 'Você está na fila'
      : 'Estamos aqui para ajudar'

  const inputClass =
    'w-full px-3 py-1.5 bg-gray-50 border rounded-xl text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus:border-primary/50 focus:bg-white transition-colors disabled:opacity-60'

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-white border-b">
        <div className="flex items-center gap-3 min-w-0">
          <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-sm">
            {atendente ? atendente.charAt(0).toUpperCase() : '·'}
            <span
              aria-hidden="true"
              className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white ${
                emAtendimento ? 'bg-green-500' : 'bg-amber-400'
              }`}
            />
          </span>
          <div className="min-w-0">
            <p className="font-medium text-sm leading-tight truncate">{headerTitle}</p>
            <p className="text-xs text-muted-foreground">{headerSub}</p>
          </div>
        </div>
        {session && !encerrado && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setConfirmClose(true)}
            aria-label="Encerrar atendimento"
            title="Encerrar atendimento"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
          </Button>
        )}
      </div>

      {/* Corpo */}
      <div
        ref={scrollRef}
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        className="flex-1 overflow-y-auto overscroll-contain touch-manipulation p-4 space-y-2"
      >
        {bubbles.map((b) => (
          <Balao key={b.id} lado={b.lado} texto={b.texto} />
        ))}

        {/* "digitando…" */}
        {botTyping && (
          <div className="flex justify-start">
            <div className="bg-white border rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-1">
              <span className="sr-only">Digitando…</span>
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce motion-reduce:animate-none" style={{ animationDelay: '0ms' }} />
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce motion-reduce:animate-none" style={{ animationDelay: '150ms' }} />
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce motion-reduce:animate-none" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        )}

        {/* 1) Opções de setor — caixinha (menu) */}
        {step === 'setor' && !botTyping && (
          <div className="mt-1 border rounded-2xl bg-white shadow-sm p-2 space-y-1 max-w-[280px]">
            {setoresLoading ? (
              <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Carregando áreas…
              </div>
            ) : (
              <>
                {setores.map((s, i) => {
                  const Icon = (s.tipo && TIPO_ICON[s.tipo]) || HelpCircle
                  return (
                    <button
                      key={s.tipo || `${s.id}-${i}`}
                      onClick={() => escolherSetor(s)}
                      className="w-full flex items-center justify-between rounded-xl px-3 py-2 text-sm text-foreground hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 transition-colors group"
                    >
                      <span className="flex items-center gap-2.5 min-w-0">
                        <Icon className="h-4 w-4 shrink-0 text-primary/70 group-hover:text-primary" aria-hidden="true" />
                        <span className="truncate">{s.nome}</span>
                      </span>
                      <span className="text-primary/50 shrink-0" aria-hidden="true">›</span>
                    </button>
                  )
                })}

                {setores.length === 0 && !setoresErro && (
                  <p className="px-3 py-2 text-sm text-muted-foreground">
                    Nenhuma área disponível no momento.
                  </p>
                )}

                {setoresErro && (
                  <div className="px-3 py-2 space-y-2">
                    <p className="text-sm text-muted-foreground">
                      Não consegui carregar as áreas.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-xl"
                      onClick={carregarSetores}
                    >
                      Tentar novamente
                    </Button>
                  </div>
                )}

                {setores.length > 0 && (
                  <>
                    <div className="h-px bg-border mx-1 my-1" />
                    <button
                      onClick={escolherNaoCliente}
                      className="w-full flex items-center justify-between rounded-xl px-3 py-2 text-sm text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 transition-colors"
                    >
                      <span className="flex items-center gap-2.5">
                        <UserPlus className="h-4 w-4 opacity-70" aria-hidden="true" />
                        Ainda não sou cliente
                      </span>
                      <span className="opacity-50 shrink-0" aria-hidden="true">›</span>
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        )}

        {/* 2) Caixinha com os dados */}
        {step === 'form' && !botTyping && (
          <form
            onSubmit={submitForm}
            className="mt-1 border rounded-2xl bg-white shadow-sm p-3 space-y-2 max-w-[280px]"
          >
            <p className="text-[11px] text-muted-foreground">
              {naoCliente ? (
                <>
                  Quero falar com o{' '}
                  <span className="font-medium text-foreground">Comercial</span>
                </>
              ) : (
                <>
                  Falar com{' '}
                  <span className="font-medium text-foreground">{selSetor?.nome}</span>
                </>
              )}
            </p>
            <input
              ref={nomeRef}
              id="w-nome"
              name="name"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Seu nome"
              aria-label="Seu nome"
              autoComplete="name"
              autoCapitalize="words"
              className={inputClass}
            />
            <input
              ref={telRef}
              id="w-tel"
              name="tel"
              type="tel"
              inputMode="tel"
              value={telefone}
              onChange={(e) => setTelefone(maskTelefone(e.target.value))}
              placeholder="Telefone / WhatsApp"
              aria-label="Telefone com DDD"
              autoComplete="tel"
              spellCheck={false}
              className={inputClass}
            />
            {!naoCliente && (
              <>
                <div className="flex items-center gap-2">
                  <span className="h-px flex-1 bg-border" />
                  <span className="text-[11px] text-muted-foreground">ou</span>
                  <span className="h-px flex-1 bg-border" />
                </div>
                <input
                  ref={cnpjRef}
                  id="w-cnpj"
                  name="cnpj"
                  inputMode="numeric"
                  value={cnpj}
                  onChange={(e) => setCnpj(maskCnpj(e.target.value))}
                  placeholder="CNPJ da empresa"
                  aria-label="CNPJ"
                  spellCheck={false}
                  className={inputClass}
                />
              </>
            )}
            {formErr && (
              <p role="alert" className="text-[11px] text-red-600 bg-red-50 rounded-lg px-2 py-1.5">
                {formErr}
              </p>
            )}
            <Button type="submit" size="sm" className="w-full rounded-xl" disabled={busy}>
              {busy ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" aria-hidden="true" />
                  Enviando…
                </>
              ) : (
                'Continuar'
              )}
            </Button>
          </form>
        )}

        {/* 2b) Seleção de empresa (busca por CNPJ) */}
        {step === 'empresa' && (
          <div className="mt-1 border rounded-2xl bg-white shadow-sm p-4 space-y-3">
            {buscando ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Buscando empresas…
              </div>
            ) : empresas.length === 0 ? (
              <>
                <p className="text-sm">
                  Não encontramos empresas para esse CNPJ. 🤔 Confira o número ou
                  informe o telefone.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-2xl"
                  onClick={() => setStep('form')}
                >
                  Voltar
                </Button>
              </>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">Selecione a sua empresa:</p>
                <div className="space-y-2 max-h-72 overflow-y-auto overscroll-contain">
                  {empresas.map((e) => (
                    <button
                      key={e.id}
                      onClick={() => selecionarEmpresa(e)}
                      className="w-full text-left border rounded-xl p-3 hover:border-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 transition-colors"
                    >
                      <p className="text-sm font-medium leading-tight">{e.nome}</p>
                      {e.razaoSocial && e.razaoSocial !== e.nome && (
                        <p className="text-xs text-muted-foreground">{e.razaoSocial}</p>
                      )}
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {e.cidade ? `${e.cidade}/${e.uf} • ` : ''}CNPJ: {e.cnpj}
                      </p>
                    </button>
                  ))}
                </div>
                <Button variant="ghost" size="sm" onClick={() => setStep('form')}>
                  Voltar
                </Button>
              </>
            )}
          </div>
        )}

        {/* criando */}
        {step === 'criando' && (
          <div className="flex justify-start">
            <div className="bg-white border rounded-2xl rounded-bl-md px-4 py-3">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden="true" />
              <span className="sr-only">Registrando seu atendimento…</span>
            </div>
          </div>
        )}

        {/* Avisos (fila / atendente entrou) — região de status */}
        <div role="status" aria-live="polite">
          {step === 'chat' && !emAtendimento && !encerrado && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs px-3 py-2 text-center leading-relaxed">
              ⏳ Você está na fila. Pode deixar sua mensagem — assim que um atendente
              assumir, ele responde por aqui.
            </div>
          )}
          {joinNotice && (
            <div className="text-center mt-2">
              <span className="inline-block rounded-full bg-green-100 text-green-700 text-xs px-3 py-1">
                🟢 {joinNotice}
              </span>
            </div>
          )}
        </div>

        {/* Mensagens ao vivo */}
        {live.map((m) => (
          <Balao
            key={m.id}
            lado={m.remetente === 'cliente-widget' ? 'right' : 'left'}
            texto={m.conteudo}
            hora={formatHora(m.enviado_em)}
          />
        ))}

        {/* Mensagens otimistas (enviando / falhou) */}
        {pendentes.map((m) => (
          <div key={m.id} className="flex justify-end">
            <div
              className={`max-w-[82%] px-3.5 py-2 rounded-2xl rounded-br-md text-sm whitespace-pre-wrap break-words bg-primary text-white ${
                m.status === 'enviando' ? 'opacity-60' : ''
              }`}
            >
              {m.texto}
              {m.status === 'falhou' && (
                <button
                  onClick={() => reenviar(m)}
                  className="block mt-1 text-[10px] text-white/90 underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 rounded"
                >
                  Não enviou. Toque para tentar de novo
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Rodapé: só no chat */}
      {step === 'chat' &&
        (confirmClose ? (
          <div className="p-3 bg-white border-t flex items-center justify-between gap-2">
            <span className="text-sm">Encerrar este atendimento?</span>
            <div className="flex gap-2 shrink-0">
              <Button variant="ghost" size="sm" onClick={() => setConfirmClose(false)}>
                Cancelar
              </Button>
              <Button variant="destructive" size="sm" onClick={encerrarAtendimento}>
                Encerrar
              </Button>
            </div>
          </div>
        ) : encerrado ? (
          <div className="p-4 bg-white border-t text-center space-y-2">
            <p className="text-sm text-muted-foreground">
              Este atendimento foi encerrado.
            </p>
            <Button variant="outline" size="sm" onClick={novoAtendimento}>
              Iniciar novo atendimento
            </Button>
          </div>
        ) : (
          <InputArea
            onSendMessage={enviarMensagem}
            sending={busy}
            disabled={false}
            placeholder="Digite sua mensagem…"
          />
        ))}
    </div>
  )
}

function Balao({
  lado,
  texto,
  hora,
}: {
  lado: 'left' | 'right'
  texto: string
  hora?: string
}) {
  const isRight = lado === 'right'
  return (
    <div className={`flex ${isRight ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[82%] px-3.5 py-2 rounded-2xl text-sm whitespace-pre-wrap break-words ${
          isRight
            ? 'bg-primary text-white rounded-br-md'
            : 'bg-white border text-foreground rounded-bl-md'
        }`}
      >
        {texto}
        {hora && (
          <span
            className={`block text-[10px] mt-0.5 text-right ${
              isRight ? 'text-white/70' : 'text-muted-foreground'
            }`}
          >
            {hora}
          </span>
        )}
      </div>
    </div>
  )
}
