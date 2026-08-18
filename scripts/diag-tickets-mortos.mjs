// SOMENTE LEITURA — caso #97520: tickets "mortos" (>24h sem nenhuma mensagem)
// e config de IA/encerramento por setor.
// Rodar: node --use-system-ca <este arquivo>
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] })
)
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const SETOR_ALVO = '32784b5b-58eb-4494-a7e6-d4a279358b84'

async function paginar(tabela, colunas, aplicaFiltros) {
  const out = []
  const passo = 1000
  for (let de = 0; ; de += passo) {
    let q = sb.from(tabela).select(colunas).range(de, de + passo - 1)
    q = aplicaFiltros(q)
    const { data, error } = await q
    if (error) throw error
    out.push(...data)
    if (data.length < passo) break
  }
  return out
}

// ─── 1. Config dos setores ────────────────────────────────────────────────
const { data: setores, error: eSet } = await sb
  .from('setores')
  .select('id, nome, encerramento_auto_ativo, encerramento_auto_minutos, openai_ativo, openai_api_key, openai_url_personalizada, openai_base_url')
  .order('nome')
  .limit(500)
if (eSet) throw eSet

console.log('=== 1. SETORES: encerramento automático + IA ===')
console.log(`total de setores: ${setores.length}`)
console.log(`com encerramento_auto_ativo: ${setores.filter((s) => s.encerramento_auto_ativo).length}`)
console.log(`com openai_ativo + chave:    ${setores.filter((s) => s.openai_ativo && s.openai_api_key).length}`)
console.log(`com url personalizada:       ${setores.filter((s) => s.openai_url_personalizada && s.openai_base_url).length}`)
for (const s of setores.filter((s) => s.encerramento_auto_ativo || (s.openai_ativo && s.openai_api_key))) {
  console.log(
    `  ${s.nome.padEnd(38)} | auto=${String(s.encerramento_auto_ativo).padEnd(5)} ${String(s.encerramento_auto_minutos ?? '-').padStart(4)}min | ia=${String(s.openai_ativo).padEnd(5)} url=${s.openai_url_personalizada ? s.openai_base_url : '(openai.com)'}`,
  )
}

const alvo = setores.find((s) => s.id === SETOR_ALVO)
console.log('\n--- setor do caso (32784b5b…) ---')
console.log(alvo ? JSON.stringify({ ...alvo, openai_api_key: alvo.openai_api_key ? `${alvo.openai_api_key.slice(0, 6)}…(${alvo.openai_api_key.length})` : null }, null, 2) : 'NÃO ENCONTRADO')

// ─── 2. Tickets abertos ───────────────────────────────────────────────────
const abertos = await paginar('tickets', 'id, setor_id, status, criado_em, is_disparo', (q) =>
  q.in('status', ['aberto', 'em_atendimento']),
)
console.log(`\n=== 2. TICKETS ABERTOS ===\ntotal: ${abertos.length}`)

// ─── 3. Quais tiveram mensagem nas últimas 24h ────────────────────────────
// Duas contas, porque o cron do caso #97520 IGNORA remetente='sistema' (aviso
// de transferência não é interação e não pode reiniciar o relógio). A diferença
// entre as duas é exatamente o que esse critério acrescenta.
const corte = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
const ids = abertos.map((t) => t.id)
const comMsgRecente = new Set()
const comInteracaoRecente = new Set()
for (let i = 0; i < ids.length; i += 200) {
  const lote = ids.slice(i, i + 200)
  const linhas = await paginar('mensagens', 'ticket_id, remetente', (q) =>
    q.in('ticket_id', lote).gte('enviado_em', corte),
  )
  for (const l of linhas) {
    comMsgRecente.add(l.ticket_id)
    if (l.remetente !== 'sistema') comInteracaoRecente.add(l.ticket_id)
  }
}

const criadoAntesDoCorte = (t) => new Date(t.criado_em) < new Date(corte)
const mortos = abertos.filter((t) => !comInteracaoRecente.has(t.id) && criadoAntesDoCorte(t))
const mortosContandoSistema = abertos.filter((t) => !comMsgRecente.has(t.id) && criadoAntesDoCorte(t))
console.log(`sem NENHUMA mensagem há +24h:                 ${mortosContandoSistema.length}`)
console.log(`sem interação (ignorando 'sistema') há +24h:  ${mortos.length}  <- o que o cron fecha`)
console.log(`  diferença (só tinham mensagem de sistema):  ${mortos.length - mortosContandoSistema.length}`)

const porSetor = new Map()
for (const t of mortos) porSetor.set(t.setor_id, (porSetor.get(t.setor_id) || 0) + 1)
const nomeSetor = new Map(setores.map((s) => [s.id, s.nome]))
console.log('\npor setor:')
for (const [sid, n] of [...porSetor.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)) {
  const s = setores.find((x) => x.id === sid)
  console.log(`  ${String(n).padStart(5)}  ${(nomeSetor.get(sid) || sid).padEnd(38)} auto=${s?.encerramento_auto_ativo}`)
}

// ─── 4. Último remetente dos mortos (amostra) ─────────────────────────────
const amostra = mortos.slice(0, 400)
const ultimo = new Map()
for (let i = 0; i < amostra.length; i += 100) {
  const lote = amostra.slice(i, i + 100).map((t) => t.id)
  const linhas = await paginar('mensagens', 'ticket_id, remetente, enviado_em', (q) =>
    q.in('ticket_id', lote).order('enviado_em', { ascending: false }),
  )
  for (const l of linhas) if (!ultimo.has(l.ticket_id)) ultimo.set(l.ticket_id, l)
}
const contagem = {}
for (const t of amostra) {
  const r = ultimo.get(t.id)?.remetente ?? '(sem mensagem nenhuma)'
  contagem[r] = (contagem[r] || 0) + 1
}
console.log(`\n=== 3. ÚLTIMO REMETENTE dos mortos (amostra de ${amostra.length}) ===`)
for (const [r, n] of Object.entries(contagem).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(5)}  ${r}`)
}

// ─── 5. Idade dos mortos ──────────────────────────────────────────────────
const agora = Date.now()
const idades = mortos.map((t) => {
  const ref = ultimo.get(t.id)?.enviado_em || t.criado_em
  return (agora - new Date(ref).getTime()) / 36e5
}).sort((a, b) => a - b)
if (idades.length) {
  const p = (q) => idades[Math.min(idades.length - 1, Math.floor(idades.length * q))]
  console.log(`\n=== 4. IDADE (horas desde a última interação) ===`)
  console.log(`  min=${p(0).toFixed(0)}h  p50=${p(0.5).toFixed(0)}h  p90=${p(0.9).toFixed(0)}h  max=${idades[idades.length - 1].toFixed(0)}h`)
}

// ─── 6. Áudios sem transcrição ────────────────────────────────────────────
const { count: audios } = await sb
  .from('mensagens')
  .select('id', { count: 'exact', head: true })
  .eq('tipo', 'audio')
  .gte('enviado_em', new Date(Date.now() - 30 * 864e5).toISOString())
console.log(`\n=== 5. ÁUDIOS (últimos 30 dias) ===\ntotal tipo=audio: ${audios}`)
