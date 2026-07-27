// SOMENTE LEITURA — detecta tickets duplicados (mesmo cliente, criados em
// sequência) e mostra por qual caminho cada um nasceu.
// Rodar: node --use-system-ca scripts/diag-tickets-duplicados.mjs [horas]
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] })
)
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const HORAS = Number(process.argv[2] || 12)
const JANELA_S = Number(process.argv[3] || 60)
const desde = new Date(Date.now() - HORAS * 3600_000).toISOString()

const { data: tickets, error } = await sb
  .from('tickets')
  .select('id, numero, cliente_id, setor_id, colaborador_id, status, criado_em, atribuido_em, clientes(nome, telefone)')
  .gte('criado_em', desde)
  .order('criado_em', { ascending: true })

if (error) { console.error('ERRO:', error); process.exit(1) }

const ids = tickets.map((t) => t.id)
console.log(`tickets nas últimas ${HORAS}h: ${tickets.length}`)

// Origem: só quem passa por lib/ticket-distribution.ts grava log 'criacao'.
let comCriacao = 0
for (let i = 0; i < ids.length; i += 300) {
  const { data } = await sb.from('ticket_logs')
    .select('ticket_id').in('ticket_id', ids.slice(i, i + 300)).eq('tipo', 'criacao')
  comCriacao += new Set((data || []).map((l) => l.ticket_id)).size
}
console.log(`  criados pelo app (log 'criacao'): ${comCriacao}`)
console.log(`  criados fora do app: ${tickets.length - comCriacao}`)
console.log(`  já nascem com colaborador_id: ${tickets.filter((t) => t.colaborador_id).length}`)

// Pares do mesmo cliente dentro da janela
const porCliente = new Map()
for (const t of tickets) {
  if (!t.cliente_id) continue
  const a = porCliente.get(t.cliente_id) || []; a.push(t); porCliente.set(t.cliente_id, a)
}
const pares = []
for (const [, arr] of porCliente) {
  for (let i = 1; i < arr.length; i++) {
    const dt = (new Date(arr[i].criado_em) - new Date(arr[i - 1].criado_em)) / 1000
    if (dt <= JANELA_S) pares.push({ dt, a: arr[i - 1], b: arr[i] })
  }
}

console.log(`\npares duplicados (<= ${JANELA_S}s): ${pares.length}`)
for (const { dt, a, b } of pares) {
  const resumo = async (t) => {
    const { data } = await sb.from('mensagens').select('remetente').eq('ticket_id', t.id)
    const r = (data || []).map((x) => x.remetente)
    return `nexus=${r.filter((x) => x.endsWith('-nexus')).length} cliente=${r.filter((x) => x === 'cliente').length} colab=${r.filter((x) => x === 'colaborador').length}`
  }
  console.log(`\n  Δ${dt.toFixed(0)}s | ${a.clientes?.nome} (${a.clientes?.telefone})`)
  console.log(`    A #${a.numero} ${a.criado_em.slice(11, 19)} colab=${a.colaborador_id?.slice(0, 8) ?? 'null'} [${await resumo(a)}]`)
  console.log(`    B #${b.numero} ${b.criado_em.slice(11, 19)} colab=${b.colaborador_id?.slice(0, 8) ?? 'null'} [${await resumo(b)}]`)
  console.log(`    mesmo setor=${a.setor_id === b.setor_id} | mesmo atendente=${a.colaborador_id === b.colaborador_id}`)
}
