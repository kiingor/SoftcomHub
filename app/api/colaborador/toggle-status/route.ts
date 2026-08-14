import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { hasSupervisorScope, type TransferActor } from '@/lib/transfer-authorization'
import {
  avaliarFimDePausa,
  avaliarInicioDePausa,
  avaliarTrocaDePausa,
  podeAlterarStatusDe,
  RECUSA_DA_SUPERVISAO,
  type AlvoDaSupervisao,
  type AtorDaSupervisao,
} from '@/lib/pausa-supervisao'

/**
 * POST /api/colaborador/toggle-status
 *
 * Quatro operações, distinguidas pelo corpo:
 *
 *   1. STATUS (comportamento histórico, corpo inalterado)
 *      { colaboradorId, isOnline, pausaAtualId? }
 *      Grava is_online / pausa_atual_id / last_heartbeat em `colaboradores`.
 *      `pausaAtualId` referencia `pausas_colaboradores` (a INSTÂNCIA), nunca
 *      `pausas` (o catálogo de tipos) — id do catálogo aqui grava FK inválida.
 *      Quando o ponteiro é LIMPO, a instância aberta é encerrada junto: ver
 *      {@link encerrarInstanciaAberta}.
 *
 *   2. TROCA DE TIPO DE PAUSA (caso #97218)
 *      { colaboradorId, trocarTipoPausaId }
 *      Reetiqueta a pausa que já está aberta. NÃO toca em `colaboradores`:
 *      nem em is_online (a pessoa continua em pausa), nem em last_heartbeat —
 *      bater o heartbeat do alvo a partir da ação do supervisor fingiria uma
 *      presença que não houve, e é justamente esse campo que a distribuição
 *      olha para decidir se manda ticket.
 *
 *   3. COLOCAR EM PAUSA (caso #97218)
 *      { colaboradorId, iniciarPausaId }
 *      INSERT em `pausas_colaboradores` + ponteiro em `colaboradores`, no mesmo
 *      formato que o próprio atendente já grava pelo WorkDesk.
 *
 *   4. TIRAR DA PAUSA (caso #97218)
 *      { colaboradorId, encerrarPausa: true }
 *      Fecha a instância (`fim`) e devolve a pessoa ao atendimento.
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

    const { colaboradorId, isOnline, pausaAtualId, trocarTipoPausaId, iniciarPausaId, encerrarPausa } = body as {
      colaboradorId?: string
      isOnline?: boolean
      pausaAtualId?: string | null
      trocarTipoPausaId?: string
      iniciarPausaId?: string
      encerrarPausa?: boolean
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
    //
    // No caminho quente (o próprio colaborador mudando o próprio status) a
    // consulta é pulada — a autorização nem olha para a lista. `sempre` existe
    // para o COLOCAR EM PAUSA, que precisa da lista mesmo sendo o próprio: é
    // ela que diz se o tipo escolhido é de um setor onde a pessoa trabalha.
    async function carregarSetoresDoAlvo(
      setorLegado: string | null,
      sempre = false,
    ): Promise<string[] | null> {
      const base = setorLegado ? [setorLegado] : []
      if (ehOProprio && !sempre) return base
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

    const atorComIdentidade = { ...atorDaSupervisao, nome: ator.nome, email: ator.email }

    // ── Operação 2: troca do TIPO da pausa aberta ────────────────────────────
    if (trocarTipoPausaId) {
      return await trocarTipoDaPausa({
        supabase,
        ator: atorComIdentidade,
        colaboradorId,
        trocarTipoPausaId,
        carregarSetoresDoAlvo,
      })
    }

    // ── Operação 3: colocar em pausa ─────────────────────────────────────────
    if (iniciarPausaId) {
      return await colocarEmPausa({
        supabase,
        ator: atorComIdentidade,
        colaboradorId,
        iniciarPausaId,
        carregarSetoresDoAlvo,
      })
    }

    // ── Operação 4: tirar da pausa ───────────────────────────────────────────
    if (encerrarPausa) {
      return await tirarDaPausa({
        supabase,
        ator: atorComIdentidade,
        colaboradorId,
        carregarSetoresDoAlvo,
      })
    }

    // ── Operação 1: status online/offline ────────────────────────────────────
    if (typeof isOnline !== 'boolean') {
      return NextResponse.json({ error: 'isOnline (boolean) required' }, { status: 400 })
    }

    let alvoNome: string | null = null
    if (!ehOProprio) {
      const { data: alvo, error: alvoError } = await supabase
        .from('colaboradores')
        .select('id, nome, setor_id')
        .eq('id', colaboradorId)
        .maybeSingle()

      if (alvoError) {
        console.error('[toggle-status] Erro ao buscar alvo:', alvoError)
        return NextResponse.json({ error: 'Erro ao validar colaborador' }, { status: 500 })
      }
      if (!alvo) {
        return NextResponse.json({ error: 'Colaborador não encontrado' }, { status: 404 })
      }
      alvoNome = alvo.nome

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

    // Limpar o ponteiro sem fechar a instância é o jeito de acumular ausência
    // eterna no relatório — ver {@link encerrarInstanciaAberta}.
    const instanciaEncerrada = (pausaAtualId ?? null) === null
      ? await encerrarInstanciaAberta(supabase, colaboradorId)
      : null

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

    if (!ehOProprio) {
      registrarRastro('status_alterado', {
        alvoId: colaboradorId,
        alvoNome,
        de: null,
        para: isOnline ? 'online' : 'offline',
        instanciaEncerrada,
        ator: atorComIdentidade,
      })
      await registrarDisponibilidade(supabase, colaboradorId, isOnline ? 'online' : 'offline')
    }

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

type Supabase = ReturnType<typeof createServiceClient>
type AtorIdentificado = AtorDaSupervisao & { nome: string | null; email: string | null }
type CarregarSetoresDoAlvo = (setorLegado: string | null, sempre?: boolean) => Promise<string[] | null>

/**
 * ── RASTRO ──────────────────────────────────────────────────────────────────
 * Uma linha estruturada no log do servidor, e não uma tabela. Por quê:
 *
 *   • `auditoria_acesso_roteamento` está MERGEADA mas não aplicada, e mesmo
 *     aplicada não cobre este caso: os triggers dela são de `colaboradores` e
 *     das tabelas de vínculo/configuração — nenhum em `pausas_colaboradores`.
 *     Quando ela estiver de pé, um trigger nessa tabela é o destino natural
 *     deste registro, e aí ele pega até a escrita feita fora do app.
 *   • `disponibilidade_logs` parece o lugar, mas não é: não tem coluna de ator
 *     (não responderia "quem mexeu") e alimenta o cálculo de produtividade —
 *     ela registra O QUE mudou, não QUEM mandou mudar. As duas coisas são
 *     gravadas, cada uma no seu lugar.
 *   • Tabela nova custaria migration num banco COMPARTILHADO com produção,
 *     para uma ação rara de supervisão.
 *
 * Formato único para as quatro ações: quem procura o que a supervisão fez com
 * um atendente filtra por `alvoId` e acha tudo, em vez de conhecer quatro
 * formatos. Se um dia deixar de bastar, o caminho é o trigger.
 */
function registrarRastro(
  acao: string,
  dados: Record<string, unknown> & { ator: AtorIdentificado },
) {
  const { ator, ...resto } = dados
  console.info(`[toggle-status] ${acao} ` + JSON.stringify({
    ...resto,
    atorId: ator.id,
    atorNome: ator.nome,
    atorEmail: ator.email,
    em: new Date().toISOString(),
  }))
}

/**
 * Fecha a pausa que estiver aberta para este colaborador e devolve o id dela.
 *
 * ── POR QUE ISTO EXISTE ─────────────────────────────────────────────────────
 * Limpar `colaboradores.pausa_atual_id` NÃO encerra a pausa: a linha de
 * `pausas_colaboradores` fica com `fim IS NULL` para sempre, e
 * /api/painel/atendentes/produtividade — que trata `fim` nulo como "pausa em
 * andamento" e conta até agora — passa a somar uma ausência que nunca termina.
 * O caminho de status já limpava o ponteiro sem fechar nada, e o logout do
 * WorkDesk manda exatamente isso ({ isOnline: false, pausaAtualId: null }):
 * quem saía do sistema em pausa deixava a instância aberta atrás de si.
 *
 * O filtro é `colaborador_id + fim IS NULL`, e não o ponteiro: o ponteiro pode
 * estar desatualizado (aponta para instância já encerrada) ou nulo justamente
 * porque alguém o limpou sem fechar. Quem procura a instância pelo ponteiro
 * não acha a órfã que precisa fechar.
 *
 * É o mesmo `update({ fim })` que components/workdesk/disponibilidade-panel.tsx
 * já faz — `duracao_minutos` fica nulo nos dois casos, ver
 * {@link tirarDaPausa}.
 */
async function encerrarInstanciaAberta(
  supabase: Supabase,
  colaboradorId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('pausas_colaboradores')
    .update({ fim: new Date().toISOString() })
    .eq('colaborador_id', colaboradorId)
    .is('fim', null)
    // O teto vale para o RETURNING, não para o UPDATE: uma pessoa tem no máximo
    // uma pausa aberta, e o `id` só volta para o rastro.
    .select('id')
    .limit(10)

  if (error) {
    console.error('[toggle-status] Erro ao encerrar a pausa aberta:', error)
    return null
  }
  return data?.[0]?.id ?? null
}

/**
 * Registra a mudança em `disponibilidade_logs` — mas só quando quem mandou foi
 * OUTRA pessoa.
 *
 * Quando é o próprio atendente, quem grava é o WorkDesk
 * (components/workdesk/disponibilidade-panel.tsx e app/workdesk/layout.tsx);
 * gravar aqui também duplicaria cada transição e a produtividade conta
 * transições. Pela ação da supervisão não passa cliente nenhum que grave — sem
 * esta linha, o relatório continuaria contando como online quem o gestor acabou
 * de derrubar, até a pessoa mesma mexer no status.
 *
 * Falha aqui NÃO derruba a operação: o estado real já foi gravado em
 * `colaboradores`, e perder a linha do relatório é menos grave do que devolver
 * erro para uma ação que aconteceu. O texto `pausa:<nome>` é o mesmo formato que
 * o painel do atendente grava — o CHECK que scripts/create-tables.sql declara só
 * admitiria 'online'/'offline', mas o painel escreve `pausa:` desde sempre e o
 * histórico exibe, então ou o CHECK não está aplicado ou a linha se perde; nos
 * dois casos o `catch` cobre.
 */
async function registrarDisponibilidade(
  supabase: Supabase,
  colaboradorId: string,
  status: string,
) {
  const { error } = await supabase
    .from('disponibilidade_logs')
    .insert({ colaborador_id: colaboradorId, status })
  if (error) {
    console.error('[toggle-status] Erro ao registrar disponibilidade:', error)
  }
}

/**
 * A instância de pausa que está valendo para o alvo, lida pelo PONTEIRO
 * `colaboradores.pausa_atual_id` — e não pela linha mais recente com
 * `fim IS NULL`: é o ponteiro que a tela de monitoramento exibe, então é essa a
 * pausa que o supervisor está olhando quando decide agir.
 */
async function carregarPausaAberta(
  supabase: Supabase,
  alvoId: string,
  pausaAtualId: string | null,
): Promise<
  | { erro: true }
  | { erro: false; pausaAberta: AlvoDaSupervisao['pausaAberta']; tipoNome: string | null; inicio: string | null }
> {
  if (!pausaAtualId) return { erro: false, pausaAberta: null, tipoNome: null, inicio: null }

  const { data: instancia, error } = await supabase
    .from('pausas_colaboradores')
    .select('id, colaborador_id, pausa_id, setor_id, inicio, fim, pausas(nome)')
    .eq('id', pausaAtualId)
    .maybeSingle()

  if (error) {
    console.error('[toggle-status] Erro ao buscar pausa aberta:', error)
    return { erro: true }
  }

  // `fim` preenchido = ponteiro desatualizado apontando para pausa encerrada;
  // vale como "não está em pausa", não como pausa aberta.
  if (!instancia || instancia.colaborador_id !== alvoId || instancia.fim !== null) {
    return { erro: false, pausaAberta: null, tipoNome: null, inicio: null }
  }

  const tipo = Array.isArray(instancia.pausas) ? instancia.pausas[0] : instancia.pausas
  return {
    erro: false,
    pausaAberta: { id: instancia.id, pausaId: instancia.pausa_id, setorId: instancia.setor_id },
    tipoNome: (tipo as { nome?: string } | null)?.nome ?? null,
    inicio: instancia.inicio,
  }
}

/**
 * COLOCAR EM PAUSA — INSERT em `pausas_colaboradores` e ponteiro em
 * `colaboradores`, no MESMO formato que o próprio atendente já grava pelo
 * WorkDesk (components/workdesk/disponibilidade-panel.tsx → `startPausa`).
 *
 * ── O QUE FOI ESPELHADO, E POR QUE ──────────────────────────────────────────
 * `is_online` vai a FALSE. É o que o painel do atendente faz ao entrar em pausa,
 * e divergir criaria dois estados diferentes para a mesma situação: `is_online`
 * é lido por lib/ticket-distribution.ts, por isAtendenteOnline (monitoramento e
 * setor) e pelo relatório de produtividade. Uma pausa aberta pelo gestor que
 * deixasse `is_online = true` apareceria "online e em pausa" em umas telas e
 * "em pausa" em outras.
 *
 * `inicio` NÃO é enviado: o DEFAULT NOW() da tabela carimba com o relógio do
 * banco, que é o mesmo que carimba `criado_em`. O painel do atendente também
 * omite — mandar o relógio do servidor de aplicação seria a terceira forma.
 *
 * `duracao_minutos` fica nulo aqui e no fechamento; ver {@link tirarDaPausa}.
 */
async function colocarEmPausa({
  supabase,
  ator,
  colaboradorId,
  iniciarPausaId,
  carregarSetoresDoAlvo,
}: {
  supabase: Supabase
  ator: AtorIdentificado
  colaboradorId: string
  iniciarPausaId: string
  carregarSetoresDoAlvo: CarregarSetoresDoAlvo
}) {
  const { data: alvo, error: alvoError } = await supabase
    .from('colaboradores')
    .select('id, nome, setor_id, pausa_atual_id')
    .eq('id', colaboradorId)
    .maybeSingle()

  if (alvoError) {
    console.error('[toggle-status] Erro ao buscar alvo do início de pausa:', alvoError)
    return NextResponse.json({ error: 'Erro ao validar colaborador' }, { status: 500 })
  }
  if (!alvo) {
    return NextResponse.json({ error: 'Colaborador não encontrado' }, { status: 404 })
  }

  // `sempre`: mesmo sendo o próprio, a lista de setores é necessária — é ela
  // que diz se o tipo escolhido é de um setor onde a pessoa trabalha.
  const setorIds = await carregarSetoresDoAlvo(alvo.setor_id, true)
  if (setorIds === null) {
    return NextResponse.json({ error: 'Erro ao validar os setores do colaborador' }, { status: 500 })
  }

  const instancia = await carregarPausaAberta(supabase, alvo.id, alvo.pausa_atual_id)
  if (instancia.erro) {
    return NextResponse.json({ error: 'Erro ao buscar a pausa atual' }, { status: 500 })
  }

  const { data: tipo, error: tipoError } = await supabase
    .from('pausas')
    .select('id, nome, setor_id, ativo')
    .eq('id', iniciarPausaId)
    .maybeSingle()

  if (tipoError) {
    console.error('[toggle-status] Erro ao buscar tipo de pausa:', tipoError)
    return NextResponse.json({ error: 'Erro ao validar o tipo de pausa' }, { status: 500 })
  }

  const avaliacao = avaliarInicioDePausa(
    ator,
    { colaboradorId, setorIds, pausaAberta: instancia.pausaAberta },
    tipo ? { id: tipo.id, setorId: tipo.setor_id, ativo: tipo.ativo === true } : null,
  )

  if (!avaliacao.permitido) {
    const recusa = RECUSA_DA_SUPERVISAO[avaliacao.motivo]
    return NextResponse.json({ error: recusa.erro }, { status: recusa.status })
  }

  const { data: aberta, error: insertError } = await supabase
    .from('pausas_colaboradores')
    .insert({
      colaborador_id: colaboradorId,
      pausa_id: avaliacao.paraTipoId,
      setor_id: avaliacao.setorId,
    })
    .select('id, inicio')
    .single()

  if (insertError || !aberta) {
    console.error('[toggle-status] Erro ao abrir a pausa:', insertError)
    return NextResponse.json({ error: 'Erro ao colocar o atendente em pausa' }, { status: 500 })
  }

  // Compare-and-set no ponteiro: entre a leitura e a escrita o atendente pode
  // ter entrado em pausa sozinho pelo WorkDesk. Sem a condição, a instância
  // dele ficaria aberta e sem ponteiro — a órfã que este caso veio corrigir.
  //
  // A comparação é com o ponteiro COMO ELE FOI LIDO, e não com null: chegar
  // aqui já garante que não há pausa aberta, mas o ponteiro pode estar
  // desatualizado (apontando para instância encerrada). Exigir null recusaria
  // toda pausa de quem tem ponteiro velho, que é justamente quem mais precisa.
  const ponteiroAnterior = alvo.pausa_atual_id
  let atualizacao = supabase
    .from('colaboradores')
    .update({
      is_online: false,
      pausa_atual_id: aberta.id,
      last_heartbeat: new Date().toISOString(),
    })
    .eq('id', colaboradorId)
  atualizacao = ponteiroAnterior
    ? atualizacao.eq('pausa_atual_id', ponteiroAnterior)
    : atualizacao.is('pausa_atual_id', null)

  const { data: colaborador, error: updateError } = await atualizacao
    .select('id, is_online, pausa_atual_id')
    .maybeSingle()

  if (updateError || !colaborador) {
    // Desfaz a instância recém-aberta: deixá-la para trás é o mesmo `fim IS NULL`
    // eterno, só que criado por nós.
    await supabase
      .from('pausas_colaboradores')
      .update({ fim: new Date().toISOString() })
      .eq('id', aberta.id)
      .is('fim', null)

    if (updateError) {
      console.error('[toggle-status] Erro ao apontar a pausa nova:', updateError)
      return NextResponse.json({ error: 'Erro ao colocar o atendente em pausa' }, { status: 500 })
    }
    return NextResponse.json(
      { error: 'O status do atendente mudou enquanto a pausa era aberta' },
      { status: 409 },
    )
  }

  registrarRastro('pausa_iniciada', {
    instanciaId: aberta.id,
    setorId: avaliacao.setorId,
    inicioDaPausa: aberta.inicio,
    alvoId: alvo.id,
    alvoNome: alvo.nome,
    de: 'sem pausa',
    paraTipoId: avaliacao.paraTipoId,
    paraTipoNome: tipo?.nome ?? null,
    ator,
  })

  if (ator.id !== colaboradorId) {
    await registrarDisponibilidade(supabase, colaboradorId, `pausa:${tipo?.nome ?? 'Pausa'}`)
  }

  // Mesmo fire-and-forget do caminho de status ao ficar offline: o último
  // atendente entrando em pausa já desencadeia o transbordo, sem esperar o cron.
  import('@/lib/ticket-queue-processor')
    .then(({ processTicketQueue }) => {
      processTicketQueue().catch((err) =>
        console.error('[toggle-status] Erro no reprocessamento async:', err)
      )
    })
    .catch((err) => console.error('[toggle-status] Erro ao carregar processTicketQueue:', err))

  return NextResponse.json({
    success: true,
    pausa: { id: aberta.id, pausa_id: avaliacao.paraTipoId, inicio: aberta.inicio, nome: tipo?.nome ?? null },
    colaborador,
  })
}

/**
 * TIRAR DA PAUSA — `fim` na instância E ponteiro limpo, nesta ordem.
 *
 * ── NÃO BASTA LIMPAR O PONTEIRO ─────────────────────────────────────────────
 * É a armadilha inteira deste caso: `pausa_atual_id = null` tira a pessoa da
 * pausa em todas as telas, e ninguém percebe que a linha de
 * `pausas_colaboradores` ficou com `fim IS NULL`. O relatório de produtividade
 * trata `fim` nulo como pausa em andamento e conta até agora — a ausência
 * "encerrada" pelo gestor continua crescendo no relatório para sempre.
 *
 * ── `duracao_minutos` ───────────────────────────────────────────────────────
 * Fica NULO, de propósito. A coluna está declarada como "calculado quando
 * finaliza" desde scripts/create-pausas-tables.sql, mas não existe trigger em
 * `pausas_colaboradores` — nem no schema versionado nem entre as migrations — e
 * NENHUM caminho de código a preenche: o painel do atendente só grava `fim`.
 * Quem consome sabe disso: /api/painel/atendentes/produtividade usa
 * `duracao_minutos` quando existe e cai para `fim - inicio` quando é nulo, que
 * é o caso de 100% das linhas hoje. Preencher só aqui faria a pausa encerrada
 * pelo gestor ser a única com valor — uma terceira forma de gravar a mesma
 * coisa, exatamente o que não se quer inventar.
 *
 * A pessoa volta ONLINE, espelhando "Voltar ao Atendimento" do painel do
 * atendente. Para deixá-la offline existe a ação de status, que também fecha a
 * instância — ver {@link encerrarInstanciaAberta}.
 */
async function tirarDaPausa({
  supabase,
  ator,
  colaboradorId,
  carregarSetoresDoAlvo,
}: {
  supabase: Supabase
  ator: AtorIdentificado
  colaboradorId: string
  carregarSetoresDoAlvo: CarregarSetoresDoAlvo
}) {
  const { data: alvo, error: alvoError } = await supabase
    .from('colaboradores')
    .select('id, nome, setor_id, pausa_atual_id')
    .eq('id', colaboradorId)
    .maybeSingle()

  if (alvoError) {
    console.error('[toggle-status] Erro ao buscar alvo do fim de pausa:', alvoError)
    return NextResponse.json({ error: 'Erro ao validar colaborador' }, { status: 500 })
  }
  if (!alvo) {
    return NextResponse.json({ error: 'Colaborador não encontrado' }, { status: 404 })
  }

  const setorIds = await carregarSetoresDoAlvo(alvo.setor_id)
  if (setorIds === null) {
    return NextResponse.json({ error: 'Erro ao validar os setores do colaborador' }, { status: 500 })
  }

  const instancia = await carregarPausaAberta(supabase, alvo.id, alvo.pausa_atual_id)
  if (instancia.erro) {
    return NextResponse.json({ error: 'Erro ao buscar a pausa atual' }, { status: 500 })
  }

  const avaliacao = avaliarFimDePausa(ator, {
    colaboradorId,
    setorIds,
    pausaAberta: instancia.pausaAberta,
  })

  if (!avaliacao.permitido) {
    const recusa = RECUSA_DA_SUPERVISAO[avaliacao.motivo]
    return NextResponse.json({ error: recusa.erro }, { status: recusa.status })
  }

  // `.is('fim', null)` não é redundante: entre a leitura e a escrita o atendente
  // pode ter voltado do intervalo sozinho pelo WorkDesk. Sem isso o `fim` seria
  // reescrito e a ausência apareceria mais longa do que foi.
  const fim = new Date().toISOString()
  const { data: encerrada, error: fimError } = await supabase
    .from('pausas_colaboradores')
    .update({ fim })
    .eq('id', avaliacao.instanciaId)
    .is('fim', null)
    .select('id, inicio, fim')
    .maybeSingle()

  if (fimError) {
    console.error('[toggle-status] Erro ao encerrar a pausa:', fimError)
    return NextResponse.json({ error: 'Erro ao tirar o atendente da pausa' }, { status: 500 })
  }
  if (!encerrada) {
    return NextResponse.json({ error: 'A pausa já havia sido encerrada' }, { status: 409 })
  }

  // O ponteiro é limpo DEPOIS de `fim` estar gravado: na ordem inversa, uma
  // falha no meio deixaria a instância aberta e invisível — a órfã de novo.
  //
  // `.eq('pausa_atual_id', ...)` é o compare-and-set do outro lado da corrida:
  // se o atendente já entrou em OUTRA pausa no meio do caminho, limpar o
  // ponteiro deixaria a instância nova aberta e sem dono. Não achar a linha não
  // é erro — a pausa que o gestor mandou encerrar está encerrada.
  const { data: colaborador, error: updateError } = await supabase
    .from('colaboradores')
    .update({ is_online: true, pausa_atual_id: null, last_heartbeat: fim })
    .eq('id', colaboradorId)
    .eq('pausa_atual_id', avaliacao.instanciaId)
    .select('id, is_online, pausa_atual_id')
    .maybeSingle()

  if (updateError) {
    console.error('[toggle-status] Erro ao limpar a pausa atual:', updateError)
    return NextResponse.json({ error: 'Erro ao tirar o atendente da pausa' }, { status: 500 })
  }

  registrarRastro('pausa_encerrada', {
    ponteiroMovido: !colaborador,
    instanciaId: avaliacao.instanciaId,
    setorId: avaliacao.setorId,
    inicioDaPausa: encerrada.inicio,
    fimDaPausa: encerrada.fim,
    alvoId: alvo.id,
    alvoNome: alvo.nome,
    deTipoId: avaliacao.deTipoId,
    deTipoNome: instancia.tipoNome,
    para: 'online',
    ator,
  })

  // Os dois registros abaixo valem só quando a pessoa realmente voltou: com o
  // ponteiro movido ela está em OUTRA pausa, e anotar "online" ou empurrar
  // ticket para ela seria mentira nas duas contas.
  if (colaborador) {
    if (ator.id !== colaboradorId) {
      await registrarDisponibilidade(supabase, colaboradorId, 'online')
    }

    // Espelha o painel do atendente, que chama /api/tickets/process-queue ao
    // voltar da pausa: quem volta ao atendimento entra na distribuição na hora.
    import('@/lib/ticket-queue-processor')
      .then(({ onColaboradorOnline }) => {
        onColaboradorOnline(colaboradorId).catch((err) =>
          console.error('[toggle-status] Erro ao processar fila do retorno:', err)
        )
      })
      .catch((err) => console.error('[toggle-status] Erro ao carregar onColaboradorOnline:', err))
  }

  return NextResponse.json({
    success: true,
    pausa: { id: avaliacao.instanciaId, fim: encerrada.fim, nome: instancia.tipoNome },
    colaborador,
  })
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
  supabase: Supabase
  ator: AtorIdentificado
  colaboradorId: string
  trocarTipoPausaId: string
  carregarSetoresDoAlvo: CarregarSetoresDoAlvo
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

  const instancia = await carregarPausaAberta(supabase, alvo.id, alvo.pausa_atual_id)
  if (instancia.erro) {
    return NextResponse.json({ error: 'Erro ao buscar a pausa atual' }, { status: 500 })
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
    { colaboradorId, setorIds, pausaAberta: instancia.pausaAberta },
    tipoDestino ? { id: tipoDestino.id, setorId: tipoDestino.setor_id, ativo: tipoDestino.ativo === true } : null,
  )

  if (!avaliacao.permitido) {
    const recusa = RECUSA_DA_SUPERVISAO[avaliacao.motivo]
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

  // O UPDATE acima apaga o tipo antigo da linha; o rastro é o único lugar onde
  // ele sobrevive. Ver {@link registrarRastro} para por que é log, e não tabela.
  //
  // Esta é a única das quatro ações que NÃO grava em `disponibilidade_logs`:
  // reetiquetar não muda a disponibilidade da pessoa — ela entrou em pausa
  // quando entrou e continua em pausa. A linha extra inventaria uma transição
  // que não houve no relatório de produtividade.
  registrarRastro('pausa_tipo_alterado', {
    instanciaId: avaliacao.instanciaId,
    setorId: avaliacao.setorId,
    inicioDaPausa: instancia.inicio,
    alvoId: alvo.id,
    alvoNome: alvo.nome,
    deTipoId: avaliacao.deTipoId,
    deTipoNome: instancia.tipoNome,
    paraTipoId: avaliacao.paraTipoId,
    paraTipoNome: tipoDestino?.nome ?? null,
    ator,
  })

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
