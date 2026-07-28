import { request as undiciRequest } from 'undici'

export interface SoftcomClient {
  nome: string
  CNPJ: string
  Registro: string | null
  PDV: string | null
  telefone: string | null
}

type UnknownRecord = Record<string, unknown>

const DEFAULT_GETCLIENT_WEBHOOK_URL =
  'https://n8n-webhook.mensageria.softcomtecnologia.com/webhook/getcliente'
const EXTERNAL_LOOKUP_TIMEOUT_MS = 10_000
const MAX_EXTERNAL_RESPONSE_BYTES = 256 * 1024

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

  if (asText(
    payload.cnpj
      ?? payload.CNPJ
      ?? payload.nome_cliente
      ?? payload.nome
      ?? payload.razaoSocial
      ?? payload.razao_social,
  )) return [payload]

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

async function readExternalResponse(body: AsyncIterable<Uint8Array>): Promise<string> {
  const chunks: Buffer[] = []
  let totalBytes = 0

  for await (const chunk of body) {
    const buffer = Buffer.from(chunk)
    totalBytes += buffer.byteLength
    if (totalBytes > MAX_EXTERNAL_RESPONSE_BYTES) {
      throw new Error('Resposta externa excedeu o limite permitido')
    }
    chunks.push(buffer)
  }

  return Buffer.concat(chunks).toString('utf8')
}

function toSoftcomClient(record: UnknownRecord, fallbackCnpj: string): SoftcomClient | null {
  const nome = asText(
    record.nome_cliente
      ?? record.nome
      ?? record.razaoSocial
      ?? record.razao_social
      ?? record.nomeFantasia,
  )
  const cnpj = onlyDigits(asText(record.cnpj ?? record.CNPJ))
  const registro = asText(record.registro ?? record.Registro ?? record.id)

  if (!nome && !cnpj && !registro) return null

  return {
    nome: nome || 'Cliente sem nome',
    CNPJ: cnpj || fallbackCnpj,
    Registro: registro,
    PDV: asText(record.pdv ?? record.PDV),
    telefone: getPhone(record),
  }
}

async function lookupSoftcomCloudClient(cnpj: string, apiKey: string): Promise<SoftcomClient | null> {
  const baseUrl = (process.env.SOFTCOM_API_URL || 'https://api.softcom.cloud/v1').replace(/\/$/, '')
  const url = new URL(`${baseUrl}/clientes`)
  url.searchParams.set('page', '1')
  url.searchParams.set('pageSize', '1')
  url.searchParams.set('cnpj', cnpj)
  url.searchParams.set('incluirDesativados', 'false')

  const response = await fetch(url, {
    headers: {
      accept: 'application/json',
      'x-api-key': apiKey,
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(EXTERNAL_LOOKUP_TIMEOUT_MS),
  })

  if (response.status === 404) return null
  if (!response.ok) {
    throw new Error(`Softcom Cloud respondeu ${response.status}`)
  }

  const payload = await response.json()
  const record = extractRecords(payload).find(
    (item) => onlyDigits(asText(item.cnpj ?? item.CNPJ)) === cnpj,
  )

  return record ? toSoftcomClient(record, cnpj) : null
}

async function lookupGetClientWebhook(cnpj: string): Promise<SoftcomClient | null> {
  const webhookUrl = process.env.GETCLIENT_WEBHOOK_URL || DEFAULT_GETCLIENT_WEBHOOK_URL
  const { statusCode, body } = await undiciRequest(webhookUrl, {
    method: 'GET',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
    },
    body: JSON.stringify([{ cnpj }]),
    headersTimeout: EXTERNAL_LOOKUP_TIMEOUT_MS,
    bodyTimeout: EXTERNAL_LOOKUP_TIMEOUT_MS,
    signal: AbortSignal.timeout(EXTERNAL_LOOKUP_TIMEOUT_MS),
  })

  const responseText = await readExternalResponse(body)
  if (statusCode !== 200) {
    throw new Error(`Webhook getcliente respondeu ${statusCode}`)
  }

  const payload: unknown = JSON.parse(responseText)
  if (isRecord(payload) && asText(payload.message)) return null
  if (
    Array.isArray(payload)
    && payload.some((item) => isRecord(item) && asText(item.message))
  ) return null

  const records = extractRecords(payload)
  const record = records.find(
    (item) => onlyDigits(asText(item.cnpj ?? item.CNPJ)) === cnpj,
  )

  return record ? toSoftcomClient(record, cnpj) : null
}

/**
 * Busca um cliente na Softcom Cloud, com fallback para o webhook legado.
 * O documento pode ser CNPJ ou CPF (cliente MEI) — os dois trafegam no mesmo
 * campo `cnpj` do contrato externo, que já responde aos dois formatos.
 */
export async function lookupSoftcomClientByCnpj(cnpj: string): Promise<SoftcomClient | null> {
  const apiKey = process.env.SOFTCOM_API_KEY
  const normalizedCnpj = cnpj.replace(/\D/g, '')

  if (apiKey) {
    try {
      const cliente = await lookupSoftcomCloudClient(normalizedCnpj, apiKey)
      if (cliente) return cliente
    } catch (error) {
      const message = error instanceof Error ? error.message : 'erro desconhecido'
      console.warn(`[softcom-client] Softcom Cloud indisponível; usando webhook getcliente: ${message}`)
    }
  }

  return lookupGetClientWebhook(normalizedCnpj)
}
