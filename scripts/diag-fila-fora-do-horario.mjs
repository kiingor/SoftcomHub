// SOMENTE LEITURA — mede quanto da "espera sem atendente" acontece com o setor
// FECHADO. O cliente que escreve 00:28 e é atendido 07:05 (5 min depois da
// abertura) aparece hoje como "6h37 de espera", porque a conta ignora
// `horarios_atendimento`.
//
// As colunas hora_inicio/hora_fim são horário de Brasília e os timestamps são
// UTC — mesma premissa de `lib/transbordo-bloqueio.ts`. Brasil não tem mais
// horário de verão desde 2019, então UTC-3 é constante.
//
// Rodar: node --use-system-ca scripts/diag-fila-fora-do-horario.mjs <setor_id> [dias]
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] })
)
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const SETOR_ID = process.argv[2]
if (!SETOR_ID) { console.error('uso: node --use-system-ca scripts/diag-fila-fora-do-horario.mjs <setor_id> [dias]'); process.exit(1) }
const DIAS = Number(process.argv[3] || 7)

const BRT_OFFSET_MS = 3 * 3_600_000
const LIMITE_FILA_MS = 60_000

const { data: horarios } = await sb
  .from('horarios_atendimento').select('dia_semana, ativo, hora_inicio, hora_fim').eq('setor_id', SETOR_ID)
const porDia = new Map((horarios || []).filter((h) => h.ativo !== false).map((h) => [h.dia_semana, h]))

const hhmmMs = (s) => {
  const [h, m] = String(s || '').split(':').map(Number)
  return ((h || 0) * 60 + (m || 0)) * 60_000
}

/**
 * Janelas de funcionamento que tocam [de, ate], em ms UTC. Varre um dia a mais
 * de cada lado porque uma janela que fecha 02:00 pertence ao dia anterior.
 */
function janelasAbertas(de, ate) {
  const janelas = []
  const primeiro = Math.floor((de - BRT_OFFSET_MS) / 86_400_000) - 1
  const ultimo = Math.floor((ate - BRT_OFFSET_MS) / 86_400_000) + 1
  for (let d = primeiro; d <= ultimo; d++) {
    const meiaNoiteBrtEmUtc = d * 86_400_000 + BRT_OFFSET_MS
    const diaSemana = new Date(meiaNoiteBrtEmUtc + 3_600_000).getUTCDay()
    const h = porDia.get(diaSemana)
    if (!h) continue
    const ini = hhmmMs(h.hora_inicio)
    const fimBruto = hhmmMs(h.hora_fim)
    // Fecha antes ou na hora de abrir = atravessa a meia-noite (00:00 e 02:00).
    const fim = fimBruto <= ini ? fimBruto + 86_400_000 : fimBruto
    janelas.push([meiaNoiteBrtEmUtc + ini, meiaNoiteBrtEmUtc + fim])
  }
  return janelas
}

/** Interseção de [de, ate] com o horário de funcionamento, em ms. */
function esperaEmHorarioUtil(de, ate) {
  let total = 0
  for (const [ini, fim] of janelasAbertas(de, ate)) {
    total += Math.max(0, Math.min(ate, fim) - Math.max(de, ini))
  }
  return total
}

const PAGE = 1000
const agora = Date.now()
const inicioDeHoje = new Date(new Date().setHours(0, 0, 0, 0)).getTime()
const inicioJanela = new Date(inicioDeHoje - (DIAS - 1) * 86_400_000).toISOString()

const tickets = []
for (let p = 0; ; p++) {
  const { data, error } = await sb
    .from('tickets')
    .select('numero, subsetor_id, criado_em, atribuido_em, primeira_resposta_em, encerrado_em, is_disparo, cliente_respondeu_em, clientes(nome)')
    .eq('setor_id', SETOR_ID).gte('criado_em', inicioJanela)
    .order('criado_em', { ascending: true })
    .range(p * PAGE, p * PAGE + PAGE - 1)
  if (error) { console.error('ERRO:', error); process.exit(1) }
  tickets.push(...data)
  if (data.length < PAGE) break
}

const entrada = (t) => Date.parse(t.is_disparo ? t.cliente_respondeu_em : t.criado_em)
const saida = (t) => {
  for (const campo of ['atribuido_em', 'primeira_resposta_em', 'encerrado_em']) {
    const v = t[campo] ? Date.parse(t[campo]) : NaN
    if (Number.isFinite(v)) return v
  }
  return agora
}

const fmt = (ms) => {
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60)
  return h > 0 ? `${h}h ${m}min` : `${m}min ${s % 60}s`
}

console.log('dia        | esperaram >1min      || maior espera')
console.log('           | hoje | só hora aberta || hoje                    | só hora aberta')
console.log('-----------|------|----------------||-------------------------|----------------')

for (let d = DIAS - 1; d >= 0; d--) {
  const ini = inicioDeHoje - d * 86_400_000
  const fimDia = ini + 86_400_000
  const doDia = tickets.filter((t) => {
    const c = Date.parse(t.criado_em)
    return c >= ini && c < fimDia
  })
  if (!doDia.length) continue

  let contaHoje = 0, contaUtil = 0
  let maiorHoje = null, maiorUtil = null
  for (const t of doDia) {
    const de = entrada(t)
    if (!Number.isFinite(de)) continue
    const ate = saida(t)
    const bruta = ate - de
    if (!Number.isFinite(bruta) || bruta < 0) continue
    const util = esperaEmHorarioUtil(de, ate)

    if (bruta > LIMITE_FILA_MS) contaHoje += 1
    if (util > LIMITE_FILA_MS) contaUtil += 1
    if (!maiorHoje || bruta > maiorHoje.ms) maiorHoje = { ms: bruta, t }
    if (!maiorUtil || util > maiorUtil.ms) maiorUtil = { ms: util, t }
  }

  const rot = (x) => x ? `${fmt(x.ms)} (#${x.t.numero})` : '—'
  console.log(
    `${new Date(ini).toISOString().slice(0, 10)} | ${String(contaHoje).padStart(4)} | ${String(contaUtil).padStart(14)} `
    + `|| ${rot(maiorHoje).padEnd(23)} | ${rot(maiorUtil)}`,
  )
}

// Quanto tempo total é contado com o setor fechado.
let bruto = 0, util = 0
for (const t of tickets) {
  const de = entrada(t)
  if (!Number.isFinite(de)) continue
  const ate = saida(t)
  const b = ate - de
  if (!Number.isFinite(b) || b < 0) continue
  bruto += b
  util += esperaEmHorarioUtil(de, ate)
}
console.log(`\nEspera somada em ${DIAS} dias: ${fmt(bruto)} contados hoje | ${fmt(util)} dentro do horário`)
console.log(`  ou seja, ${(((bruto - util) / bruto) * 100).toFixed(1)}% do tempo medido é com o setor FECHADO.`)
console.log('\nHorário cadastrado (Brasília):')
for (const [dia, h] of [...porDia.entries()].sort((a, b) => a[0] - b[0])) {
  console.log(`  ${['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][dia]}: ${String(h.hora_inicio).slice(0, 5)} → ${String(h.hora_fim).slice(0, 5)}`)
}
