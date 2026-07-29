import assert from 'node:assert/strict'
import fs from 'node:fs'
import { registerHooks } from 'node:module'
import path from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'server-only') {
      return { url: 'data:text/javascript,export default {}', shortCircuit: true }
    }
    if (!specifier.startsWith('@/')) return nextResolve(specifier, context)

    let resolvedPath = path.resolve(specifier.slice(2))
    if (!path.extname(resolvedPath) && fs.existsSync(`${resolvedPath}.ts`)) {
      resolvedPath = `${resolvedPath}.ts`
    }
    return nextResolve(pathToFileURL(resolvedPath).href, context)
  },
})

const {
  NexusSessionLinkValidationError,
  prepareNexusSessionLink,
} = await import('../lib/server/nexus-message-linking.ts')
const {
  OUVIDORIA_MATRIZ_SECTOR_ID,
  SERVICE_DESK_MATRIZ_SECTOR_ID,
} = await import('../lib/nexus-channel-resolution.ts')

// Identificadores reais: o número compartilhado ServiceDesk/Ouvidoria Matriz e o
// do Financeiro Matriz, que o n8n carimbava em toda resposta do bot.
const CANAL_CLIENTE = '1068061143047980'
const CANAL_ERRADO_DO_BOT = '958565544008403'
const FINANCEIRO_ID = '30000000-0000-4000-8000-000000000001'
const CLIENTE_ID = '40000000-0000-4000-8000-000000000001'
const TELEFONE = '5583988535477'

class TableQuery {
  constructor(rows) {
    this.rows = rows
    this.filters = []
    this.orderKeys = []
    this.from = 0
    this.to = Number.MAX_SAFE_INTEGER
  }

  select() { return this }
  eq(column, value) { this.filters.push((row) => row[column] === value); return this }
  in(column, values) {
    const allowed = new Set(values)
    this.filters.push((row) => allowed.has(row[column]))
    return this
  }
  gte(column, value) { this.filters.push((row) => row[column] >= value); return this }
  lte(column, value) { this.filters.push((row) => row[column] <= value); return this }
  order(column, options) { this.orderKeys.push([column, options?.ascending !== false]); return this }
  range(from, to) { this.from = from; this.to = to; return this }
  then(resolve, reject) { return this.execute().then(resolve, reject) }

  async execute() {
    let rows = this.rows.filter((row) => this.filters.every((filter) => filter(row)))
    for (const [column, ascending] of [...this.orderKeys].reverse()) {
      rows = rows.slice().sort((first, second) => {
        const order = first[column] < second[column] ? -1 : first[column] > second[column] ? 1 : 0
        return ascending ? order : -order
      })
    }
    return { data: rows.slice(this.from, this.to + 1).map((row) => ({ ...row })), error: null }
  }
}

function createSupabase({ mensagens }) {
  const setores = [
    { id: SERVICE_DESK_MATRIZ_SECTOR_ID, phone_number_id: null, assistente_ia: true },
    { id: OUVIDORIA_MATRIZ_SECTOR_ID, phone_number_id: null, assistente_ia: false },
    { id: FINANCEIRO_ID, phone_number_id: null, assistente_ia: true },
  ]
  const setorCanais = [
    { id: 'canal-sd', setor_id: SERVICE_DESK_MATRIZ_SECTOR_ID, instancia: null, phone_number_id: CANAL_CLIENTE, ativo: true },
    { id: 'canal-ouv', setor_id: OUVIDORIA_MATRIZ_SECTOR_ID, instancia: null, phone_number_id: CANAL_CLIENTE, ativo: true },
    { id: 'canal-fin', setor_id: FINANCEIRO_ID, instancia: null, phone_number_id: CANAL_ERRADO_DO_BOT, ativo: true },
  ]
  const tables = { setores, setor_canais: setorCanais, mensagens }
  return {
    from(table) {
      assert.ok(tables[table], `tabela inesperada: ${table}`)
      return new TableQuery(tables[table])
    },
  }
}

const baseMs = Date.now() - 60 * 60_000
const at = (offsetSeconds) => new Date(baseMs + offsetSeconds * 1000).toISOString()

function mensagem(id, remetente, phoneNumberId, offsetSeconds) {
  return {
    id,
    cliente_id: CLIENTE_ID,
    enviado_em: at(offsetSeconds),
    phone_number_id: phoneNumberId,
    remetente,
    ticket_id: null,
    clientes: { telefone: TELEFONE },
  }
}

// A conversa do print: cliente sempre no mesmo canal, bot carimbado com o do
// Financeiro Matriz.
const SESSAO_REAL = [
  mensagem('m1', 'cliente-nexus', CANAL_CLIENTE, 0),
  mensagem('m2', 'bot-nexus', CANAL_ERRADO_DO_BOT, 18),
  mensagem('m3', 'cliente-nexus', CANAL_CLIENTE, 189),
  mensagem('m4', 'bot-nexus', CANAL_ERRADO_DO_BOT, 209),
]

const preparar = (mensagens, messageIds) => prepareNexusSessionLink({
  supabase: createSupabase({ mensagens }),
  messageIds,
  sourceSectorId: SERVICE_DESK_MATRIZ_SECTOR_ID,
  allowedClientIds: [CLIENTE_ID],
  clientPhone: TELEFONE,
})

test('vincula a sessão mesmo com a resposta do bot carimbada com outro canal', async () => {
  // Era o bloqueio do painel Nexus: o bot apontava para o Financeiro Matriz e a
  // sessão inteira era recusada, mesmo com o cliente sempre no mesmo canal.
  const result = await preparar(SESSAO_REAL, ['m1', 'm2', 'm3', 'm4'])

  assert.deepEqual(result.messageIds.sort(), ['m1', 'm2', 'm3', 'm4'])
  assert.equal(result.sourceSectorId, SERVICE_DESK_MATRIZ_SECTOR_ID)
})

test('traz as respostas do bot nas bordas mesmo com o canal errado', async () => {
  // A expansão de fronteira filtrava por canal; sem isso o histórico anexado ao
  // ticket perdia as respostas do bot vizinhas à seleção. A varredura só anda
  // para fora, então `m2`, que é interior, continua vindo de quem seleciona.
  const mensagens = [
    mensagem('m0', 'bot-nexus', CANAL_ERRADO_DO_BOT, -120),
    ...SESSAO_REAL,
  ]

  const result = await preparar(mensagens, ['m1', 'm3'])

  assert.ok(result.messageIds.includes('m0'), 'faltou a resposta do bot anterior à seleção')
  assert.ok(result.messageIds.includes('m4'), 'faltou a resposta do bot posterior à seleção')
})

test('recusa quando as falas do CLIENTE vêm de canais diferentes', async () => {
  const mensagens = [
    mensagem('m1', 'cliente-nexus', CANAL_CLIENTE, 0),
    mensagem('m3', 'cliente-nexus', CANAL_ERRADO_DO_BOT, 189),
  ]

  await assert.rejects(
    preparar(mensagens, ['m1', 'm3']),
    NexusSessionLinkValidationError,
  )
})

test('recusa quando a fala do cliente não é de canal do setor de origem', async () => {
  const mensagens = [mensagem('m1', 'cliente-nexus', 'canal-de-outro-setor', 0)]

  await assert.rejects(
    preparar(mensagens, ['m1']),
    NexusSessionLinkValidationError,
  )
})

test('recusa a sessão sem nenhuma fala do cliente para provar o canal', async () => {
  const mensagens = [
    mensagem('m2', 'bot-nexus', CANAL_ERRADO_DO_BOT, 18),
    mensagem('m4', 'bot-nexus', CANAL_ERRADO_DO_BOT, 209),
  ]

  await assert.rejects(
    preparar(mensagens, ['m2', 'm4']),
    (error) => (
      error instanceof NexusSessionLinkValidationError
      && /comprovar o canal/.test(error.message)
    ),
  )
})

test('recusa mensagem já vinculada a outro ticket', async () => {
  const mensagens = SESSAO_REAL.map((message) => (
    message.id === 'm3' ? { ...message, ticket_id: 'ticket-de-outro' } : message
  ))

  await assert.rejects(
    preparar(mensagens, ['m1', 'm2', 'm3', 'm4']),
    NexusSessionLinkValidationError,
  )
})

test('não puxa a resposta do bot de outra sessão do mesmo cliente', async () => {
  // 63 clientes falaram por dois canais dentro de 25 min nos 7 dias até
  // 29/07/2026. Sem a fronteira por troca de canal, a busca por remetente
  // levaria a resposta do bot da OUTRA conversa para dentro deste ticket — e ao
  // vincular, ela sumiria do painel Nexus daquela sessão.
  const mensagens = [
    mensagem('outro-bot', 'bot-nexus', CANAL_ERRADO_DO_BOT, -200),
    mensagem('outro-cliente', 'cliente-nexus', CANAL_ERRADO_DO_BOT, -240),
    ...SESSAO_REAL,
  ]

  const result = await preparar(mensagens, ['m1', 'm2', 'm3', 'm4'])

  assert.ok(!result.messageIds.includes('outro-cliente'), 'fala do cliente em outro canal não é desta sessão')
  assert.ok(!result.messageIds.includes('outro-bot'), 'resposta do bot da outra sessão não pode ser vinculada')
  assert.deepEqual(result.messageIds.sort(), ['m1', 'm2', 'm3', 'm4'])
})
