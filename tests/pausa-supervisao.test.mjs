import assert from 'node:assert/strict'
import test from 'node:test'
import {
  avaliarFimDePausa,
  avaliarInicioDePausa,
  avaliarTrocaDePausa,
  podeAlterarStatusDe,
  RECUSA_DA_SUPERVISAO,
} from '../lib/pausa-supervisao.ts'
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
    'FORA_DO_ESCOPO', 'SEM_PAUSA_ABERTA', 'JA_EM_PAUSA', 'TIPO_INEXISTENTE',
    'TIPO_INATIVO', 'TIPO_DE_OUTRO_SETOR', 'MESMO_TIPO',
  ]
  for (const motivo of motivos) {
    assert.ok(RECUSA_DA_SUPERVISAO[motivo]?.erro, `sem mensagem para ${motivo}`)
    assert.ok(RECUSA_DA_SUPERVISAO[motivo]?.status >= 400, `status inválido para ${motivo}`)
  }
})

// ── COLOCAR EM PAUSA ────────────────────────────────────────────────────────
// O espelho da troca: aqui a pausa ainda não existe, então o "setor da pausa"
// é o setor do TIPO escolhido — é ele que vai para pausas_colaboradores.setor_id.

const foraDePausa = (extra = {}) => ({
  colaboradorId: ALVO.id,
  setorIds: [SETOR_A],
  pausaAberta: null,
  ...extra,
})

test('supervisor coloca em pausa alguém do setor dele', () => {
  assert.deepEqual(avaliarInicioDePausa(ator(SUPERVISOR_A), foraDePausa(), CAFE), {
    permitido: true,
    paraTipoId: 'tipo-cafe',
    setorId: SETOR_A,
  })
})

test('supervisor de OUTRO setor não coloca ninguém em pausa', () => {
  assert.deepEqual(avaliarInicioDePausa(ator(SUPERVISOR_B), foraDePausa(), CAFE), {
    permitido: false,
    motivo: 'FORA_DO_ESCOPO',
  })
})

test('atendente comum não coloca outra pessoa em pausa', () => {
  assert.deepEqual(avaliarInicioDePausa(ator(ATENDENTE_COMUM), foraDePausa(), CAFE), {
    permitido: false,
    motivo: 'FORA_DO_ESCOPO',
  })
})

test('tipo de pausa de setor onde o atendente não trabalha é recusado — inclusive para o master', () => {
  // Não é permissão, é coerência: abrir pausa do setor B para quem só trabalha
  // no A inventa ausência no relatório de um setor onde a pessoa nunca esteve.
  const tipoDoB = { id: 'tipo-b', setorId: SETOR_B, ativo: true }
  assert.deepEqual(avaliarInicioDePausa(ator(SUPERVISOR_A), foraDePausa(), tipoDoB), {
    permitido: false,
    motivo: 'TIPO_DE_OUTRO_SETOR',
  })
  assert.deepEqual(avaliarInicioDePausa(ator(MASTER), foraDePausa(), tipoDoB), {
    permitido: false,
    motivo: 'TIPO_DE_OUTRO_SETOR',
  })
})

test('tipo inativo e tipo inexistente não abrem pausa', () => {
  assert.deepEqual(avaliarInicioDePausa(ator(SUPERVISOR_A), foraDePausa(), { ...CAFE, ativo: false }), {
    permitido: false,
    motivo: 'TIPO_INATIVO',
  })
  assert.deepEqual(avaliarInicioDePausa(ator(SUPERVISOR_A), foraDePausa(), null), {
    permitido: false,
    motivo: 'TIPO_INEXISTENTE',
  })
})

test('quem já está em pausa não ganha uma segunda instância', () => {
  // Abrir outra zeraria o cronômetro e viraria UMA ausência em DUAS no
  // relatório. Corrigir o rótulo é avaliarTrocaDePausa, que preserva `inicio`.
  assert.deepEqual(avaliarInicioDePausa(ator(SUPERVISOR_A), emPausa(), CAFE), {
    permitido: false,
    motivo: 'JA_EM_PAUSA',
  })
})

test('master coloca em pausa sem vínculo nenhum, desde que o tipo seja do setor do alvo', () => {
  assert.deepEqual(avaliarInicioDePausa(ator(MASTER), foraDePausa(), CAFE), {
    permitido: true,
    paraTipoId: 'tipo-cafe',
    setorId: SETOR_A,
  })
})

test('o próprio colaborador entra em pausa sozinho', () => {
  assert.equal(avaliarInicioDePausa(ator(ALVO), foraDePausa(), CAFE).permitido, true)
})

// ── TIRAR DA PAUSA ──────────────────────────────────────────────────────────
// O retorno carrega a INSTÂNCIA porque é ela que precisa receber `fim`: limpar
// só o ponteiro deixa a linha com fim IS NULL e o relatório soma para sempre.

test('supervisor tira da pausa, e o que volta é a instância que recebe `fim`', () => {
  assert.deepEqual(avaliarFimDePausa(ator(SUPERVISOR_A), emPausa()), {
    permitido: true,
    instanciaId: PAUSA_ABERTA.id,
    deTipoId: 'tipo-banheiro',
    setorId: SETOR_A,
  })
})

test('tirar da pausa de quem não está em pausa é recusado', () => {
  assert.deepEqual(avaliarFimDePausa(ator(SUPERVISOR_A), emPausa({ pausaAberta: null })), {
    permitido: false,
    motivo: 'SEM_PAUSA_ABERTA',
  })
})

test('supervisor de OUTRO setor não tira ninguém da pausa', () => {
  assert.deepEqual(avaliarFimDePausa(ator(SUPERVISOR_B), emPausa()), {
    permitido: false,
    motivo: 'FORA_DO_ESCOPO',
  })
})

test('atendente comum não tira outra pessoa da pausa', () => {
  assert.deepEqual(avaliarFimDePausa(ator(ATENDENTE_COMUM), emPausa()), {
    permitido: false,
    motivo: 'FORA_DO_ESCOPO',
  })
})

test('master tira da pausa em qualquer setor, e o próprio atendente também', () => {
  assert.equal(avaliarFimDePausa(ator(MASTER), emPausa({ setorIds: [SETOR_B] })).permitido, true)
  assert.equal(avaliarFimDePausa(ator(ALVO), emPausa()).permitido, true)
})

test('supervisão do setor da PESSOA não basta: a pausa também tem que ser de setor supervisionado', () => {
  // O supervisor de A alcança a pessoa (ela trabalha em A e em B), mas a pausa
  // aberta conta no relatório de B — quem encerra ausência de B é supervisor de B.
  const pausaDoB = emPausa({
    setorIds: [SETOR_A, SETOR_B],
    pausaAberta: { id: 'instancia-2', pausaId: 'tipo-almoco', setorId: SETOR_B },
  })
  assert.deepEqual(avaliarFimDePausa(ator(SUPERVISOR_A), pausaDoB), {
    permitido: false,
    motivo: 'FORA_DO_ESCOPO',
  })
  assert.equal(avaliarFimDePausa(ator(SUPERVISOR_B), pausaDoB).permitido, true)
})

test('as quatro ações recusam o supervisor de outro setor pelo MESMO motivo', () => {
  // Uma recusa só, vinda de podeAlterarStatusDe: se um dia uma das quatro
  // passar a decidir sozinha, este teste cai junto.
  assert.equal(podeAlterarStatusDe(ator(SUPERVISOR_B), emPausa()), false)
  assert.equal(avaliarInicioDePausa(ator(SUPERVISOR_B), foraDePausa(), CAFE).motivo, 'FORA_DO_ESCOPO')
  assert.equal(avaliarFimDePausa(ator(SUPERVISOR_B), emPausa()).motivo, 'FORA_DO_ESCOPO')
  assert.equal(avaliarTrocaDePausa(ator(SUPERVISOR_B), emPausa(), CAFE).motivo, 'FORA_DO_ESCOPO')
})

test('nas quatro ações o próprio colaborador continua passando', () => {
  assert.equal(podeAlterarStatusDe(ator(ALVO), foraDePausa({ setorIds: [] })), true)
  assert.equal(avaliarInicioDePausa(ator(ALVO), foraDePausa(), CAFE).permitido, true)
  assert.equal(avaliarFimDePausa(ator(ALVO), emPausa()).permitido, true)
  assert.equal(avaliarTrocaDePausa(ator(ALVO), emPausa(), CAFE).permitido, true)
})
