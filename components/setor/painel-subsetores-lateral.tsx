'use client'

import { Layers, Timer } from 'lucide-react'

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { type ResumoTempoReal } from '@/lib/monitoramento-tempo-real'
import { cn } from '@/lib/utils'

export interface OpcaoSubsetor {
  id: string
  nome: string
}

export interface EspacoSubsetor {
  subsetorId: string
  resumo: ResumoTempoReal | null
}

/**
 * Acompanhamento de dois subsetores, na coluna lateral do Monitoramento.
 *
 * Fica ao lado do "Status dos atendentes", ocupando o vão que sobrava ali. O
 * card grande da esquerda soma o setor inteiro: "2 ativos, 0 na fila" não diz
 * se é o Suporte ou o Prime.
 *
 * Só DOIS espaços, escolhidos pelo gestor. Listar todos os subsetores enchia a
 * coluna e afogava justamente os dois que ele acompanha; o formato é compacto
 * porque a coluna tem um terço da largura.
 */
export function PainelSubsetoresLateral({
  opcoes,
  espacoA,
  espacoB,
  aoTrocarA,
  aoTrocarB,
  limiteEsperaMin = 15,
}: {
  opcoes: OpcaoSubsetor[]
  espacoA: EspacoSubsetor
  espacoB: EspacoSubsetor
  aoTrocarA: (id: string) => void
  aoTrocarB: (id: string) => void
  /** Acima disto a espera aparece destacada. */
  limiteEsperaMin?: number
}) {
  if (opcoes.length === 0) return null

  // Sem wrapper de Card: fica DENTRO do card de status dos atendentes, e
  // aninhar Card em Card renderiza borda e fundo duplicados.
  return (
    <section aria-label="Atendimento por subsetor">
      <p className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Layers className="h-4 w-4" aria-hidden="true" />
        Por subsetor
      </p>

      <div className="space-y-2">
        <Espaco
          rotulo="Primeiro subsetor"
          espaco={espacoA}
          opcoes={opcoes}
          aoTrocar={aoTrocarA}
          limiteEsperaMin={limiteEsperaMin}
        />
        <Espaco
          rotulo="Segundo subsetor"
          espaco={espacoB}
          opcoes={opcoes}
          aoTrocar={aoTrocarB}
          limiteEsperaMin={limiteEsperaMin}
        />
      </div>
    </section>
  )
}

function Espaco({
  rotulo,
  espaco,
  opcoes,
  aoTrocar,
  limiteEsperaMin,
}: {
  rotulo: string
  espaco: EspacoSubsetor
  opcoes: OpcaoSubsetor[]
  aoTrocar: (id: string) => void
  limiteEsperaMin: number
}) {
  const esperaAlta = (espaco.resumo?.maiorEsperaFilaMs ?? 0) > limiteEsperaMin * 60_000

  return (
    <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <Select value={espaco.subsetorId} onValueChange={aoTrocar}>
          <SelectTrigger
            className="h-7 w-[150px] border-0 bg-transparent px-1 text-sm font-medium shadow-none focus:ring-0"
            aria-label={rotulo}
          >
            <SelectValue placeholder="Escolher" />
          </SelectTrigger>
          <SelectContent>
            {opcoes.map((opcao) => (
              <SelectItem key={opcao.id} value={opcao.id}>{opcao.nome}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="shrink-0 text-xs text-muted-foreground tabular-nums">
          {espaco.resumo?.total ?? 0} ativos
        </p>
      </div>

      <div className="mt-2 grid grid-cols-3 gap-2">
        <Valor
          rotulo="Na fila"
          valor={String(espaco.resumo?.naFila ?? 0)}
          tom={(espaco.resumo?.naFila ?? 0) > 0 ? 'alerta' : undefined}
        />
        <Valor rotulo="Atendendo" valor={String(espaco.resumo?.emAtendimento ?? 0)} />
        <Valor
          rotulo="Maior espera"
          valor={formatarEsperaCurta(espaco.resumo?.maiorEsperaFilaMs ?? 0)}
          tom={esperaAlta ? 'critico' : undefined}
          icone={esperaAlta}
        />
      </div>
    </div>
  )
}

/**
 * Na lateral não cabe `hh:mm:ss`. "22min" e "1h07" se leem de relance, que é o
 * uso real desta coluna — o número exato está no card grande ao lado.
 */
function formatarEsperaCurta(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '—'
  const minutos = Math.floor(ms / 60_000)
  if (minutos < 60) return `${minutos}min`
  const horas = Math.floor(minutos / 60)
  if (horas < 24) {
    const resto = minutos % 60
    return resto === 0 ? `${horas}h` : `${horas}h${String(resto).padStart(2, '0')}`
  }
  return `${Math.floor(horas / 24)}d`
}

function Valor({
  rotulo,
  valor,
  tom,
  icone = false,
}: {
  rotulo: string
  valor: string
  tom?: 'alerta' | 'critico'
  icone?: boolean
}) {
  return (
    <div className="min-w-0">
      <p className={cn(
        'flex items-center gap-1 text-base font-semibold tabular-nums',
        tom === 'alerta' && 'text-orange-600 dark:text-orange-400',
        tom === 'critico' && 'text-red-600 dark:text-red-400',
        !tom && 'text-foreground',
      )}>
        {icone && <Timer className="h-3 w-3 shrink-0" aria-hidden="true" />}
        <span className="truncate">{valor}</span>
      </p>
      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{rotulo}</p>
    </div>
  )
}

export { formatarEsperaCurta }
