import type { SupabaseClient } from '@supabase/supabase-js'
import type { SetorAiConfig } from '@/lib/ai-provider'

const COLUNAS_BASE = 'openai_ativo, openai_api_key, openai_url_personalizada, openai_base_url'
const COLUNAS_MODELO = 'openai_modelo_chat, openai_modelo_transcricao'

/** Coluna que ainda não existe neste ambiente — o mesmo par que a tela do setor trata. */
function eColunaAusente(erro: { code?: string } | null): boolean {
  return erro?.code === '42703' || erro?.code === 'PGRST204'
}

/**
 * Config de IA do setor para as rotas de /api/ia.
 *
 * As colunas de modelo entraram depois (caso #97520) e a migration deste banco
 * pode não ter rodado ainda. Em vez de derrubar a transcrição inteira com
 * "column does not exist", a gente tenta com elas e cai para o SELECT antigo —
 * aí os resolvedores usam o padrão do provedor, que é o comportamento de antes.
 */
export async function carregarConfigIaDoSetor(
  supabase: SupabaseClient,
  setorId: string,
): Promise<{ setor: SetorAiConfig | null; erro: string | null }> {
  const comModelo = await supabase
    .from('setores')
    .select(`${COLUNAS_BASE}, ${COLUNAS_MODELO}`)
    .eq('id', setorId)
    .maybeSingle()

  if (!comModelo.error) {
    return { setor: (comModelo.data as SetorAiConfig | null) ?? null, erro: null }
  }
  if (!eColunaAusente(comModelo.error)) {
    return { setor: null, erro: comModelo.error.message }
  }

  const semModelo = await supabase
    .from('setores')
    .select(COLUNAS_BASE)
    .eq('id', setorId)
    .maybeSingle()

  if (semModelo.error) {
    return { setor: null, erro: semModelo.error.message }
  }
  return { setor: (semModelo.data as SetorAiConfig | null) ?? null, erro: null }
}
