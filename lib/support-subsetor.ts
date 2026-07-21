import type { SupabaseClient } from '@supabase/supabase-js'

export const SUPPORT_SUBSETOR_NAME = 'Suporte'

export interface SupportSubsetor {
  id: string
  nome: string
}

export async function findActiveSupportSubsetor(
  supabase: SupabaseClient,
  setorId: string,
): Promise<SupportSubsetor | null> {
  const { data, error } = await supabase
    .from('subsetores')
    .select('id, nome')
    .eq('setor_id', setorId)
    .eq('ativo', true)
    .ilike('nome', SUPPORT_SUBSETOR_NAME)
    .order('id')
    .limit(2)

  if (error) {
    throw new Error(`Erro ao buscar subsetor ${SUPPORT_SUBSETOR_NAME}: ${error.message}`)
  }

  if ((data?.length ?? 0) > 1) {
    throw new Error(`O setor ${setorId} possui mais de um subsetor ${SUPPORT_SUBSETOR_NAME} ativo`)
  }

  return data?.[0] ?? null
}
