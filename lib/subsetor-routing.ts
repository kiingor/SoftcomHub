export function isExactSubsetorMatch(
  ticketSubsetorId: string | null,
  colaboradorSubsetorIds: Iterable<string>,
): boolean {
  const subsetorIds = new Set(colaboradorSubsetorIds)

  return ticketSubsetorId
    ? subsetorIds.has(ticketSubsetorId)
    : subsetorIds.size === 0
}

export const SEM_SUBSETOR_ID = 'sem_subsetor'

// Regra OU: vazio = todos os atendentes; "sem_subsetor" cobre quem não tem
// nenhum vínculo em colaboradores_subsetores; demais ids casam se o atendente
// estiver ligado a qualquer um dos subsetores selecionados.
export function matchesAtendenteSubsetorFilter(
  selectedSubsetorIds: string[],
  assignedSubsetorIds?: string[] | null,
): boolean {
  if (selectedSubsetorIds.length === 0) return true

  const subsetorIds = assignedSubsetorIds || []
  return (selectedSubsetorIds.includes(SEM_SUBSETOR_ID) && subsetorIds.length === 0)
    || subsetorIds.some((id) => selectedSubsetorIds.includes(id))
}

// Remove da seleção salva qualquer id que não exista mais entre os subsetores
// ativos do setor atual. `activeSubsetorIds` deve refletir SOMENTE os
// subsetores já confirmados carregados para o setor em questão — passar uma
// lista vazia por "ainda carregando" apagaria seleções válidas. SEM_SUBSETOR_ID
// nunca é removido, pois não depende da lista de subsetores. Retorna a mesma
// referência quando nada muda, para não disparar re-render/gravação à toa.
export function sanitizeSubsetorFilterSelection(
  selectedSubsetorIds: string[],
  activeSubsetorIds: Iterable<string>,
): string[] {
  const validIds = new Set<string>([SEM_SUBSETOR_ID, ...activeSubsetorIds])
  const cleaned = selectedSubsetorIds.filter((id) => validIds.has(id))
  return cleaned.length === selectedSubsetorIds.length ? selectedSubsetorIds : cleaned
}
