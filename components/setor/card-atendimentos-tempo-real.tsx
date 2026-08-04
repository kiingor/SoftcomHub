'use client'

import { Activity, CheckCircle, Headphones, Inbox, Timer, TrendingUp } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { type ResumoTempoReal } from '@/lib/monitoramento-tempo-real'
import { formatarEsperaLonga, type EpisodiosDeFila, type ResumoFila } from '@/lib/relatorio-fila'
import { type WorkloadOs } from '@/lib/workload-os'
import { cn } from '@/lib/utils'

/** Valor do seletor para "sem recorte de subsetor". */
export const TODOS_SUBSETORES = '__todos__'

export interface OpcaoSubsetor {
  id: string
  nome: string
}

/**
 * O card "Atendimentos em tempo real".
 *
 * Extraído da página para poder ser repetido: o gestor mantém um card com o
 * setor inteiro e outro recortado num subsetor, lado a lado, com exatamente os
 * mesmos indicadores. Um componente só garante que os dois nunca divirjam na
 * apresentação — e o cálculo já é compartilhado por `calcularTempoReal`.
 *
 * O seletor fica no canto superior direito. Sem `opcoes`, ele não aparece.
 */
export function CardAtendimentosTempoReal({
  resumo,
  workload,
  tomCarga,
  tempoMaximoFila,
  tempoMaximoResposta,
  fila,
  episodios,
  opcoes,
  subsetorSelecionado = TODOS_SUBSETORES,
  aoTrocarSubsetor,
}: {
  resumo: Pick<ResumoTempoReal, 'total' | 'naFila' | 'emAtendimento' | 'finalizadosHoje' | 'atendentesOnline'>
  workload: WorkloadOs
  tomCarga: { badge: string; value: string }
  /** Já formatados em hh:mm:ss pela página. */
  tempoMaximoFila: string
  tempoMaximoResposta: string
  /** Fila do DIA, no mesmo recorte do card. Sem isto, a faixa não aparece. */
  fila?: Pick<ResumoFila, 'maiorEspera' | 'entraramNaFila'>
  /** Vezes que a fila se formou hoje. Depende de `atribuido_em`. */
  episodios?: EpisodiosDeFila
  opcoes?: OpcaoSubsetor[]
  subsetorSelecionado?: string
  aoTrocarSubsetor?: (id: string) => void
}) {
  const temSeletor = Boolean(opcoes?.length && aoTrocarSubsetor)

  return (
    <Card className="glass-card-elevated @container h-full overflow-auto rounded-lg border-l-4 border-l-primary">
      <CardHeader className="flex flex-row items-center justify-between gap-1.5 pb-2">
        <CardTitle className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-muted-foreground">
          <Activity className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
          <span className="truncate">Atendimentos em tempo real</span>
        </CardTitle>

        {temSeletor && (
          <Select value={subsetorSelecionado} onValueChange={aoTrocarSubsetor}>
            <SelectTrigger className="h-7 w-[180px] shrink-0 text-xs" aria-label="Filtrar por subsetor">
              <SelectValue placeholder="Subsetor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS_SUBSETORES}>Todos os subsetores</SelectItem>
              {opcoes!.map((opcao) => (
                <SelectItem key={opcao.id} value={opcao.id}>{opcao.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </CardHeader>

      <CardContent className="space-y-2">
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border/80 bg-border/80 @sm:grid-cols-4">
          <Numero icone={Activity} rotulo="Total ativos" valor={resumo.total} />
          <Numero icone={Inbox} rotulo="Na fila" valor={resumo.naFila} cor="text-orange-500" />
          <Numero icone={Headphones} rotulo="Em atendimento" valor={resumo.emAtendimento} cor="text-primary" />
          <Numero icone={CheckCircle} rotulo="Finalizados hoje" valor={resumo.finalizadosHoje} cor="text-green-500" />
        </div>

        <div className="grid gap-2 @sm:grid-cols-[minmax(0,1.2fr)_minmax(190px,0.8fr)]">
          <section
            className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2"
            aria-label="Maiores esperas atuais"
          >
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Timer className="h-3 w-3" aria-hidden="true" />
              <span>Maiores esperas atuais</span>
            </div>
            <div className="mt-2 grid grid-cols-2 divide-x divide-border/70">
              <div className="min-w-0 pr-2.5">
                <p className="whitespace-nowrap text-lg font-semibold tracking-tight text-foreground tabular-nums">
                  {tempoMaximoFila}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">Na fila</p>
              </div>
              <div className="min-w-0 pl-2.5">
                <p className="whitespace-nowrap text-lg font-semibold tracking-tight text-foreground tabular-nums">
                  {tempoMaximoResposta}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">Sem 1ª resposta</p>
              </div>
            </div>
          </section>

          <section
            className={cn('rounded-lg border px-3 py-2', tomCarga.badge)}
            title={`${resumo.total} tickets ativos ÷ ${resumo.atendentesOnline} atendentes online compatíveis`}
            aria-label={workload.ratio === null
              ? `${workload.label}: ${resumo.total} tickets ativos e nenhum atendente online compatível`
              : `${workload.formattedRatio} tickets por atendente online: ${workload.label}`}
          >
            <div className="flex items-center justify-between gap-1.5">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <TrendingUp className="h-3 w-3" aria-hidden="true" />
                <span>Carga por atendente</span>
              </div>
              <Badge variant="outline" className={cn('h-5 shrink-0 px-1.5 text-[10px]', tomCarga.badge)}>
                {workload.label}
              </Badge>
            </div>
            <div className="mt-1.5 flex items-end justify-between gap-2">
              <div>
                <p className={cn('text-xl font-semibold tracking-tight tabular-nums', tomCarga.value)}>
                  {workload.formattedRatio}
                </p>
                <p className="text-xs text-muted-foreground">Média/OS</p>
              </div>
              <p className="pb-0.5 text-right text-[11px] leading-tight text-muted-foreground tabular-nums">
                {resumo.atendentesOnline} online
              </p>
            </div>
          </section>
        </div>

        {fila && (
          <div className="grid grid-cols-2 gap-2 border-t border-border/70 pt-2 text-center">
            <div>
              <p className={cn(
                'text-xl font-bold tabular-nums',
                episodios && episodios.vezes > 0
                  ? 'text-orange-600 dark:text-orange-400'
                  : 'text-foreground',
              )}>
                {episodios?.vezes ?? 0}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">Número de filas hoje</p>
              {/* Quantos esperaram e o pico, juntos: sozinho, "14 filas" não
                  distingue uma fila que empilha de esperas isoladas. Medido em
                  04/08/2026 no ServiceDesk, os dois subsetores davam ~38 pela
                  regra antiga, mas o Suporte tinha 258 clientes e pico 14
                  contra 79 e pico 5 do Prime — não se comparavam com o mesmo
                  peso. A conta é o tempo sem atendente e dentro do expediente:
                  ver a nota do topo de `lib/relatorio-fila.ts`. */}
              <p
                className="text-[11px] text-muted-foreground"
                title={`${fila.entraramNaFila} clientes esperaram na fila além do limite hoje; no pior instante havia ${episodios?.pico ?? 0} esperando ao mesmo tempo`}
              >
                {episodios && episodios.vezes > 0
                  ? `${fila.entraramNaFila} ${fila.entraramNaFila === 1 ? 'cliente' : 'clientes'} · pico de ${episodios.pico}`
                  : 'ninguém esperou hoje'}
              </p>
            </div>
            <div className="min-w-0">
              <p className={cn(
                'whitespace-nowrap text-xl font-bold tabular-nums',
                fila.maiorEspera?.emAndamento ? 'text-red-600 dark:text-red-400' : 'text-foreground',
              )}>
                {fila.maiorEspera ? formatarEsperaLonga(fila.maiorEspera.esperaMs) : '—'}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">Maior tempo de espera em fila</p>
              <p
                className="truncate text-[11px] text-muted-foreground"
                title={fila.maiorEspera?.cliente || ''}
              >
                {fila.maiorEspera
                  ? `#${fila.maiorEspera.ticket ?? '?'} · ${fila.maiorEspera.cliente || 'Cliente desconhecido'}${fila.maiorEspera.emAndamento ? ' · ainda esperando' : ''}`
                  : 'sem atendimento hoje'}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function Numero({
  icone: Icone,
  rotulo,
  valor,
  cor = 'text-foreground',
}: {
  icone: typeof Activity
  rotulo: string
  valor: number
  cor?: string
}) {
  return (
    <div className="min-w-0 bg-background/60 px-2.5 py-2">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icone className={cn('h-3 w-3 shrink-0', cor !== 'text-foreground' && cor)} aria-hidden="true" />
        <span className="truncate">{rotulo}</span>
      </div>
      <p className={cn('mt-1.5 text-xl font-semibold tracking-tight tabular-nums', cor)}>
        {valor}
      </p>
    </div>
  )
}
