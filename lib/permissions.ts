type DashboardPermission =
  | { can_view_dashboard?: boolean | null }
  | { can_view_dashboard?: boolean | null }[]
  | null
  | undefined

export function canViewDashboard(permissao: DashboardPermission) {
  const permission = Array.isArray(permissao) ? permissao[0] : permissao
  return permission?.can_view_dashboard === true
}
