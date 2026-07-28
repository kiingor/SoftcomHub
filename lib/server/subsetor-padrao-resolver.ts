import { escolherSubsetorPadrao } from '@/lib/subsetor-padrao'

/**
 * Busca o cadastro do setor e devolve o subsetor padrão derivado.
 *
 * A regra de escolha mora em `lib/subsetor-padrao.ts`, testável sem banco.
 * Aqui fica só a leitura: subsetores ativos do setor e quais deles têm ao
 * menos um atendente vinculado.
 */

/**
 * Cache curto por processo.
 *
 * A redistribuição em lote percorre dezenas de tickets do mesmo setor, e sem
 * isto seriam duas consultas por ticket. Trinta segundos é curto o bastante
 * para uma mudança de cadastro valer quase de imediato, e longo o bastante para
 * o lote inteiro usar uma leitura só.
 */
const CACHE_MS = 30_000
const cache = new Map<string, { valor: string | null; expiraEm: number }>()

export function limparCacheSubsetorPadrao(): void {
  cache.clear()
}

export async function resolverSubsetorPadrao(
  supabase: any,
  setorId: string,
  agoraMs = Date.now(),
): Promise<string | null> {
  const guardado = cache.get(setorId)
  if (guardado && guardado.expiraEm > agoraMs) return guardado.valor

  const [subsetoresRes, vinculosRes] = await Promise.all([
    supabase.from('subsetores').select('id, nome, ativo').eq('setor_id', setorId),
    supabase.from('colaboradores_subsetores').select('subsetor_id').eq('setor_id', setorId),
  ])

  if (subsetoresRes.error || vinculosRes.error) {
    // Não derrubar a criação do ticket por causa do padrão: sem ele o ticket
    // nasce como nascia antes. Mas o erro vai para o log em vez de sumir.
    console.warn('[subsetor-padrao] falha ao ler o cadastro do setor', {
      setorId,
      erro: (subsetoresRes.error || vinculosRes.error)?.message,
    })
    return null
  }

  const comAtendente = new Set<string>(
    (vinculosRes.data || [])
      .map((v: { subsetor_id: string | null }) => v.subsetor_id)
      .filter((id: string | null): id is string => Boolean(id)),
  )
  const valor = escolherSubsetorPadrao(subsetoresRes.data || [], comAtendente)

  cache.set(setorId, { valor, expiraEm: agoraMs + CACHE_MS })
  return valor
}
