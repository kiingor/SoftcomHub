import assert from 'node:assert/strict'
import fs from 'node:fs'
import { registerHooks } from 'node:module'
import path from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'

const moduleUrl = (source) => `data:text/javascript,${encodeURIComponent(source)}`

const mockedModules = {
  'server-only': moduleUrl('export {}'),
  'next/server': moduleUrl(`
    export const NextResponse = {
      json(body, init) {
        return new Response(JSON.stringify(body), {
          status: init?.status ?? 200,
          headers: { 'content-type': 'application/json' },
        })
      },
    }
  `),
  '@/lib/supabase/server': moduleUrl(`
    export async function createClient() {
      return {
        auth: {
          async getUser() {
            const email = globalThis.__managerSupportUserEmail
            return { data: { user: email ? { email } : null } }
          },
        },
      }
    }
  `),
  '@/lib/supabase/service': moduleUrl(`
    export function createServiceClient() {
      return globalThis.__managerSupportDatabase
    }
  `),
  '@/lib/push': moduleUrl(`
    export async function sendPushToColaboradores(service, collaboratorIds, payload) {
      globalThis.__managerSupportPushCalls.push({ service, collaboratorIds, payload })
      const failure = globalThis.__managerSupportPushFailures.shift()
      if (failure) throw failure
      return { sent: collaboratorIds.length, failed: 0 }
    }
  `),
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (mockedModules[specifier]) {
      return { shortCircuit: true, url: mockedModules[specifier] }
    }

    if (specifier.startsWith('@/')) {
      let resolvedPath = path.resolve(specifier.slice(2))
      if (!path.extname(resolvedPath) && fs.existsSync(`${resolvedPath}.ts`)) {
        resolvedPath = `${resolvedPath}.ts`
      }
      return { shortCircuit: true, url: pathToFileURL(resolvedPath).href }
    }

    return nextResolve(specifier, context)
  },
})

const supportRoute = await import('../app/api/tickets/[ticketId]/apoio-gestor/route.ts')
const messagesRoute = await import('../app/api/tickets/[ticketId]/apoio-gestor/mensagens/route.ts')
const managersRoute = await import('../app/api/setores/[id]/gestores/route.ts')

const SECTOR_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_SECTOR_ID = '11111111-1111-4111-8111-222222222222'
const TICKET_ID = '22222222-2222-4222-8222-222222222222'
const ATTENDANT_ID = '33333333-3333-4333-8333-333333333333'
const REGULAR_ID = '44444444-4444-4444-8444-444444444444'
const MANAGER_A_ID = '55555555-5555-4555-8555-555555555555'
const MANAGER_B_ID = '66666666-6666-4666-8666-666666666666'
const MANAGER_OUTSIDE_ID = '77777777-7777-4777-8777-777777777777'
const SUPPORT_ID = '88888888-8888-4888-8888-888888888888'
const SUPPORT_B_ID = '88888888-8888-4888-8888-999999999999'
const ADMIN_ID = '99999999-9999-4999-8999-999999999999'

const ATTENDANT = collaborator({
  id: ATTENDANT_ID,
  name: 'Atendente Dono',
  email: 'atendente@softcom.test',
})
const REGULAR = collaborator({
  id: REGULAR_ID,
  name: 'Atendente Sem Ticket',
  email: 'regular@softcom.test',
})
const MANAGER_A = collaborator({
  id: MANAGER_A_ID,
  name: 'Gestor A',
  email: 'gestor-a@softcom.test',
  canViewDashboard: true,
})
const MANAGER_B = collaborator({
  id: MANAGER_B_ID,
  name: 'Gestor B',
  email: 'gestor-b@softcom.test',
  canViewDashboard: true,
})
const MANAGER_OUTSIDE = collaborator({
  id: MANAGER_OUTSIDE_ID,
  name: 'Gestor Fora do Setor',
  email: 'gestor-fora@softcom.test',
  canViewDashboard: true,
})
const ADMIN = collaborator({
  id: ADMIN_ID,
  name: 'Administrador',
  email: 'admin@softcom.test',
  isMaster: true,
})

function collaborator({
  id,
  name,
  email,
  canViewDashboard = false,
  canManageUsers = false,
  isMaster = false,
  legacySectorId = null,
  active = true,
}) {
  return {
    id,
    nome: name,
    email,
    ativo: active,
    is_master: isMaster,
    setor_id: legacySectorId,
    permissoes: {
      can_view_dashboard: canViewDashboard,
      can_manage_users: canManageUsers,
    },
  }
}

function ticket() {
  return {
    id: TICKET_ID,
    numero: 96438,
    status: 'em_atendimento',
    setor_id: SECTOR_ID,
    colaborador_id: ATTENDANT_ID,
    colaboradores: { nome: ATTENDANT.nome },
  }
}

function managerLink(managerId, sectorId = SECTOR_ID) {
  return {
    setor_id: sectorId,
    colaborador_id: managerId,
    criado_em: '2026-08-10T12:00:00.000Z',
  }
}

function activeSupport(overrides = {}) {
  return {
    id: SUPPORT_ID,
    ticket_id: TICKET_ID,
    setor_id: SECTOR_ID,
    atendente_id: ATTENDANT_ID,
    atendente_nome: ATTENDANT.nome,
    solicitante_id: ATTENDANT_ID,
    gestor_id: MANAGER_A_ID,
    gestor_nome: MANAGER_A.nome,
    origem: 'atendente',
    status: 'ativo',
    motivo: null,
    solicitado_em: '2026-08-10T12:00:00.000Z',
    aceito_em: '2026-08-10T12:01:00.000Z',
    encerrado_em: null,
    encerrado_por_id: null,
    atualizado_em: '2026-08-10T12:01:00.000Z',
    ...overrides,
  }
}

function pendingSupport(overrides = {}) {
  return {
    ...activeSupport(),
    gestor_id: null,
    gestor_nome: null,
    status: 'pendente',
    aceito_em: null,
    atualizado_em: '2026-08-10T12:00:00.000Z',
    ...overrides,
  }
}

function closedSupport(overrides = {}) {
  return {
    ...activeSupport(),
    status: 'encerrado',
    encerrado_em: '2026-08-10T12:02:00.000Z',
    encerrado_por_id: ATTENDANT_ID,
    atualizado_em: '2026-08-10T12:02:00.000Z',
    ...overrides,
  }
}

class FakeQuery {
  constructor(database, table) {
    this.database = database
    this.table = table
    this.operation = 'select'
    this.payload = null
    this.filters = []
    this.orders = []
    this.rowLimit = null
    this.returnsRows = false
  }

  select() {
    if (this.operation !== 'select') this.returnsRows = true
    return this
  }

  insert(payload) {
    this.operation = 'insert'
    this.payload = payload
    return this
  }

  update(payload) {
    this.operation = 'update'
    this.payload = payload
    return this
  }

  delete() {
    this.operation = 'delete'
    return this
  }

  eq(column, value) {
    this.filters.push({ kind: 'eq', column, value })
    return this
  }

  in(column, values) {
    this.filters.push({ kind: 'in', column, value: [...values] })
    return this
  }

  is(column, value) {
    this.filters.push({ kind: 'is', column, value })
    return this
  }

  order(column, options = {}) {
    this.orders.push({ column, ascending: options.ascending !== false })
    return this
  }

  limit(value) {
    this.rowLimit = value
    return this
  }

  async maybeSingle() {
    const result = await this.execute()
    if (result.error) return result
    if (!result.data || result.data.length === 0) return { data: null, error: null }
    if (result.data.length > 1) {
      return { data: null, error: { message: 'Multiple rows returned' } }
    }
    return { data: result.data[0], error: null }
  }

  then(onFulfilled, onRejected) {
    return this.execute().then(onFulfilled, onRejected)
  }

  async execute() {
    this.database.calls.push({
      table: this.table,
      operation: this.operation,
      payload: this.payload,
      filters: this.filters.map((filter) => ({ ...filter })),
      orders: this.orders.map((order) => ({ ...order })),
    })

    if (this.operation === 'insert') return this.executeInsert()
    if (this.operation === 'update') return this.executeUpdate()
    if (this.operation === 'delete') return this.executeDelete()

    return { data: this.filteredRows().map((row) => ({ ...row })), error: null }
  }

  filteredRows() {
    let rows = this.database.table(this.table).filter((row) => (
      this.filters.every((filter) => {
        if (filter.kind === 'eq') return row[filter.column] === filter.value
        if (filter.kind === 'in') return filter.value.includes(row[filter.column])
        return filter.value === null
          ? row[filter.column] === null || row[filter.column] === undefined
          : row[filter.column] === filter.value
      })
    ))

    for (const order of [...this.orders].reverse()) {
      rows = [...rows].sort((left, right) => {
        const comparison = String(left[order.column]).localeCompare(String(right[order.column]))
        return order.ascending ? comparison : -comparison
      })
    }

    return this.rowLimit === null ? rows : rows.slice(0, this.rowLimit)
  }

  async executeInsert() {
    const failure = this.database.consumeInsertFailure(this.table)
    if (failure) return { data: null, error: failure }

    const values = Array.isArray(this.payload) ? this.payload : [this.payload]
    const rows = values.map((value) => this.database.withDefaults(this.table, value))
    const notificationResult = this.table === 'ticket_apoios_gestor'
      ? this.database.prepareSupportNotifications([], rows)
      : { notifications: [], error: null }
    if (notificationResult.error) return { data: null, error: notificationResult.error }

    this.database.table(this.table).push(...rows)
    this.database.table('notificacoes').push(...notificationResult.notifications)

    return {
      data: this.returnsRows ? rows.map((row) => ({ ...row })) : null,
      error: null,
    }
  }

  async executeUpdate() {
    const rows = this.filteredRows()
    const updatedRows = rows.map((row) => ({ ...row, ...this.payload }))
    const notificationResult = this.table === 'ticket_apoios_gestor'
      ? this.database.prepareSupportNotifications(rows, updatedRows)
      : { notifications: [], error: null }
    if (notificationResult.error) return { data: null, error: notificationResult.error }

    for (const row of rows) Object.assign(row, this.payload)
    this.database.table('notificacoes').push(...notificationResult.notifications)
    return {
      data: this.returnsRows ? rows.map((row) => ({ ...row })) : null,
      error: null,
    }
  }

  async executeDelete() {
    const selected = new Set(this.filteredRows())
    this.database.tables[this.table] = this.database.table(this.table)
      .filter((row) => !selected.has(row))
    return { data: null, error: null }
  }
}

class FakeDatabase {
  constructor(tables = {}) {
    this.sequence = 0
    this.calls = []
    this.insertFailures = new Map()
    this.rpcFailures = new Map()
    this.rpcHooks = new Map()
    this.supportNotificationFailures = []
    this.tables = {
      colaboradores: [],
      tickets: [],
      setor_gestores: [],
      colaborador_setores: [],
      colaboradores_setores: [],
      ticket_apoios_gestor: [],
      ticket_apoio_mensagens: [],
      notificacoes: [],
      ...structuredClone(tables),
    }
  }

  from(table) {
    return new FakeQuery(this, table)
  }

  async rpc(name, args) {
    this.calls.push({
      operation: 'rpc',
      name,
      args: structuredClone(args),
    })

    const failure = this.consumeRpcFailure(name)
    if (failure) return { data: null, error: failure }
    const hook = this.consumeRpcHook(name)
    if (hook) hook(this, args)

    if (name === 'chama_gestor_definir_gestor_setor') {
      return this.defineSectorManager(args)
    }
    if (name === 'chama_gestor_aceitar_apoio') {
      return this.acceptManagerSupport(args)
    }
    return { data: null, error: { message: `Unknown RPC: ${name}` } }
  }

  defineSectorManager(args) {
    const sectorId = args.p_setor_id
    const collaboratorId = args.p_colaborador_id
    const currentLinks = this.table('setor_gestores')
    const linkExists = currentLinks.some((link) => (
      link.setor_id === sectorId && link.colaborador_id === collaboratorId
    ))

    if (args.p_incluir === true) {
      if (linkExists) return { data: false, error: null }
      currentLinks.push({
        setor_id: sectorId,
        colaborador_id: collaboratorId,
        criado_em: '2026-08-10T12:00:00.000Z',
      })
      return { data: true, error: null }
    }

    if (!linkExists) return { data: false, error: null }
    this.tables.setor_gestores = currentLinks.filter((link) => (
      link.setor_id !== sectorId || link.colaborador_id !== collaboratorId
    ))
    return { data: true, error: null }
  }

  acceptManagerSupport(args) {
    const support = this.table('ticket_apoios_gestor').find((row) => (
      row.id === args.p_apoio_id && row.ticket_id === args.p_ticket_id
    ))
    if (!support || support.status !== 'pendente' || support.gestor_id) {
      return { data: false, error: null }
    }

    const manager = this.table('colaboradores').find((row) => row.id === args.p_gestor_id)
    const now = '2026-08-10T12:01:00.000Z'
    const updatedSupport = {
      ...support,
      gestor_id: args.p_gestor_id,
      gestor_nome: manager?.nome ?? 'Gestor',
      status: 'ativo',
      aceito_em: now,
      atualizado_em: now,
    }
    const notificationResult = this.prepareSupportNotifications([support], [updatedSupport])
    if (notificationResult.error) return { data: null, error: notificationResult.error }

    Object.assign(support, updatedSupport)
    this.table('notificacoes').push(...notificationResult.notifications)
    return { data: true, error: null }
  }

  failNextInsert(table, error = { message: 'Insert failed' }) {
    const failures = this.insertFailures.get(table) ?? []
    failures.push(error)
    this.insertFailures.set(table, failures)
  }

  failNextRpc(name, error = { message: 'RPC failed' }) {
    const failures = this.rpcFailures.get(name) ?? []
    failures.push(error)
    this.rpcFailures.set(name, failures)
  }

  beforeNextRpc(name, hook) {
    const hooks = this.rpcHooks.get(name) ?? []
    hooks.push(hook)
    this.rpcHooks.set(name, hooks)
  }

  consumeInsertFailure(table) {
    const failures = this.insertFailures.get(table)
    if (!failures?.length) return null
    return failures.shift()
  }

  consumeRpcFailure(name) {
    const failures = this.rpcFailures.get(name)
    if (!failures?.length) return null
    return failures.shift()
  }

  consumeRpcHook(name) {
    const hooks = this.rpcHooks.get(name)
    if (!hooks?.length) return null
    return hooks.shift()
  }

  failNextSupportNotification(error = { code: 'P0001', message: 'Support notification failed' }) {
    this.supportNotificationFailures.push(error)
  }

  prepareSupportNotifications(previousRows, nextRows) {
    const notificationValues = []

    for (let index = 0; index < nextRows.length; index += 1) {
      const previous = previousRows[index] ?? null
      const support = nextRows[index]
      const isPendingCreation = previous === null && support.status === 'pendente'
      const isActiveCreation = previous === null && support.status === 'ativo'
      const isAcceptance = previous?.status === 'pendente' && support.status === 'ativo'
      if (!isPendingCreation && !isActiveCreation && !isAcceptance) continue

      const ticketNumber = this.table('tickets')
        .find((ticketRow) => ticketRow.id === support.ticket_id)?.numero
      const ticketLabel = ticketNumber ? `ticket #${ticketNumber}` : 'ticket selecionado'

      if (isPendingCreation) {
        const recipientIds = this.table('setor_gestores')
          .filter((link) => link.setor_id === support.setor_id)
          .map((link) => link.colaborador_id)
          .filter((managerId) => managerId !== support.atendente_id)
          .filter((managerId) => {
            const manager = this.table('colaboradores').find((row) => row.id === managerId)
            if (!manager?.ativo) return false
            if (manager.is_master === true) return true
            if (manager.permissoes?.can_view_dashboard !== true) return false
            return manager.setor_id === support.setor_id
              || this.table('colaborador_setores').some((link) => (
                link.setor_id === support.setor_id && link.colaborador_id === managerId
              ))
              || this.table('colaboradores_setores').some((link) => (
                link.setor_id === support.setor_id && link.colaborador_id === managerId
              ))
          })

        if (recipientIds.length === 0) {
          return {
            notifications: [],
            error: {
              code: '23514',
              message: 'Não há gestor elegível para receber o chamado',
            },
          }
        }

        notificationValues.push(...recipientIds.map((recipientId) => ({
          setor_id: support.setor_id,
          remetente_id: support.atendente_id,
          destinatario_id: recipientId,
          titulo: 'Atendente solicitou apoio',
          mensagem: `${support.atendente_nome} solicitou um gestor no ${ticketLabel}.`,
          tipo: 'chama_gestor',
          ticket_id: support.ticket_id,
          url: `/setor/${support.setor_id}?ticket=${support.ticket_id}&apoio=${support.id}`,
        })))
        continue
      }

      notificationValues.push({
        setor_id: support.setor_id,
        remetente_id: support.gestor_id,
        destinatario_id: support.atendente_id,
        titulo: isActiveCreation ? 'Gestor iniciou um apoio' : 'Gestor aceitou o chamado',
        mensagem: isActiveCreation
          ? `${support.gestor_nome ?? 'Gestor'} iniciou apoio no ${ticketLabel}.`
          : `${support.gestor_nome ?? 'Gestor'} aceitou o apoio do ${ticketLabel}.`,
        tipo: 'chama_gestor',
        ticket_id: support.ticket_id,
        url: `/workdesk?ticket=${support.ticket_id}&apoio=${support.id}`,
      })
    }

    if (notificationValues.length === 0) return { notifications: [], error: null }
    const failure = this.supportNotificationFailures.shift()
    if (failure) return { notifications: [], error: failure }

    return {
      notifications: notificationValues.map((value) => this.withDefaults('notificacoes', value)),
      error: null,
    }
  }

  table(name) {
    if (!this.tables[name]) this.tables[name] = []
    return this.tables[name]
  }

  withDefaults(table, value) {
    this.sequence += 1
    const now = `2026-08-10T12:${String(this.sequence).padStart(2, '0')}:00.000Z`

    if (table === 'ticket_apoios_gestor') {
      return {
        id: `90000000-0000-4000-8000-${String(this.sequence).padStart(12, '0')}`,
        gestor_id: null,
        gestor_nome: null,
        motivo: null,
        solicitado_em: now,
        aceito_em: null,
        encerrado_em: null,
        encerrado_por_id: null,
        atualizado_em: now,
        ...value,
      }
    }

    if (table === 'ticket_apoio_mensagens') {
      return {
        id: `91000000-0000-4000-8000-${String(this.sequence).padStart(12, '0')}`,
        criado_em: now,
        ...value,
      }
    }

    if (table === 'notificacoes') {
      return {
        id: `92000000-0000-4000-8000-${String(this.sequence).padStart(12, '0')}`,
        criado_em: now,
        ...value,
      }
    }

    return { ...value }
  }
}

function createEnvironment(overrides = {}) {
  const database = new FakeDatabase({
    colaboradores: [ATTENDANT, REGULAR, MANAGER_A, MANAGER_B, MANAGER_OUTSIDE, ADMIN],
    setores: [{ id: SECTOR_ID }],
    tickets: [ticket()],
    setor_gestores: [managerLink(MANAGER_A_ID), managerLink(MANAGER_B_ID)],
    colaborador_setores: [
      managerLink(MANAGER_A_ID),
      managerLink(MANAGER_B_ID),
    ],
    ...overrides,
  })

  globalThis.__managerSupportDatabase = database
  globalThis.__managerSupportPushCalls = []
  globalThis.__managerSupportPushFailures = []
  globalThis.__managerSupportUserEmail = null
  return database
}

async function runAs(actor, handler, request) {
  globalThis.__managerSupportUserEmail = actor.email
  const response = await handler(request, {
    params: Promise.resolve({ ticketId: TICKET_ID }),
  })
  return { response, body: await response.json() }
}

async function runManagerGroupAs(actor, handler, request) {
  globalThis.__managerSupportUserEmail = actor.email
  const response = await handler(request, {
    params: Promise.resolve({ id: SECTOR_ID }),
  })
  return { response, body: await response.json() }
}

async function captureExpectedErrors(action) {
  const originalError = console.error
  const errors = []
  console.error = (...values) => errors.push(values)
  try {
    return { result: await action(), errors }
  } finally {
    console.error = originalError
  }
}

function supportRequest(method = 'POST', body) {
  return new Request(`http://localhost/api/tickets/${TICKET_ID}/apoio-gestor`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
}

function messageRequest(content, supportId = SUPPORT_ID) {
  return new Request(`http://localhost/api/tickets/${TICKET_ID}/apoio-gestor/mensagens`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apoioId: supportId, conteudo: content }),
  })
}

function supportGetRequest(supportId) {
  const query = supportId ? `?apoioId=${encodeURIComponent(supportId)}` : ''
  return new Request(`http://localhost/api/tickets/${TICKET_ID}/apoio-gestor${query}`)
}

function managerGroupRequest(method = 'GET', operation) {
  return new Request(`http://localhost/api/setores/${SECTOR_ID}/gestores`, {
    method,
    headers: operation ? { 'Content-Type': 'application/json' } : undefined,
    body: operation ? JSON.stringify(operation) : undefined,
  })
}

test('atendente responsável cria apoio pendente e avisa todos os gestores elegíveis', async () => {
  const database = createEnvironment()

  const { response, body } = await runAs(
    ATTENDANT,
    supportRoute.POST,
    supportRequest(),
  )

  assert.equal(response.status, 201)
  assert.equal(body.support.status, 'pendente')
  assert.equal(body.support.atendente_id, ATTENDANT_ID)
  assert.equal(database.tables.ticket_apoios_gestor.length, 1)

  const notifications = database.tables.notificacoes
  assert.equal(notifications.length, 2)
  assert.deepEqual(
    new Set(notifications.map((notification) => notification.destinatario_id)),
    new Set([MANAGER_A_ID, MANAGER_B_ID]),
  )
  assert.ok(notifications.every((notification) => notification.tipo === 'chama_gestor'))
  assert.ok(notifications.every((notification) => notification.url.includes(`/setor/${SECTOR_ID}?ticket=${TICKET_ID}`)))
  assert.equal(database.calls.some((call) => (
    call.table === 'notificacoes' && call.operation === 'insert'
  )), false)

  assert.equal(globalThis.__managerSupportPushCalls.length, 1)
  assert.deepEqual(
    new Set(globalThis.__managerSupportPushCalls[0].collaboratorIds),
    new Set([MANAGER_A_ID, MANAGER_B_ID]),
  )
})

test('colaborador regular que não é dono do ticket recebe 403', async () => {
  const database = createEnvironment()

  const { response, body } = await runAs(REGULAR, supportRoute.POST, supportRequest())

  assert.equal(response.status, 403)
  assert.equal(body.code, 'SUPPORT_FORBIDDEN')
  assert.equal(database.tables.ticket_apoios_gestor.length, 0)
  assert.equal(database.tables.notificacoes.length, 0)
})

test('primeiro gestor aceita com CAS e segundo gestor recebe conflito', async () => {
  const database = createEnvironment({
    ticket_apoios_gestor: [pendingSupport()],
  })

  const first = await runAs(
    MANAGER_A,
    supportRoute.PATCH,
    supportRequest('PATCH', { action: 'accept', apoioId: SUPPORT_ID }),
  )
  const second = await runAs(
    MANAGER_B,
    supportRoute.PATCH,
    supportRequest('PATCH', { action: 'accept', apoioId: SUPPORT_ID }),
  )

  assert.equal(first.response.status, 200)
  assert.equal(first.body.support.status, 'ativo')
  assert.equal(first.body.support.gestor_id, MANAGER_A_ID)
  assert.equal(second.response.status, 409)
  assert.equal(second.body.code, 'SUPPORT_ALREADY_TAKEN')
  assert.equal(database.tables.ticket_apoios_gestor[0].gestor_id, MANAGER_A_ID)
  assert.equal(database.tables.notificacoes.length, 1)
  assert.equal(database.tables.notificacoes[0].destinatario_id, ATTENDANT_ID)
  assert.equal(database.tables.notificacoes[0].tipo, 'chama_gestor')
  assert.equal(database.calls.some((call) => (
    call.table === 'notificacoes' && call.operation === 'insert'
  )), false)

  const acceptanceCalls = database.calls.filter((call) => (
    call.operation === 'rpc' && call.name === 'chama_gestor_aceitar_apoio'
  ))
  assert.equal(acceptanceCalls.length, 1)
  assert.deepEqual(acceptanceCalls[0].args, {
    p_ticket_id: TICKET_ID,
    p_apoio_id: SUPPORT_ID,
    p_gestor_id: MANAGER_A_ID,
  })
  assert.equal(database.calls.some((call) => (
    call.table === 'ticket_apoios_gestor' && call.operation === 'update'
  )), false)
})

test('CAS perdido na RPC é reconciliado como chamado aceito por outro gestor', async () => {
  const database = createEnvironment({
    ticket_apoios_gestor: [pendingSupport()],
  })
  database.beforeNextRpc('chama_gestor_aceitar_apoio', (currentDatabase) => {
    Object.assign(currentDatabase.tables.ticket_apoios_gestor[0], {
      gestor_id: MANAGER_B_ID,
      gestor_nome: MANAGER_B.nome,
      status: 'ativo',
      aceito_em: '2026-08-10T12:01:00.000Z',
    })
  })

  const result = await runAs(
    MANAGER_A,
    supportRoute.PATCH,
    supportRequest('PATCH', { action: 'accept', apoioId: SUPPORT_ID }),
  )

  assert.equal(result.response.status, 409)
  assert.equal(result.body.code, 'SUPPORT_ALREADY_TAKEN')
  assert.equal(database.tables.ticket_apoios_gestor[0].gestor_id, MANAGER_B_ID)
  assert.equal(globalThis.__managerSupportPushCalls.length, 0)
})

test('CAS repetido pelo mesmo gestor retorna sucesso idempotente sem novo Push', async () => {
  const database = createEnvironment({
    ticket_apoios_gestor: [pendingSupport()],
  })
  database.beforeNextRpc('chama_gestor_aceitar_apoio', (currentDatabase) => {
    Object.assign(currentDatabase.tables.ticket_apoios_gestor[0], {
      gestor_id: MANAGER_A_ID,
      gestor_nome: MANAGER_A.nome,
      status: 'ativo',
      aceito_em: '2026-08-10T12:01:00.000Z',
    })
  })

  const result = await runAs(
    MANAGER_A,
    supportRoute.PATCH,
    supportRequest('PATCH', { action: 'accept', apoioId: SUPPORT_ID }),
  )

  assert.equal(result.response.status, 200)
  assert.equal(result.body.idempotent, true)
  assert.equal(result.body.support.gestor_id, MANAGER_A_ID)
  assert.equal(globalThis.__managerSupportPushCalls.length, 0)
})

test('deadlock no aceite retorna conflito recuperável sem alterar o apoio', async () => {
  const database = createEnvironment({
    ticket_apoios_gestor: [pendingSupport()],
  })
  database.failNextRpc('chama_gestor_aceitar_apoio', {
    code: '40P01',
    message: 'deadlock detected',
  })

  const result = await runAs(
    MANAGER_A,
    supportRoute.PATCH,
    supportRequest('PATCH', { action: 'accept', apoioId: SUPPORT_ID }),
  )

  assert.equal(result.response.status, 409)
  assert.equal(result.body.code, 'SUPPORT_CONTEXT_CHANGED')
  assert.equal(database.tables.ticket_apoios_gestor[0].status, 'pendente')
  assert.equal(globalThis.__managerSupportPushCalls.length, 0)
})

test('POST de tela idle antiga não aceita solicitação pendente criada depois', async () => {
  const database = createEnvironment({
    ticket_apoios_gestor: [pendingSupport()],
  })

  const staleStart = await runAs(
    MANAGER_A,
    supportRoute.POST,
    supportRequest(),
  )

  assert.equal(staleStart.response.status, 409)
  assert.equal(staleStart.body.code, 'SUPPORT_CONTEXT_CHANGED')
  assert.equal(database.tables.ticket_apoios_gestor[0].status, 'pendente')
  assert.equal(database.tables.ticket_apoios_gestor[0].gestor_id, null)
  assert.equal(database.calls.some((call) => (
    call.table === 'ticket_apoios_gestor' && call.operation === 'update'
  )), false)
})

test('somente os dois participantes enviam mensagens no apoio ativo', async () => {
  const database = createEnvironment({
    ticket_apoios_gestor: [activeSupport()],
  })

  const attendantMessage = await runAs(
    ATTENDANT,
    messagesRoute.POST,
    messageRequest('Preciso de orientação neste caso.'),
  )
  const managerMessage = await runAs(
    MANAGER_A,
    messagesRoute.POST,
    messageRequest('Vou orientar o procedimento.'),
  )
  const otherManagerMessage = await runAs(
    MANAGER_B,
    messagesRoute.POST,
    messageRequest('Tentativa de terceiro participante.'),
  )

  assert.equal(attendantMessage.response.status, 201)
  assert.equal(managerMessage.response.status, 201)
  assert.equal(otherManagerMessage.response.status, 403)
  assert.equal(otherManagerMessage.body.code, 'SUPPORT_FORBIDDEN')
  assert.deepEqual(
    database.tables.ticket_apoio_mensagens.map((message) => message.autor_id),
    [ATTENDANT_ID, MANAGER_A_ID],
  )
  assert.deepEqual(
    database.tables.notificacoes.map((notification) => notification.destinatario_id),
    [MANAGER_A_ID, ATTENDANT_ID],
  )
  assert.ok(database.tables.notificacoes[0].url.startsWith(`/setor/${SECTOR_ID}?ticket=${TICKET_ID}`))
  assert.ok(database.tables.notificacoes[1].url.startsWith(`/workdesk?ticket=${TICKET_ID}`))
  assert.ok(database.tables.notificacoes.every((notification) => notification.tipo === 'chama_gestor'))
  assert.deepEqual(
    globalThis.__managerSupportPushCalls.map((call) => call.collaboratorIds),
    [[MANAGER_A_ID], [ATTENDANT_ID]],
  )
  assert.ok(globalThis.__managerSupportPushCalls.every((call) => (
    call.payload.tag === `apoio-gestor-mensagem-${SUPPORT_ID}`
  )))
})

test('falha ao avisar nova mensagem não desfaz nem falha o envio já persistido', async () => {
  const database = createEnvironment({
    ticket_apoios_gestor: [activeSupport()],
  })
  database.failNextInsert('notificacoes', { message: 'notification storage unavailable' })

  const { result } = await captureExpectedErrors(() => runAs(
    ATTENDANT,
    messagesRoute.POST,
    messageRequest('Mensagem persistida apesar do aviso.'),
  ))

  assert.equal(result.response.status, 201)
  assert.equal(database.tables.ticket_apoio_mensagens.length, 1)
  assert.equal(database.tables.notificacoes.length, 0)
  assert.equal(globalThis.__managerSupportPushCalls.length, 0)
})

test('GET mantém somente as 500 mensagens mais recentes em ordem cronológica', async () => {
  const messages = Array.from({ length: 505 }, (_, index) => ({
    id: `message-${String(index).padStart(3, '0')}`,
    apoio_id: SUPPORT_ID,
    autor_id: index % 2 === 0 ? ATTENDANT_ID : MANAGER_A_ID,
    autor_nome: index % 2 === 0 ? ATTENDANT.nome : MANAGER_A.nome,
    conteudo: `Mensagem ${index}`,
    criado_em: new Date(Date.UTC(2026, 7, 10, 12, 0, index)).toISOString(),
  }))
  const database = createEnvironment({
    ticket_apoios_gestor: [activeSupport()],
    ticket_apoio_mensagens: messages,
  })

  const history = await runAs(
    ATTENDANT,
    supportRoute.GET,
    supportGetRequest(SUPPORT_ID),
  )

  assert.equal(history.response.status, 200)
  assert.equal(history.body.messages.length, 500)
  assert.equal(history.body.messages[0].id, 'message-005')
  assert.equal(history.body.messages.at(-1).id, 'message-504')

  const messagesQuery = database.calls.find((call) => (
    call.table === 'ticket_apoio_mensagens' && call.operation === 'select'
  ))
  assert.deepEqual(messagesQuery.orders, [
    { column: 'criado_em', ascending: false },
    { column: 'id', ascending: false },
  ])
})

test('gestor com vínculo antigo no grupo, mas fora do setor atual, recebe 403', async () => {
  const database = createEnvironment({
    setor_gestores: [managerLink(MANAGER_OUTSIDE_ID)],
    colaborador_setores: [managerLink(MANAGER_OUTSIDE_ID, OTHER_SECTOR_ID)],
  })

  const { response, body } = await runAs(
    MANAGER_OUTSIDE,
    supportRoute.POST,
    supportRequest(),
  )

  assert.equal(response.status, 403)
  assert.equal(body.code, 'SUPPORT_FORBIDDEN')
  assert.equal(database.tables.ticket_apoios_gestor.length, 0)
})

test('GET omite gestor stale, mas a operação por membro ainda consegue removê-lo', async () => {
  const inactiveManager = collaborator({
    id: MANAGER_B_ID,
    name: MANAGER_B.nome,
    email: MANAGER_B.email,
    canViewDashboard: true,
    active: false,
  })
  const database = createEnvironment({
    colaboradores: [
      ATTENDANT,
      REGULAR,
      MANAGER_A,
      inactiveManager,
      MANAGER_OUTSIDE,
      ADMIN,
    ],
    setor_gestores: [
      managerLink(MANAGER_A_ID),
      managerLink(MANAGER_B_ID),
    ],
    colaborador_setores: [
      managerLink(MANAGER_A_ID),
      managerLink(MANAGER_B_ID),
      managerLink(REGULAR_ID),
    ],
  })

  const listed = await runManagerGroupAs(
    ADMIN,
    managersRoute.GET,
    managerGroupRequest(),
  )

  assert.equal(listed.response.status, 200)
  assert.deepEqual(listed.body.gestores.map((manager) => manager.id), [MANAGER_A_ID])

  const removed = await runManagerGroupAs(
    ADMIN,
    managersRoute.PUT,
    managerGroupRequest('PUT', { colaboradorId: MANAGER_B_ID, incluir: false }),
  )

  assert.equal(removed.response.status, 200)
  assert.deepEqual(
    database.tables.setor_gestores.map((link) => link.colaborador_id),
    [MANAGER_A_ID],
  )
  const operationCalls = database.calls.filter((call) => (
    call.operation === 'rpc' && call.name === 'chama_gestor_definir_gestor_setor'
  ))
  assert.equal(operationCalls.length, 1)
  assert.deepEqual(operationCalls[0].args, {
    p_setor_id: SECTOR_ID,
    p_colaborador_id: MANAGER_B_ID,
    p_incluir: false,
  })
  assert.equal(database.calls.some((call) => (
    call.table === 'setor_gestores' && ['insert', 'delete'].includes(call.operation)
  )), false)

  const invalid = await runManagerGroupAs(
    ADMIN,
    managersRoute.PUT,
    managerGroupRequest('PUT', { colaboradorId: REGULAR_ID, incluir: true }),
  )

  assert.equal(invalid.response.status, 422)
  assert.equal(invalid.body.code, 'INVALID_MANAGER_SELECTION')
  assert.deepEqual(
    database.tables.setor_gestores.map((link) => link.colaborador_id),
    [MANAGER_A_ID],
  )
})

test('falha de validação na inclusão preserva o grupo e permite retry atômico', async () => {
  const database = createEnvironment()
  database.failNextRpc('chama_gestor_definir_gestor_setor', {
    code: '23514',
    message: 'manager became ineligible while waiting for the sector lock',
  })

  const failed = await runManagerGroupAs(
    ADMIN,
    managersRoute.PUT,
    managerGroupRequest('PUT', { colaboradorId: ADMIN_ID, incluir: true }),
  )

  assert.equal(failed.response.status, 422)
  assert.equal(failed.body.code, 'INVALID_MANAGER_SELECTION')
  assert.deepEqual(
    database.tables.setor_gestores.map((link) => link.colaborador_id),
    [MANAGER_A_ID, MANAGER_B_ID],
  )

  const retried = await runManagerGroupAs(
    ADMIN,
    managersRoute.PUT,
    managerGroupRequest('PUT', { colaboradorId: ADMIN_ID, incluir: true }),
  )

  assert.equal(retried.response.status, 200)
  assert.deepEqual(
    database.tables.setor_gestores.map((link) => link.colaborador_id),
    [MANAGER_A_ID, MANAGER_B_ID, ADMIN_ID],
  )
  assert.equal(database.calls.filter((call) => (
    call.operation === 'rpc' && call.name === 'chama_gestor_definir_gestor_setor'
  )).length, 2)
})

test('operação de um membro preserva uma mudança concorrente em outro membro', async () => {
  const database = createEnvironment()
  database.beforeNextRpc('chama_gestor_definir_gestor_setor', (currentDatabase) => {
    currentDatabase.tables.setor_gestores.push(managerLink(ADMIN_ID))
  })

  const result = await runManagerGroupAs(
    ADMIN,
    managersRoute.PUT,
    managerGroupRequest('PUT', { colaboradorId: MANAGER_B_ID, incluir: false }),
  )

  assert.equal(result.response.status, 200)
  assert.deepEqual(
    database.tables.setor_gestores.map((link) => link.colaborador_id),
    [MANAGER_A_ID, ADMIN_ID],
  )
})

test('falha atômica do aviso não deixa apoio parcial e uma nova tentativa cria apenas um', async () => {
  for (const actor of [ATTENDANT, MANAGER_A]) {
    const database = createEnvironment()
    database.failNextSupportNotification()

    const { result: failed } = await captureExpectedErrors(() => runAs(
      actor,
      supportRoute.POST,
      supportRequest(),
    ))

    assert.equal(failed.response.status, 500)
    assert.equal(failed.body.code, 'SUPPORT_OPERATION_FAILED')
    assert.equal(database.tables.ticket_apoios_gestor.length, 0)
    assert.equal(database.tables.notificacoes.length, 0)
    assert.equal(globalThis.__managerSupportPushCalls.length, 0)

    globalThis.__managerSupportPushFailures.push(new Error('push unavailable'))
    const { result: retried } = await captureExpectedErrors(() => runAs(
      actor,
      supportRoute.POST,
      supportRequest(),
    ))

    assert.equal(retried.response.status, 201)
    assert.equal(database.tables.ticket_apoios_gestor.length, 1)
    assert.equal(database.tables.notificacoes.length, actor.id === ATTENDANT_ID ? 2 : 1)
    assert.equal(globalThis.__managerSupportPushCalls.length, 1)
    assert.equal(database.calls.some((call) => (
      call.table === 'ticket_apoios_gestor' && call.operation === 'delete'
    )), false)
    assert.equal(database.calls.some((call) => (
      call.table === 'notificacoes' && call.operation === 'insert'
    )), false)
  }
})

test('falha atômica no aceite mantém o pendente e o retry aceita sem DELETE ou duplicação', async () => {
  const database = createEnvironment({
    ticket_apoios_gestor: [pendingSupport()],
  })
  database.failNextSupportNotification()

  const { result: failed } = await captureExpectedErrors(() => runAs(
    MANAGER_A,
    supportRoute.PATCH,
    supportRequest('PATCH', { action: 'accept', apoioId: SUPPORT_ID }),
  ))

  assert.equal(failed.response.status, 500)
  assert.equal(database.tables.ticket_apoios_gestor.length, 1)
  assert.equal(database.tables.ticket_apoios_gestor[0].status, 'pendente')
  assert.equal(database.tables.ticket_apoios_gestor[0].gestor_id, null)
  assert.equal(database.tables.notificacoes.length, 0)
  assert.equal(globalThis.__managerSupportPushCalls.length, 0)

  globalThis.__managerSupportPushFailures.push(new Error('push unavailable'))
  const { result: retried } = await captureExpectedErrors(() => runAs(
    MANAGER_A,
    supportRoute.PATCH,
    supportRequest('PATCH', { action: 'accept', apoioId: SUPPORT_ID }),
  ))

  assert.equal(retried.response.status, 200)
  assert.equal(database.tables.ticket_apoios_gestor[0].status, 'ativo')
  assert.equal(database.tables.ticket_apoios_gestor[0].gestor_id, MANAGER_A_ID)
  assert.equal(database.tables.notificacoes.length, 1)
  assert.equal(database.tables.notificacoes[0].destinatario_id, ATTENDANT_ID)
  assert.equal(globalThis.__managerSupportPushCalls.length, 1)
  assert.equal(database.calls.some((call) => (
    call.table === 'ticket_apoios_gestor' && call.operation === 'delete'
  )), false)
  assert.equal(database.calls.some((call) => (
    call.table === 'notificacoes' && call.operation === 'insert'
  )), false)
})

test('PATCH e mensagem rejeitam corpo sem apoioId', async () => {
  createEnvironment({
    ticket_apoios_gestor: [activeSupport()],
  })

  const patchWithoutId = await runAs(
    ATTENDANT,
    supportRoute.PATCH,
    supportRequest('PATCH', { action: 'close' }),
  )
  const messageWithoutId = await runAs(
    ATTENDANT,
    messagesRoute.POST,
    new Request(`http://localhost/api/tickets/${TICKET_ID}/apoio-gestor/mensagens`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conteudo: 'Mensagem sem sessão.' }),
    }),
  )

  assert.equal(patchWithoutId.response.status, 400)
  assert.equal(patchWithoutId.body.code, 'INVALID_SUPPORT_REQUEST')
  assert.equal(messageWithoutId.response.status, 422)
  assert.equal(messageWithoutId.body.code, 'INVALID_SUPPORT_MESSAGE')
})

test('aba antiga A nunca aceita, encerra ou envia mensagem no apoio B novo', async () => {
  const supportA = closedSupport({
    id: SUPPORT_ID,
    solicitado_em: '2026-08-10T12:00:00.000Z',
  })
  const supportB = activeSupport({
    id: SUPPORT_B_ID,
    solicitado_em: '2026-08-10T13:00:00.000Z',
    aceito_em: '2026-08-10T13:01:00.000Z',
    atualizado_em: '2026-08-10T13:01:00.000Z',
  })
  const database = createEnvironment({
    ticket_apoios_gestor: [supportA, supportB],
  })

  const oldDeepLink = await runAs(
    ATTENDANT,
    supportRoute.GET,
    supportGetRequest(SUPPORT_ID),
  )
  const staleClose = await runAs(
    ATTENDANT,
    supportRoute.PATCH,
    supportRequest('PATCH', { action: 'close', apoioId: SUPPORT_ID }),
  )
  const staleAccept = await runAs(
    MANAGER_B,
    supportRoute.PATCH,
    supportRequest('PATCH', { action: 'accept', apoioId: SUPPORT_ID }),
  )
  const staleMessage = await runAs(
    ATTENDANT,
    messagesRoute.POST,
    messageRequest('Não pode cair na sessão B.', SUPPORT_ID),
  )

  assert.equal(oldDeepLink.response.status, 200)
  assert.equal(oldDeepLink.body.support.id, SUPPORT_ID)
  assert.equal(oldDeepLink.body.support.status, 'encerrado')
  assert.equal(staleClose.response.status, 200)
  assert.equal(staleClose.body.support.id, SUPPORT_ID)
  assert.equal(staleClose.body.idempotent, true)
  assert.equal(staleAccept.response.status, 409)
  assert.equal(staleAccept.body.code, 'SUPPORT_NOT_PENDING')
  assert.equal(staleMessage.response.status, 409)
  assert.equal(staleMessage.body.code, 'SUPPORT_NOT_ACTIVE')
  assert.equal(database.tables.ticket_apoio_mensagens.length, 0)
  assert.equal(database.tables.ticket_apoios_gestor.find((row) => row.id === SUPPORT_B_ID).status, 'ativo')

  const currentClose = await runAs(
    ATTENDANT,
    supportRoute.PATCH,
    supportRequest('PATCH', { action: 'close', apoioId: SUPPORT_B_ID }),
  )

  assert.equal(currentClose.response.status, 200)
  assert.equal(currentClose.body.support.id, SUPPORT_B_ID)
  assert.equal(database.tables.ticket_apoios_gestor.find((row) => row.id === SUPPORT_B_ID).status, 'encerrado')

  const closeUpdate = database.calls.find((call) => (
    call.table === 'ticket_apoios_gestor'
    && call.operation === 'update'
    && call.payload?.status === 'encerrado'
  ))
  assert.ok(closeUpdate)
  assert.ok(closeUpdate.filters.some((filter) => (
    filter.kind === 'eq' && filter.column === 'id' && filter.value === SUPPORT_B_ID
  )))
  assert.ok(closeUpdate.filters.some((filter) => (
    filter.kind === 'eq' && filter.column === 'ticket_id' && filter.value === TICKET_ID
  )))
  assert.ok(closeUpdate.filters.some((filter) => (
    filter.kind === 'eq' && filter.column === 'status' && filter.value === 'ativo'
  )))
})
