import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { hasSupervisorScope, type TransferActor } from '@/lib/transfer-authorization'
import { podeAlterarStatusDe, type AtorDaSupervisao } from '@/lib/pausa-supervisao'

/**
 * POST /api/colaborador/toggle-status
 *
 * Body: { colaboradorId, isOnline, pausaAtualId? }
 *
 * Grava is_online / pausa_atual_id / last_heartbeat em `colaboradores`.
 * `pausaAtualId` referencia `pausas_colaboradores` (a INSTÂNCIA), nunca
 * `pausas` (o catálogo de tipos) — id do catálogo aqui grava FK inválida.
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

    const { colaboradorId, isOnline, pausaAtualId } = body as {
      colaboradorId?: string
      isOnline?: boolean
      pausaAtualId?: string | null
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
