// SOMENTE LEITURA — quanto cada número conectado recebe de fato.
//
// O número não está no banco: `setor_canais` guarda só o `phone_number_id`
// (Cloud API) ou o nome da `instancia` (Evolution). O número que o cliente
// disca vem da Meta, então o script resolve o id pelo Graph antes de contar.
//
// Conta duas coisas, por número:
//   CHAMADAS  — tickets que receberam ao menos uma mensagem do cliente naquele número
//   MENSAGENS — mensagens de cliente ('cliente' + 'cliente-nexus'), mês a mês
//
// Canal ≠ setor: um mesmo número atende vários setores (0520 abre ticket em
// ServiceDesk, Ouvidoria E Comercial), por isso a contagem é por número e não
// por setor.
//
// Uso:
//   node --use-system-ca scripts/diag-volume-por-numero.mjs [dias] [meses]
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
const MESES = Number(process.argv[3] || 6)
const REMETENTES_CLIENTE = ['cliente', 'cliente-nexus']

const { data: setores } = await sb.from('setores').select('id, nome')
const nomeSetor = new Map(setores.map((s) => [s.id, s.nome]))

const { data: canais } = await sb.from('setor_canais')
  .select('nome, setor_id, tipo, ativo, phone_number_id, whatsapp_token')
  .eq('tipo', 'whatsapp').eq('ativo', true)

// phone_number_id -> { numero, setores[] }.  Um id pode servir vários setores.
const numeros = new Map()
for (const c of canais) {
  if (!c.phone_number_id) continue
  let reg = numeros.get(c.phone_number_id)
  if (!reg) {
    const r = await fetch(
      `https://graph.facebook.com/v20.0/${c.phone_number_id}?fields=display_phone_number`,
      { headers: { Authorization: `Bearer ${c.whatsapp_token || env.WHATSAPP_ACCESS_TOKEN}` } }
    )
    const j = await r.json().catch(() => ({}))
    reg = { numero: j.display_phone_number || `id ${c.phone_number_id}`, setores: [] }
    numeros.set(c.phone_number_id, reg)
  }
  const setor = nomeSetor.get(c.setor_id)
  if (setor && !reg.setores.includes(setor)) reg.setores.push(setor)
}

const contarTickets = async (pni, ini, fim) => {
  let q = sb.from('tickets')
    .select('id, mensagens!inner(phone_number_id, remetente)', { count: 'exact', head: true })
    .eq('mensagens.phone_number_id', pni).in('mensagens.remetente', REMETENTES_CLIENTE)
    .gte('criado_em', ini)
  if (fim) q = q.lt('criado_em', fim)
  const { count, error } = await q
  if (error) throw new Error(error.message)
  return count
}
const contarMensagens = async (pni, ini, fim) => {
  let q = sb.from('mensagens').select('id', { count: 'exact', head: true })
    .eq('phone_number_id', pni).in('remetente', REMETENTES_CLIENTE).gte('enviado_em', ini)
  if (fim) q = q.lt('enviado_em', fim)
  const { count } = await q
  return count
}

const desde = new Date(Date.now() - DIAS * 864e5).toISOString()
console.log(`\n########  volume por número — últimos ${DIAS} dias  ########\n`)
const linhas = []
for (const [pni, reg] of numeros) {
  const [tickets, msgs] = await Promise.all([contarTickets(pni, desde), contarMensagens(pni, desde)])
  const { data: ultima } = await sb.from('mensagens').select('enviado_em')
    .eq('phone_number_id', pni).in('remetente', REMETENTES_CLIENTE)
    .order('enviado_em', { ascending: false }).limit(1)
  linhas.push({ numero: reg.numero, setores: reg.setores.join(' + '), tickets, msgs, ultima: ultima?.[0]?.enviado_em?.slice(0, 10) || 'nunca' })
}
linhas.sort((a, b) => a.tickets - b.tickets)
for (const l of linhas) {
  console.log(`${l.numero.padEnd(20)} chamadas=${String(l.tickets).padStart(6)}  msgs=${String(l.msgs).padStart(7)}  última entrada=${l.ultima}  ${l.setores}`)
}
console.log(`\nmenor volume: ${linhas[0].numero} (${linhas[0].tickets} chamadas)\n`)

console.log(`########  mensagens de cliente por mês (${MESES} meses)  ########\n`)
const cabecalho = [...numeros.values()].map((r) => r.numero.padStart(20)).join('')
console.log('mês'.padEnd(9) + cabecalho)
const hoje = new Date()
for (let i = MESES - 1; i >= 0; i--) {
  const ini = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - i, 1))
  const fim = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - i + 1, 1))
  const cols = []
  for (const pni of numeros.keys()) {
    cols.push(String(await contarMensagens(pni, ini.toISOString(), fim.toISOString())).padStart(20))
  }
  console.log(ini.toISOString().slice(0, 7).padEnd(9) + cols.join(''))
}
console.log()
