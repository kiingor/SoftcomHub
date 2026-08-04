// SOMENTE LEITURA — separa duas coisas que hoje contam como "deu fila":
//   (A) FILA DE VERDADE  — o ticket ficou sem dono (criado → atribuído)
//   (B) DEMORA DE RESPOSTA — teve dono na hora, mas o atendente levou pra
//                            mandar a primeira mensagem (atribuído → 1ª resposta)
//
// `resumirFila`/`contarEpisodiosDeFila` medem criado → PRIMEIRA RESPOSTA, então
// somam (A)+(B). É defensável do ponto de vista do cliente — ter dono e não ter
// recebido mensagem é esperar —, mas o rótulo "deu fila" promete (A).
// `atribuido_em` só é gravado desde 28/07/2026, então a janela útil é curta.
//
// Rodar: node --use-system-ca scripts/diag-fila-vs-resposta.mjs <setor_id> [dias]
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
if (!SETOR_ID) { console.error('uso: node --use-system-ca scripts/diag-fila-vs-resposta.mjs <setor_id> [dias]'); process.exit(1) }
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

const { data: subsetores } = await sb.from('subsetores').select('id, nome').eq('setor_id', SETOR_ID)
const agora = Date.now()
const inicioDeHoje = new Date(new Date().setHours(0, 0, 0, 0))
const inicioJanela = new Date(inicioDeHoje.getTime() - (DIAS - 1) * 86_400_000)

const tickets = await paginar(() => sb
  .from('tickets')
  .select('id, numero, subsetor_id, criado_em, atribuido_em, primeira_resposta_em, encerrado_em, is_disparo, cliente_respondeu_em')
  .eq('setor_id', SETOR_ID)
  .gte('criado_em', inicioJanela.toISOString())
  .order('criado_em', { ascending: true }))

const entrada = (t) => Date.parse(t.is_disparo ? t.cliente_respondeu_em : t.criado_em)
const fimDaEspera = (t) => {
  const r = t.primeira_resposta_em ? Date.parse(t.primeira_resposta_em) : NaN
  if (Number.isFinite(r)) return r
  const e = t.encerrado_em ? Date.parse(t.encerrado_em) : NaN
  return Number.isFinite(e) ? e : agora
}

for (const limiteS of [60, 90]) {
  console.log(`\n${'='.repeat(78)}`)
  console.log(`LIMIAR DE FILA = ${limiteS}s`)
  console.log('='.repeat(78))
  console.log('subsetor | dia        | tickets || conta hoje | fila real | só demora | % falso')
  console.log('---------|------------|---------||------------|-----------|-----------|--------')

  for (const sub of subsetores || []) {
    for (let d = DIAS - 1; d >= 0; d--) {
      const ini = new Date(inicioDeHoje.getTime() - d * 86_400_000)
      const fim = new Date(ini.getTime() + 86_400_000)
      const doDia = tickets.filter((t) => (
        t.subsetor_id === sub.id
        && t.criado_em >= ini.toISOString() && t.criado_em < fim.toISOString()
      ))
      if (!doDia.length) continue

      let contaHoje = 0   // o que a tela chama de "esperou": criado → 1ª resposta
      let filaReal = 0    // ficou sem dono além do limiar: criado → atribuído
      let soDemora = 0    // teve dono rápido, mas a resposta demorou
      let semCarimbo = 0

      for (const t of doDia) {
        const ent = entrada(t)
        if (!Number.isFinite(ent)) continue
        const esperaTotal = (fimDaEspera(t) - ent) / 1000
        if (esperaTotal <= limiteS) continue
        contaHoje += 1

        if (!t.atribuido_em) { semCarimbo += 1; continue }
        const semDono = (Date.parse(t.atribuido_em) - ent) / 1000
        if (semDono > limiteS) filaReal += 1
        else soDemora += 1
      }

      const pctFalso = contaHoje ? ((soDemora / contaHoje) * 100).toFixed(0) + '%' : '—'
      console.log(
        `${sub.nome.padEnd(8)} | ${ini.toISOString().slice(0, 10)} | ${String(doDia.length).padStart(7)} `
        + `|| ${String(contaHoje).padStart(10)} | ${String(filaReal).padStart(9)} | ${String(soDemora).padStart(9)} | ${pctFalso.padStart(6)}`
        + (semCarimbo ? `  (${semCarimbo} sem atribuido_em)` : ''),
      )
    }
    console.log('---------|------------|---------||------------|-----------|-----------|--------')
  }
}

// Onde o tempo é gasto, nos tickets que a tela conta como fila.
console.log('\n=== Nos tickets contados como "deu fila", onde o tempo foi gasto? ===')
for (const sub of subsetores || []) {
  const doSub = tickets.filter((t) => {
    if (t.subsetor_id !== sub.id || !t.atribuido_em) return false
    const ent = entrada(t)
    return Number.isFinite(ent) && (fimDaEspera(t) - ent) / 1000 > 60
  })
  if (!doSub.length) continue
  const semDono = doSub.map((t) => (Date.parse(t.atribuido_em) - entrada(t)) / 1000).sort((a, b) => a - b)
  const digitando = doSub.map((t) => (fimDaEspera(t) - Date.parse(t.atribuido_em)) / 1000).sort((a, b) => a - b)
  const med = (a) => a[Math.floor(a.length / 2)]
  console.log(
    `  ${sub.nome.padEnd(8)} (${doSub.length} tickets): `
    + `sem dono mediana ${med(semDono).toFixed(0)}s | esperando o atendente escrever mediana ${med(digitando).toFixed(0)}s`,
  )
}
