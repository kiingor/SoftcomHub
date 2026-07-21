export function isExactSubsetorMatch(
  ticketSubsetorId: string | null,
  colaboradorSubsetorIds: Iterable<string>,
): boolean {
  const subsetorIds = new Set(colaboradorSubsetorIds)

  return ticketSubsetorId
    ? subsetorIds.has(ticketSubsetorId)
    : subsetorIds.size === 0
}

export function shouldRouteTransferToSupport({
  destinationSetorId,
  destinationSubsetorId,
  destinationColaboradorId,
  currentSubsetorId,
}: {
  destinationSetorId: string | null
  destinationSubsetorId: string | null
  destinationColaboradorId: string | null
  currentSubsetorId: string | null
}): boolean {
  if (destinationSubsetorId) return false
  if (destinationSetorId) return true

  return !destinationColaboradorId && !currentSubsetorId
}
