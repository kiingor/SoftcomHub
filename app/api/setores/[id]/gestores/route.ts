import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  authenticateManagerSupportActor,
  canManageManagerGroup,
  getEligibleManagersForSector,
  type ManagerSupportActor,
} from '@/lib/server/manager-support'

const sectorIdSchema = z.string().uuid()
const setManagerSchema = z.object({
  colaboradorId: z.string().uuid(),
  incluir: z.boolean(),
}).strict()

type RouteContext = { params: Promise<{ id: string }> }
type ServiceClient = Extract<Awaited<ReturnType<typeof authenticateManagerSupportActor>>, { ok: true }>['service']
type PermissionRelation =
  | { can_view_dashboard?: boolean | null }
  | { can_view_dashboard?: boolean | null }[]
  | null
function errorResponse(error: string, code: string, status: number) {
  return NextResponse.json({ error, code }, { status })
}

function firstPermission(value: PermissionRelation) {
  return Array.isArray(value) ? value[0] ?? null : value
}

async function loadSectorManagers(service: ServiceClient, sectorId: string) {
  const eligible = await getEligibleManagersForSector(service, sectorId)
  if (eligible.error) throw new Error(eligible.error)

  return eligible.managers
    .map((manager) => ({
      id: manager.id,
      nome: manager.name,
      email: manager.email,
      ativo: true,
      is_master: manager.isMaster,
      can_view_dashboard: manager.canViewDashboard,
      criado_em: manager.createdAt,
    }))
    .sort((left, right) => left.nome.localeCompare(right.nome, 'pt-BR'))
}

async function authorizeManagerGroup(
  sectorId: string,
): Promise<
  | { ok: true; actor: ManagerSupportActor; service: ServiceClient }
  | { ok: false; response: NextResponse }
> {
  const authentication = await authenticateManagerSupportActor()
  if (!authentication.ok) {
    return {
      ok: false,
      response: errorResponse(authentication.error, authentication.code, authentication.status),
    }
  }

  const { data: sector, error: sectorError } = await authentication.service
    .from('setores')
    .select('id')
    .eq('id', sectorId)
    .maybeSingle()

  if (sectorError) {
    console.error('[manager-support] Failed to validate manager group sector:', sectorError.message)
    return {
      ok: false,
      response: errorResponse(
        'Não foi possível validar o setor.',
        'MANAGER_GROUP_OPERATION_FAILED',
        500,
      ),
    }
  }
  if (!sector) {
    return {
      ok: false,
      response: errorResponse('Setor não encontrado.', 'SECTOR_NOT_FOUND', 404),
    }
  }

  try {
    const allowed = await canManageManagerGroup(
      authentication.service,
      authentication.actor,
      sectorId,
    )
    if (!allowed) {
      return {
        ok: false,
        response: errorResponse(
          'Você não pode administrar os gestores deste setor.',
          'MANAGER_GROUP_FORBIDDEN',
          403,
        ),
      }
    }
  } catch (error) {
    console.error('[manager-support] Failed to authorize manager group:', error)
    return {
      ok: false,
      response: errorResponse(
        'Não foi possível validar sua permissão.',
        'MANAGER_GROUP_OPERATION_FAILED',
        500,
      ),
    }
  }

  return {
    ok: true,
    actor: authentication.actor,
    service: authentication.service,
  }
}

async function validateManagerTargets(
  service: ServiceClient,
  sectorId: string,
  collaboratorIds: string[],
) {
  if (collaboratorIds.length === 0) return true

  const [collaboratorsResult, dashboardLinksResult, workdeskLinksResult] = await Promise.all([
    service
      .from('colaboradores')
      .select('id, ativo, is_master, setor_id, permissoes:permissao_id(can_view_dashboard)')
      .in('id', collaboratorIds)
      .limit(collaboratorIds.length),
    service
      .from('colaborador_setores')
      .select('colaborador_id')
      .eq('setor_id', sectorId)
      .in('colaborador_id', collaboratorIds)
      .limit(collaboratorIds.length),
    service
      .from('colaboradores_setores')
      .select('colaborador_id')
      .eq('setor_id', sectorId)
      .in('colaborador_id', collaboratorIds)
      .limit(collaboratorIds.length),
  ])

  if (collaboratorsResult.error || dashboardLinksResult.error || workdeskLinksResult.error) {
    throw collaboratorsResult.error ?? dashboardLinksResult.error ?? workdeskLinksResult.error
  }

  const linkedIds = new Set([
    ...(dashboardLinksResult.data ?? []).map((link) => link.colaborador_id),
    ...(workdeskLinksResult.data ?? []).map((link) => link.colaborador_id),
  ])
  const collaborators = collaboratorsResult.data ?? []
  if (collaborators.length !== collaboratorIds.length) return false

  return collaborators.every((collaborator) => {
    const permission = firstPermission(collaborator.permissoes as PermissionRelation)
    const hasManagerProfile = collaborator.is_master === true
      || permission?.can_view_dashboard === true
    const belongsToSector = collaborator.is_master === true
      || collaborator.setor_id === sectorId
      || linkedIds.has(collaborator.id)

    return collaborator.ativo === true && hasManagerProfile && belongsToSector
  })
}

export async function GET(_request: Request, routeContext: RouteContext) {
  const { id: setorId } = await routeContext.params
  const parsedSectorId = sectorIdSchema.safeParse(setorId)
  if (!parsedSectorId.success) {
    return errorResponse('Setor inválido.', 'INVALID_MANAGER_GROUP_REQUEST', 400)
  }

  const authorization = await authorizeManagerGroup(parsedSectorId.data)
  if (!authorization.ok) return authorization.response

  try {
    const gestores = await loadSectorManagers(authorization.service, parsedSectorId.data)
    return NextResponse.json({ gestores })
  } catch (error) {
    console.error('[manager-support] Failed to list sector managers:', error)
    return errorResponse(
      'Não foi possível carregar os gestores do setor.',
      'MANAGER_GROUP_OPERATION_FAILED',
      500,
    )
  }
}

export async function PUT(request: Request, routeContext: RouteContext) {
  const { id: setorId } = await routeContext.params
  const parsedSectorId = sectorIdSchema.safeParse(setorId)
  if (!parsedSectorId.success) {
    return errorResponse('Setor inválido.', 'INVALID_MANAGER_GROUP_REQUEST', 400)
  }

  const parsedBody = setManagerSchema.safeParse(await request.json().catch(() => null))
  if (!parsedBody.success) {
    return errorResponse(
      'A operação de gestor é inválida.',
      'INVALID_MANAGER_GROUP_REQUEST',
      400,
    )
  }

  const authorization = await authorizeManagerGroup(parsedSectorId.data)
  if (!authorization.ok) return authorization.response

  const { colaboradorId, incluir } = parsedBody.data
  try {
    if (incluir) {
      const validTarget = await validateManagerTargets(
        authorization.service,
        parsedSectorId.data,
        [colaboradorId],
      )
      if (!validTarget) {
        return errorResponse(
          'O gestor deve estar ativo, possuir acesso de gestão e pertencer ao setor.',
          'INVALID_MANAGER_SELECTION',
          422,
        )
      }
    }

    const { error: operationError } = await authorization.service.rpc(
      'chama_gestor_definir_gestor_setor',
      {
        p_setor_id: parsedSectorId.data,
        p_colaborador_id: colaboradorId,
        p_incluir: incluir,
      },
    )
    if (operationError?.code === '23514' && incluir) {
      return errorResponse(
        'O gestor deve estar ativo, possuir acesso de gestão e pertencer ao setor.',
        'INVALID_MANAGER_SELECTION',
        422,
      )
    }
    if (operationError?.code === '23514') {
      return errorResponse(
        'O setor mudou durante a atualização do grupo Gestor.',
        'MANAGER_GROUP_CONTEXT_CHANGED',
        409,
      )
    }
    if (operationError) throw operationError

    const gestores = await loadSectorManagers(authorization.service, parsedSectorId.data)
    return NextResponse.json({ gestores })
  } catch (error) {
    console.error('[manager-support] Failed to update sector manager:', error)
    return errorResponse(
      'Não foi possível salvar os gestores do setor.',
      'MANAGER_GROUP_OPERATION_FAILED',
      500,
    )
  }
}
