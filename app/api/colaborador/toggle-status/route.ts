import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { hasSupervisorScope, type TransferActor } from '@/lib/transfer-authorization'
import {
  avaliarTrocaDePausa,
  podeAlterarStatusDe,
  RECUSA_DA_TROCA,
  type AlvoDaSupervisao,
  type AtorDaSupervisao,
} from '@/lib/pausa-supervisao'

/**
 * POST /api/colaborador/toggle-status
 *
 * Duas operações, distinguidas por `trocarTipoPausaId`:
 *
 *   1. STATUS (comportamento histórico, corpo inalterado)
 *      { colaboradorId, isOnline, pausaAtualId? }
 *      Grava is_online / pausa_atual_id / last_heartbeat em `colaboradores`.
 *      `pausaAtualId` referencia `pausas_colaboradores` (a INSTÂNCIA), nunca
 *      `pausas` (o catálogo de tipos) — id do catálogo aqui grava FK inválida.
 *
 *   2. TROCA DE TIPO DE PAUSA (caso #97218)
 *      { colaboradorId, trocarTipoPausaId }
 *      Reetiqueta a pausa que já está aberta. NÃO toca em `colaboradores`:
 *      nem em is_online (a pessoa continua em pausa), nem em last_heartbeat —
 *      bater o heartbeat do alvo a partir da ação do supervisor fingiria uma
 *      presença que não houve, e é justamente esse campo que a distribuição
 *      olha para decidir se manda ticket.
 *
 * ── SEGURANÇA ──────────────────────────────────────────────────────────────
 * A rota usa service_role, que ignora RLS por completo, e até o caso #97218 não
 * tinha checagem NENHUMA: qualquer POST anônimo com um colaboradorId derrubava
 * ou "pausava" quem quisesse — inclusive o setor inteiro, um id por vez. Agora
 * exige sessão sempre, e permissão de supervisão para mexer em OUTRA pessoa.
 * O critério de supervisor é `hasSupervisorScope`, o mesmo de
 * /api/tickets/transferir e do bloqueio de devolução do caso #97066; não há um
 * segundo critério aqui.
 *
 * O colaborador mexendo no PRÓPRIO status continua passando direto — é o
 * caminho quente, usado pelo WorkDesk (layout e painel de disponibilidade) o
 * dia inteiro, e por isso o caso "sou eu mesmo" nem chega a consultar vínculo.
 */
export async function POST(request: NextRequest) {
  try {
    const authClient = await createServerClient()
    const {
      data: { user },
    } = await authClient.auth.getUser()

    if (!user?.email) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const supabase = createServiceClient()
    const body = await request.json()

    const { colaboradorId, isOnline, pausaAtualId, trocarTipoPausaId } = body as {
      colaboradorId?: string
      isOnline?: boolean
      pausaAtualId?: string | null
      trocarTipoPausaId?: string
    }

    if (!colaboradorId) {
      return NextResponse.json({ error: 'colaboradorId required' }, { status: 400 })
    }

    // O ator é resolvido por E-MAIL, e não por id: colaboradores.id não é
    // garantidamente o auth.uid() (os dois caminhos de criação divergem). É como
    // requireAdmin, useColaborador e o layout do WorkDesk resolvem.
    const { data: ator, error: atorError } = await supabase
      .from('colaboradores')
      .select('id, nome, email, ativo, is_master, setor_id, permissoes:permissao_id(can_see_all_tickets)')
      .eq('email', user.email)
      .maybeSingle()

    if (atorError) {
      console.error('[toggle-status] Erro ao buscar colaborador:', atorError)
      return NextResponse.json({ error: 'Erro ao validar colaborador' }, { status: 500 })
    }
    if (!ator?.ativo) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
    }

    const ehOProprio = ator.id === colaboradorId
    const atorPermissoes = Array.isArray(ator.permissoes) ? ator.permissoes[0] : ator.permissoes
    const atorCanSeeAllTickets = atorPermissoes?.can_see_all_tickets === true

    // Vínculos só interessam quando o alvo é outra pessoa — e nem aí para o
    // master, que manda em qualquer setor. Poupa duas consultas no caminho
    // quente do WorkDesk.
    //
    // O teto de 200 nas duas leituras de vínculo não corta dado real (uma
    // pessoa é ligada a um punhado de setores): existe para a consulta não ir
    // sem limite, que é como o PostgREST trunca em 1.000 calado.
    let atorLinkedSetorIds: string[] = ator.setor_id ? [ator.setor_id] : []
    if (!ehOProprio && ator.is_master !== true && atorCanSeeAllTickets) {
      const { data: vinculos, error: vinculosError } = await supabase
        .from('colaboradores_setores')
        .select('setor_id')
        .eq('colaborador_id', ator.id)
        .limit(200)

      if (vinculosError) {
        console.error('[toggle-status] Erro ao validar setores do ator:', vinculosError)
        return NextResponse.json({ error: 'Erro ao validar os setores do colaborador' }, { status: 500 })
      }
      atorLinkedSetorIds = Array.from(new Set([
        ...atorLinkedSetorIds,
        ...(vinculos || []).map((v: { setor_id: string }) => v.setor_id),
      ]))
    }

    const transferActor: TransferActor = {
      id: ator.id,
      isMaster: ator.is_master === true,
      canSeeAllTickets: atorCanSeeAllTickets,
      linkedSetorIds: atorLinkedSetorIds,
    }
    const atorDaSupervisao: AtorDaSupervisao = {
      id: ator.id,
      temEscopoNoSetor: (setorId: string) => hasSupervisorScope(transferActor, setorId),
    }

    // Setores do ALVO: o vínculo real está em `colaboradores_setores`;
    // `colaboradores.setor_id` é legado e vem nulo em quase todo mundo.
    async function carregarSetoresDoAlvo(setorLegado: string | null): Promise<string[] | null> {
      const base = setorLegado ? [setorLegado] : []
      if (ehOProprio) return base
      const { data: vinculos, error } = await supabase
        .from('colaboradores_setores')
        .select('setor_id')
        .eq('colaborador_id', colaboradorId!)
        .limit(200)

      if (error) {
        console.error('[toggle-status] Erro ao validar setores do alvo:', error)
        return null
      }
      return Array.from(new Set([
        ...base,
        ...(vinculos || []).map((v: { setor_id: string }) => v.setor_id),
      ]))
    }

    // ── Operação 2: troca do TIPO da pausa aberta ────────────────────────────
    if (trocarTipoPausaId) {
      return await trocarTipoDaPausa({
        supabase,
        ator: { ...atorDaSupervisao, nome: ator.nome, email: ator.email },
        colaboradorId,
        trocarTipoPausaId,
        carregarSetoresDoAlvo,
      })
    }

    // ── Operação 1: status online/offline ────────────────────────────────────
    if (typeof isOnline !== 'boolean') {
      return NextResponse.json({ error: 'isOnline (boolean) required' }, { status: 400 })
    }

    if (!ehOProprio) {
      const { data: alvo, error: alvoError } = await supabase
        .from('colaboradores')
        .select('id, setor_id')
        .eq('id', colaboradorId)
        .maybeSingle()

      if (alvoError) {
        console.error('[toggle-status] Erro ao buscar alvo:', alvoError)
        return NextResponse.json({ error: 'Erro ao validar colaborador' }, { status: 500 })
      }
      if (!alvo) {
        return NextResponse.json({ error: 'Colaborador não encontrado' }, { status: 404 })
      }

      const setorIds = await carregarSetoresDoAlvo(alvo.setor_id)
      if (setorIds === null) {
        return NextResponse.json({ error: 'Erro ao validar os setores do colaborador' }, { status: 500 })
      }
      const autorizado = podeAlterarStatusDe(atorDaSupervisao, {
        colaboradorId,
        setorIds,
        pausaAberta: null,
      })
      if (!autorizado) {
        return NextResponse.json(
          { error: 'Você não pode alterar o status de um atendente de um setor ao qual não está vinculado' },
          { status: 403 },
        )
      }
    }

    // setores_ativos_sessao NÃO é tocado por este endpoint — a configuração é
    // permanente e controlada pelo admin via dashboard. Toggle de online/offline
    // só muda is_online + pausa.
    const updateData: Record<string, unknown> = {
      is_online: isOnline,
      pausa_atual_id: pausaAtualId ?? null,
      last_heartbeat: new Date().toISOString(),
    }

    const { data, error } = await supabase
      .from('colaboradores')
      .update(updateData)
      .eq('id', colaboradorId)
      .select('id, is_online, pausa_atual_id')
      .single()

    if (error) {
      console.error('[toggle-status] Error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    console.log(`[toggle-status] Colaborador ${colaboradorId} → is_online=${isOnline}, pausa=${pausaAtualId ?? 'null'}`)

    // Quando colaborador fica offline, dispara reprocessamento da fila em fire-and-forget.
    // Garante que o último atendente saindo já desencadeia transbordo imediato,
    // sem esperar o cron periódico.
    if (isOnline === false) {
      import('@/lib/ticket-queue-processor')
        .then(({ processTicketQueue }) => {
          processTicketQueue().catch((err) =>
            console.error('[toggle-status] Erro no reprocessamento async:', err)
          )
        })
        .catch((err) =>
          console.error('[toggle-status] Erro ao carregar processTicketQueue:', err)
        )
    }

    return NextResponse.json({
      success: true,
      colaborador: data,
    })
  } catch (error: any) {
    console.error('[toggle-status] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * Reetiqueta a pausa aberta: UPDATE do `pausa_id` na linha de
 * `pausas_colaboradores`, preservando `inicio`.
 *
 * ── POR QUE UPDATE, E NÃO FECHAR-E-ABRIR OUTRA ──────────────────────────────
 * Fechar a instância e abrir outra ZERA o cronômetro, e o cronômetro é o motivo
 * da correção existir: `tempo_maximo_minutos` mora no TIPO, e a tela de
 * monitoramento compara o tempo desde `inicio` com o limite do tipo. Se o
 * atendente marcou "Banheiro" (limite curto) estando no almoço, reetiquetar tem
 * que fazer o MESMO tempo decorrido ser julgado pelo limite novo. Zerando, uma
 * ausência de 45 minutos volta a 00:00:00 e o alerta de "limite excedido" que
 * provocou a intervenção some no instante em que ela acontece — a ferramenta
 * lavaria justamente o problema que existe para mostrar.
 *
 * O relatório reforça: /api/painel/atendentes/produtividade soma linhas de
 * `pausas_colaboradores`. Fechar-e-abrir transforma UMA ausência em DUAS pausas
 * curtas, e a primeira ainda fica com o tipo errado — não preserva a verdade,
 * preserva o engano e ainda inventa uma pausa a mais.
 *
 * Fechar-e-abrir já EXISTE e quer dizer outra coisa: é o que
 * components/workdesk/disponibilidade-panel.tsx faz quando o próprio atendente
 * troca de pausa ("terminei o almoço, agora estou em reunião") — duas
 * atividades em sequência. A supervisão não está registrando outra atividade,
 * está corrigindo o rótulo da mesma. Ações diferentes, registros diferentes;
 * implementar as duas igual apagaria a diferença no relatório.
 *
 * O que se perde — o registro de que houve uma escolha errada — é exatamente o
 * que o rastro abaixo guarda.
 */
async function trocarTipoDaPausa({
  supabase,
  ator,
  colaboradorId,
  trocarTipoPausaId,
  carregarSetoresDoAlvo,
}: {
  supabase: ReturnType<typeof createServiceClient>
  ator: AtorDaSupervisao & { nome: string | null; email: string | null }
  colaboradorId: string
  trocarTipoPausaId: string
  carregarSetoresDoAlvo: (setorLegado: string | null) => Promise<string[] | null>
}) {
  const { data: alvo, error: alvoError } = await supabase
    .from('colaboradores')
    .select('id, nome, setor_id, pausa_atual_id')
    .eq('id', colaboradorId)
    .maybeSingle()

  if (alvoError) {
    console.error('[toggle-status] Erro ao buscar alvo da troca de pausa:', alvoError)
    return NextResponse.json({ error: 'Erro ao validar colaborador' }, { status: 500 })
  }
  if (!alvo) {
    return NextResponse.json({ error: 'Colaborador não encontrado' }, { status: 404 })
  }

  const setorIds = await carregarSetoresDoAlvo(alvo.setor_id)
  if (setorIds === null) {
    return NextResponse.json({ error: 'Erro ao validar os setores do colaborador' }, { status: 500 })
  }

  // A instância vem de `colaboradores.pausa_atual_id`, e não da linha mais
  // recente com `fim IS NULL`: é o ponteiro que a tela de monitoramento exibe,
  // então é essa a pausa que o supervisor está olhando quando decide trocar.
  let pausaAberta = null as AlvoDaSupervisao['pausaAberta']
  let tipoAtualNome: string | null = null
  let inicioDaPausa: string | null = null

  if (alvo.pausa_atual_id) {
    const { data: instancia, error: instanciaError } = await supabase
      .from('pausas_colaboradores')
      .select('id, colaborador_id, pausa_id, setor_id, inicio, fim, pausas(nome)')
      .eq('id', alvo.pausa_atual_id)
      .maybeSingle()

    if (instanciaError) {
      console.error('[toggle-status] Erro ao buscar pausa aberta:', instanciaError)
      return NextResponse.json({ error: 'Erro ao buscar a pausa atual' }, { status: 500 })
    }
    // `fim` preenchido = ponteiro desatualizado apontando para pausa encerrada;
    // vale como "não está em pausa", não como pausa aberta.
    if (instancia && instancia.colaborador_id === alvo.id && instancia.fim === null) {
      const tipoAtual = Array.isArray(instancia.pausas) ? instancia.pausas[0] : instancia.pausas
      pausaAberta = {
        id: instancia.id,
        pausaId: instancia.pausa_id,
        setorId: instancia.setor_id,
      }
      tipoAtualNome = (tipoAtual as { nome?: string } | null)?.nome ?? null
      inicioDaPausa = instancia.inicio
    }
  }

  const { data: tipoDestino, error: tipoError } = await supabase
    .from('pausas')
    .select('id, nome, setor_id, ativo')
    .eq('id', trocarTipoPausaId)
    .maybeSingle()

  if (tipoError) {
    console.error('[toggle-status] Erro ao buscar tipo de pausa:', tipoError)
    return NextResponse.json({ error: 'Erro ao validar o tipo de pausa' }, { status: 500 })
  }

  const avaliacao = avaliarTrocaDePausa(
    ator,
    { colaboradorId, setorIds, pausaAberta },
    tipoDestino ? { id: tipoDestino.id, setorId: tipoDestino.setor_id, ativo: tipoDestino.ativo === true } : null,
  )

  if (!avaliacao.permitido) {
    const recusa = RECUSA_DA_TROCA[avaliacao.motivo]
    return NextResponse.json({ error: recusa.erro }, { status: recusa.status })
  }

  // `.is('fim', null)` não é redundante: entre a leitura e a escrita o atendente
  // pode ter voltado do intervalo pelo WorkDesk. Sem isso a troca reetiquetaria
  // uma pausa já encerrada.
  const { data: atualizada, error: updateError } = await supabase
    .from('pausas_colaboradores')
    .update({ pausa_id: avaliacao.paraTipoId })
    .eq('id', avaliacao.instanciaId)
    .is('fim', null)
    .select('id, pausa_id, inicio')
    .maybeSingle()

  if (updateError) {
    console.error('[toggle-status] Erro ao trocar o tipo da pausa:', updateError)
    return NextResponse.json({ error: 'Erro ao trocar o tipo da pausa' }, { status: 500 })
  }
  if (!atualizada) {
    return NextResponse.json(
      { error: 'A pausa foi encerrada enquanto a troca era feita' },
      { status: 409 },
    )
  }

  // ── RASTRO ────────────────────────────────────────────────────────────────
  // Uma linha estruturada no log do servidor, e não uma tabela. Por quê:
  //
  //   • `auditoria_acesso_roteamento` está MERGEADA mas não aplicada, e mesmo
  //     aplicada não cobre este caso: os triggers dela são de `colaboradores` e
  //     das tabelas de vínculo/configuração — nenhum em `pausas_colaboradores`.
  //     Quando ela estiver de pé, um trigger nessa tabela é o destino natural
  //     deste registro, e aí ele pega até a escrita feita fora do app.
  //   • `disponibilidade_logs` parece o lugar, mas não é: não tem coluna de
  //     ator (não responderia "quem trocou"), o CHECK declarado no schema só
  //     admite 'online'/'offline', e ela alimenta o cálculo de produtividade —
  //     escrever ali falsificaria um relatório para registrar uma correção.
  //   • Tabela nova custaria migration num banco COMPARTILHADO com produção,
  //     para uma ação rara de supervisão.
  //
  // O UPDATE acima apaga o tipo antigo da linha; esta linha é o único lugar
  // onde ele sobrevive. Se um dia ela deixar de bastar, o caminho é o trigger.
  console.info('[toggle-status] pausa_tipo_alterado ' + JSON.stringify({
    instanciaId: avaliacao.instanciaId,
    setorId: avaliacao.setorId,
    inicioDaPausa,
    alvoId: alvo.id,
    alvoNome: alvo.nome,
    deTipoId: avaliacao.deTipoId,
    deTipoNome: tipoAtualNome,
    paraTipoId: avaliacao.paraTipoId,
    paraTipoNome: tipoDestino?.nome ?? null,
    atorId: ator.id,
    atorNome: ator.nome,
    atorEmail: ator.email,
    em: new Date().toISOString(),
  }))

  return NextResponse.json({
    success: true,
    pausa: {
      id: atualizada.id,
      pausa_id: atualizada.pausa_id,
      inicio: atualizada.inicio,
      nome: tipoDestino?.nome ?? null,
    },
  })
}
