// Helpers to export the sector attendance report (tickets of the current
// filtered view) to CSV and XLSX. Used by app/setor/[id]/page.tsx.
//
// CSV is generated manually with a UTF-8 BOM and `,` delimiter (RFC-4180 style
// quoting). XLSX uses the `xlsx` lib, imported lazily so it stays out of the
// main bundle until the user actually exports.

import { formatTicketStatus } from '@/lib/ticket-status'

export interface RelatorioTicket {
  numero?: number | string | null
  canal?: string | null
  status?: string | null
  criado_em?: string | null
  encerrado_em?: string | null
  primeira_resposta_em?: string | null
  clientes?: { nome?: string | null; telefone?: string | null; CNPJ?: string | null } | null
  colaboradores?: { nome?: string | null } | null
  tipos_atendimento?: { nome?: string | null } | null
  avaliacoes?: Array<{ nota?: number | null }> | null
  [key: string]: unknown
}


// Column order shared by CSV and XLSX so both exports stay identical.
const COLUMNS = [
  'Nº ticket',
  'Cliente',
  'Canal',
  'Atendente',
  'Tipo',
  'Status',
  'Abertura',
  'Fechamento',
  '1ª resposta (TMA)',
  'Resolução (TMA)',
  'NPS',
] as const

type Column = (typeof COLUMNS)[number]
type ExportRow = Record<Column, string | number>

function formatDateTime(value?: string | null): string {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function diffMs(start?: string | null, end?: string | null): number | null {
  if (!start || !end) return null
  const a = new Date(start).getTime()
  const b = new Date(end).getTime()
  if (Number.isNaN(a) || Number.isNaN(b)) return null
  const diff = b - a
  return diff >= 0 ? diff : null
}

// HH:MM:SS duration (matches the TMA format shown in the report cards).
function formatDuration(ms: number | null): string {
  if (ms == null || !Number.isFinite(ms)) return ''
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function buildRelatorioRows(tickets: RelatorioTicket[]): ExportRow[] {
  return tickets.map((t) => {
    const cliente = t.clientes?.nome || t.clientes?.telefone || 'Desconhecido'
    const primeiraRespostaMs = diffMs(t.criado_em, t.primeira_resposta_em)
    const resolucaoMs = t.status === 'encerrado' ? diffMs(t.criado_em, t.encerrado_em) : null
    const nota = t.avaliacoes?.[0]?.nota
    return {
      'Nº ticket': t.numero != null ? `#${t.numero}` : '',
      Cliente: cliente,
      Canal: t.canal || '',
      Atendente: t.colaboradores?.nome || '',
      Tipo: t.tipos_atendimento?.nome || '',
      Status: formatTicketStatus(t.status),
      Abertura: formatDateTime(t.criado_em),
      Fechamento: formatDateTime(t.encerrado_em),
      '1ª resposta (TMA)': formatDuration(primeiraRespostaMs),
      'Resolução (TMA)': formatDuration(resolucaoMs),
      NPS: nota != null ? nota : '',
    }
  })
}

function escapeCsvValue(value: string | number): string {
  const str = String(value ?? '')
  // Quote when the value contains the delimiter, quotes or line breaks.
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export function buildRelatorioCsv(tickets: RelatorioTicket[]): string {
  const rows = buildRelatorioRows(tickets)
  const header = COLUMNS.map((c) => escapeCsvValue(c)).join(',')
  const body = rows
    .map((row) => COLUMNS.map((col) => escapeCsvValue(row[col])).join(','))
    .join('\r\n')
  return body ? `${header}\r\n${body}` : header
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function exportRelatorioCsv(
  tickets: RelatorioTicket[],
  filename = 'relatorio-atendimentos.csv',
): void {
  const csv = buildRelatorioCsv(tickets)
  // Prepend a UTF-8 BOM so Excel renders accents correctly.
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8;' })
  triggerDownload(blob, filename)
}

export async function exportRelatorioXlsx(
  tickets: RelatorioTicket[],
  filename = 'relatorio-atendimentos.xlsx',
): Promise<void> {
  const XLSX = await import('xlsx')
  const rows = buildRelatorioRows(tickets)
  const worksheet = XLSX.utils.json_to_sheet(rows, { header: [...COLUMNS] })
  worksheet['!cols'] = COLUMNS.map((c) => ({ wch: Math.max(12, c.length + 4) }))
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Atendimentos')
  // Build the file in-memory and download via Blob — avoids relying on the
  // package's environment detection / Node `fs` inside the client bundle.
  const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  triggerDownload(blob, filename)
}
