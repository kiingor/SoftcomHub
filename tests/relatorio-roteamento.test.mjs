import assert from 'node:assert/strict'
import test from 'node:test'
import {
  classificarEntradasDeRoteamento,
  resumirOrigensDeRoteamento,
} from '../lib/relatorio-roteamento.ts'

const setores = [
  { id: 'matriz', nome: 'ServiceDesk Matriz' },
  { id: 'juazeiro', nome: 'Juazeiro do Norte PEV' },
  { id: 'barbalha', nome: 'Barbalha PEV' },
]

test('agrega quantidade, taxa e recorrência por setor de origem', () => {
  const resumo = resumirOrigensDeRoteamento([
    { id: '1', setorOrigemId: 'juazeiro', setorDestinoId: 'matriz', ocorridoEm: '2026-08-01T10:00:00.000Z', tipoMovimento: 'transferencia' },
    { id: '2', setorOrigemId: 'juazeiro', setorDestinoId: 'matriz', ocorridoEm: '2026-08-01T14:00:00.000Z', tipoMovimento: 'transbordo' },
    { id: '3', setorOrigemId: 'juazeiro', setorDestinoId: 'matriz', ocorridoEm: '2026-08-02T10:00:00.000Z', tipoMovimento: 'transbordo' },
    { id: '4', setorOrigemId: 'barbalha', setorDestinoId: 'matriz', ocorridoEm: '2026-08-02T11:00:00.000Z' },
  ], setores)

  assert.equal(resumo.totalEntradas, 4)
  assert.equal(resumo.transferencias, 1)
  assert.equal(resumo.transbordos, 2)
  assert.equal(resumo.semClassificacao, 1)
  assert.deepEqual(resumo.maiorIndice, {
    id: 'setor:juazeiro',
    nome: 'Juazeiro do Norte PEV',
    tipo: 'setor',
    fluxo: 'Juazeiro do Norte PEV → ServiceDesk Matriz',
    quantidade: 3,
    taxa: 75,
    transferencias: 1,
    transbordos: 2,
    semClassificacao: 0,
    diasComOcorrencia: 2,
    maiorPicoDiario: 2,
  })
  assert.equal(resumo.origens[1].taxa, 25)
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
    transferencias: 0,
    transbordos: 0,
    semClassificacao: 0,
    origens: [],
    maiorIndice: null,
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
