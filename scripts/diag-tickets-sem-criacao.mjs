// SOMENTE LEITURA — verifica se "ticket sem log de criacao" é um caso isolado
// ou um padrão recorrente (o que apontaria pra um bug maior em criarEDistribuirTicket).
// Rodar: node --use-system-ca scripts/diag-tickets-sem-criacao.mjs
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] })
)
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

// Últimos 3 dias de tickets
const desde = '2026-07-17T00:00:00Z'

const { data: tickets, error: eT } = await sb
  .from('tickets')
  .select('id, numero, cliente_id, setor_id, status, canal, colaborador_id, criado_em')
  .gte('criado_em', desde)
  .order('criado_em', { ascending: true })

if (eT) { console.error('Erro tickets:', eT.message); process.exit(1) }
console.log(`Tickets desde ${desde}: ${tickets.length}`)

// Evita .in() com 860 IDs (URL grande demais / Bad Request) — busca por
// criado_em na mesma janela e cruza em memória.
const { data: logs, error: eL } = await sb
  .from('ticket_logs')
  .select('ticket_id, tipo, criado_em')
  .eq('tipo', 'criacao')
  .gte('criado_em', desde)
  .order('criado_em', { ascending: true })
  .limit(5000)

if (eL) { console.error('Erro logs:', eL.message); process.exit(1) }
console.log(`Logs 'criacao' desde ${desde}: ${logs.length}`)
const comLog = new Set((logs || []).map(l => l.ticket_id))

const semLog = tickets.filter(t => !comLog.has(t.id))
console.log(`\nTickets SEM log de 'criacao': ${semLog.length} / ${tickets.length}`)
semLog.forEach(t => {
  console.log(`  #${t.numero}  id=${t.id}  setor=${t.setor_id}  canal=${t.canal}  status=${t.status}  colaborador_id=${t.colaborador_id || 'NULL'}  criado_em=${t.criado_em}`)
})
