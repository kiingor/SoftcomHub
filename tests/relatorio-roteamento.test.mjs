import assert from 'node:assert/strict'
import test from 'node:test'
import {
  classificarEntradasDeRoteamento,
  filtrarEntradasDeRoteamentoPorFiltroDeTicket,
  reconstruirEntradasDeRoteamento,
  resumirOrigensDeRoteamento,
} from '../lib/relatorio-roteamento.ts'

const setores = [
  { id: 'matriz', nome: 'ServiceDesk Matriz' },
  { id: 'juazeiro', nome: 'Juazeiro do Norte PEV' },
  { id: 'barbalha', nome: 'Barbalha PEV' },
]

test('calcula a taxa de transbordo sobre movimentos classificados', () => {
  const resumo = resumirOrigensDeRoteamento([
    { id: '1', setorOrigemId: 'juazeiro', setorDestinoId: 'matriz', ocorridoEm: '2026-08-01T10:00:00.000Z', tipoMovimento: 'transferencia' },
    { id: '2', setorOrigemId: 'juazeiro', setorDestinoId: 'matriz', ocorridoEm: '2026-08-01T14:00:00.000Z', tipoMovimento: 'transbordo' },
    { id: '3', setorOrigemId: 'juazeiro', setorDestinoId: 'matriz', ocorridoEm: '2026-08-02T10:00:00.000Z', tipoMovimento: 'transbordo' },
    { id: '4', setorOrigemId: 'barbalha', setorDestinoId: 'matriz', ocorridoEm: '2026-08-02T11:00:00.000Z' },
  ], setores)

  assert.equal(resumo.totalEntradas, 4)
  assert.equal(resumo.movimentosClassificados, 3)
  assert.equal(resumo.transferencias, 1)
  assert.equal(resumo.transbordos, 2)
  assert.equal(resumo.semClassificacao, 1)
  assert.deepEqual(resumo.maiorTaxaTransbordo, {
    id: 'setor:juazeiro',
    nome: 'Juazeiro do Norte PEV',
    tipo: 'setor',
    fluxo: 'Juazeiro do Norte PEV → ServiceDesk Matriz',
    quantidade: 3,
    movimentosClassificados: 3,
    taxaTransbordo: 66.7,
    transferencias: 1,
    transbordos: 2,
    semClassificacao: 0,
    diasComOcorrencia: 2,
    maiorPicoDiario: 2,
  })
  assert.equal(resumo.origens[1].movimentosClassificados, 0)
  assert.equal(resumo.origens[1].taxaTransbordo, 0)
})

test('não escolhe a origem com mais transferências manuais como maior taxa de transbordo', () => {
  const entradas = [
    ...Array.from({ length: 10 }, (_, index) => ({
      id: `manual-${index}`,
      setorOrigemId: 'juazeiro',
      setorDestinoId: 'matriz',
      tipoMovimento: 'transferencia',
    })),
    { id: 'juazeiro-transbordo', setorOrigemId: 'juazeiro', setorDestinoId: 'matriz', tipoMovimento: 'transbordo' },
    { id: 'barbalha-transferencia', setorOrigemId: 'barbalha', setorDestinoId: 'matriz', tipoMovimento: 'transferencia' },
    { id: 'barbalha-transbordo-1', setorOrigemId: 'barbalha', setorDestinoId: 'matriz', tipoMovimento: 'transbordo' },
    { id: 'barbalha-transbordo-2', setorOrigemId: 'barbalha', setorDestinoId: 'matriz', tipoMovimento: 'transbordo' },
    ...Array.from({ length: 8 }, (_, index) => ({
      id: `sem-evidencia-${index}`,
      setorOrigemId: 'juazeiro',
      setorDestinoId: 'matriz',
    })),
  ]

  const resumo = resumirOrigensDeRoteamento(entradas, setores)

  assert.equal(resumo.maiorTaxaTransbordo?.id, 'setor:barbalha')
  assert.deepEqual(
    resumo.origens.map(({ id, taxaTransbordo, movimentosClassificados }) => ({ id, taxaTransbordo, movimentosClassificados })),
    [
      { id: 'setor:barbalha', taxaTransbordo: 66.7, movimentosClassificados: 3 },
      { id: 'setor:juazeiro', taxaTransbordo: 9.1, movimentosClassificados: 11 },
    ],
  )
})

test('usa PDV, fluxo e origem desconhecida quando o setor não está disponível', () => {
  const resumo = resumirOrigensDeRoteamento([
    { id: '1', setorOrigemId: 'removido', setorDestinoId: 'matriz', pdv: '1234' },
    { id: '2', setorDestinoId: 'matriz', canal: 'WhatsApp' },
    { id: '3', setorDestinoId: 'matriz' },
  ], setores)

  assert.deepEqual(
    resumo.origens.map(({ nome, tipo, fluxo }) => ({ nome, tipo, fluxo })),
    [
      { nome: 'Fluxo WhatsApp', tipo: 'fluxo', fluxo: 'Fluxo WhatsApp → ServiceDesk Matriz' },
      { nome: 'Origem desconhecida', tipo: 'desconhecida', fluxo: 'Origem desconhecida → ServiceDesk Matriz' },
      { nome: 'PDV 1234', tipo: 'pdv', fluxo: 'PDV 1234 → ServiceDesk Matriz' },
    ],
  )
})

test('retorna um resumo vazio sem dividir por zero', () => {
  const resumo = resumirOrigensDeRoteamento([], setores)

  assert.deepEqual(resumo, {
    totalEntradas: 0,
    movimentosClassificados: 0,
    entradasLegadas: 0,
    transferencias: 0,
    transbordos: 0,
    semClassificacao: 0,
    origens: [],
    maiorTaxaTransbordo: null,
  })
})

test('correlaciona cada entrada ao log da mesma rota sem reutilizar logs', () => {
  const entradas = [
    {
      id: 'manual',
      ticketId: 'ticket-1',
      setorOrigemId: 'juazeiro',
      setorDestinoId: 'matriz',
      ocorridoEm: '2026-08-03T10:00:00.000Z',
    },
    {
      id: 'automatico',
      ticketId: 'ticket-1',
      setorOrigemId: 'barbalha',
      setorDestinoId: 'matriz',
      ocorridoEm: '2026-08-03T10:03:00.000Z',
    },
    {
      id: 'sem-evidencia',
      ticketId: 'ticket-2',
      setorOrigemId: 'juazeiro',
      setorDestinoId: 'matriz',
      ocorridoEm: '2026-08-03T11:00:00.000Z',
    },
  ]
  const logs = [
    {
      ticketId: 'ticket-1',
      tipo: 'transferencia',
      descricao: 'Transferido por Ana: Juazeiro do Norte PEV → ServiceDesk Matriz (fila)',
      criadoEm: '2026-08-03T10:00:02.000Z',
    },
    {
      ticketId: 'ticket-1',
      tipo: 'transferencia_automatica',
      descricao: 'Transbordo: Barbalha PEV → ServiceDesk Matriz (fila sem atendentes)',
      criadoEm: '2026-08-03T10:03:03.000Z',
    },
    {
      ticketId: 'ticket-2',
      tipo: 'transferencia',
      descricao: 'Transferido por Ana: Juazeiro do Norte PEV → ServiceDesk Matriz (fila)',
      criadoEm: '2026-08-03T11:10:00.000Z',
    },
  ]

  const classificadas = classificarEntradasDeRoteamento(entradas, logs, setores)

  assert.deepEqual(
    classificadas.map(({ id, tipoMovimento }) => ({ id, tipoMovimento })),
    [
      { id: 'manual', tipoMovimento: 'transferencia' },
      { id: 'automatico', tipoMovimento: 'transbordo' },
      { id: 'sem-evidencia', tipoMovimento: null },
    ],
  )
})

test('reconstrói rotas legadas por logs sem duplicar eventos estruturados novos', () => {
  const entradas = [
    {
      id: 'novo-1',
      ticketId: 'ticket-novo',
      setorOrigemId: 'juazeiro',
      setorDestinoId: 'matriz',
      ocorridoEm: '2026-08-04T10:00:00.000Z',
      fonte: 'assignment_log',
    },
    {
      id: 'novo-2',
      ticketId: 'ticket-novo',
      setorOrigemId: 'barbalha',
      setorDestinoId: 'matriz',
      ocorridoEm: '2026-08-04T10:10:00.000Z',
      fonte: 'assignment_log',
    },
  ]
  const logs = [
    {
      id: 'log-novo-1',
      ticketId: 'ticket-novo',
      tipo: 'transferencia',
      descricao: 'Transferido por Ana: Juazeiro do Norte PEV → ServiceDesk Matriz (fila)',
      criadoEm: '2026-08-04T10:00:02.000Z',
    },
    {
      id: 'log-novo-2',
      ticketId: 'ticket-novo',
      tipo: 'transferencia_automatica',
      descricao: 'Transbordo: Barbalha PEV → ServiceDesk Matriz (fila vazia)',
      criadoEm: '2026-08-04T10:10:02.000Z',
    },
    {
      id: 'log-legado-manual',
      ticketId: 'ticket-legado-manual',
      tipo: 'transferencia',
      descricao: 'Transferido por Ana: Juazeiro do Norte PEV → ServiceDesk Matriz (fila)',
      criadoEm: '2026-08-04T11:00:00.000Z',
    },
    {
      id: 'log-legado-auto',
      ticketId: 'ticket-legado-auto',
      tipo: 'transferencia_automatica',
      descricao: 'Transbordo: Barbalha PEV → ServiceDesk Matriz (fila vazia)',
      criadoEm: '2026-08-04T11:05:00.000Z',
    },
    {
      id: 'log-sem-rota',
      ticketId: 'ticket-sem-rota',
      tipo: 'transferencia',
      descricao: 'Transferência manual registrada',
      criadoEm: '2026-08-04T11:10:00.000Z',
    },
  ]

  const reconstruidas = reconstruirEntradasDeRoteamento(entradas, logs, setores, 'matriz')

  assert.deepEqual(
    reconstruidas.map(({ id, fonte, tipoMovimento, setorOrigemId }) => ({ id, fonte, tipoMovimento, setorOrigemId })),
    [
      { id: 'novo-1', fonte: 'assignment_log', tipoMovimento: undefined, setorOrigemId: 'juazeiro' },
      { id: 'novo-2', fonte: 'assignment_log', tipoMovimento: undefined, setorOrigemId: 'barbalha' },
      { id: 'ticket-log:log-legado-manual', fonte: 'ticket_log_legado', tipoMovimento: 'transferencia', setorOrigemId: 'juazeiro' },
      { id: 'ticket-log:log-legado-auto', fonte: 'ticket_log_legado', tipoMovimento: 'transbordo', setorOrigemId: 'barbalha' },
    ],
  )
})

test('aplica o predicado compartilhado do relatório para tag, atendente e subsetor', () => {
  const atendentesDaTag = new Set(['atendente-com-tag', 'atendente-sem-filtro'])
  const atendentesSelecionados = new Set(['atendente-com-tag'])
  const subsetoresSelecionados = new Set(['prime'])
  const filtradas = filtrarEntradasDeRoteamentoPorFiltroDeTicket([
    { id: 'incluida', colaboradorId: 'atendente-com-tag', subsetorId: 'prime' },
    { id: 'outra-tag', colaboradorId: 'atendente-fora-da-tag', subsetorId: 'prime' },
    { id: 'outro-atendente', colaboradorId: 'atendente-sem-filtro', subsetorId: 'prime' },
    { id: 'outro-subsetor', colaboradorId: 'atendente-com-tag', subsetorId: 'suporte' },
  ], (ticket) => (
    atendentesDaTag.has(ticket.colaborador_id || '')
    && atendentesSelecionados.has(ticket.colaborador_id || '')
    && subsetoresSelecionados.has(ticket.subsetor_id || '')
  ))

  assert.deepEqual(filtradas.map((entrada) => entrada.id), ['incluida'])
})
