// SOMENTE LEITURA — mede o desequilíbrio na distribuição de tickets por atendente.
//
// Serve para comparar antes/depois da mudança na regra de distribuição
// (lib/distribuicao-fila.ts): rode hoje para ter a linha de base e repita
// depois de alguns dias com a regra nova valendo.
//
// Uso:
//   node --use-system-ca scripts/diag-distribuicao-atendentes.mjs [dias] ["nome do setor"]
//
// Exemplos:
//   node --use-system-ca scripts/diag-distribuicao-atendentes.mjs            # 7 dias, todos os setores
//   node --use-system-ca scripts/diag-distribuicao-atendentes.mjs 1          # só hoje
//   node --use-system-ca scripts/diag-distribuicao-atendentes.mjs 7 "ServiceDesk Matriz"
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] })
)
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const DIAS = Number(process.argv[2] || 7)
const FILTRO_SETOR = process.argv[3] || null

const desde = new Date()
if (DIAS <= 1) desde.setHours(0, 0, 0, 0)
else desde.setTime(Date.now() - DIAS * 86400000)

// Pagina sempre: o PostgREST corta em 1.000 linhas sem avisar.
async function buscarTudo(construirQuery) {
  const PAGINA = 1000
  const todos = []
  for (let inicio = 0; ; inicio += PAGINA) {
    const { data, error } = await construirQuery().range(inicio, inicio + PAGINA - 1)
    if (error) throw new Error(error.message)
    if (!data?.length) break
    todos.push(...data)
    if (data.length < PAGINA) break
  }
  return todos
}

const tickets = await buscarTudo(() => sb
  .from('tickets')
  .select('colaborador_id, setor_id, subsetor_id, criado_em')
  .gte('criado_em', desde.toISOString())
  .not('colaborador_id', 'is', null))

const setores = await buscarTudo(() => sb.from('setores').select('id, nome'))
const nomeSetor = Object.fromEntries(setores.map((s) => [s.id, s.nome]))

const colaboradores = await buscarTudo(() => sb.from('colaboradores').select('id, nome, ativo'))
const infoColab = Object.fromEntries(colaboradores.map((c) => [c.id, c]))

const janela = DIAS <= 1 ? 'hoje' : `últimos ${DIAS} dias`
console.log(`Distribuição por atendente — ${janela} (desde ${desde.toISOString().slice(0, 16).replace('T', ' ')})`)
console.log(`${tickets.length} tickets atribuídos\n`)

// Agrupa por setor
const porSetor = new Map()
for (const t of tickets) {
  if (!t.setor_id) continue
  if (FILTRO_SETOR && nomeSetor[t.setor_id] !== FILTRO_SETOR) continue
  const lista = porSetor.get(t.setor_id) || []
  lista.push(t)
  porSetor.set(t.setor_id, lista)
}

const resumo = []

for (const [setorId, doSetor] of [...porSetor.entries()].sort((a, b) => b[1].length - a[1].length)) {
  const contagem = new Map()
  for (const t of doSetor) contagem.set(t.colaborador_id, (contagem.get(t.colaborador_id) || 0) + 1)

  const linhas = [...contagem.entries()]
    .map(([id, n]) => ({ id, nome: infoColab[id]?.nome || id.slice(0, 8), ativo: infoColab[id]?.ativo !== false, n }))
    .sort((a, b) => b.n - a.n)

  // Só quem recebeu pelo menos 1: quem estava de férias ou fora de escala
  // entraria como zero e inflaria o desvio sem representar injustiça.
  const total = doSetor.length
  const media = total / linhas.length
  const variancia = linhas.reduce((acc, l) => acc + (l.n - media) ** 2, 0) / linhas.length
  const desvioPadrao = Math.sqrt(variancia)
  // Coeficiente de variação: desvio relativo à média. É o número a acompanhar —
  // não depende do volume, então dá para comparar dias e setores diferentes.
  const cv = media > 0 ? desvioPadrao / media : 0
  const maior = linhas[0]?.n || 0
  const menor = linhas[linhas.length - 1]?.n || 0

  resumo.push({ setor: nomeSetor[setorId] || setorId.slice(0, 8), total, atendentes: linhas.length, media, cv, maior, menor })

  console.log(`${'='.repeat(64)}`)
  console.log(`${nomeSetor[setorId] || setorId}`)
  console.log(`${total} tickets · ${linhas.length} atendentes · média ${media.toFixed(1)}`)
  console.log(`${'='.repeat(64)}`)

  for (const l of linhas) {
    const desvio = media > 0 ? ((l.n - media) / media) * 100 : 0
    const barra = '█'.repeat(Math.max(1, Math.round((l.n / maior) * 26)))
    const sinal = desvio > 0 ? '+' : ''
    const marca = Math.abs(desvio) > 50 ? '  <<' : ''
    console.log(
      `${String(l.n).padStart(5)}  ${barra.padEnd(27)} ${l.nome.slice(0, 26).padEnd(27)} ${sinal}${desvio.toFixed(0)}%${l.ativo ? '' : ' [inativo]'}${marca}`
    )
  }

  console.log(`\n  desvio padrão ${desvioPadrao.toFixed(1)} · coef. de variação ${(cv * 100).toFixed(0)}% · amplitude ${maior}–${menor}`)
  console.log(`  fora de ±50% da média: ${linhas.filter((l) => Math.abs((l.n - media) / media) > 0.5).length} de ${linhas.length}\n`)
}

if (resumo.length > 1) {
  console.log(`${'='.repeat(64)}`)
  console.log('RESUMO — quanto menor o coeficiente de variação, mais equilibrado')
  console.log(`${'='.repeat(64)}`)
  console.log(`${'setor'.padEnd(30)} ${'tickets'.padStart(8)} ${'atend.'.padStart(7)} ${'CV'.padStart(6)}`)
  for (const r of resumo.sort((a, b) => b.cv - a.cv)) {
    console.log(`${r.setor.slice(0, 29).padEnd(30)} ${String(r.total).padStart(8)} ${String(r.atendentes).padStart(7)} ${(r.cv * 100).toFixed(0).padStart(5)}%`)
  }
  console.log('\nCV até ~25% costuma ser jornada e escala; acima de ~50% indica a regra de distribuição.')
}
