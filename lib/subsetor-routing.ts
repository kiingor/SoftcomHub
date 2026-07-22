export function isExactSubsetorMatch(
  ticketSubsetorId: string | null,
  colaboradorSubsetorIds: Iterable<string>,
): boolean {
  const subsetorIds = new Set(colaboradorSubsetorIds)

  return ticketSubsetorId
    ? subsetorIds.has(ticketSubsetorId)
    : subsetorIds.size === 0
}
