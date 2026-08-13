'use client'

import { useEffect, useState } from 'react'
import { Coffee, Play, Power } from 'lucide-react'

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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
   * Supervisiono o setor deste atendente? Falso esconde TODOS os controles.
   * A tela esconder não é a trava — o servidor recusa de qualquer forma; isto
   * só evita oferecer o que o POST negaria.
   */
  podeSupervisionar?: boolean
  /**
   * Tipos que a supervisão pode escolher para reetiquetar a pausa em andamento
   * — já filtrados pelo setor da pausa, por `ativo` e sem o tipo que já está
   * valendo. Vazio esconde o controle: quem não é supervisor daquele setor não
   * recebe opção nenhuma.
   */
  tiposDePausa?: TipoDePausaOpcao[]
  /**
   * Tipos para COLOCAR em pausa quem não está — dos setores do atendente que eu
   * supervisiono, ativos. Lista à parte de `tiposDePausa` porque o recorte é
   * outro: lá o setor é o da pausa que já existe, aqui é o do vínculo.
   */
  tiposParaIniciarPausa?: TipoDePausaOpcao[]
  onTrocarTipoDePausa?: (tipoId: string) => Promise<void>
  onIniciarPausa?: (tipoId: string) => Promise<void>
  onEncerrarPausa?: () => Promise<void>
  onDefinirDisponibilidade?: (isOnline: boolean) => Promise<void>
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
  podeSupervisionar = false,
  tiposDePausa = [],
  tiposParaIniciarPausa = [],
  onTrocarTipoDePausa,
  onIniciarPausa,
  onEncerrarPausa,
  onDefinirDisponibilidade,
}: AtendenteCardProps) {
  const [agora, setAgora] = useState(() => Date.now())
  const [executando, setExecutando] = useState(false)
  // A ação fica pendurada aqui até o gestor confirmar o aviso dos tickets.
  const [aConfirmar, setAConfirmar] = useState<{ rotulo: string; executar: () => Promise<void> } | null>(null)

  useEffect(() => {
    if (!emPausa) return
    const intervalo = setInterval(() => setAgora(Date.now()), 1000)
    return () => clearInterval(intervalo)
  }, [emPausa])

  const pausaElapsedMs = emPausa ? computePausaElapsedMs(pausaInfo, agora) : 0
  const pausaEstourada = emPausa && isPausaEstourada(pausaInfo, pausaElapsedMs)
  const podeTrocarPausa = podeSupervisionar && emPausa && !!onTrocarTipoDePausa && tiposDePausa.length > 0
  const podeIniciarPausa = podeSupervisionar && !emPausa && !!onIniciarPausa && tiposParaIniciarPausa.length > 0
  const podeEncerrarPausa = podeSupervisionar && emPausa && !!onEncerrarPausa
  const podeDefinirDisponibilidade = podeSupervisionar && !!onDefinirDisponibilidade
  const temControles = podeTrocarPausa || podeIniciarPausa || podeEncerrarPausa || podeDefinirDisponibilidade
  // Em pausa, o botão de status vale por "Ficar Offline": alternar ofereceria
  // "Deixar online", que é o que o botão de tirar da pausa ao lado já faz.
  const statusAlvoOnline = emPausa ? false : !isOnline

  const executar = async (acao: () => Promise<void>) => {
    setExecutando(true)
    try {
      await acao()
    } finally {
      setExecutando(false)
    }
  }

  /**
   * Ticket aberto NÃO bloqueia a ação — bloquear tornaria a ferramenta inútil
   * exatamente no caso que a motivou, o atendente que sumiu COM tickets
   * abertos. Os tickets seguem atribuídos a ele; o gestor só é avisado de
   * quantos são antes de confirmar. Sem ticket aberto não há o que avisar, e a
   * ação vai direto.
   */
  const pedir = (rotulo: string, acao: () => Promise<void>) => {
    if (ticketsAtivos > 0) {
      setAConfirmar({ rotulo, executar: acao })
      return
    }
    void executar(acao)
  }

  const confirmar = async () => {
    const pendente = aConfirmar
    setAConfirmar(null)
    if (pendente) await executar(pendente.executar)
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

      {temControles && (
        <div className="mt-2 space-y-2 border-t pt-2">
          {/* Em pausa: trocar o TIPO. O cronômetro NÃO zera — a rota faz UPDATE
              do tipo na mesma instância, então o tempo decorrido passa a ser
              julgado pelo limite do tipo novo, que é o motivo da correção
              existir. Fora de pausa: COLOCAR em pausa, que abre instância nova. */}
          {(podeTrocarPausa || podeIniciarPausa) && (
            <div className="flex items-center gap-2">
              <Coffee className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <Select
                value=""
                disabled={executando}
                onValueChange={(tipoId) => {
                  if (!tipoId) return
                  pedir(
                    emPausa ? 'trocar o tipo da pausa' : 'colocar em pausa',
                    async () => {
                      if (emPausa) await onTrocarTipoDePausa?.(tipoId)
                      else await onIniciarPausa?.(tipoId)
                    },
                  )
                }}
              >
                <SelectTrigger
                  className="h-7 flex-1 text-xs"
                  aria-label={emPausa ? `Trocar o tipo de pausa de ${nome}` : `Colocar ${nome} em pausa`}
                >
                  <SelectValue
                    placeholder={
                      executando
                        ? 'Alterando...'
                        : emPausa
                          ? 'Trocar tipo de pausa'
                          : 'Colocar em pausa'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {(emPausa ? tiposDePausa : tiposParaIniciarPausa).map((tipo) => (
                    <SelectItem key={tipo.id} value={tipo.id} className="text-xs">
                      {tipo.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {(podeEncerrarPausa || podeDefinirDisponibilidade) && (
            <div className="flex items-center gap-2">
              {/* Os dois botões que o painel do atendente mostra em pausa:
                  "Voltar ao Atendimento" e "Ficar Offline". Em pausa o botão de
                  status manda para OFFLINE, e não alterna — alternar ofereceria
                  "Deixar online", que é a mesma coisa que tirar da pausa. */}
              {podeEncerrarPausa && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={executando}
                  className="h-7 flex-1 gap-1.5 text-xs"
                  onClick={() => pedir('tirar da pausa', async () => { await onEncerrarPausa?.() })}
                >
                  <Play className="h-3 w-3" aria-hidden="true" />
                  Tirar da pausa
                </Button>
              )}
              {podeDefinirDisponibilidade && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={executando}
                  className="h-7 flex-1 gap-1.5 text-xs"
                  onClick={() => pedir(
                    statusAlvoOnline ? 'deixar online' : 'deixar offline',
                    async () => { await onDefinirDisponibilidade?.(statusAlvoOnline) },
                  )}
                >
                  <Power className="h-3 w-3" aria-hidden="true" />
                  {statusAlvoOnline ? 'Deixar online' : 'Deixar offline'}
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      <AlertDialog open={!!aConfirmar} onOpenChange={(aberto) => { if (!aberto) setAConfirmar(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {nome} tem {ticketsAtivos} {ticketsAtivos === 1 ? 'ticket aberto' : 'tickets abertos'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {ticketsAtivos === 1 ? 'Ele continua' : 'Eles continuam'} atribuído
              {ticketsAtivos === 1 ? '' : 's'} a {nome} — nada é devolvido para a fila.
              Confirma {aConfirmar?.rotulo}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmar}>Confirmar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
