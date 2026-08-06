'use client'

import { Fragment, useCallback, useEffect, useState } from 'react'
import { AlertCircle, Loader2, RefreshCw, Sparkles, X } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatarDuracao, type MetricasDeTempo } from '@/lib/analise-atendimento'
import { cn } from '@/lib/utils'

interface AnaliseResposta {
  markdown: string
  gerado_em: string
  modelo: string | null
  do_cache: boolean
  total_mensagens: number
  ultima_mensagem_em: string | null
  metricas?: MetricasDeTempo | null
  /** Ainda chegando pelo stream — o rodapé não deve dizer "Analisado". */
  parcial?: boolean
}

function tempoRelativo(iso: string | null | undefined): string {
  if (!iso) return 'agora'
  const minutos = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000)
  if (minutos < 1) return 'agora mesmo'
  if (minutos < 60) return `há ${minutos} min`
  const horas = Math.floor(minutos / 60)
  if (horas < 24) return `há ${horas}h`
  return `há ${Math.floor(horas / 24)}d`
}

/**
 * A barra lateral "Status do atendimento", ao lado da conversa do Monitoramento.
 *
 * Fica colada no balão do chat de propósito: o supervisor lê a conclusão da IA
 * e confere na conversa ao lado sem trocar de tela. A rota reutiliza a análise
 * somente enquanto a conversa e o contexto efetivamente enviados ao modelo são
 * iguais; aqui só mostramos se o texto veio do cache e oferecemos o reanalisar.
 *
 * Monta e desmonta junto com a barra: reabrir dispara outra requisição, mas ela
 * volta do cache do servidor sem gastar chamada de IA.
 */
export function StatusAtendimentoPanel({
  ticketId,
  onFechar,
}: {
  ticketId: string | null
  onFechar: () => void
}) {
  const [analise, setAnalise] = useState<AnaliseResposta | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  /**
   * Lê o SSE da rota. O texto entra na tela conforme chega — o modelo leva ~6s
   * para terminar, mas as primeiras linhas aparecem em cerca de um segundo, e é
   * disso que o supervisor precisa para decidir se continua lendo.
   */
  const analisar = useCallback(async (id: string, forcar: boolean) => {
    setCarregando(true)
    setErro(null)
    setAnalise(null)

    try {
      const resposta = await fetch('/api/ia/status-atendimento', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket_id: id, forcar, stream: true }),
      })

      if (!resposta.body) {
        setErro('Não foi possível analisar este atendimento.')
        return
      }

      const leitor = resposta.body.getReader()
      const decodificador = new TextDecoder()
      let restante = ''
      let markdown = ''

      for (;;) {
        const { done, value } = await leitor.read()
        if (done) break

        restante += decodificador.decode(value, { stream: true })
        // Eventos SSE são separados por linha em branco; o último pedaço pode
        // estar cortado no meio e fica para a próxima volta.
        const blocos = restante.split('\n\n')
        restante = blocos.pop() ?? ''

        for (const bloco of blocos) {
          const evento = bloco.match(/^event:\s*(.+)$/m)?.[1]?.trim()
          const dadosBrutos = bloco.match(/^data:\s*([\s\S]+)$/m)?.[1]
          if (!evento || !dadosBrutos) continue

          let dados: Record<string, unknown>
          try {
            dados = JSON.parse(dadosBrutos)
          } catch {
            continue
          }

          if (evento === 'erro') {
            setErro((dados.error as string) || 'Não foi possível analisar este atendimento.')
            setCarregando(false)
            return
          }

          if (evento === 'meta') {
            setCarregando(false)
            setAnalise({
              markdown: '',
              gerado_em: new Date().toISOString(),
              modelo: null,
              do_cache: Boolean(dados.do_cache),
              total_mensagens: Number(dados.total_mensagens ?? 0),
              ultima_mensagem_em: null,
              metricas: (dados.metricas as MetricasDeTempo) ?? null,
              parcial: true,
            })
            continue
          }

          if (evento === 'delta') {
            markdown += String(dados.t ?? '')
            setAnalise((atual) => (atual ? { ...atual, markdown } : atual))
            continue
          }

          if (evento === 'fim') {
            setAnalise({ ...(dados as unknown as AnaliseResposta), parcial: false })
          }
        }
      }
    } catch {
      setErro('Falha de conexão ao consultar a análise.')
    } finally {
      setCarregando(false)
    }
  }, [])

  // A troca de ticket precisa limpar o resultado anterior: sem isto a barra
  // mostraria por um instante a análise do ticket que acabou de ser fechado.
  useEffect(() => {
    setAnalise(null)
    setErro(null)
    if (ticketId) analisar(ticketId, false)
  }, [ticketId, analisar])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2.5">
        <h3 className="flex min-w-0 items-center gap-1.5 text-sm font-semibold">
          <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
          <span className="truncate">Status do atendimento</span>
        </h3>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0"
          onClick={onFechar}
          aria-label="Fechar o status do atendimento"
          title="Fechar"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {carregando ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden="true" />
            <p className="text-xs">Lendo a conversa…</p>
          </div>
        ) : erro ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
            <AlertCircle className="h-6 w-6 text-muted-foreground/60" aria-hidden="true" />
            <p className="text-xs text-muted-foreground">{erro}</p>
          </div>
        ) : analise ? (
          <>
            {analise.metricas && <Metricas dados={analise.metricas} />}
            <AnaliseMarkdown texto={analise.markdown} />
          </>
        ) : null}
      </div>

      <div className="space-y-1.5 border-t px-3 py-2">
        <p className="text-[11px] leading-tight text-muted-foreground">
          {!analise
            ? 'A análise é atualizada quando a conversa ou o contexto analisado muda.'
            : analise.parcial
              ? `Escrevendo… · ${analise.total_mensagens} ${analise.total_mensagens === 1 ? 'mensagem' : 'mensagens'}`
              : `Analisado ${tempoRelativo(analise.gerado_em)} · ${analise.total_mensagens} ${analise.total_mensagens === 1 ? 'mensagem' : 'mensagens'}`}
          {analise?.do_cache && (
            <Badge variant="outline" className="ml-1.5 h-4 px-1.5 text-[10px] font-normal">
              sem mensagem nova
            </Badge>
          )}
        </p>
        <Button
          variant="outline"
          size="sm"
          className="h-7 w-full text-xs"
          disabled={!ticketId || carregando || analise?.parcial}
          onClick={() => ticketId && analisar(ticketId, true)}
        >
          <RefreshCw className={cn('h-3 w-3', carregando && 'animate-spin')} aria-hidden="true" />
          Reanalisar
        </Button>
      </div>
    </div>
  )
}

/**
 * Os tempos medidos, acima do texto da IA.
 *
 * Vêm calculados da rota, sobre os carimbos das mensagens — não são opinião do
 * modelo. Por isso ficam num bloco separado do markdown: número medido e texto
 * gerado não devem se misturar na leitura.
 */
function Metricas({ dados }: { dados: MetricasDeTempo }) {
  const semDialogo = dados.primeiraRespostaMs === null
    && dados.mediaAtendenteMs === null
    && dados.maiorLacuna === null
  if (semDialogo) return null

  return (
    <section className="mb-3 rounded-lg border bg-muted/30 px-2.5 py-2">
      <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Tempos medidos
      </h4>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5">
        <Metrica
          rotulo="1ª resposta"
          valor={formatarDuracao(dados.primeiraRespostaMs)}
          titulo="Da última mensagem do bloco consecutivo do cliente até a primeira resposta humana. O bot não conta."
        />
        <Metrica
          rotulo="Média atendente"
          valor={formatarDuracao(dados.mediaAtendenteMs)}
          titulo="Média do tempo que o atendente leva para responder o cliente"
        />
        <Metrica
          rotulo="Média cliente"
          valor={formatarDuracao(dados.mediaClienteMs)}
          titulo="Média do tempo que o cliente leva para responder o atendente"
        />
        <Metrica
          rotulo="Maior espera"
          valor={dados.maiorLacuna ? formatarDuracao(dados.maiorLacuna.ms) : '—'}
          titulo={dados.maiorLacuna
            ? `Maior silêncio da conversa; quem aguardou foi o ${dados.maiorLacuna.quemEsperou}`
            : 'Sem troca de lado na conversa'}
          nota={dados.maiorLacuna ? `esperou o ${dados.maiorLacuna.quemEsperou}` : undefined}
        />
      </dl>
      {dados.respostasDoAtendente > 0 && (
        <p className="mt-1.5 border-t pt-1.5 text-[11px] text-muted-foreground">
          {dados.respostasDoAtendente - dados.respostasAcimaDaMedia} de {dados.respostasDoAtendente}{' '}
          {dados.respostasDoAtendente === 1 ? 'resposta' : 'respostas'} dentro da média
          {dados.outliers > 0 && (
            <span className="text-amber-600 dark:text-amber-400">
              {' '}· {dados.outliers} {dados.outliers === 1 ? 'lacuna' : 'lacunas'} acima de 10min
            </span>
          )}
        </p>
      )}
    </section>
  )
}

function Metrica({
  rotulo,
  valor,
  titulo,
  nota,
}: {
  rotulo: string
  valor: string
  titulo: string
  nota?: string
}) {
  return (
    <div className="min-w-0" title={titulo}>
      <dt className="truncate text-[11px] text-muted-foreground">{rotulo}</dt>
      <dd className="text-sm font-semibold tabular-nums text-foreground">{valor}</dd>
      {nota && <p className="truncate text-[10px] text-muted-foreground">{nota}</p>}
    </div>
  )
}

/**
 * Renderizador do markdown que a IA devolve — só `##`, `-` e `**`, que é o que
 * o prompt manda ela usar. Um parser mínimo evita trazer dependência nova só
 * para três marcações, do mesmo jeito que o painel de referência faz.
 */
function AnaliseMarkdown({ texto }: { texto: string }) {
  const blocos: React.ReactNode[] = []
  let itens: React.ReactNode[] = []

  const fecharLista = () => {
    if (itens.length === 0) return
    blocos.push(
      <ul key={`lista-${blocos.length}`} className="my-1.5 space-y-1">
        {itens}
      </ul>,
    )
    itens = []
  }

  texto.split('\n').forEach((linha, indice) => {
    const conteudo = linha.trim()

    if (conteudo.startsWith('## ')) {
      fecharLista()
      blocos.push(
        <h4
          key={indice}
          className="mt-3.5 border-b pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground first:mt-0"
        >
          {conteudo.slice(3)}
        </h4>,
      )
      return
    }

    if (conteudo.startsWith('- ') || conteudo.startsWith('* ')) {
      itens.push(
        <li key={indice} className="flex gap-1.5 text-[13px] leading-snug text-foreground">
          <span aria-hidden="true" className="mt-[6px] h-1 w-1 shrink-0 rounded-full bg-muted-foreground/60" />
          <span>{comNegrito(conteudo.slice(2))}</span>
        </li>,
      )
      return
    }

    if (!conteudo) {
      fecharLista()
      return
    }

    fecharLista()
    blocos.push(
      <p key={indice} className="my-1.5 text-[13px] leading-snug text-foreground">
        {comNegrito(conteudo)}
      </p>,
    )
  })

  fecharLista()
  return <div>{blocos}</div>
}

function comNegrito(linha: string): React.ReactNode {
  return linha.split(/(\*\*[^*]+\*\*)/g).map((parte, indice) => (
    <Fragment key={indice}>
      {parte.startsWith('**') && parte.endsWith('**')
        ? <strong className="font-semibold">{parte.slice(2, -2)}</strong>
        : parte}
    </Fragment>
  ))
}
