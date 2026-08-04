'use client'

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

export interface SubsetorOption {
  id: string
  nome: string
}

export interface ColunaComparacao {
  subsetorId: string
  tickets: any[]
}

/** Um indicador já formatado, pronto para a coluna. */
export interface IndicadorComparacao {
  chave: string
  rotulo: string
  valor: string
  /** Quanto maior, melhor? Define a cor de quem lidera. */
  maiorEhMelhor: boolean
  /** Valor numérico para decidir quem lidera; null quando não comparável. */
  bruto: number | null
}

/**
 * Comparação de dois subsetores lado a lado.
 *
 * O gestor do ServiceDesk acompanha Suporte e Prime ao mesmo tempo: os números
 * agregados do setor escondem que uma fila vai bem e a outra não. Duas colunas,
 * mesmas métricas, mesmo período — e o líder de cada linha fica destacado, que
 * é o que ele lê primeiro.
 */
export function ComparacaoSubsetores({
  opcoes,
  esquerda,
  direita,
  aoTrocarEsquerda,
  aoTrocarDireita,
  indicadoresEsquerda,
  indicadoresDireita,
}: {
  opcoes: SubsetorOption[]
  esquerda: string
  direita: string
  aoTrocarEsquerda: (id: string) => void
  aoTrocarDireita: (id: string) => void
  indicadoresEsquerda: IndicadorComparacao[]
  indicadoresDireita: IndicadorComparacao[]
}) {
  const porChaveDireita = new Map(indicadoresDireita.map((i) => [i.chave, i]))

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <SeletorColuna rotulo="Coluna da esquerda" valor={esquerda} opcoes={opcoes} aoTrocar={aoTrocarEsquerda} />
        <SeletorColuna rotulo="Coluna da direita" valor={direita} opcoes={opcoes} aoTrocar={aoTrocarDireita} />
      </div>

      {esquerda === direita && (
        <p className="rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">
          As duas colunas mostram o mesmo subsetor. Escolha outro de um dos lados
          para a comparação fazer sentido.
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] border-separate border-spacing-y-2">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-2.5 pb-1 text-left font-medium">Indicador</th>
              <th className="px-2.5 pb-1 text-right font-medium">
                {opcoes.find((o) => o.id === esquerda)?.nome || '—'}
              </th>
              <th className="px-2.5 pb-1 text-right font-medium">
                {opcoes.find((o) => o.id === direita)?.nome || '—'}
              </th>
            </tr>
          </thead>
          <tbody>
            {indicadoresEsquerda.map((indicador) => {
              const oposto = porChaveDireita.get(indicador.chave)
              const lider = definirLider(indicador, oposto)

              return (
                <tr key={indicador.chave} className="bg-card/60">
                  <td className="rounded-l-lg px-2.5 py-2 text-sm text-muted-foreground">
                    {indicador.rotulo}
                  </td>
                  <td className={cn(
                    'px-2.5 py-2 text-right text-sm font-semibold tabular-nums',
                    lider === 'esquerda' && 'text-green-600 dark:text-green-400',
                  )}>
                    {indicador.valor}
                  </td>
                  <td className={cn(
                    'rounded-r-lg px-2.5 py-2 text-right text-sm font-semibold tabular-nums',
                    lider === 'direita' && 'text-green-600 dark:text-green-400',
                  )}>
                    {oposto?.valor ?? '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/** Nenhum lado é destacado quando empatam ou quando falta número dos dois. */
function definirLider(
  esquerda: IndicadorComparacao,
  direita: IndicadorComparacao | undefined,
): 'esquerda' | 'direita' | null {
  if (!direita) return null
  if (esquerda.bruto === null || direita.bruto === null) return null
  if (esquerda.bruto === direita.bruto) return null

  const esquerdaLidera = esquerda.maiorEhMelhor
    ? esquerda.bruto > direita.bruto
    : esquerda.bruto < direita.bruto

  return esquerdaLidera ? 'esquerda' : 'direita'
}

function SeletorColuna({
  rotulo,
  valor,
  opcoes,
  aoTrocar,
}: {
  rotulo: string
  valor: string
  opcoes: SubsetorOption[]
  aoTrocar: (id: string) => void
}) {
  return (
    <label className="space-y-1.5">
      <span className="text-xs text-muted-foreground">{rotulo}</span>
      <Select value={valor} onValueChange={aoTrocar}>
        <SelectTrigger className="w-full" size="sm" aria-label={rotulo}>
          <SelectValue placeholder="Escolha um subsetor" />
        </SelectTrigger>
        <SelectContent>
          {opcoes.map((opcao) => (
            <SelectItem key={opcao.id} value={opcao.id}>{opcao.nome}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  )
}
