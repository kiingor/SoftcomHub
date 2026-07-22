export const SERVICE_DESK_MATRIZ_SECTOR_ID = 'ca1416cb-2f57-4e0f-9abc-50158d0229ab'
export const OUVIDORIA_MATRIZ_SECTOR_ID = '2fcb16a5-aa72-4f29-a5b9-de415693648e'

const SERVICE_DESK_SHARED_CHANNEL_OWNERS = new Set([
  SERVICE_DESK_MATRIZ_SECTOR_ID,
  OUVIDORIA_MATRIZ_SECTOR_ID,
])

export function resolveSharedChannelOwnerId(ownerIds: Iterable<string>) {
  const owners = new Set([...ownerIds].filter(Boolean))
  if (owners.size === 0) return null
  if (owners.size === 1) return [...owners][0]

  const isServiceDeskSharedChannel = (
    owners.size === SERVICE_DESK_SHARED_CHANNEL_OWNERS.size
    && [...owners].every((ownerId) => SERVICE_DESK_SHARED_CHANNEL_OWNERS.has(ownerId))
  )
  return isServiceDeskSharedChannel ? SERVICE_DESK_MATRIZ_SECTOR_ID : null
}
