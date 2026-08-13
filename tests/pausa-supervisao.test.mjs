import assert from 'node:assert/strict'
import test from 'node:test'
import { avaliarTrocaDePausa, podeAlterarStatusDe, RECUSA_DA_TROCA } from '../lib/pausa-supervisao.ts'
import { hasSupervisorScope } from '../lib/transfer-authorization.ts'

// O critério de "supervisor" NÃO é reescrito aqui: é a mesma hasSupervisorScope
// que a rota injeta. Se um dia ela mudar, estes testes mudam junto — que é o
// ponto de não haver uma segunda definição. Mesmo padrão de
// tests/transbordo-devolucao.test.mjs.
const ator = (colaborador) => ({
  id: colaborador.id,
  temEscopoNoSetor: (setorId) => hasSupervisorScope(colaborador, setorId),
})

const SETOR_A = 'setor-a'
const SETOR_B = 'setor-b'

const SUPERVISOR_A = { id: 'sup-a', isMaster: false, canSeeAllTickets: true, linkedSetorIds: [SETOR_A] }
const SUPERVISOR_B = { id: 'sup-b', isMaster: false, canSeeAllTickets: true, linkedSetorIds: [SETOR_B] }
const ATENDENTE_COMUM = { id: 'colab-2', isMaster: false, canSeeAllTickets: false, linkedSetorIds: [SETOR_A] }
const MASTER = { id: 'master-1', isMaster: true, canSeeAllTickets: false, linkedSetorIds: [] }
const ALVO = { id: 'colab-1', isMaster: false, canSeeAllTickets: false, linkedSetorIds: [SETOR_A] }

const PAUSA_ABERTA = { id: 'instancia-1', pausaId: 'tipo-banheiro', setorId: SETOR_A }
const CAFE = { id: 'tipo-cafe', setorId: SETOR_A, ativo: true }

const emPausa = (extra = {}) => ({
  colaboradorId: ALVO.id,
  // O vínculo real mora em colaboradores_setores; colaboradores.setor_id é
  // legado e vem nulo em quase todo mundo, então a lista NUNCA depende dele.
  setorIds: [SETOR_A],
  pausaAberta: PAUSA_ABERTA,
  ...extra,
})

test('supervisor do setor troca a pausa de alguém daquele setor', () => {
  assert.deepEqual(avaliarTrocaDePausa(ator(SUPERVISOR_A), emPausa(), CAFE), {
    permitido: true,
    instanciaId: 'instancia-1',
    deTipoId: 'tipo-banheiro',
    paraTipoId: 'tipo-cafe',
    setorId: SETOR_A,
  })
})

test('supervisor de OUTRO setor é recusado', () => {
  assert.deepEqual(avaliarTrocaDePausa(ator(SUPERVISOR_B), emPausa(), CAFE), {
    permitido: false,
    motivo: 'FORA_DO_ESCOPO',
  })
})

test('atendente comum não mexe na pausa de outra pessoa, nem no próprio setor', () => {
  assert.deepEqual(avaliarTrocaDePausa(ator(ATENDENTE_COMUM), emPausa(), CAFE), {
    permitido: false,
    motivo: 'FORA_DO_ESCOPO',
  })
})

test('master troca a pausa de qualquer setor, mesmo sem vínculo nenhum', () => {
  const resultado = avaliarTrocaDePausa(ator(MASTER), emPausa({ setorIds: [SETOR_B] }), {
    id: 'tipo-almoco',
    setorId: SETOR_A,
    ativo: true,
  })
  assert.equal(resultado.permitido, true)
})

test('o próprio colaborador troca o rótulo da própria pausa', () => {
  const resultado = avaliarTrocaDePausa(ator(ALVO), emPausa(), CAFE)
  assert.equal(resultado.permitido, true)
})

test('atendente que não está em pausa: não há o que trocar', () => {
  assert.deepEqual(avaliarTrocaDePausa(ator(SUPERVISOR_A), emPausa({ pausaAberta: null }), CAFE), {
    permitido: false,
    motivo: 'SEM_PAUSA_ABERTA',
  })
})

test('quem não tem escopo nem descobre se o alvo está em pausa', () => {
  // A recusa vem por FORA_DO_ESCOPO antes de olhar a pausa: o não autorizado
  // recebe a mesma resposta esteja o alvo em pausa ou não.
  const semPausa = avaliarTrocaDePausa(ator(SUPERVISOR_B), emPausa({ pausaAberta: null }), CAFE)
  const comPausa = avaliarTrocaDePausa(ator(SUPERVISOR_B), emPausa(), CAFE)
  assert.deepEqual(semPausa, comPausa)
  assert.deepEqual(semPausa, { permitido: false, motivo: 'FORA_DO_ESCOPO' })
})

test('tipo de pausa de outro setor é recusado', () => {
  assert.deepEqual(
    avaliarTrocaDePausa(ator(SUPERVISOR_A), emPausa(), { id: 'tipo-b', setorId: SETOR_B, ativo: true }),
    { permitido: false, motivo: 'TIPO_DE_OUTRO_SETOR' },
  )
})

test('nem o master reetiqueta a pausa para um tipo de outro setor', () => {
  // Não é permissão, é coerência: o relatório de pausa é agrupado por setor, e
  // reetiquetar não pode mover a ausência para o relatório de outro setor.
  assert.deepEqual(
    avaliarTrocaDePausa(ator(MASTER), emPausa(), { id: 'tipo-b', setorId: SETOR_B, ativo: true }),
    { permitido: false, motivo: 'TIPO_DE_OUTRO_SETOR' },
  )
})

test('tipo inexistente e tipo inativo são recusados', () => {
  assert.deepEqual(avaliarTrocaDePausa(ator(SUPERVISOR_A), emPausa(), null), {
    permitido: false,
    motivo: 'TIPO_INEXISTENTE',
  })
  assert.deepEqual(
    avaliarTrocaDePausa(ator(SUPERVISOR_A), emPausa(), { ...CAFE, ativo: false }),
    { permitido: false, motivo: 'TIPO_INATIVO' },
  )
})

test('reescolher o tipo que já está valendo não é troca', () => {
  assert.deepEqual(
    avaliarTrocaDePausa(ator(SUPERVISOR_A), emPausa(), { id: PAUSA_ABERTA.pausaId, setorId: SETOR_A, ativo: true }),
    { permitido: false, motivo: 'MESMO_TIPO' },
  )
})

test('supervisor alcança quem está no setor pelo vínculo, não pelo setor_id legado', () => {
  // colaboradores.setor_id é nulo em quase todo mundo: se a autorização
  // dependesse dele, o supervisor não alcançaria praticamente ninguém.
  const alvoSoComVinculo = emPausa({ setorIds: [SETOR_A] })
  assert.equal(avaliarTrocaDePausa(ator(SUPERVISOR_A), alvoSoComVinculo, CAFE).permitido, true)
  assert.equal(avaliarTrocaDePausa(ator(SUPERVISOR_A), emPausa({ setorIds: [] }), CAFE).permitido, false)
})

// ── podeAlterarStatusDe: o portão do online/offline ─────────────────────────
// É o mesmo POST que o WorkDesk chama o dia inteiro. Fechá-lo cedo demais
// derrubaria o uso normal do sistema; deixá-lo aberto é o buraco que o caso
// #97218 fechou — qualquer POST anônimo derrubava o setor inteiro.

test('colaborador mexendo no PRÓPRIO status continua permitido', () => {
  const eu = { colaboradorId: ALVO.id, setorIds: [], pausaAberta: null }
  assert.equal(podeAlterarStatusDe(ator(ALVO), eu), true)
})

test('atendente comum não derruba outra pessoa; supervisor do setor e master derrubam', () => {
  const outro = { colaboradorId: ALVO.id, setorIds: [SETOR_A], pausaAberta: null }
  assert.equal(podeAlterarStatusDe(ator(ATENDENTE_COMUM), outro), false)
  assert.equal(podeAlterarStatusDe(ator(SUPERVISOR_A), outro), true)
  assert.equal(podeAlterarStatusDe(ator(SUPERVISOR_B), outro), false)
  assert.equal(podeAlterarStatusDe(ator(MASTER), outro), true)
})

test('toda recusa tem mensagem e status HTTP — nenhuma cai em undefined', () => {
  const motivos = [
    'FORA_DO_ESCOPO', 'SEM_PAUSA_ABERTA', 'TIPO_INEXISTENTE',
    'TIPO_INATIVO', 'TIPO_DE_OUTRO_SETOR', 'MESMO_TIPO',
  ]
  for (const motivo of motivos) {
    assert.ok(RECUSA_DA_TROCA[motivo]?.erro, `sem mensagem para ${motivo}`)
    assert.ok(RECUSA_DA_TROCA[motivo]?.status >= 400, `status inválido para ${motivo}`)
  }
})
