// SOMENTE LEITURA — procura tickets recentes que já têm mensagens cliente-nexus/
// bot-nexus vinculadas (ticket_id preenchido), sinal de que o trigger pegou um
// caso real (não o meu teste, que já foi desfeito).
// Rodar: node --use-system-ca scripts/checar-tickets-com-nexus-vinculado.mjs
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] })
)
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

// Janela: desde hoje de manhã (cobre com folga o horário em que o trigger foi criado)
const DESDE = '2026-07-20T00:00:00Z'

const { data: msgs, error } = await sb
  .from('mensagens')
  .select('id, ticket_id, cliente_id, remetente, enviado_em')
  .in('remetente', ['cliente-nexus', 'bot-nexus'])
  .not('ticket_id', 'is', null)
  .gte('enviado_em', DESDE)
  .order('enviado_em', { ascending: true })

if (error) { console.error('Erro:', error.message); process.exit(1) }
console.log(`Mensagens cliente-nexus/bot-nexus JÁ vinculadas a um ticket (hoje): ${msgs.length}`)

const ticketIds = [...new Set(msgs.map(m => m.ticket_id))]
console.log(`Tickets distintos envolvidos: ${ticketIds.length}`)

if (ticketIds.length === 0) process.exit(0)

const { data: tickets, error: eT } = await sb
  .from('tickets')
  .select('id, numero, status, criado_em, encerrado_em, setor_id')
  .in('id', ticketIds)
  .order('criado_em', { ascending: true })

if (eT) { console.error('Erro tickets:', eT.message); process.exit(1) }

console.log('\n=== Tickets com histórico do Nexus vinculado ===')
tickets.forEach(t => {
  const qtdMsgs = msgs.filter(m => m.ticket_id === t.id).length
  console.log(`#${t.numero}  id=${t.id}  status=${t.status}  criado=${t.criado_em}  encerrado=${t.encerrado_em || '—'}  mensagens_nexus_vinculadas=${qtdMsgs}`)
})

const encerrados = tickets.filter(t => t.status === 'encerrado')
console.log(`\n${encerrados.length} desses já foi(ram) encerrado(s) — o webhook pra Maestro já deve ter disparado com o historico_conversa incluindo essas mensagens.`)
