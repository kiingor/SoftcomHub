import { variantesDeTelefoneBR } from '@/lib/phone'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Estado em que o cliente foi entregue ao fluxo de avaliação (NPS) do n8n.
 *
 * Enquanto o ticket está assim, as mensagens do cliente são consumidas pela
 * avaliação e não chegam ao WorkDesk. Quem sai daqui é o n8n — o Hub só espelha.
 */
export const STATUS_AVALIACAO = 'avaliar'

export interface AvaliacaoEncerrada {
  id: string
  numero: number | null
  setor_id: string | null
}

interface TicketEmAvaliacao {
  id: string
  numero: number | null
  setor_id: string | null
  encerrado_em: string | null
}

/**
 * Encerra a avaliação pendente do dono deste telefone, em QUALQUER setor.
 *
 * O caso que originou isto (04/09/2026): o #183439 do ServiceDesk foi encerrado
 * às 14:11 e o cliente entrou no NPS; às 14:18 o Especialista Ativo disparou o
 * #183657 para o mesmo aparelho. O cliente recebeu a mensagem e não conseguiu
 * responder — nenhuma mensagem dele chegou ao Hub depois disso, e o atendente
 * encerrou às 15:01 com "não obtivemos resposta". A avaliação não respeita
 * fronteira de setor porque o cliente é um só: preso no NPS de um setor, ele
 * está mudo para todos.
 *
 * Duas armadilhas que a implementação evita de propósito:
 *
 *  1. Casar por `cliente_id` não serve. O mesmo WhatsApp tem cadastro com e sem
 *     o nono dígito (558388330154 e 5583988330154 no caso real) — a busca é
 *     por todas as {@link variantesDeTelefoneBR}.
 *  2. Filtrar por setor com NPS ligado não serve. O flag `webhook_eventos` do
 *     Hub é ignorado pelo n8n: o ServiceDesk Matriz Chat tem avaliação
 *     desligada e mesmo assim produziu 645 das 991 avaliações da semana de
 *     28/08–04/09. O que vale é o status real do ticket.
 *
 * Nunca lança: um disparo não pode falhar porque a limpeza da avaliação falhou.
 * Devolve os tickets que saíram de 'avaliar'.
 */
export async function encerrarAvaliacaoPendente(
  supabase: Pick<SupabaseClient, 'from'>,
  telefone: string | null | undefined,
  origem: string,
): Promise<AvaliacaoEncerrada[]> {
  const variantes = variantesDeTelefoneBR(telefone)
  if (variantes.length === 0) return []

  try {
    // Teto explícito porque são no máximo duas formas do mesmo telefone: se
    // aparecer mais que isso, é cadastro sujo e não silêncio do PostgREST.
    const { data: clientes, error: clientesErro } = await supabase
      .from('clientes')
      .select('id')
      .in('telefone', variantes)
      .limit(10)

    if (clientesErro) {
      console.warn(`[${origem}] não foi possível procurar o cliente da avaliação:`, clientesErro.code)
      return []
    }

    const clienteIds = (clientes || []).map((c: { id: string }) => c.id)
    if (clienteIds.length === 0) return []

    // Um cliente tem uma avaliação pendente, não mil — mas o corte silencioso
    // de 1.000 do PostgREST passaria despercebido sem um teto declarado.
    const { data: tickets, error: ticketsErro } = await supabase
      .from('tickets')
      .select('id, numero, setor_id, encerrado_em')
      .in('cliente_id', clienteIds)
      .eq('status', STATUS_AVALIACAO)
      .limit(50)

    if (ticketsErro) {
      console.warn(`[${origem}] não foi possível ler a avaliação pendente:`, ticketsErro.code)
      return []
    }

    const pendentes = (tickets || []) as TicketEmAvaliacao[]
    if (pendentes.length === 0) return []

    const agora = new Date().toISOString()
    // O ticket já costuma ter `encerrado_em` — o n8n o move para 'avaliar'
    // DEPOIS do encerramento. Preservar essa marca é o que mantém honesto o
    // tempo de atendimento nos relatórios; só quem chegou sem ela recebe agora.
    const jaEncerrados = pendentes.filter((t) => t.encerrado_em).map((t) => t.id)
    const semMarca = pendentes.filter((t) => !t.encerrado_em).map((t) => t.id)

    if (jaEncerrados.length > 0) {
      const { error } = await supabase
        .from('tickets')
        .update({ status: 'encerrado' })
        .in('id', jaEncerrados)
      if (error) {
        console.warn(`[${origem}] não foi possível encerrar a avaliação:`, error.code)
        return []
      }
    }
    if (semMarca.length > 0) {
      const { error } = await supabase
        .from('tickets')
        .update({ status: 'encerrado', encerrado_em: agora })
        .in('id', semMarca)
      if (error) {
        console.warn(`[${origem}] não foi possível encerrar a avaliação:`, error.code)
        return []
      }
    }

    // Sem este rastro o ticket muda de status sozinho e ninguém sabe por quê.
    const { error: msgErro } = await supabase.from('mensagens').insert(
      pendentes.map((t) => ({
        ticket_id: t.id,
        remetente: 'sistema',
        conteudo:
          'Avaliação encerrada automaticamente: um novo disparo foi enviado para este cliente.',
        tipo: 'texto',
        enviado_em: agora,
      })),
    )
    if (msgErro) {
      console.warn(`[${origem}] avaliação encerrada, mas sem registro na conversa:`, msgErro.code)
    }

    console.log(
      `[${origem}] avaliação encerrada para liberar o disparo — tickets: ${pendentes.map((t) => t.numero ?? t.id).join(', ')}`,
    )

    return pendentes.map((t) => ({ id: t.id, numero: t.numero, setor_id: t.setor_id }))
  } catch (erro) {
    console.warn(
      `[${origem}] falha inesperada ao encerrar a avaliação:`,
      erro instanceof Error ? erro.message : 'erro desconhecido',
    )
    return []
  }
}
