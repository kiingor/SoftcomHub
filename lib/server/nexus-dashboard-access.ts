import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { canViewDashboard } from '@/lib/permissions'

type AssignmentTable = 'colaborador_setores' | 'colaboradores_setores'

async function loadAllSectorIds(supabase: SupabaseClient) {
  const ids: string[] = []

  for (let page = 0; ; page += 1) {
    const from = page * 1000
    const { data, error } = await supabase
      .from('setores')
      .select('id')
      .order('id', { ascending: true })
      .range(from, from + 999)

    if (error) throw error
    const rows = data || []
    ids.push(...rows.map((row) => row.id))
    if (rows.length < 1000) break
  }

  return ids
}

async function loadAssignedSectorIds(
  supabase: SupabaseClient,
  table: AssignmentTable,
  collaboratorId: string,
) {
  const ids: string[] = []

  for (let page = 0; ; page += 1) {
    const from = page * 1000
    const { data, error } = await supabase
      .from(table)
      .select('setor_id')
      .eq('colaborador_id', collaboratorId)
      .order('setor_id', { ascending: true })
      .range(from, from + 999)

    if (error) throw error
    const rows = data || []
    ids.push(...rows
      .map((row) => row.setor_id)
      .filter((sectorId): sectorId is string => Boolean(sectorId)))
    if (rows.length < 1000) break
  }

  return ids
}

export async function resolveNexusDashboardAccess(
  supabase: SupabaseClient,
  email: string,
) {
  const { data: collaborator, error } = await supabase
    .from('colaboradores')
    .select('id, ativo, is_master, permissoes:permissao_id(can_view_dashboard)')
    .eq('email', email)
    .maybeSingle()

  if (error) throw error
  if (!collaborator?.ativo || !canViewDashboard(collaborator.permissoes)) return null

  const sectorIds = collaborator.is_master
    ? await loadAllSectorIds(supabase)
    : [...new Set((await Promise.all([
        loadAssignedSectorIds(supabase, 'colaborador_setores', collaborator.id),
        loadAssignedSectorIds(supabase, 'colaboradores_setores', collaborator.id),
      ])).flat())]

  return {
    collaboratorId: collaborator.id,
    isMaster: collaborator.is_master === true,
    sectorIds,
  }
}
