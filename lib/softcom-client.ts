export interface SoftcomClient {
  nome: string
  CNPJ: string
  Registro: string | null
  PDV: string | null
  telefone: string | null
}

type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asText(value: unknown): string | null {
  if (typeof value === 'string') {
    const normalized = value.trim()
    return normalized || null
  }

  if (typeof value === 'number') return String(value)

  return null
}

function onlyDigits(value: string | null): string | null {
  if (!value) return null
  const normalized = value.replace(/\D/g, '')
  return normalized || null
}

function extractRecords(payload: unknown, depth = 0): UnknownRecord[] {
  if (depth > 2) return []
  if (Array.isArray(payload)) return payload.filter(isRecord)
  if (!isRecord(payload)) return []

  if (asText(payload.cnpj ?? payload.CNPJ)) return [payload]

  for (const key of ['data', 'clientes', 'items', 'results', 'content']) {
    const records = extractRecords(payload[key], depth + 1)
    if (records.length > 0) return records
  }

  return []
}

function getPhone(client: UnknownRecord): string | null {
  const directPhone = onlyDigits(asText(client.telefone ?? client.celular ?? client.phone))
  if (directPhone) return directPhone

  const contacts = Array.isArray(client.contatos) ? client.contatos : []
  const contact = contacts.find(isRecord)
  if (!contact) return null

  const ddd = onlyDigits(asText(contact.ddd)) || ''
  const phone = onlyDigits(asText(contact.telefone ?? contact.celular ?? contact.phone)) || ''
  return ddd || phone ? `${ddd}${phone}` : null
}

/** Busca um cliente pelo CNPJ na API Softcom Cloud, sem persistir dados locais. */
export async function lookupSoftcomClientByCnpj(cnpj: string): Promise<SoftcomClient | null> {
  const apiKey = process.env.SOFTCOM_API_KEY
  if (!apiKey) {
    throw new Error('SOFTCOM_API_KEY não configurada')
  }

  const normalizedCnpj = cnpj.replace(/\D/g, '')
  const baseUrl = (process.env.SOFTCOM_API_URL || 'https://api.softcom.cloud/v1').replace(/\/$/, '')
  const url = new URL(`${baseUrl}/clientes`)
  url.searchParams.set('page', '1')
  url.searchParams.set('pageSize', '1')
  url.searchParams.set('cnpj', normalizedCnpj)
  url.searchParams.set('incluirDesativados', 'false')

  const response = await fetch(url, {
    headers: {
      accept: 'application/json',
      'x-api-key': apiKey,
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  })

  if (response.status === 404) return null
  if (!response.ok) {
    throw new Error(`Softcom Cloud respondeu ${response.status}`)
  }

  const payload = await response.json()
  const records = extractRecords(payload)
  const record = records.find(
    (item) => onlyDigits(asText(item.cnpj ?? item.CNPJ)) === normalizedCnpj,
  )

  if (!record) return null

  return {
    nome: asText(record.nome ?? record.razaoSocial ?? record.razao_social ?? record.nomeFantasia)
      || 'Cliente sem nome',
    CNPJ: onlyDigits(asText(record.cnpj ?? record.CNPJ)) || normalizedCnpj,
    Registro: asText(record.registro ?? record.Registro ?? record.id),
    PDV: asText(record.pdv ?? record.PDV),
    telefone: getPhone(record),
  }
}
