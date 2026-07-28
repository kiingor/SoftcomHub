/**
 * Leitura completa de tabelas no PostgREST.
 *
 * O servidor corta toda resposta em 1.000 linhas e NÃO avisa: sem erro, sem
 * cabeçalho de aviso, sem nada que distinga "cortei" de "só existem 1.000".
 * Um `.range(0, 99999)` não resolve — o teto é por requisição, e a janela maior
 * volta com as mesmas 1.000. A única saída é pedir página por página até uma
 * delas voltar incompleta.
 *
 * Esse corte silencioso já produziu bugs distintos aqui: avaliações somando
 * zero, dias zerados no gráfico de horários de pico, e histórico de conversa
 * mostrando as mensagens mais antigas em vez das mais recentes.
 */

export const POSTGREST_PAGE_SIZE = 1000

/** `.in()` com lista longa estoura o tamanho da URL; 200 é o teto usado aqui. */
export const POSTGREST_IN_CHUNK_SIZE = 200

export function chunkValues<T>(
  values: readonly T[],
  size = POSTGREST_IN_CHUNK_SIZE,
): T[][] {
  const chunks: T[][] = []
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size))
  }
  return chunks
}

/**
 * Percorre todas as páginas de uma query.
 *
 * `createQuery` é uma FUNÇÃO, não uma query pronta: o builder do supabase-js
 * não pode ser reaproveitado entre execuções, cada página precisa da sua.
 *
 * A query PRECISA ter ordem determinística. `.range()` recorta por posição, e
 * sem `ORDER BY` estável o Postgres pode devolver as linhas em ordem diferente
 * a cada página — o que faz uma linha aparecer duas vezes e outra sumir, de
 * forma intermitente e praticamente impossível de reproduzir.
 */
export async function loadRowsByPages<TRow = any>(
  createQuery: () => any,
  pageSize = POSTGREST_PAGE_SIZE,
): Promise<TRow[]> {
  const rows: TRow[] = []
  const normalizedPageSize = Number.isFinite(pageSize) && pageSize > 0
    ? Math.floor(pageSize)
    : POSTGREST_PAGE_SIZE

  for (let page = 0; ; page += 1) {
    const from = page * normalizedPageSize
    const { data, error } = await createQuery().range(from, from + normalizedPageSize - 1)
    if (error) throw error
    if (!data || data.length === 0) break

    rows.push(...data)
    // Página incompleta significa fim dos dados. Uma página CHEIA não significa
    // nada: pode ser o fim exato ou pode ter mais — por isso pede a próxima.
    if (data.length < normalizedPageSize) break
  }

  return rows
}

/**
 * Lê todas as linhas cujo `filterColumn` esteja em `values`.
 *
 * Fatia a lista para caber na URL e pagina DENTRO de cada fatia: 200 ids podem
 * facilmente devolver mais de 1.000 linhas, e sem o laço a fatia vinha cortada.
 *
 * Ordena por `id` DEPOIS do `configure`, para que a ordem pedida por quem
 * chamou continue valendo e o `id` entre só como critério de desempate — que é
 * o que torna a paginação determinística. Assume que a tabela tem `id`.
 */
export async function loadRowsByValues<TRow = any>(
  supabase: any,
  table: string,
  columns: string,
  filterColumn: string,
  values: readonly string[],
  configure?: (query: any) => any,
): Promise<TRow[]> {
  const valueChunks = chunkValues([...new Set(values)])
  const chunkRows = await Promise.all(valueChunks.map((valueChunk) => (
    loadRowsByPages<TRow>(() => {
      const query = supabase.from(table).select(columns).in(filterColumn, valueChunk)
      return (configure ? configure(query) : query).order('id', { ascending: true })
    })
  )))

  return chunkRows.flat()
}
