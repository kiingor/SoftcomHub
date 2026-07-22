export type SafeNexusChannelConfiguration = {
  sectors: Array<{ id: string; nome: string }>
  channels: Array<{
    identifier: string
    channelKey: string
    sectorId: string
    sectorName: string
  }>
  warnings: Array<{
    code: 'AMBIGUOUS_CHANNELS_OMITTED'
    count: number
  }>
}

export async function loadSafeNexusChannelConfiguration(
  sectorIds: readonly string[],
) {
  const params = new URLSearchParams({
    setorIds: [...new Set(sectorIds)].join(','),
  })
  const response = await fetch(`/api/nexus/canais?${params.toString()}`, {
    cache: 'no-store',
  })
  const payload = await response.json().catch(() => ({})) as
    | SafeNexusChannelConfiguration
    | { error?: string }

  if (!response.ok || !('channels' in payload)) {
    throw new Error(
      'error' in payload && payload.error
        ? payload.error
        : 'Não foi possível resolver os canais do Nexus.',
    )
  }

  return payload
}
