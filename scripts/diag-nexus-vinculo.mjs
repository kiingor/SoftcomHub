// SOMENTE LEITURA — diagnostico do fix de vinculo do historico do Nexus.
// Rodar: node --use-system-ca scripts/diag-nexus-vinculo.mjs
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] })
)
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const TELEFONE = '558388535477'
const TICKET_ID = 'd876a9c7-a1a2-4b63-84d8-e78fb1ef2522'

const { data: clientes, error: eCli } = await sb
  .from('clientes')
  .select('id, nome, telefone')
  .eq('telefone', TELEFONE)

console.log('=== Clientes com esse telefone ===')
if (eCli) console.error('Erro:', eCli.message)
console.log(clientes)

const clienteIds = (clientes || []).map(c => c.id)

if (clienteIds.length > 0) {
  // Cliente de teste tem historico gigante (>1000 msgs desde fevereiro) — sem
  // filtro de data a query bate no limite padrao do PostgREST (1000 linhas) e
  // NUNCA chega nas mensagens de hoje. Filtra só o dia do teste.
  const { data: msgs, error: eMsg } = await sb
    .from('mensagens')
    .select('id, ticket_id, cliente_id, remetente, conteudo, enviado_em')
    .in('cliente_id', clienteIds)
    .gte('enviado_em', '2026-07-20T00:00:00Z')
    .order('enviado_em', { ascending: true })

  console.log(`\n=== TODAS as mensagens desses cliente_ids (${msgs?.length || 0}) ===`)
  if (eMsg) console.error('Erro:', eMsg.message)
  ;(msgs || []).forEach(m => {
    console.log(`${m.enviado_em}  ticket_id=${m.ticket_id || 'NULL'}  remetente=${m.remetente}  conteudo="${(m.conteudo || '').slice(0, 60)}"`)
  })

  const orfasNexus = (msgs || []).filter(m => m.ticket_id === null && ['cliente-nexus', 'bot-nexus'].includes(m.remetente))
  console.log(`\n=== Órfãs do Nexus (ticket_id null, remetente cliente-nexus/bot-nexus) ===`)
  console.log(orfasNexus.length ? orfasNexus : 'NENHUMA — não havia histórico do bot pra vincular')
}

console.log('\n=== Ticket em questão ===')
const { data: ticket, error: eTicket } = await sb
  .from('tickets')
  .select('id, numero, cliente_id, setor_id, status, canal, criado_em')
  .eq('id', TICKET_ID)
  .maybeSingle()
if (eTicket) console.error('Erro:', eTicket.message)
console.log(ticket)

console.log('\n=== ticket_logs desse ticket (como foi criado) ===')
const { data: logs, error: eLogs } = await sb
  .from('ticket_logs')
  .select('tipo, descricao, criado_em')
  .eq('ticket_id', TICKET_ID)
  .order('criado_em', { ascending: true })
if (eLogs) console.error('Erro:', eLogs.message)
console.log(logs)
