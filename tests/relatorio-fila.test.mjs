import assert from 'node:assert/strict'
import test from 'node:test'
import {
  resumirFila,
  formatarEsperaLonga,
  faixaDeSaude,
  LIMITE_FILA_PADRAO_MIN,
  LIMITE_SLA_PADRAO_MIN,
  contarEpisodiosDeFila,
} from '../lib/relatorio-fila.ts'

const AGORA = Date.parse('2026-07-28T18:00:00.000Z')
const min = (n) => new Date(AGORA - n * 60_000).toISOString()
const base = { agoraMs: AGORA }

test('separa entrar na fila de estourar o SLA', () => {
  // A operação considera fila a partir de 1 min; o SLA é 15. Um cliente que
  // esperou 5min entrou na fila mas está dentro do prazo.
  const r = resumirFila([
    { criado_em: min(20), primeira_resposta_em: min(15) },  // 5min
    { criado_em: min(60), primeira_resposta_em: min(30) },  // 30min
    { criado_em: min(90), primeira_resposta_em: min(20) },  // 70min
  ], base)

  assert.equal(r.total, 3)
  assert.equal(r.entraramNaFila, 3, 'os três esperaram mais de 1 min')
  assert.equal(r.acimaDoSla, 2)
  assert.equal(r.dentroDoSla, 1)
  assert.equal(r.saudePercentual, 33, 'a saúde mede o SLA, não a fila')
})

test('resposta em menos de 1 minuto não entra na fila', () => {
  const r = resumirFila([
    { criado_em: new Date(AGORA - 40_000).toISOString(), primeira_resposta_em: min(0) },
  ], base)

  assert.equal(r.entraramNaFila, 0)
  assert.equal(r.acimaDoSla, 0)
  assert.equal(r.saudePercentual, 100)
})

test('ticket sem resposta conta a espera até agora — é quem ainda espera', () => {
  const r = resumirFila([{ criado_em: min(45), primeira_resposta_em: null }], base)

  assert.equal(r.entraramNaFila, 1)
  assert.equal(r.acimaDoSla, 1)
  assert.equal(r.maiorEspera.esperaMs, 45 * 60_000)
  assert.equal(r.maiorEspera.emAndamento, true)
})

test('exatamente no limite não conta — nem na fila, nem no SLA', () => {
  assert.equal(
    resumirFila([{ criado_em: min(LIMITE_FILA_PADRAO_MIN), primeira_resposta_em: min(0) }], base).entraramNaFila,
    0,
  )
  assert.equal(
    resumirFila([{ criado_em: min(LIMITE_SLA_PADRAO_MIN), primeira_resposta_em: min(0) }], base).acimaDoSla,
    0,
  )
})

test('a maior espera traz ticket, cliente e entrada', () => {
  const r = resumirFila([
    { numero: 111, criado_em: min(30), primeira_resposta_em: min(25), clientes: { nome: 'ALFA' } },
    { numero: 222, criado_em: min(200), primeira_resposta_em: min(10), clientes: { nome: 'BETA' } },
  ], base)

  assert.equal(r.maiorEspera.ticket, '222')
  assert.equal(r.maiorEspera.cliente, 'BETA')
  assert.equal(r.maiorEspera.esperaMs, 190 * 60_000)
  assert.equal(r.maiorEspera.entradaISO, min(200))
})

test('aceita o cliente como objeto ou como array', () => {
  // O PostgREST devolve as duas formas conforme a consulta; aceitar só uma
  // faria o nome sumir calado numa das telas.
  const comObjeto = resumirFila([
    { numero: 1, criado_em: min(30), primeira_resposta_em: min(5), clientes: { nome: 'ALFA' } },
  ], base)
  const comArray = resumirFila([
    { numero: 1, criado_em: min(30), primeira_resposta_em: min(5), clientes: [{ nome: 'ALFA' }] },
  ], base)

  assert.equal(comObjeto.maiorEspera.cliente, 'ALFA')
  assert.equal(comArray.maiorEspera.cliente, 'ALFA')
  assert.equal(resumirFila([{ criado_em: min(30), clientes: [] }], base).maiorEspera.cliente, null)
})

test('pico simultâneo conta só quem está acima do limite ao mesmo tempo', () => {
  // Três esperas longas sobrepostas, uma curta fora do limite.
  const r = resumirFila([
    { criado_em: min(120), primeira_resposta_em: min(10) },
    { criado_em: min(110), primeira_resposta_em: min(20) },
    { criado_em: min(100), primeira_resposta_em: min(30) },
    { criado_em: min(5), primeira_resposta_em: min(2) },
  ], base)

  assert.equal(r.picoSimultaneo, 3)
})

test('esperas que não se sobrepõem não viram pico', () => {
  const r = resumirFila([
    { criado_em: min(300), primeira_resposta_em: min(260) },
    { criado_em: min(100), primeira_resposta_em: min(60) },
  ], base)

  assert.equal(r.entraramNaFila, 2)
  assert.equal(r.picoSimultaneo, 1)
})

test('período sem ticket é saúde 100, não divisão por zero', () => {
  const r = resumirFila([], base)
  assert.equal(r.total, 0)
  assert.equal(r.saudePercentual, 100)
  assert.equal(r.picoSimultaneo, 0)
  assert.equal(r.maiorEspera, null)
})

test('data inválida ou no futuro não entra na conta', () => {
  const r = resumirFila([
    { criado_em: 'nao-e-data', primeira_resposta_em: min(1) },
    { criado_em: null },
    { criado_em: new Date(AGORA + 600_000).toISOString(), primeira_resposta_em: null },
  ], base)

  assert.equal(r.entraramNaFila, 0)
  assert.equal(r.maiorEspera, null)
})

test('os dois limiares são configuráveis e independentes', () => {
  const tickets = [{ criado_em: min(20), primeira_resposta_em: min(0) }]

  assert.equal(resumirFila(tickets, { ...base, limiteSlaMin: 15 }).acimaDoSla, 1)
  assert.equal(resumirFila(tickets, { ...base, limiteSlaMin: 30 }).acimaDoSla, 0)
  assert.equal(resumirFila(tickets, { ...base, limiteFilaMin: 25 }).entraramNaFila, 0)
})

test('formata a espera como o painel de referência', () => {
  assert.equal(formatarEsperaLonga(0), '—')
  assert.equal(formatarEsperaLonga(-1), '—')
  assert.equal(formatarEsperaLonga(45_000), '45s')
  assert.equal(formatarEsperaLonga(125_000), '2min 5s')
  assert.equal(formatarEsperaLonga(33_173_000), '9h 12min 53s')
})

test('faixa de saúde separa boa, atenção e crítica', () => {
  assert.equal(faixaDeSaude(100), 'boa')
  assert.equal(faixaDeSaude(90), 'boa')
  assert.equal(faixaDeSaude(89), 'atencao')
  assert.equal(faixaDeSaude(70), 'atencao')
  assert.equal(faixaDeSaude(69), 'critica')
})

// --- episódios de fila (criado_em → primeira_resposta_em) ---

const seg = (n) => new Date(AGORA - n * 1000).toISOString()

test('clientes que chegam juntos são UM episódio, não vários', () => {
  // É a diferença entre a métrica pedida e a anterior: contar vezes, não gente.
  const r = contarEpisodiosDeFila([
    { criado_em: seg(600), primeira_resposta_em: seg(300) },
    { criado_em: seg(590), primeira_resposta_em: seg(280) },
    { criado_em: seg(580), primeira_resposta_em: seg(200) },
  ], { agoraMs: AGORA })

  assert.equal(r.vezes, 1)
  assert.equal(r.pico, 3)
})

test('a fila esvaziar e voltar conta como dois episódios', () => {
  // O caso que o gestor descreveu: uma fila absorve 40 clientes e acaba = 1;
  // depois formou de novo com 7 = 2.
  const r = contarEpisodiosDeFila([
    { criado_em: seg(900), primeira_resposta_em: seg(800) },
    { criado_em: seg(400), primeira_resposta_em: seg(300) },
  ], { agoraMs: AGORA })

  assert.equal(r.vezes, 2)
  assert.equal(r.pico, 1)
})

test('uma fila longa que absorve muita gente sem esvaziar é UMA vez', () => {
  // Chegadas de 10 em 10s, cada uma esperando 120s: sempre sobra alguém
  // esperando quando o próximo chega, então a fila nunca zera.
  const tickets = Array.from({ length: 40 }, (_, i) => ({
    criado_em: seg(900 - i * 10),
    primeira_resposta_em: seg(780 - i * 10),
  }))
  const r = contarEpisodiosDeFila(tickets, { agoraMs: AGORA })

  assert.equal(r.vezes, 1, '40 clientes numa fila contínua são um episódio')
  assert.ok(r.pico >= 2)
})

test('atendido dentro do limite não forma fila', () => {
  // Sem isso, todo ticket respondido em 10s abriria um episódio e o número
  // voltaria a ser contagem de cliente.
  const r = contarEpisodiosDeFila([
    { criado_em: seg(310), primeira_resposta_em: seg(300) },
  ], { agoraMs: AGORA })

  assert.equal(r.vezes, 0)
  assert.equal(r.pico, 0)
  assert.equal(r.semEspera, 1)
})

test('ticket ainda sem resposta conta como fila correndo agora', () => {
  const r = contarEpisodiosDeFila([
    { criado_em: seg(120), primeira_resposta_em: null },
  ], { agoraMs: AGORA })

  assert.equal(r.vezes, 1)
  assert.equal(r.pico, 1)
})

test('encerrado sem nenhuma resposta usa o encerramento como fim da espera', () => {
  // O cliente esperou e desistiu (ou foi encerrado). A espera acabou ali, não
  // agora — senão o episódio ficaria aberto para sempre.
  const r = contarEpisodiosDeFila([
    { criado_em: seg(900), primeira_resposta_em: null, encerrado_em: seg(600), status: 'encerrado' },
    { criado_em: seg(300), primeira_resposta_em: seg(120) },
  ], { agoraMs: AGORA })

  assert.equal(r.vezes, 2, 'a fila esvaziou entre os dois')
})

test('o limite de fila é configurável', () => {
  const tickets = [{ criado_em: seg(180), primeira_resposta_em: seg(60) }] // 2min

  assert.equal(contarEpisodiosDeFila(tickets, { agoraMs: AGORA }).vezes, 1)
  assert.equal(
    contarEpisodiosDeFila(tickets, { agoraMs: AGORA, limiteFilaMin: 5 }).vezes,
    0,
    'com limite de 5min, esperar 2min não é fila',
  )
})

test('lista vazia não inventa episódio', () => {
  const r = contarEpisodiosDeFila([], { agoraMs: AGORA })
  assert.deepEqual([r.vezes, r.pico, r.semEspera], [0, 0, 0])
})
