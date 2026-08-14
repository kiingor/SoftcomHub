// O embed do PostgREST (`permissoes:permissao_id(...)`) chega ora como objeto,
// ora como array de um item, dependendo de como a FK foi inferida na query.
type PermissaoEmbed<T> = T | T[] | null | undefined

type DashboardPermission = PermissaoEmbed<{ can_view_dashboard?: boolean | null }>
type ManageUsersPermission = PermissaoEmbed<{ can_manage_users?: boolean | null }>
type SeeAllTicketsPermission = PermissaoEmbed<{ can_see_all_tickets?: boolean | null }>

export function canViewDashboard(permissao: DashboardPermission) {
  const permission = Array.isArray(permissao) ? permissao[0] : permissao
  return permission?.can_view_dashboard === true
}

export function canManageUsers(permissao: ManageUsersPermission) {
  const permission = Array.isArray(permissao) ? permissao[0] : permissao
  return permission?.can_manage_users === true
}

// A permissão do supervisor. Ela NÃO decide sozinha nada de supervisão: quem
// decide é `hasSupervisorScope` em lib/transfer-authorization.ts, que cruza esta
// permissão com o vínculo de setor. Aqui só se resolve a forma do embed.
export function canSeeAllTickets(permissao: SeeAllTicketsPermission) {
  const permission = Array.isArray(permissao) ? permissao[0] : permissao
  return permission?.can_see_all_tickets === true
}
