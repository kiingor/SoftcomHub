'use client'

import { useEffect, useState } from 'react'
import { Coffee } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { computePausaElapsedMs, formatPausaStatusLabel, isPausaEstourada } from '@/lib/pausa-status'
import { cn } from '@/lib/utils'

export interface PausaInfo {
  nome: string
  inicio: string
  tempoMaximoMinutos: number | null
}

export interface TipoDePausaOpcao {
  id: string
  nome: string
}

export interface AtendenteCardProps {
  nome: string
  isOnline: boolean
  pausaInfo?: PausaInfo | null
  /** Um atendente pode estar em pausa sem que os dados dela tenham carregado. */
  emPausa: boolean
  ticketsAtivos: number
  /**
   * Tipos que a supervisão pode escolher para reetiquetar a pausa em andamento
   * — já filtrados pelo setor da pausa, por `ativo` e sem o tipo que já está
   * valendo. Vazio esconde o controle, e é assim que quem não é supervisor
   * daquele setor não o vê: a página não manda opção nenhuma. A tela esconder
   * não é a trava — o servidor recusa de qualquer forma.
   */
  tiposDePausa?: TipoDePausaOpcao[]
  onTrocarTipoDePausa?: (tipoId: string) => Promise<void>
}

/**
 * Card de atendente do painel de monitoramento.
 *
 * O relógio de 1s vive AQUI, e não na página: só o tempo de pausa precisa dessa
 * cadência. Quando o tick ficava no componente raiz, a página inteira — tabelas
 * de tickets incluídas — re-renderizava a cada segundo sem necessidade, já que
 * os tempos das tabelas vêm de `useMemo` e só mudam quando os dados chegam.
 */
export function AtendenteCard({
  nome,
  isOnline,
  pausaInfo,
  emPausa,
  ticketsAtivos,
  tiposDePausa = [],
  onTrocarTipoDePausa,
}: AtendenteCardProps) {
  const [agora, setAgora] = useState(() => Date.now())
  const [trocando, setTrocando] = useState(false)

  useEffect(() => {
    if (!emPausa) return
    const intervalo = setInterval(() => setAgora(Date.now()), 1000)
    return () => clearInterval(intervalo)
  }, [emPausa])

  const pausaElapsedMs = emPausa ? computePausaElapsedMs(pausaInfo, agora) : 0
  const pausaEstourada = emPausa && isPausaEstourada(pausaInfo, pausaElapsedMs)
  const podeTrocarPausa = emPausa && !!onTrocarTipoDePausa && tiposDePausa.length > 0

  const trocarTipoDePausa = async (tipoId: string) => {
    if (!onTrocarTipoDePausa || !tipoId) return
    setTrocando(true)
    try {
      await onTrocarTipoDePausa(tipoId)
    } finally {
      setTrocando(false)
    }
  }

  return (
    <div className="rounded-xl border bg-card/60 px-4 py-3 transition-colors hover:bg-muted/40">
      <div className="flex items-center gap-3">
        <span
          className={cn(
            'h-3 w-3 shrink-0 rounded-full',
            isOnline ? 'bg-green-500' : pausaEstourada ? 'bg-red-500' : emPausa ? 'bg-yellow-500' : 'bg-gray-400',
          )}
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{nome}</p>
          <p className={cn(
            'text-xs truncate',
            isOnline
              ? 'text-green-600 dark:text-green-400'
              : pausaEstourada
                ? 'text-red-600 dark:text-red-400 font-medium'
                : emPausa
                  ? 'text-yellow-600 dark:text-yellow-400'
                  : 'text-muted-foreground',
          )}>
            {/* formatPausaStatusLabel e não formatPausaLabel: acrescenta
                "· limite excedido" em texto, para o aviso não depender só da cor. */}
            {isOnline ? 'Online' : emPausa ? formatPausaStatusLabel(pausaInfo, pausaElapsedMs) : 'Offline'}
          </p>
        </div>
        {ticketsAtivos > 0 && (
          <Badge variant="secondary" className="shrink-0 text-[10px]">
            {ticketsAtivos} {ticketsAtivos === 1 ? 'ticket' : 'tickets'}
          </Badge>
        )}
      </div>

      {/* Trocar o TIPO da pausa em andamento. O cronômetro NÃO zera: a rota faz
          UPDATE do tipo na mesma instância, então o tempo decorrido passa a ser
          julgado pelo limite do tipo novo — que é o motivo da correção existir. */}
      {podeTrocarPausa && (
        <div className="mt-2 flex items-center gap-2 border-t pt-2">
          <Coffee className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <Select
            value=""
            disabled={trocando}
            onValueChange={trocarTipoDePausa}
          >
            <SelectTrigger className="h-7 flex-1 text-xs" aria-label={`Trocar o tipo de pausa de ${nome}`}>
              <SelectValue placeholder={trocando ? 'Alterando...' : 'Trocar tipo de pausa'} />
            </SelectTrigger>
            <SelectContent>
              {tiposDePausa.map((tipo) => (
                <SelectItem key={tipo.id} value={tipo.id} className="text-xs">
                  {tipo.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  )
}
