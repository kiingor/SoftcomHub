// SOMENTE LEITURA — por que o cliente fica preso na fila e por que quem chegou
// depois é atendido antes.
//
// Responde três coisas, nesta ordem:
//   1. CAPACIDADE  — o setor comporta a demanda? (teto × atendentes ÷ tempo de posse)
//   2. FILA AGORA  — quem está esperando e o motivo exato de cada atendente não pegar
//   3. ORDEM       — quando abre uma vaga, ela vai para o mais antigo da fila?
//
// A ordem é medida pelo trigger `log_ticket_assignment_timing`, que registra TODA
// atribuição, venha ela da API ou de um UPDATE direto no banco. É a única fonte
// que enxerga os dois caminhos — hoje 99% dos tickets nascem fora da API.
//
// Uso:
//   node --use-system-ca scripts/diag-fila-ordem.mjs ["nome do setor"] [horas]
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] })
)
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const FILTRO_SETOR = process.argv[2] || 'ServiceDesk Matriz Chat'
const HORAS = Number(process.argv[3] || 12)

// Pagina sempre: o PostgREST corta em 1.000 linhas sem avisar.
async function buscarTudo(construirQuery) {
  const PAGINA = 1000
  const todos = []
  for (let inicio = 0; ; inicio += PAGINA) {
    const { data, error } = await construirQuery().range(inicio, inicio + PAGINA - 1)
    if (error) throw new Error(error.message)
    if (!data?.length) break
    todos.push(...data)
    if (data.length < PAGINA) break
  }
  return todos
}

const min = (ms) => `${Math.round(ms / 60000)}min`
const quantil = (ordenados, p) => ordenados[Math.floor(ordenados.length * p)]

const setores = await buscarTudo(() => sb.from('setores').select('id, nome').order('id'))
const setor = setores.find((s) => s.nome === FILTRO_SETOR)
if (!setor) {
  console.error(`Setor "${FILTRO_SETOR}" não encontrado.`)
  console.error(`Opções: ${setores.map((s) => s.nome).join(' | ')}`)
  process.exit(1)
}
const subsetores = await buscarTudo(() => sb.from('subsetores').select('id, nome, setor_id').order('id'))
const nomeSub = new Map(subsetores.map((s) => [s.id, s.nome]))

const config = await buscarTudo(() => sb.from('ticket_distribution_config')
  .select('max_tickets_per_agent').eq('setor_id', setor.id).order('setor_id'))
const teto = config[0]?.max_tickets_per_agent ?? 10

console.log(`\n########  ${setor.nome}  —  teto = ${teto} ticket(s) por atendente  ########`)

// ---------------------------------------------------------------- 1. CAPACIDADE
const inicioDoDia = new Date(); inicioDoDia.setHours(0, 0, 0, 0)
const doDia = await buscarTudo(() => sb.from('tickets')
  .select('id, criado_em, atribuido_em, encerrado_em, is_disparo')
  .eq('setor_id', setor.id).gte('criado_em', inicioDoDia.toISOString()).order('id'))

const posse = doDia.filter((t) => t.atribuido_em && t.encerrado_em)
  .map((t) => Date.parse(t.encerrado_em) - Date.parse(t.atribuido_em)).sort((a, b) => a - b)
const espera = doDia.filter((t) => t.atribuido_em && !t.is_disparo)
  .map((t) => Date.parse(t.atribuido_em) - Date.parse(t.criado_em)).sort((a, b) => a - b)

console.log(`\n=== 1. CAPACIDADE (hoje) ===`)
console.log(`tickets: ${doDia.length} (${doDia.filter((t) => t.is_disparo).length} disparo)`)
if (posse.length) {
  console.log(`tempo com o atendente: p50=${min(quantil(posse, .5))} p75=${min(quantil(posse, .75))} p90=${min(quantil(posse, .9))}`)
}
if (espera.length) {
  const acima = espera.filter((e) => e > 1800000).length
  console.log(`espera na fila:       p50=${min(quantil(espera, .5))} p75=${min(quantil(espera, .75))} p90=${min(quantil(espera, .9))} max=${min(espera.at(-1))}`)
  console.log(`  esperaram +30min: ${acima} (${(acima / espera.length * 100).toFixed(1)}%)`)
}

const porHora = new Map()
for (const t of doDia) {
  if (t.is_disparo) continue
  const h = new Date(t.criado_em).getHours()
  porHora.set(h, (porHora.get(h) || 0) + 1)
}
const pico = porHora.size ? Math.max(...porHora.values()) : 0

const vinculos = await buscarTudo(() => sb.from('colaboradores_setores')
  .select('colaborador_id, colaboradores(id, nome, is_online, ativo, pausa_atual_id, last_heartbeat, setores_ativos_sessao)')
  .eq('setor_id', setor.id).order('colaborador_id'))
const online = [...new Map(
  vinculos.map((v) => v.colaboradores)
    .filter((c) => c?.ativo && c.is_online
      && (Array.isArray(c.setores_ativos_sessao) ? c.setores_ativos_sessao : []).includes(setor.id))
    .map((c) => [c.id, c]),
).values()]

if (posse.length) {
  // Um atendente comporta `teto` conversas ao mesmo tempo, cada uma ocupando a
  // posse mediana. Essa razão é o que decide se a fila cresce ou drena.
  const posseHoras = quantil(posse, .5) / 3600000
  const vazao = (n) => n * teto / posseHoras
  console.log(`\nvazão = atendentes × teto ÷ posse mediana:`)
  for (const n of [...new Set([online.length || 1, 15, 20])].sort((a, b) => a - b)) {
    console.log(`   ${String(n).padStart(2)} atendentes → ${vazao(n).toFixed(0)} tickets/hora`)
  }
  const capacidadeAtual = vazao(online.length || 1)
  console.log(`   pico de chegada hoje → ${pico} tickets/hora  (${pico > capacidadeAtual ? 'ACIMA da vazão: a fila cresce' : 'dentro da vazão'})`)
}

// ---------------------------------------------------------------- 2. FILA AGORA
const fila = await buscarTudo(() => sb.from('tickets')
  .select('id, numero, criado_em, subsetor_id, status')
  .eq('setor_id', setor.id).in('status', ['aberto', 'em_atendimento']).is('colaborador_id', null)
  .order('criado_em', { ascending: true }))

console.log(`\n=== 2. FILA AGORA: ${fila.length} ticket(s) sem atendente ===`)
if (fila.length) {
  for (const t of fila) {
    console.log(`   #${t.numero} ${t.subsetor_id ? (nomeSub.get(t.subsetor_id) || '?') : '(sem subsetor)'} — esperando ${min(Date.now() - Date.parse(t.criado_em))}`)
  }

  const links = await buscarTudo(() => sb.from('colaboradores_subsetores')
    .select('colaborador_id, subsetor_id').eq('setor_id', setor.id).order('colaborador_id'))
  const subsDe = new Map()
  for (const l of links) {
    const a = subsDe.get(l.colaborador_id) || []
    a.push(l.subsetor_id)
    subsDe.set(l.colaborador_id, a)
  }

  // Inclui quem está online mas sem o setor na sessão: o motivo importa.
  const todosOnline = [...new Map(
    vinculos.map((v) => v.colaboradores).filter((c) => c?.ativo && c.is_online).map((c) => [c.id, c]),
  ).values()]
  const ids = todosOnline.map((c) => c.id)
  const abertos = ids.length ? await buscarTudo(() => sb.from('tickets')
    .select('id, colaborador_id').in('colaborador_id', ids)
    .in('status', ['aberto', 'em_atendimento']).order('id')) : []
  const contagem = new Map()
  for (const a of abertos) contagem.set(a.colaborador_id, (contagem.get(a.colaborador_id) || 0) + 1)

  const subsDaFila = [...new Set(fila.map((t) => t.subsetor_id ?? null))]
  console.log(`\n   por que os ${todosOnline.length} atendentes online não pegam:`)
  for (const c of todosOnline) {
    const motivos = []
    const atraso = c.last_heartbeat ? Date.now() - Date.parse(c.last_heartbeat) : Infinity
    if (c.pausa_atual_id) motivos.push('em pausa')
    if (atraso > 5 * 60000) motivos.push(`heartbeat ${Number.isFinite(atraso) ? min(atraso) : 'nunca'}`)
    if (!(Array.isArray(c.setores_ativos_sessao) ? c.setores_ativos_sessao : []).includes(setor.id)) {
      motivos.push('setor fora da sessão')
    }
    const meus = subsDe.get(c.id) || []
    if (!subsDaFila.some((s) => (s ? meus.includes(s) : meus.length === 0))) {
      motivos.push(`subsetor não casa (${meus.map((s) => nomeSub.get(s) || s).join('/') || 'sem vínculo'})`)
    }
    const n = contagem.get(c.id) || 0
    if (teto > 0 && n >= teto) motivos.push(`no teto ${n}/${teto}`)
    console.log(`     ${motivos.length ? '✗' : '✓'} ${c.nome} (${n}/${teto})${motivos.length ? ' — ' + motivos.join('; ') : ' — PODE RECEBER'}`)
  }
}

// ---------------------------------------------------------------- 3. ORDEM
const corte = Date.now() - HORAS * 3600000
const janela = await buscarTudo(() => sb.from('tickets')
  .select('id, numero, criado_em, subsetor_id, colaborador_id, is_disparo')
  .eq('setor_id', setor.id)
  .gte('criado_em', new Date(Date.now() - (HORAS + 36) * 3600000).toISOString())
  .order('criado_em'))
const porId = new Map(janela.map((t) => [t.id, t]))

const eventos = await buscarTudo(() => sb.from('ticket_assignment_logs')
  .select('ticket_id, colaborador_id, previous_colaborador_id, assignment_reason, created_at')
  .gte('created_at', new Date(Date.now() - (HORAS + 36) * 3600000).toISOString())
  .order('created_at'))
const porTicket = new Map()
for (const e of eventos) {
  if (!porId.has(e.ticket_id)) continue
  const a = porTicket.get(e.ticket_id) || []
  a.push(e)
  porTicket.set(e.ticket_id, a)
}

// O trigger grava esta razão quando o ticket é INSERIDO já com atendente — ou
// seja, ele nunca passou pela fila.
const NASCEU_ATRIBUIDO = 'Atribuição inicial do ticket'
const donoEm = (ticketId, ms) => {
  const es = porTicket.get(ticketId) || []
  let dono = es.find((e) => e.assignment_reason === NASCEU_ATRIBUIDO)?.colaborador_id ?? null
  for (const e of es) {
    if (Date.parse(e.created_at) <= ms && e.assignment_reason !== NASCEU_ATRIBUIDO) dono = e.colaborador_id
  }
  return dono
}

const ganhos = eventos.filter((e) => e.colaborador_id && !e.previous_colaborador_id
  && e.assignment_reason !== NASCEU_ATRIBUIDO
  && Date.parse(e.created_at) >= corte
  && porId.has(e.ticket_id) && !porId.get(e.ticket_id).is_disparo)
const nasceram = eventos.filter((e) => e.assignment_reason === NASCEU_ATRIBUIDO
  && Date.parse(e.created_at) >= corte && porId.has(e.ticket_id))

let primeiro = 0, ultimo = 0, rapidos = 0
const posicoes = []
for (const g of ganhos) {
  const t = porId.get(g.ticket_id)
  const quando = Date.parse(g.created_at)
  if (quando - Date.parse(t.criado_em) < 5000) rapidos++

  // A fila daquele instante: mesmo subsetor, já criados, ainda sem dono.
  const naFila = janela
    .filter((o) => (o.subsetor_id ?? null) === (t.subsetor_id ?? null) && !o.is_disparo
      && Date.parse(o.criado_em) <= quando
      && (o.id === g.ticket_id || donoEm(o.id, quando) === null))
    .sort((a, b) => Date.parse(a.criado_em) - Date.parse(b.criado_em))
  if (naFila.length < 2) continue

  const pos = naFila.findIndex((o) => o.id === g.ticket_id) + 1
  if (pos < 1) continue
  posicoes.push(pos)
  if (pos === 1) primeiro++
  if (pos === naFila.length) ultimo++
}

console.log(`\n=== 3. ORDEM — quem ficou com a vaga (últimas ${HORAS}h) ===`)
console.log(`atribuições analisadas (com 2+ esperando na fila): ${posicoes.length}`)
if (posicoes.length) {
  console.log(`   foi para o MAIS ANTIGO da fila: ${primeiro} (${(primeiro / posicoes.length * 100).toFixed(1)}%)  <- deveria ser ~100%`)
  console.log(`   foi para o MAIS NOVO da fila:   ${ultimo} (${(ultimo / posicoes.length * 100).toFixed(1)}%)`)
  console.log(`   posição média do escolhido:     ${(posicoes.reduce((a, p) => a + p, 0) / posicoes.length).toFixed(1)}`)
}
if (ganhos.length) {
  console.log(`\n   atribuídos com menos de 5s de vida: ${rapidos} de ${ganhos.length} (${(rapidos / ganhos.length * 100).toFixed(1)}%)`)
}
console.log(`   nasceram já com atendente (nunca entraram na fila): ${nasceram.length}`)
const semFlag = nasceram.filter((e) => !porId.get(e.ticket_id).is_disparo).length
console.log(`     destes, sem is_disparo=true: ${semFlag} — invisíveis em relatório de disparo`)
