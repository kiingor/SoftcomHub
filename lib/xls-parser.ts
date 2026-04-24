import * as XLSX from 'xlsx'

export interface DestinatarioParsed {
  nome: string | null
  cnpj: string | null
  registro: string | null
  telefone: string
}

export interface XlsParseError {
  row: number
  message: string
}

export interface XlsParseResult {
  total: number
  destinatarios: DestinatarioParsed[]
  errors: XlsParseError[]
}

const MAX_ROWS = 500
const HEADER_ALIASES: Record<string, 'nome' | 'cnpj' | 'registro' | 'telefone'> = {
  nome: 'nome',
  name: 'nome',
  cnpj: 'cnpj',
  'cnpj/cpf': 'cnpj',
  cpf: 'cnpj',
  registro: 'registro',
  codigo: 'registro',
  'código': 'registro',
  telefone: 'telefone',
  celular: 'telefone',
  fone: 'telefone',
  whatsapp: 'telefone',
  phone: 'telefone',
}

function normalizeHeader(raw: string): string {
  return raw
    .toString()
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function normalizePhone(raw: string | number | null | undefined): string | null {
  if (raw == null) return null
  const digits = String(raw).replace(/\D/g, '')
  if (!digits) return null
  if (digits.length === 10 || digits.length === 11) return `55${digits}`
  if (digits.length === 12 || digits.length === 13) return digits
  return null
}

function normalizeCnpj(raw: string | number | null | undefined): string | null {
  if (raw == null) return null
  const digits = String(raw).replace(/\D/g, '')
  return digits || null
}

function toStringOrNull(raw: unknown): string | null {
  if (raw == null) return null
  const s = String(raw).trim()
  return s || null
}

export function parseDisparoXls(buffer: ArrayBuffer): XlsParseResult {
  const workbook = XLSX.read(buffer, { type: 'array' })
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) {
    return { total: 0, destinatarios: [], errors: [{ row: 0, message: 'Planilha vazia' }] }
  }

  const sheet = workbook.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: null,
    raw: false,
  })

  const destinatarios: DestinatarioParsed[] = []
  const errors: XlsParseError[] = []

  const totalRows = Math.min(rows.length, MAX_ROWS)
  if (rows.length > MAX_ROWS) {
    errors.push({
      row: 0,
      message: `Planilha tem ${rows.length} linhas. Apenas as primeiras ${MAX_ROWS} serão importadas.`,
    })
  }

  for (let i = 0; i < totalRows; i++) {
    const rawRow = rows[i]
    const rowNumber = i + 2

    const mapped: Record<string, unknown> = {}
    for (const key of Object.keys(rawRow)) {
      const alias = HEADER_ALIASES[normalizeHeader(key)]
      if (alias) mapped[alias] = rawRow[key]
    }

    const telefone = normalizePhone(mapped.telefone as string | number | null)
    if (!telefone) {
      errors.push({ row: rowNumber, message: 'Telefone inválido ou ausente' })
      continue
    }

    destinatarios.push({
      nome: toStringOrNull(mapped.nome),
      cnpj: normalizeCnpj(mapped.cnpj as string | number | null),
      registro: toStringOrNull(mapped.registro),
      telefone,
    })
  }

  return { total: destinatarios.length, destinatarios, errors }
}

export function buildDisparoXlsTemplate(): Buffer {
  const data = [
    { nome: 'Exemplo Cliente', cnpj: '12345678000190', registro: 'REG123', telefone: '11999999999' },
  ]
  const worksheet = XLSX.utils.json_to_sheet(data, {
    header: ['nome', 'cnpj', 'registro', 'telefone'],
  })
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Disparo')
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
}
