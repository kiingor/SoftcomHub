import assert from 'node:assert/strict'
import test from 'node:test'
import { criarMedidorDeExpediente } from '../lib/horario-atendimento.ts'

// Horário real do ServiceDesk Matriz Chat (hora de Brasília).
const SERVICEDESK = [
  { dia_semana: 0, ativo: true, hora_inicio: '07:00:00', hora_fim: '00:00:00' },
  { dia_semana: 1, ativo: true, hora_inicio: '07:00:00', hora_fim: '22:00:00' },
  { dia_semana: 2, ativo: true, hora_inicio: '07:00:00', hora_fim: '22:00:00' },
  { dia_semana: 3, ativo: true, hora_inicio: '07:00:00', hora_fim: '22:00:00' },
  { dia_semana: 4, ativo: true, hora_inicio: '07:00:00', hora_fim: '00:00:00' },
  { dia_semana: 5, ativo: true, hora_inicio: '07:00:00', hora_fim: '02:00:00' },
  { dia_semana: 6, ativo: true, hora_inicio: '07:00:00', hora_fim: '02:00:00' },
]

const medir = criarMedidorDeExpediente(SERVICEDESK)
const min = (n) => n * 60_000
// Brasília é UTC-3: "T10:00:00Z" é 07:00 da manhã em Brasília.
const utc = (iso) => Date.parse(iso)

test('o caso que motivou a mudança: espera da madrugada', () => {
  // #155513, terça 04/08/2026: chegou 00:28 (fechado desde 22:00) e foi
  // atendido 07:05, cinco minutos depois de abrir. Contava 6h37.
  const espera = medir(utc('2026-08-04T03:28:33Z'), utc('2026-08-04T10:05:44Z'))

  assert.ok(espera > min(5) && espera < min(6), `esperado ~5min, veio ${espera / 60_000}min`)
})

test('espera inteira dentro do expediente conta integralmente', () => {
  // Terça, 10:00 → 10:30 em Brasília.
  assert.equal(medir(utc('2026-08-04T13:00:00Z'), utc('2026-08-04T13:30:00Z')), min(30))
})

test('espera inteira fora do expediente é zero', () => {
  // Terça, 02:00 → 03:00 em Brasília: abre só às 07:00.
  assert.equal(medir(utc('2026-08-04T05:00:00Z'), utc('2026-08-04T06:00:00Z')), 0)
})

test('janela que atravessa a meia-noite é uma só', () => {
  // Sexta 07/08 fecha às 02:00 de sábado. Espera de 01:30 a 02:30 (Brasília)
  // aproveita só os 30 min antes do fechamento.
  const espera = medir(utc('2026-08-08T04:30:00Z'), utc('2026-08-08T05:30:00Z'))

  assert.equal(espera, min(30))
})

test('espera que cruza o fechamento e a reabertura soma os dois pedaços', () => {
  // Terça 21:30 → quarta 07:30 (Brasília): 30 min antes de fechar às 22:00,
  // mais 30 min depois de abrir às 07:00. As 9h fechadas não contam.
  const espera = medir(utc('2026-08-05T00:30:00Z'), utc('2026-08-05T10:30:00Z'))

  assert.equal(espera, min(60))
})

test('dia inativo não abre', () => {
  const soSegunda = criarMedidorDeExpediente([
    { dia_semana: 1, ativo: true, hora_inicio: '07:00:00', hora_fim: '22:00:00' },
    { dia_semana: 2, ativo: false, hora_inicio: '07:00:00', hora_fim: '22:00:00' },
  ])
  // Terça 10:00 → 11:00 em Brasília, com a terça desativada.
  assert.equal(soSegunda(utc('2026-08-04T13:00:00Z'), utc('2026-08-04T14:00:00Z')), 0)
})

test('sem horário cadastrado devolve null — a conta segue em tempo corrido', () => {
  // Zerar a espera de todo setor sem cadastro seria pior que não descontar.
  assert.equal(criarMedidorDeExpediente([]), null)
  assert.equal(criarMedidorDeExpediente(null), null)
  assert.equal(
    criarMedidorDeExpediente([{ dia_semana: 1, hora_inicio: null, hora_fim: null }]),
    null,
    'linha sem horário utilizável não conta como cadastro',
  )
})

test('intervalo invertido ou vazio não vira espera negativa', () => {
  assert.equal(medir(utc('2026-08-04T13:30:00Z'), utc('2026-08-04T13:00:00Z')), 0)
  assert.equal(medir(utc('2026-08-04T13:00:00Z'), utc('2026-08-04T13:00:00Z')), 0)
})

test('espera de vários dias soma um expediente por dia', () => {
  // Segunda 07:00 → quarta 07:00 (Brasília): dois dias completos de 15h.
  const espera = medir(utc('2026-08-03T10:00:00Z'), utc('2026-08-05T10:00:00Z'))

  assert.equal(espera, 2 * 15 * 3_600_000)
})
