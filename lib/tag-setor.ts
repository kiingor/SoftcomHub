/**
 * Recorte de atendentes e métricas por tag de setor.
 *
 * A tag de setor é a operação que o atendente executa DENTRO de um canal —
 * "Suporte Chat" (recebe chat e dispara ocorrência) contra "Pit Stop" (só
 * dispara). Ela mora no vínculo (`colaboradores_setores.tag_setor_id`), não no
 * canal: ServiceDesk e PIT STOP vão ser fundidos num canal só, com as duas
 * operações e mais uma convivendo dentro dele, e aí a tag do canal daria a mesma
 * resposta para todo mundo.
 *
 * Não confundir com duas dimensões vizinhas:
 *   `tags`      — origem do canal (Matriz, Filial, PEV, Franquias, Internos)
 *   `subsetor`  — categoria que roteia ticket (Prime, Suporte)
 * A tag de setor é a terceira: quem faz o quê, para métrica e visibilidade.
 */

export type TagSetor = {
  id: string
  nome: string
  cor: string
  ordem?: number | null
  setor_id?: string | null
}

/** Vínculo atendente ↔ canal, já com a operação dele naquele canal. */
export type VinculoSetor = {
  colaborador_id: string
  setor_id: string
  tag_setor_id: string | null
}

/** Linha de `vw_nps_colaborador_tag_setor`. */
export type LinhaNps = {
  colaborador_id: string
  tag_setor_id: string | null
  total: number
  soma_notas: number
}

export type Nps = {
  media: number
  total: number
}

/** Índice (colaborador → tags dele), sem repetir, na ordem em que apareceram. */
export function tagsPorColaborador(
  vinculos: readonly VinculoSetor[],
): Map<string, string[]> {
  const porColaborador = new Map<string, string[]>()
  for (const vinculo of vinculos) {
    if (!vinculo.tag_setor_id) continue
    const atual = porColaborador.get(vinculo.colaborador_id)
    if (!atual) {
      porColaborador.set(vinculo.colaborador_id, [vinculo.tag_setor_id])
    } else if (!atual.includes(vinculo.tag_setor_id)) {
      atual.push(vinculo.tag_setor_id)
    }
  }
  return porColaborador
}

/**
 * O recorte que o usuário logado PODE ver.
 *
 * `null` significa "todas as tags" — é o caso do master e de um canal que ainda
 * não possui tags configuradas. Para os demais, em um canal com tags, uma lista
 * vazia significa "nenhuma operação autorizada".
 */
export function tagsVisiveisPara(
  tagsDoUsuario: readonly string[],
  isMaster: boolean,
  hasTagsConfigured = true,
): string[] | null {
  if (isMaster || !hasTagsConfigured) return null
  return [...tagsDoUsuario]
}

/**
 * Cruza o que o usuário PODE ver com o que ele ESCOLHEU no filtro.
 *
 * A permissão manda: escolher uma tag fora do próprio recorte não amplia nada.
 * Devolve `[]` só quando a escolha não tem interseção com a permissão — e aí a
 * tela mostra vazio de propósito, não por engano.
 */
export function filtroEfetivo(
  permitidas: readonly string[] | null,
  escolhidas: readonly string[],
): string[] {
  if (permitidas === null) return [...escolhidas]
  if (escolhidas.length === 0) return [...permitidas]
  return escolhidas.filter((tagId) => permitidas.includes(tagId))
}

/**
 * O atendente entra na tela com o filtro dado?
 *
 * Filtro vazio é "sem recorte". Atendente sem tag só aparece assim: com filtro
 * ativo ele não pertence a operação nenhuma.
 */
export function atendenteNoFiltro(
  tagsAtendente: readonly string[],
  filtro: readonly string[],
): boolean {
  if (filtro.length === 0) return true
  return tagsAtendente.some((tagId) => filtro.includes(tagId))
}

/**
 * Decide se o ticket pertence ao recorte da operação.
 *
 * Na fila ainda não existe atendente para associar à tag. O monitoramento pode
 * incluí-la explicitamente para manter a fila do canal visível às operações.
 */
export function ticketNoFiltroDeTag(
  colaboradorId: string | null | undefined,
  idsAtendentesNoFiltro: ReadonlySet<string> | null,
  incluirSemAtendente = false,
): boolean {
  if (idsAtendentesNoFiltro === null) return true
  if (!colaboradorId) return incluirSemAtendente
  return idsAtendentesNoFiltro.has(colaboradorId)
}

/**
 * NPS do atendente restrito às tags do filtro, ou `null` quando não há nota.
 *
 * Soma as linhas em vez de mediar as médias: com 40 notas numa tag e 3 na outra,
 * a média das médias dá peso igual às duas e mente. Aqui é soma de notas sobre
 * soma de atendimentos, que é a média real do recorte.
 *
 * Filtro vazio soma todas as linhas do atendente — inclusive a de
 * `tag_setor_id: null`, onde caem avaliação sem ticket e vínculo sem tag. Por
 * isso o total sem filtro continua batendo com o total do banco.
 */
export function npsDoAtendente(
  linhas: readonly LinhaNps[],
  filtro: readonly string[],
): Nps | null {
  let total = 0
  let soma = 0
  for (const linha of linhas) {
    if (filtro.length > 0 && (linha.tag_setor_id === null || !filtro.includes(linha.tag_setor_id))) {
      continue
    }
    total += linha.total
    soma += linha.soma_notas
  }
  if (total === 0) return null
  return { media: soma / total, total }
}

/** Agrupa as linhas da view por atendente, para consulta O(1) na tabela. */
export function agruparNpsPorColaborador(
  linhas: readonly LinhaNps[],
): Map<string, LinhaNps[]> {
  const porColaborador = new Map<string, LinhaNps[]>()
  for (const linha of linhas) {
    const atual = porColaborador.get(linha.colaborador_id)
    if (atual) atual.push(linha)
    else porColaborador.set(linha.colaborador_id, [linha])
  }
  return porColaborador
}

/** Ordena como o cadastro pede: `ordem`, e nome como desempate. */
export function ordenarTags(tags: readonly TagSetor[]): TagSetor[] {
  return [...tags].sort((a, b) => {
    const ordem = (a.ordem ?? 0) - (b.ordem ?? 0)
    return ordem !== 0 ? ordem : a.nome.localeCompare(b.nome, 'pt-BR')
  })
}

/**
 * As tags que viram opção de filtro na tela.
 *
 * Só o que o usuário pode ver, e dentro disso só o que está aplicado em algum
 * vínculo — tag criada e nunca usada não vira opção que não filtra nada.
 */
export function tagsParaFiltro(
  catalogo: readonly TagSetor[],
  vinculos: readonly VinculoSetor[],
  permitidas: readonly string[] | null,
): TagSetor[] {
  const emUso = new Set<string>()
  for (const vinculo of vinculos) {
    if (vinculo.tag_setor_id) emUso.add(vinculo.tag_setor_id)
  }
  return ordenarTags(
    catalogo.filter(
      (tag) => emUso.has(tag.id) && (permitidas === null || permitidas.includes(tag.id)),
    ),
  )
}
