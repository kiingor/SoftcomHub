// SOMENTE LEITURA — disparo que cai em cima da avaliação (NPS) do cliente.
//
// Quando um atendimento é encerrado, o Hub avisa o n8n com `avaliar: true` e o
// cliente entra no fluxo de NPS; o espelho disso aqui é `tickets.status =
// 'avaliar'`. Enquanto o cliente está nesse fluxo, as respostas dele são
// consumidas pela avaliação e não chegam ao WorkDesk. Se um disparo sair nessa
// janela, o cliente recebe a mensagem e não consegue responder — o ticket novo
// nasce mudo.
//
// O casamento é por TELEFONE, não por cliente_id: o mesmo WhatsApp tem cadastro
// duplicado com e sem o nono dígito (ex.: 558388330154 e 5583988330154), então
// checar cliente_id perderia justamente os casos entre cadastros.
//
// Uso:
//   node --use-system-ca scripts/diag-disparo-durante-avaliacao.mjs [dias] [janela_min]
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] })
)
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const DIAS = Number(process.argv[2] || 30)
const JANELA_MIN = Number(process.argv[3] || 30)
const desde = new Date(Date.now() - DIAS * 864e5).toISOString()

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

/**
 * Chave que junta os dois cadastros do mesmo WhatsApp. O celular brasileiro
 * aparece com e sem o nono dígito e `normalizeBrazilianPhone` não completa —
 * derruba-se o 9 para comparar sempre a forma curta.
 */
function chaveTelefone(bruto) {
  const d = String(bruto || '').replace(/\D/g, '')
  const nacional = d.length > 11 && d.startsWith('55') ? d.slice(2) : d
  if (nacional.length === 11 && nacional[2] === '9') return nacional.slice(0, 2) + nacional.slice(3)
  return nacional
}

const [setores, clientes, tickets, disparos] = await Promise.all([
  buscarTudo(() => sb.from('setores').select('id, nome, webhook_eventos').order('id')),
  buscarTudo(() => sb.from('clientes').select('id, telefone').order('id')),
  buscarTudo(() => sb.from('tickets')
    .select('id, numero, cliente_id, setor_id, status, criado_em, encerrado_em, is_disparo')
    .gte('criado_em', desde).order('id')),
  buscarTudo(() => sb.from('disparo_logs')
    .select('ticket_id, cliente_telefone, cliente_nome, setor_id, criado_em, template_name')
    .eq('status', 'enviado').gte('criado_em', desde).order('criado_em')),
])

const nomeSetor = new Map(setores.map((s) => [s.id, s.nome]))
// Mesma regra do /api/webhooks/dispatch: null = avalia; senão só se listar.
const avaliaSetor = new Map(setores.map((s) => [s.id, s.webhook_eventos == null || s.webhook_eventos.includes('avaliacao')]))
const chaveDoCliente = new Map(clientes.map((c) => [c.id, chaveTelefone(c.telefone)]))
const ticketPorId = new Map(tickets.map((t) => [t.id, t]))

// encerramentos por chave de telefone, ordenados no tempo
const encerramentos = new Map()
for (const t of tickets) {
  if (!t.encerrado_em) continue
  const k = chaveDoCliente.get(t.cliente_id)
  if (!k) continue
  if (!encerramentos.has(k)) encerramentos.set(k, [])
  encerramentos.get(k).push(t)
}
for (const lista of encerramentos.values()) lista.sort((a, b) => a.encerrado_em.localeCompare(b.encerrado_em))

const janelaMs = JANELA_MIN * 60000
const atingidos = []
for (const d of disparos) {
  const k = chaveTelefone(d.cliente_telefone)
  const anteriores = encerramentos.get(k) || []
  const tDisparo = Date.parse(d.criado_em)
  const encerradoAntes = anteriores.filter((t) => {
    const fim = Date.parse(t.encerrado_em)
    return t.id !== d.ticket_id && fim <= tDisparo && tDisparo - fim <= janelaMs
  })
  if (encerradoAntes.length) {
    atingidos.push({ disparo: d, anterior: encerradoAntes[encerradoAntes.length - 1] })
  }
}

console.log(`\n########  disparo em cima da avaliação — ${DIAS} dias, janela de ${JANELA_MIN} min  ########\n`)
console.log(`disparos enviados no período .................. ${disparos.length}`)
console.log(`saíram até ${JANELA_MIN} min após um encerramento do mesmo cliente ... ${atingidos.length} (${(100 * atingidos.length / disparos.length).toFixed(1)}%)`)
const comFlag = atingidos.filter((a) => avaliaSetor.get(a.anterior.setor_id)).length
console.log(`  ... com NPS ligado no setor que encerrou ....... ${comFlag}`)
console.log(`  ... com NPS DESLIGADO no setor que encerrou .... ${atingidos.length - comFlag}  (o n8n avalia mesmo assim — ver ServiceDesk)`)

// Quantos desses tickets de disparo receberam ALGUMA resposta do cliente?
async function ticketsComRespostaDoCliente(ids) {
  const comResposta = new Set()
  for (let i = 0; i < ids.length; i += 100) {
    const bloco = ids.slice(i, i + 100)
    const linhas = await buscarTudo(() => sb.from('mensagens').select('ticket_id')
      .in('ticket_id', bloco).in('remetente', ['cliente', 'cliente-nexus']).order('ticket_id'))
    for (const l of linhas) comResposta.add(l.ticket_id)
  }
  return comResposta
}

const idsAtingidos = atingidos.map((a) => a.disparo.ticket_id).filter(Boolean)
const idsControle = disparos
  .map((d) => d.ticket_id)
  .filter((id) => id && !idsAtingidos.includes(id))
  .sort(() => Math.random() - 0.5)
  .slice(0, 400)

const [respAtingidos, respControle] = await Promise.all([
  ticketsComRespostaDoCliente(idsAtingidos),
  ticketsComRespostaDoCliente(idsControle),
])

const taxa = (comResp, total) => total ? `${(100 * comResp / total).toFixed(1)}%` : '—'
console.log(`\nresposta do cliente no ticket do disparo:`)
console.log(`  dentro da janela de avaliação .... ${respAtingidos.size}/${idsAtingidos.length} responderam (${taxa(respAtingidos.size, idsAtingidos.length)})`)
console.log(`  fora da janela (amostra) ......... ${respControle.size}/${idsControle.length} responderam (${taxa(respControle.size, idsControle.length)})`)

console.log(`\núltimos ${Math.min(15, atingidos.length)} casos:\n`)
for (const a of atingidos.slice(-15)) {
  const t = ticketPorId.get(a.disparo.ticket_id)
  const gap = Math.round((Date.parse(a.disparo.criado_em) - Date.parse(a.anterior.encerrado_em)) / 60000)
  const respondeu = respAtingidos.has(a.disparo.ticket_id) ? 'respondeu' : 'MUDO'
  console.log(
    `${a.disparo.criado_em.slice(0, 16).replace('T', ' ')}  ` +
    `#${String(t?.numero ?? '?').padEnd(7)} ${String(nomeSetor.get(a.disparo.setor_id)).padEnd(24)} ` +
    `${gap}min após #${a.anterior.numero} (${nomeSetor.get(a.anterior.setor_id)}${avaliaSetor.get(a.anterior.setor_id) ? '' : ', NPS off'}) — ${respondeu}`
  )
}
console.log()
