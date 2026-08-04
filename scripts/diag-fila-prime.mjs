// SOMENTE LEITURA — investiga por que um subsetor pequeno acumula tantos
// "episódios de fila". Duas hipóteses:
//   (H1) os tickets marcados no subsetor não são de clientes daquele perfil
//        (cruza com a coluna `clientes.prime`)
//   (H2) são poucos e espalhados no tempo: como a fila esvazia entre um e
//        outro, cada cliente vira o seu próprio episódio e a métrica degenera
//        em contagem de cliente — que é justamente o que ela deveria evitar
//
// A razão episódios ÷ clientes-que-esperaram é o teste de H2: perto de 1,00 a
// métrica não está medindo "fila", está contando gente.
//
// Rodar: node --use-system-ca scripts/diag-fila-prime.mjs <setor_id> [dias]
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { contarEpisodiosDeFila, resumirFila, LIMITE_FILA_PADRAO_MIN } from '../lib/relatorio-fila.ts'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] })
)
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const SETOR_ID = process.argv[2]
if (!SETOR_ID) { console.error('uso: node --use-system-ca scripts/diag-fila-prime.mjs <setor_id> [dias]'); process.exit(1) }
const DIAS = Number(process.argv[3] || 7)

const PAGE = 1000
async function paginar(construir) {
  const linhas = []
  for (let p = 0; ; p++) {
    const { data, error } = await construir().range(p * PAGE, p * PAGE + PAGE - 1)
    if (error) { console.error('ERRO:', error); process.exit(1) }
    linhas.push(...data)
    if (data.length < PAGE) break
  }
  return linhas
}

const { data: subsetores } = await sb.from('subsetores').select('id, nome, ativo').eq('setor_id', SETOR_ID)
const nomeSub = new Map((subsetores || []).map((s) => [s.id, s.nome]))

const agora = new Date()
const inicioDeHoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate())
const inicioJanela = new Date(inicioDeHoje.getTime() - (DIAS - 1) * 86_400_000)

const tickets = await paginar(() => sb
  .from('tickets')
  // `atribuido_em` fecha a fila; sem ele a lib cai no fallback da primeira
  // resposta e o script mediria a regra antiga sem avisar.
  .select('id, numero, cliente_id, subsetor_id, status, criado_em, atribuido_em, primeira_resposta_em, encerrado_em, is_disparo, cliente_respondeu_em, colaborador_id')
  .eq('setor_id', SETOR_ID)
  .gte('criado_em', inicioJanela.toISOString())
  .order('criado_em', { ascending: true }))

// ---------------------------------------------------------------- H1
const idsClientes = [...new Set(tickets.map((t) => t.cliente_id).filter(Boolean))]
const perfil = new Map()
for (let i = 0; i < idsClientes.length; i += 300) {
  const { data } = await sb.from('clientes').select('id, nome, prime').in('id', idsClientes.slice(i, i + 300))
  for (const c of data || []) perfil.set(c.id, c)
}
// `prime` é texto "true"/"false" no banco, não boolean.
const ehPrime = (id) => String(perfil.get(id)?.prime ?? '').trim().toLowerCase() === 'true'

console.log('=== H1: o subsetor bate com o perfil do cliente? ===')
for (const sub of [...(subsetores || []), { id: null, nome: '(sem subsetor)' }]) {
  const doSub = tickets.filter((t) => t.subsetor_id === sub.id)
  if (doSub.length === 0) continue
  const comCliente = doSub.filter((t) => t.cliente_id && perfil.has(t.cliente_id))
  const prime = comCliente.filter((t) => ehPrime(t.cliente_id)).length
  const pct = comCliente.length ? ((prime / comCliente.length) * 100).toFixed(1) : '—'
  console.log(`  ${String(sub.nome).padEnd(15)}: ${String(doSub.length).padStart(5)} tickets | clientes com prime=true: ${String(prime).padStart(5)} (${pct}%)`)
}
const totalPrimeClientes = [...perfil.values()].filter((c) => String(c.prime ?? '').trim().toLowerCase() === 'true').length
console.log(`  clientes distintos na janela: ${perfil.size} | destes, prime=true: ${totalPrimeClientes}`)

// ---------------------------------------------------------------- H2
console.log(`\n=== H2: episódios estão virando contagem de cliente? (limiar ${LIMITE_FILA_PADRAO_MIN} min) ===`)
console.log('     razão = episódios ÷ clientes que esperaram. ~1,00 = cada cliente é seu próprio episódio.\n')
console.log('subsetor        | dia        | tickets | esperaram | episódios | razão | pico | sem espera')
console.log('----------------|------------|---------|-----------|-----------|-------|------|-----------')

for (const sub of (subsetores || [])) {
  for (let d = DIAS - 1; d >= 0; d--) {
    const inicio = new Date(inicioDeHoje.getTime() - d * 86_400_000)
    const fim = new Date(inicio.getTime() + 86_400_000)
    const agoraMs = Math.min(agora.getTime(), fim.getTime())
    const doDia = tickets.filter((t) => (
      t.subsetor_id === sub.id
      && t.criado_em >= inicio.toISOString() && t.criado_em < fim.toISOString()
    ))
    if (doDia.length === 0) continue

    const opts = { agoraMs }
    const ep = contarEpisodiosDeFila(doDia, opts)
    const esperaram = resumirFila(doDia, opts).entraramNaFila
    const razao = esperaram > 0 ? (ep.vezes / esperaram).toFixed(2) : '—'

    console.log(
      `${String(sub.nome).padEnd(15)} | ${inicio.toISOString().slice(0, 10)} `
      + `| ${String(doDia.length).padStart(7)} | ${String(esperaram).padStart(9)} `
      + `| ${String(ep.vezes).padStart(9)} | ${String(razao).padStart(5)} `
      + `| ${String(ep.pico).padStart(4)} | ${String(ep.semEspera).padStart(10)}`,
    )
  }
  console.log('----------------|------------|---------|-----------|-----------|-------|------|-----------')
}

// ------------------------------------------------- por que esperam tanto
console.log('\n=== Quanto cada subsetor espera pela 1ª resposta ===')
for (const sub of (subsetores || [])) {
  const doSub = tickets.filter((t) => t.subsetor_id === sub.id)
  if (!doSub.length) continue
  const esperas = doSub.map((t) => {
    const entrada = Date.parse(t.is_disparo ? t.cliente_respondeu_em : t.criado_em)
    const resp = t.primeira_resposta_em ? Date.parse(t.primeira_resposta_em) : NaN
    const enc = t.encerrado_em ? Date.parse(t.encerrado_em) : NaN
    const saida = Number.isFinite(resp) ? resp : (Number.isFinite(enc) ? enc : agora.getTime())
    return (saida - entrada) / 1000
  }).filter((s) => Number.isFinite(s) && s >= 0).sort((a, b) => a - b)
  if (!esperas.length) continue
  const pct = (p) => esperas[Math.min(esperas.length - 1, Math.floor((p / 100) * esperas.length))]
  const acima = esperas.filter((s) => s > LIMITE_FILA_PADRAO_MIN * 60).length
  console.log(
    `  ${String(sub.nome).padEnd(10)}: mediana ${(pct(50)).toFixed(0).padStart(6)}s | p90 ${(pct(90) / 60).toFixed(1).padStart(6)}min `
    + `| acima do limiar: ${acima}/${esperas.length} (${((acima / esperas.length) * 100).toFixed(1)}%)`,
  )
}

// ------------------------------------------------- cobertura de atendente
console.log('\n=== Atendentes vinculados x online agora ===')
const { data: vinculos } = await sb
  .from('colaboradores_subsetores')
  .select('subsetor_id, colaboradores(nome, is_online, ativo, setores_ativos_sessao)')
  .eq('setor_id', SETOR_ID)
for (const sub of (subsetores || [])) {
  const doSub = (vinculos || []).filter((v) => v.subsetor_id === sub.id)
  const online = doSub.filter((v) => v.colaboradores?.is_online && v.colaboradores?.ativo)
  const servindo = online.filter((v) => (v.colaboradores?.setores_ativos_sessao || []).includes(SETOR_ID))
  console.log(`  ${String(sub.nome).padEnd(10)}: ${String(doSub.length).padStart(3)} vinculados | ${online.length} online | ${servindo.length} com este setor ativo na sessão`)
}
