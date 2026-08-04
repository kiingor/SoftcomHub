// SOMENTE LEITURA — confere "vezes que deu fila" do card de tempo real:
//   ANTES  — uma linha do tempo só para o setor inteiro
//   DEPOIS — soma fila a fila, com o ticket sem subsetor caindo no padrão
//            (`somarEpisodiosPorFila`, o que a tela passou a usar)
//
// Também dimensiona o TRANSBORDO, que a princípio parecia distorcer o número:
// ticket que transbordou pra cá carrega `criado_em` do setor de origem, então
// arrasta a espera de OUTRO setor. Medido em 04/08/2026 no ServiceDesk: são 3%
// dos tickets e a espera herdada tem mediana de 42s — abaixo do limiar de fila
// de 1 min, ou seja, quase nunca chega a abrir episódio. Por isso a tela NÃO
// trata transbordo; este script mantém a medição para reconferir se mudar.
//
// Usa a lib de verdade (node 24 faz strip de tipos) pra não divergir da tela.
//
// Rodar: node --use-system-ca scripts/diag-episodios-fila.mjs <setor_id> [dias]
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { contarEpisodiosDeFila, somarEpisodiosPorFila } from '../lib/relatorio-fila.ts'
import { escolherSubsetorPadrao } from '../lib/subsetor-padrao.ts'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] })
)
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const SETOR_ID = process.argv[2]
if (!SETOR_ID) { console.error('uso: node --use-system-ca scripts/diag-episodios-fila.mjs <setor_id> [dias]'); process.exit(1) }
const DIAS = Number(process.argv[3] || 7)

const PAGE = 1000
async function paginar(construir) {
  const linhas = []
  for (let pagina = 0; ; pagina++) {
    const { data, error } = await construir().range(pagina * PAGE, pagina * PAGE + PAGE - 1)
    if (error) { console.error('ERRO:', error); process.exit(1) }
    linhas.push(...data)
    if (data.length < PAGE) break
  }
  return linhas
}

const { data: subsetores } = await sb.from('subsetores').select('id, nome, ativo').eq('setor_id', SETOR_ID)
const nomeSub = new Map((subsetores || []).map((s) => [s.id, s.nome]))
const { data: setorRow } = await sb.from('setores').select('nome').eq('id', SETOR_ID).single()

// Mesma regra da tela: ticket sem subsetor cai no padrão do setor.
const { data: vinculos } = await sb
  .from('colaboradores_subsetores').select('subsetor_id').eq('setor_id', SETOR_ID)
const subsetorPadrao = escolherSubsetorPadrao(
  subsetores || [],
  new Set((vinculos || []).map((v) => v.subsetor_id).filter(Boolean)),
)
const filaDoTicket = (t) => t.subsetor_id || subsetorPadrao || 'sem_subsetor'

console.log(`Setor: ${setorRow?.nome || SETOR_ID}`)
console.log(`Subsetores: ${(subsetores || []).map((s) => s.nome).join(', ') || '(nenhum)'}`)
console.log(`Subsetor padrão (destino de quem vem sem subsetor): ${subsetorPadrao ? nomeSub.get(subsetorPadrao) : '(nenhum — contam à parte)'}\n`)

const agora = new Date()
const inicioDeHoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate())
const inicioJanela = new Date(inicioDeHoje.getTime() - (DIAS - 1) * 86_400_000)

const todos = await paginar(() => sb
  .from('tickets')
  // `atribuido_em` é obrigatório aqui: é ele que fecha a fila. Sem selecionar,
  // a lib cai no fallback da primeira resposta e o script mede a regra ANTIGA
  // sem avisar — foi o que aconteceu na primeira versão deste script.
  // `colaborador_id` também: ter dono prova que o ticket saiu da fila mesmo
  // quando nenhum carimbo registrou quando.
  .select('id, numero, subsetor_id, status, criado_em, atribuido_em, primeira_resposta_em, encerrado_em, is_disparo, cliente_respondeu_em, transbordo_hops, colaborador_id')
  .eq('setor_id', SETOR_ID)
  .gte('criado_em', inicioJanela.toISOString())
  .order('criado_em', { ascending: true }))

// Chegada por transbordo = último log 'transferencia_automatica' do ticket.
const idsTransbordo = todos.filter((t) => (t.transbordo_hops || 0) > 0).map((t) => t.id)
const chegadaAqui = new Map()
for (let i = 0; i < idsTransbordo.length; i += 300) {
  const { data } = await sb
    .from('ticket_logs')
    .select('ticket_id, criado_em')
    .eq('tipo', 'transferencia_automatica')
    .in('ticket_id', idsTransbordo.slice(i, i + 300))
  for (const log of data || []) {
    const atual = chegadaAqui.get(log.ticket_id)
    if (!atual || log.criado_em > atual) chegadaAqui.set(log.ticket_id, log.criado_em)
  }
}

console.log('dia         | tickets | transb || ANTES | DEPOIS || detalhe por fila (o que a tela passa a mostrar)')
console.log('            |         |        || única | soma   ||')
console.log('------------|---------|--------||-------|--------||------------------------------------------------')

for (let d = DIAS - 1; d >= 0; d--) {
  const inicio = new Date(inicioDeHoje.getTime() - d * 86_400_000)
  const fim = new Date(inicio.getTime() + 86_400_000)
  // O dia corrente ainda não fechou: a espera de quem não foi respondido corre
  // até agora, igual à tela.
  const agoraMs = Math.min(agora.getTime(), fim.getTime())
  const opts = { agoraMs }
  const doDia = todos.filter((t) => t.criado_em >= inicio.toISOString() && t.criado_em < fim.toISOString())
  if (doDia.length === 0) continue

  const transbNoDia = doDia.filter((t) => (t.transbordo_hops || 0) > 0).length

  const antes = contarEpisodiosDeFila(doDia, opts)
  const depois = somarEpisodiosPorFila(doDia, filaDoTicket, opts)

  // Cada card individual, no mesmo recorte que a tela usa depois da mudança.
  const detalhe = [...new Set(doDia.map(filaDoTicket))]
    .map((chave) => ({
      nome: nomeSub.get(chave) || '(sem subsetor)',
      v: contarEpisodiosDeFila(doDia.filter((t) => filaDoTicket(t) === chave), opts).vezes,
    }))
    .sort((a, b) => b.v - a.v)

  const soma = detalhe.reduce((acc, s) => acc + s.v, 0)
  const confere = soma === depois.vezes ? '' : `  ⚠ soma=${soma}`

  const col = (n, w) => String(n).padStart(w)
  console.log(
    `${inicio.toISOString().slice(0, 10)}  | ${col(doDia.length, 7)} | ${col(transbNoDia, 6)} `
    + `|| ${col(antes.vezes, 5)} | ${col(depois.vezes, 6)} `
    + `|| ${detalhe.map((s) => `${s.nome}=${s.v}`).join(' + ')} = ${depois.vezes}`
    + ` (pico ${depois.pico})${confere}`,
  )
}

const transb = todos.filter((t) => (t.transbordo_hops || 0) > 0)
console.log(`\nChegaram por transbordo em ${DIAS} dias: ${transb.length} de ${todos.length} (${((transb.length / Math.max(1, todos.length)) * 100).toFixed(1)}%)`)
console.log(`  com log de chegada localizado: ${transb.filter((t) => chegadaAqui.has(t.id)).length}`)

const minutos = (ms) => (ms / 60_000).toFixed(1)
const herdado = transb
  .filter((t) => chegadaAqui.has(t.id))
  .map((t) => Date.parse(chegadaAqui.get(t.id)) - Date.parse(t.criado_em))
  .filter((ms) => Number.isFinite(ms) && ms >= 0)
  .sort((a, b) => a - b)
if (herdado.length) {
  const pct = (p) => herdado[Math.min(herdado.length - 1, Math.floor((p / 100) * herdado.length))]
  console.log(`  espera herdada do setor de ORIGEM (criado_em → chegada aqui):`)
  console.log(`    mediana: ${minutos(pct(50))}min | p90: ${minutos(pct(90))}min | max: ${minutos(herdado[herdado.length - 1])}min`)
  console.log(`  é esse tempo que hoje entra na conta deste setor sem ter sido fila dele.`)
}
