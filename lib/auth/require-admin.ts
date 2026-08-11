import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { canManageUsers, canViewDashboard } from '@/lib/permissions'

export type AdminGuardResult =
  | { ok: true; colaborador: { id: string; nome: string; email: string } }
  | { ok: false; error: string; status: number }

/**
 * Confere se quem chamou a rota pode administrar contas de outras pessoas.
 *
 * As rotas em /api/admin usam a service_role key, que ignora RLS por completo:
 * sem esta checagem, qualquer requisicao anonima para a URL trocava a senha (ou
 * apagava a conta) de qualquer usuario informando so o e-mail.
 *
 * O criterio repete o que o banco ja usa em can_manage_tags_setor(): conta
 * ativa E (admin OU pode gerir usuarios OU tem acesso ao dashboard). O ultimo
 * caso e mais amplo do que "admin" de proposito — a troca de senha em
 * /setor/[id] ja era aberta a supervisores, e restringir aqui derrubaria esse
 * fluxo que existe hoje.
 *
 * A busca e por e-mail, e nao por id, porque colaboradores.id nao e o auth.uid()
 * — o middleware e o useColaborador resolvem o colaborador logado do mesmo jeito.
 */
export async function requireAdmin(): Promise<AdminGuardResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user?.email) {
    return { ok: false, error: 'Nao autenticado', status: 401 }
  }

  const service = createServiceClient()
  const { data: colaborador } = await service
    .from('colaboradores')
    .select(
      'id, nome, email, ativo, is_master, permissoes:permissao_id(can_view_dashboard, can_manage_users)',
    )
    .eq('email', user.email)
    .maybeSingle()

  if (!colaborador || colaborador.ativo !== true) {
    return { ok: false, error: 'Acesso negado', status: 403 }
  }

  const autorizado =
    colaborador.is_master === true ||
    canManageUsers(colaborador.permissoes) ||
    canViewDashboard(colaborador.permissoes)

  if (!autorizado) {
    return { ok: false, error: 'Acesso negado', status: 403 }
  }

  return {
    ok: true,
    colaborador: {
      id: colaborador.id,
      nome: colaborador.nome,
      email: colaborador.email,
    },
  }
}
