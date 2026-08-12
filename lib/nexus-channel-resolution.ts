export const SERVICE_DESK_MATRIZ_SECTOR_ID = 'ca1416cb-2f57-4e0f-9abc-50158d0229ab'
export const OUVIDORIA_MATRIZ_SECTOR_ID = '2fcb16a5-aa72-4f29-a5b9-de415693648e'

const SERVICE_DESK_SHARED_CHANNEL_OWNERS = new Set([
  SERVICE_DESK_MATRIZ_SECTOR_ID,
  OUVIDORIA_MATRIZ_SECTOR_ID,
])

/**
 * Dono canônico de um identificador de canal (phone_number_id / instância).
 *
 * `preferredOwnerId` é o setor que o chamador já sabe ser legítimo para aquele
 * canal — na prática, o setor atual do ticket. Quando ele está entre os donos,
 * é ele: nenhum critério inventado aqui é mais confiável do que o setor que
 * possui a conversa, e o único efeito da escolha é de qual linha de
 * `setor_canais` saem as credenciais do MESMO número. Sem essa preferência,
 * qualquer número compartilhado fora do par ServiceDesk/Ouvidoria caía em
 * `null` e o envio morria em CHANNEL_MISMATCH mesmo com o canal cadastrado no
 * próprio setor do ticket.
 *
 * O par ServiceDesk Matriz + Ouvidoria Matriz continua fixo porque o cadastro
 * não tem como expressar "canal principal": `setor_canais` não possui coluna
 * `principal`/`padrao` e o banco é compartilhado com produção. Enquanto essa
 * coluna não existir, canal compartilhado por dois setores dos quais nenhum é o
 * do ticket segue ambíguo — devolve `null` de propósito.
 */
export function resolveSharedChannelOwnerId(
  ownerIds: Iterable<string>,
  preferredOwnerId?: string | null,
) {
  const owners = new Set([...ownerIds].filter(Boolean))
  if (owners.size === 0) return null
  if (owners.size === 1) return [...owners][0]
  if (preferredOwnerId && owners.has(preferredOwnerId)) return preferredOwnerId

  const isServiceDeskSharedChannel = (
    owners.size === SERVICE_DESK_SHARED_CHANNEL_OWNERS.size
    && [...owners].every((ownerId) => SERVICE_DESK_SHARED_CHANNEL_OWNERS.has(ownerId))
  )
  return isServiceDeskSharedChannel ? SERVICE_DESK_MATRIZ_SECTOR_ID : null
}
