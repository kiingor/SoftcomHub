// SOMENTE LEITURA — quais valores de `remetente` existem em mensagens.
// Importa para o cron de tickets mortos: o filtro precisa contar como
// "interação" tudo que é gente ou bot, e ignorar só o ruído do sistema.
// Rodar: node --use-system-ca scripts/diag-remetentes.mjs
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] })
)
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const candidatos = [
  'cliente', 'colaborador', 'bot', 'sistema', 'supervisor',
  'cliente-nexus', 'bot-nexus', 'atendente', 'widget',
]
console.log('contagem por remetente (últimos 90 dias):')
const desde = new Date(Date.now() - 90 * 864e5).toISOString()
for (const r of candidatos) {
  const { count, error } = await sb
    .from('mensagens')
    .select('id', { count: 'exact', head: true })
    .eq('remetente', r)
    .gte('enviado_em', desde)
  console.log(`  ${r.padEnd(16)} ${error ? `erro: ${error.message}` : count}`)
}

// varredura para achar valores fora da lista
const { data: amostra } = await sb
  .from('mensagens')
  .select('remetente')
  .gte('enviado_em', desde)
  .not('remetente', 'in', `(${candidatos.join(',')})`)
  .limit(50)
console.log(`\nremetentes fora da lista: ${amostra?.length ? [...new Set(amostra.map((m) => m.remetente))].join(', ') : '(nenhum)'}`)
