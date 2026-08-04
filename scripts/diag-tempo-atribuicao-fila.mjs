// SOMENTE LEITURA — mede o tempo real entre o ticket cair na fila e ser
// atribuído a um atendente, pra calibrar o limiar de "deu fila" com dado real
// em vez de chute. `atribuido_em` só é gravado desde 28/07/2026 (ver
// lib/ticket-assignment-stamp.ts), então a janela útil é curta.
//
// Entrada na fila segue a mesma regra de lib/relatorio-fila.ts
// (resolverEntradaDeFila): disparo usa cliente_respondeu_em, o resto usa
// criado_em.
//
// Rodar: node --use-system-ca scripts/diag-tempo-atribuicao-fila.mjs [dias] [setor_id]
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] })
)
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const DIAS = Number(process.argv[2] || 14)
const SETOR_ID = process.argv[3] || null
const desde = new Date(Date.now() - DIAS * 86_400_000).toISOString()

// PostgREST corta em 1000 linhas por página silenciosamente — pagina até
// esgotar, senão os percentis mentem sobre o volume real (visto: 3652 linhas
// reais viravam 1000 sem paginação).
const PAGE = 1000
const tickets = []
for (let pagina = 0; ; pagina++) {
  let query = sb
    .from('tickets')
    .select('id, numero, setor_id, subsetor_id, status, criado_em, atribuido_em, is_disparo, cliente_respondeu_em')
    .gte('criado_em', desde)
    .not('atribuido_em', 'is', null)
    .order('criado_em', { ascending: true })
    .range(pagina * PAGE, pagina * PAGE + PAGE - 1)
  if (SETOR_ID) query = query.eq('setor_id', SETOR_ID)

  const { data, error } = await query
  if (error) { console.error('ERRO:', error); process.exit(1) }
  tickets.push(...data)
  if (data.length < PAGE) break
}

console.log(`tickets com atribuido_em nos últimos ${DIAS} dias${SETOR_ID ? ` (setor ${SETOR_ID})` : ''}: ${tickets.length}`)

function entradaNaFila(t) {
  const iso = t.is_disparo ? t.cliente_respondeu_em : t.criado_em
  return iso ? Date.parse(iso) : NaN
}

const latencias = []
let semEntrada = 0
let negativas = 0
for (const t of tickets) {
  const entrada = entradaNaFila(t)
  if (!Number.isFinite(entrada)) { semEntrada++; continue }
  const atribuido = Date.parse(t.atribuido_em)
  const latMs = atribuido - entrada
  if (!Number.isFinite(latMs) || latMs < 0) { negativas++; continue }
  latencias.push(latMs / 1000)
}
console.log(`  sem entrada de fila resolvível (disparo sem resposta): ${semEntrada}`)
console.log(`  latência negativa/descartada: ${negativas}`)
console.log(`  amostra válida: ${latencias.length}\n`)

if (latencias.length === 0) { console.log('sem dados suficientes.'); process.exit(0) }

latencias.sort((a, b) => a - b)
const pct = (p) => {
  const idx = Math.min(latencias.length - 1, Math.floor((p / 100) * latencias.length))
  return latencias[idx]
}
const media = latencias.reduce((a, b) => a + b, 0) / latencias.length
const fmt = (s) => `${s.toFixed(1)}s`

console.log('Distribuição do tempo criado→atribuído (segundos):')
console.log(`  min    : ${fmt(latencias[0])}`)
console.log(`  p10    : ${fmt(pct(10))}`)
console.log(`  p25    : ${fmt(pct(25))}`)
console.log(`  mediana: ${fmt(pct(50))}`)
console.log(`  p75    : ${fmt(pct(75))}`)
console.log(`  p90    : ${fmt(pct(90))}`)
console.log(`  p95    : ${fmt(pct(95))}`)
console.log(`  max    : ${fmt(latencias[latencias.length - 1])}`)
console.log(`  média  : ${fmt(media)}`)

console.log('\nHistograma (quantos tickets levaram até X pra ser atribuídos):')
const baldes = [5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 300, Infinity]
let anterior = 0
for (const limite of baldes) {
  const n = latencias.filter((s) => s > anterior && s <= limite).length
  const rotulo = limite === Infinity ? `> ${anterior}s` : `${anterior}-${limite}s`
  const pctTotal = ((n / latencias.length) * 100).toFixed(1)
  console.log(`  ${rotulo.padEnd(10)}: ${String(n).padStart(5)}  (${pctTotal}%)`)
  anterior = limite
}

console.log('\nQuantos tickets cruzam cada limiar candidato de "fila":')
for (const limiteS of [30, 60, 90, 120]) {
  const n = latencias.filter((s) => s > limiteS).length
  console.log(`  > ${limiteS}s: ${n} tickets (${((n / latencias.length) * 100).toFixed(1)}%)`)
}
