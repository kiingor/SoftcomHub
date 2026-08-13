// Transbordo entre SUBSETORES: as consultas — caso #97238.
//
// A regra é unidirecional. O ticket do Suporte pode ser absorvido por atendente
// do Prime quando a fila do Suporte transborda; o ticket do Prime NÃO cai para o
// Suporte, porque o cliente Prime tem que ficar com os atendentes escolhidos
// para o Prime. A única brecha é o Prime ficar sem NINGUÉM presente — aí é
// melhor o Suporte atender do que ninguém.
//
// Antes disso o transbordo era um conjunto simétrico (ver histórico de
// `distribuicao-fila.ts`), e o sentido Prime → Suporte não só era permitido como
// tinha privilégio: furava a fila do Suporte.
//
// Este módulo é compartilhado de propósito. A regra precisa valer nos QUATRO
// caminhos que atribuem ticket — distribuição na entrada, cron da fila, puxar
// manual e transbordo de setor. Enquanto ela morava dentro do cron, os outros
// três vazavam.
//
// A parte PURA vive em `transbordo-pares.ts` e é reexportada aqui: este arquivo
// importa `loadRowsByPages` pelo alias `@/`, que não resolve sob `node --test`,
// então nada testável pode morar junto.

import { loadRowsByPages } from '@/lib/supabase/paginate'
import { estaPresenteNoSetor, normalizarNomeSubsetor } from '@/lib/transbordo-pares'

export {
  estaPresenteNoSetor,
  montarParesDeTransbordo,
  normalizarNomeSubsetor,
  HEARTBEAT_STALE_MS,
} from '@/lib/transbordo-pares'
export type { ColaboradorPresenca } from '@/lib/transbordo-pares'

export interface SubsetoresPrimeESuporte {
  primeId: string | null
  suporteId: string | null
}

const CACHE_SUBSETORES_TRANSBORDO_MS = 30_000
const subsetoresTransbordoCache = new Map<string, {
  valor: SubsetoresPrimeESuporte
  expiraEm: number
}>()

/**
 * Prime e Suporte são identificados PELO NOME do subsetor — não existe flag no
 * banco. Renomear o subsetor desliga a regra, e é o preço de não precisar de
 * migration. Setor sem Prime nem Suporte devolve os dois `null`, o que resulta
 * em nenhum par e portanto nenhum transbordo entre subsetores.
 */
export async function getSubsetoresPrimeESuporte(
  supabase: any,
  setorId: string,
): Promise<SubsetoresPrimeESuporte> {
  const cache = subsetoresTransbordoCache.get(setorId)
  if (cache && cache.expiraEm > Date.now()) return cache.valor

  try {
    const data = await loadRowsByPages<{ id: string; nome: string; ativo: boolean | null }>(() => supabase
      .from('subsetores')
      .select('id, nome, ativo')
      .eq('setor_id', setorId)
      .order('id', { ascending: true }))

    const ativos = data.filter((subsetor) => subsetor.ativo !== false)
    const valor = {
      primeId: ativos.find((subsetor) => normalizarNomeSubsetor(subsetor.nome) === 'prime')?.id || null,
      suporteId: ativos.find((subsetor) => normalizarNomeSubsetor(subsetor.nome) === 'suporte')?.id || null,
    }

    subsetoresTransbordoCache.set(setorId, {
      valor,
      expiraEm: Date.now() + CACHE_SUBSETORES_TRANSBORDO_MS,
    })
    return valor
  } catch (error) {
    console.warn('[transbordo-subsetor] Não foi possível identificar Prime e Suporte:', {
      setorId,
      error: error instanceof Error ? error.message : String(error),
    })
    return { primeId: null, suporteId: null }
  }
}

/**
 * Algum atendente do subsetor está presente agora?
 *
 * Erro de consulta devolve `true` — na dúvida o ticket do Prime fica na fila.
 * Vazar para o Suporte por causa de uma consulta que falhou seria pior do que
 * segurar: a fila é recuperável, a quebra da regra é o bug que o caso pede para
 * corrigir.
 *
 * Ticket sem subsetor devolve `true` porque nem participa de par — `null` nunca
 * é origem de transbordo.
 */
export async function subsetorTemAtendentePresente(
  supabase: any,
  setorId: string,
  subsetorId: string | null | undefined,
): Promise<boolean> {
  if (!subsetorId) return true

  const { data, error } = await supabase
    .from('colaboradores_subsetores')
    .select('colaborador_id, colaboradores(is_online, ativo, last_heartbeat, setores_ativos_sessao)')
    .eq('setor_id', setorId)
    .eq('subsetor_id', subsetorId)

  if (error) {
    console.warn('[transbordo-subsetor] Não foi possível verificar presença; segurando o ticket:', {
      setorId,
      subsetorId,
      error: error.message,
    })
    return true
  }

  const agoraMs = Date.now()
  return (data || []).some((link: any) => estaPresenteNoSetor(link?.colaboradores, setorId, agoraMs))
}
