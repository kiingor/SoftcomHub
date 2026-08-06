import assert from 'node:assert/strict'
import test from 'node:test'
import {
  resumirFila,
  formatarEsperaLonga,
  faixaDeSaude,
  LIMITE_FILA_PADRAO_MIN,
  LIMITE_SLA_PADRAO_MIN,
  contarEpisodiosDeFila,
  somarEpisodiosPorFila,
  calcularIndicadoresDaFila,
  percentualDeFila,
} from '../lib/relatorio-fila.ts'
import { criarMedidorDeExpediente } from '../lib/horario-atendimento.ts'

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

test('disparo sem resposta do cliente não entra na fila', () => {
  const r = resumirFila([
    {
      numero: '153078',
      criado_em: min(90),
      is_disparo: true,
      primeira_resposta_em: min(15),
    },
  ], base)

  assert.equal(r.total, 0)
})

test('disparo respondido começa a fila na resposta do cliente', () => {
  const r = resumirFila([
    {
      criado_em: min(120),
      is_disparo: true,
      cliente_respondeu_em: min(20),
      primeira_resposta_em: min(5),
    },
  ], base)

  assert.equal(r.maiorEspera.esperaMs, 15 * 60_000)
  assert.equal(r.maiorEspera.entradaISO, min(20))
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

test('exatamente no limite não forma episódio de fila', () => {
  const ticket = {
    criado_em: seg(360),
    atribuido_em: seg(300),
  }

  assert.equal(resumirFila([ticket], base).entraramNaFila, 0)

  const episodios = contarEpisodiosDeFila([ticket], { agoraMs: AGORA })
  assert.equal(episodios.vezes, 0)
  assert.equal(episodios.pico, 0)
  assert.equal(episodios.semEspera, 1)
})

test('ticket ainda sem resposta conta como fila correndo agora', () => {
  const r = contarEpisodiosDeFila([
    { criado_em: seg(120), primeira_resposta_em: null },
  ], { agoraMs: AGORA })

  assert.equal(r.vezes, 1)
  assert.equal(r.pico, 1)
})

test('disparo sem resposta do cliente não cria episódio de fila', () => {
  const r = contarEpisodiosDeFila([
    { criado_em: seg(120), is_disparo: true, primeira_resposta_em: seg(60) },
  ], { agoraMs: AGORA })

  assert.equal(r.vezes, 0)
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

test('a fila acaba na ATRIBUIÇÃO, não na primeira resposta', () => {
  // O caso que motivou a mudança: medido em 04/08/2026, 86% do que o card
  // chamava de fila no Prime era ticket já atribuído em segundos cujo atendente
  // demorou a escrever. Isso é tempo de resposta, não falta de gente.
  const r = resumirFila([
    { criado_em: min(10), atribuido_em: min(9.5), primeira_resposta_em: min(2) },
  ], base)

  assert.equal(r.entraramNaFila, 0, 'atribuído em 30s: nunca formou fila')
  assert.equal(r.maiorEspera.esperaMs, 30_000, 'a espera para na atribuição')
})

test('ficar sem atendente além do limite é fila, mesmo respondido logo depois', () => {
  const r = resumirFila([
    { criado_em: min(30), atribuido_em: min(10), primeira_resposta_em: min(9) },
  ], base)

  assert.equal(r.entraramNaFila, 1)
  assert.equal(r.maiorEspera.esperaMs, 20 * 60_000)
})

test('sem carimbo de atribuição cai na primeira resposta — histórico pré-28/07', () => {
  // `atribuido_em` não existia antes de 28/07/2026. Sem a degradação, todo
  // ticket antigo viraria "ainda esperando" e o relatório de 90 dias quebraria.
  const r = resumirFila([
    { criado_em: min(30), atribuido_em: null, primeira_resposta_em: min(10) },
  ], base)

  assert.equal(r.entraramNaFila, 1)
  assert.equal(r.maiorEspera.esperaMs, 20 * 60_000)
})

test('episódios também param na atribuição', () => {
  // Dois tickets atribuídos rápido, cada um com resposta lenta. Pela regra
  // antiga seriam 2 episódios de fila; não são fila nenhuma.
  const tickets = [
    { criado_em: seg(900), atribuido_em: seg(890), primeira_resposta_em: seg(300) },
    { criado_em: seg(400), atribuido_em: seg(395), primeira_resposta_em: seg(100) },
  ]
  const r = contarEpisodiosDeFila(tickets, { agoraMs: AGORA })

  assert.equal(r.vezes, 0)
  assert.equal(r.semEspera, 2)
})

test('ticket nunca atribuído segue na fila correndo agora', () => {
  const r = contarEpisodiosDeFila([
    { criado_em: seg(120), atribuido_em: null, primeira_resposta_em: null },
  ], { agoraMs: AGORA })

  assert.equal(r.vezes, 1)
  assert.equal(r.pico, 1)
})

test('a espera fora do expediente não conta quando há medidor', () => {
  // #155513: chegou 00:28 de terça (fechado desde 22:00), atendido 07:05 —
  // cinco minutos após a abertura. Sem descontar, liderava o dia com 6h37.
  const expediente = criarMedidorDeExpediente([
    { dia_semana: 2, ativo: true, hora_inicio: '07:00:00', hora_fim: '22:00:00' },
  ])
  const madrugada = [{
    numero: '155513',
    criado_em: '2026-08-04T03:28:33Z',
    atribuido_em: '2026-08-04T10:05:44Z',
  }]
  const agoraMs = Date.parse('2026-08-04T23:00:00Z')

  const corrido = resumirFila(madrugada, { agoraMs })
  assert.ok(corrido.maiorEspera.esperaMs > 6 * 3_600_000, 'sem medidor conta as 6h37')

  const util = resumirFila(madrugada, { agoraMs, expediente })
  assert.ok(
    util.maiorEspera.esperaMs < 6 * 60_000,
    `com medidor sobram ~5min, veio ${util.maiorEspera.esperaMs / 60_000}min`,
  )
  assert.equal(util.entraramNaFila, 1, 'ainda esperou mais de 1 min de expediente')
  assert.equal(util.acimaDoSla, 0, '5 min não estouram o SLA de 15')
})

test('episódio usa o mesmo teste de expediente que resumirFila', () => {
  // Sem isto o card diria "ninguém esperou" e ainda assim contaria episódios.
  const expediente = criarMedidorDeExpediente([
    { dia_semana: 2, ativo: true, hora_inicio: '07:00:00', hora_fim: '22:00:00' },
  ])
  const madrugada = [{
    criado_em: '2026-08-04T03:28:33Z',
    atribuido_em: '2026-08-04T07:00:00Z', // 04:00 BRT, ainda fechado
  }]
  const agoraMs = Date.parse('2026-08-04T23:00:00Z')

  assert.equal(contarEpisodiosDeFila(madrugada, { agoraMs }).vezes, 1, 'em tempo corrido é fila')
  assert.equal(
    contarEpisodiosDeFila(madrugada, { agoraMs, expediente }).vezes,
    0,
    'no expediente, não houve espera nenhuma',
  )
})

test('filas simultâneas de subsetores diferentes são episódios diferentes', () => {
  // Duas filas sobrepostas no tempo. Numa linha do tempo só o contador nunca
  // volta a zero e vira 1 episódio; são duas equipes esperando, logo 2.
  const tickets = [
    { subsetor_id: 'suporte', criado_em: seg(900), primeira_resposta_em: seg(300) },
    { subsetor_id: 'prime', criado_em: seg(600), primeira_resposta_em: seg(120) },
  ]
  const opts = { agoraMs: AGORA }

  assert.equal(contarEpisodiosDeFila(tickets, opts).vezes, 1, 'linha única funde as duas')
  assert.equal(somarEpisodiosPorFila(tickets, (t) => t.subsetor_id, opts).vezes, 2)
})

test('o pico da soma é o do conjunto, não a soma dos picos', () => {
  // Os dois esperam ao mesmo tempo: no pior instante havia 2 clientes no setor.
  const tickets = [
    { subsetor_id: 'suporte', criado_em: seg(900), primeira_resposta_em: seg(300) },
    { subsetor_id: 'prime', criado_em: seg(600), primeira_resposta_em: seg(120) },
  ]
  const r = somarEpisodiosPorFila(tickets, (t) => t.subsetor_id, { agoraMs: AGORA })

  assert.equal(r.pico, 2)
})

test('ticket sem subsetor entra na fila que o chamador indicar', () => {
  // No ServiceDesk o trabalho não classificado é do Suporte. Sem dobrar, ele
  // viraria uma terceira fila fantasma e somaria um episódio a mais.
  const tickets = [
    { subsetor_id: 'suporte', criado_em: seg(900), primeira_resposta_em: seg(300) },
    { subsetor_id: null, criado_em: seg(800), primeira_resposta_em: seg(400) },
  ]
  const opts = { agoraMs: AGORA }

  assert.equal(somarEpisodiosPorFila(tickets, (t) => t.subsetor_id || 'sem', opts).vezes, 2)
  assert.equal(
    somarEpisodiosPorFila(tickets, (t) => t.subsetor_id || 'suporte', opts).vezes,
    1,
    'dobrado no Suporte, os dois estão na MESMA fila contínua',
  )
})

test('percentual inclui o ticket sem subsetor absorvido pelo Suporte', () => {
  const tickets = [
    { subsetor_id: 'suporte', criado_em: seg(900), atribuido_em: seg(300) },
    { subsetor_id: null, criado_em: seg(800), atribuido_em: seg(400) },
  ]
  const filaDoTicket = (ticket) => ticket.subsetor_id || 'suporte'
  const ticketsDoSuporte = tickets.filter((ticket) => filaDoTicket(ticket) === 'suporte')
  const { fila, episodios } = calcularIndicadoresDaFila(ticketsDoSuporte, filaDoTicket, base)

  assert.equal(fila.total, 2)
  assert.equal(episodios.vezes, 1)
  assert.equal(
    percentualDeFila(episodios.vezes, fila.total),
    50,
    'o denominador inclui os mesmos dois tickets usados para os episódios',
  )
})

test('somar uma fila só dá o mesmo que contar direto', () => {
  // Garante que o card com um subsetor escolhido não muda de número.
  const tickets = [
    { subsetor_id: 'suporte', criado_em: seg(900), primeira_resposta_em: seg(800) },
    { subsetor_id: 'suporte', criado_em: seg(400), primeira_resposta_em: seg(300) },
  ]
  const opts = { agoraMs: AGORA }

  assert.deepEqual(
    somarEpisodiosPorFila(tickets, (t) => t.subsetor_id, opts),
    contarEpisodiosDeFila(tickets, opts),
  )
})

test('ticket encerrado sem resposta para de esperar no encerramento', () => {
  // Caso real do #151097: criado 13:34:17, encerrado 13:35:31 sem nenhuma
  // resposta. Contando só a primeira resposta, a espera corria contra o relógio
  // e o card mostrava "3h 53min · ainda esperando" horas depois.
  const r = resumirFila([
    { numero: '151097', criado_em: min(240), encerrado_em: min(238), clientes: { nome: 'SOFTCOM BACKUP' } },
  ], base)

  assert.equal(r.maiorEspera.esperaMs, 2 * 60_000)
  assert.equal(r.maiorEspera.emAndamento, false)
})

test('a resposta manda sobre o encerramento quando as duas existem', () => {
  const r = resumirFila([
    { criado_em: min(100), primeira_resposta_em: min(90), encerrado_em: min(10) },
  ], base)

  assert.equal(r.maiorEspera.esperaMs, 10 * 60_000)
  assert.equal(r.maiorEspera.emAndamento, false)
})

test('sem resposta e sem encerramento a espera segue correndo', () => {
  const r = resumirFila([{ criado_em: min(45) }], base)

  assert.equal(r.maiorEspera.esperaMs, 45 * 60_000)
  assert.equal(r.maiorEspera.emAndamento, true)
})

// --- percentual de fila (filas ÷ tickets do dia) ---

test('percentual de fila divide filas por tickets', () => {
  // Caso real de 06/08/2026 no ServiceDesk: 9 filas em 33 tickets.
  assert.equal(percentualDeFila(9, 33), 27)
  assert.equal(percentualDeFila(1, 4), 25)
  assert.equal(percentualDeFila(0, 50), 0, 'nenhuma fila em 50 tickets é 0%')
})

test('percentual de fila NÃO é a fatia de tickets que esperou', () => {
  // O mesmo dia tinha 17 tickets que esperaram (52%), contra 9 filas (27%).
  // Guarda a distinção: são perguntas diferentes sobre o mesmo dia.
  const filas = percentualDeFila(9, 33)
  const fatiaDeClientes = Math.round((17 / 33) * 100)

  assert.equal(filas, 27)
  assert.equal(fatiaDeClientes, 52)
  assert.notEqual(filas, fatiaDeClientes)
})

test('sem tickets devolve null, não 0%', () => {
  // 0% leria como "nunca deu fila"; sem movimento não há frequência a relatar.
  assert.equal(percentualDeFila(0, 0), null)
  assert.equal(percentualDeFila(3, 0), null)
  assert.equal(percentualDeFila(1, -5), null)
})

test('entrada inválida não vira NaN no card', () => {
  assert.equal(percentualDeFila(Number.NaN, 10), null)
  assert.equal(percentualDeFila(2, Number.NaN), null)
  assert.equal(percentualDeFila(-2, 10), 0, 'contagem negativa não vira percentual negativo')
})
