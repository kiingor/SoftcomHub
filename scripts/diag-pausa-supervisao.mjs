// SOMENTE LEITURA — caso #97218: "não dá para colocar em pausa quem está
// offline ou online". Checa os três pontos que podem esconder ou recusar a ação:
//
//   (A) o setor não tem NENHUM tipo de pausa ATIVO → o menu "Colocar em pausa"
//       nem chega a ser renderizado (setor/[id]:6885 e monitoramento:688)
//   (B) o ponteiro colaboradores.pausa_atual_id aponta para instância ABERTA →
//       a rota recusa com JA_EM_PAUSA (409), mesmo a tela mostrando Offline
//   (C) o atendente não tem vínculo em colaboradores_setores → setorIds vazio,
//       e avaliarInicioDePausa recusa com TIPO_DE_OUTRO_SETOR
//
// Rodar: node --use-system-ca scripts/diag-pausa-supervisao.mjs
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] })
)
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const { data: setores, error: eSet } = await sb
  .from('setores').select('id, nome').order('nome').limit(200)
if (eSet) throw eSet

const { data: pausas, error: ePau } = await sb
  .from('pausas').select('id, nome, setor_id, ativo').limit(1000)
if (ePau) throw ePau

const porSetor = new Map()
for (const p of pausas) {
  const l = porSetor.get(p.setor_id) || { ativos: 0, inativos: 0 }
  if (p.ativo) l.ativos++; else l.inativos++
  porSetor.set(p.setor_id, l)
}

console.log('=== (A) CATÁLOGO DE PAUSAS POR SETOR ===')
console.log('    ativos=0 => o menu "Colocar em pausa" NÃO aparece nessa tela\n')
let semAtivo = 0
for (const s of setores) {
  const l = porSetor.get(s.id) || { ativos: 0, inativos: 0 }
  if (l.ativos === 0) semAtivo++
  console.log(`  ${String(l.ativos).padStart(3)} ativos /${String(l.inativos).padStart(3)} inativos   ${s.nome}${l.ativos === 0 ? '   <-- SEM TIPO ATIVO' : ''}`)
}
console.log(`\n  setores sem nenhum tipo ativo: ${semAtivo}/${setores.length}`)

const { data: colabs, error: eCol } = await sb
  .from('colaboradores')
  .select('id, nome, is_online, pausa_atual_id')
  .eq('ativo', true)
  .not('pausa_atual_id', 'is', null)
  .limit(500)
if (eCol) throw eCol

console.log(`\n=== (B) PONTEIROS pausa_atual_id não-nulos: ${colabs.length} ===`)
if (colabs.length) {
  const { data: inst, error: eIns } = await sb
    .from('pausas_colaboradores')
    .select('id, colaborador_id, fim, setor_id, inicio')
    .in('id', colabs.map((c) => c.pausa_atual_id))
  if (eIns) throw eIns
  const byId = new Map(inst.map((i) => [i.id, i]))
  let abertas = 0, fechadas = 0, ausentes = 0
  for (const c of colabs) {
    const i = byId.get(c.pausa_atual_id)
    if (!i) { ausentes++; console.log(`  PONTEIRO QUEBRADO  ${c.nome}  (instância não existe)`) }
    else if (i.fim !== null) { fechadas++; console.log(`  PONTEIRO VELHO     ${c.nome}  (instância já encerrada)`) }
    else { abertas++; console.log(`  EM PAUSA (aberta)  ${c.nome}  is_online=${c.is_online}  desde ${i.inicio}`) }
  }
  console.log(`\n  abertas=${abertas}  fechadas=${fechadas}  inexistentes=${ausentes}`)
  console.log('  "EM PAUSA (aberta)" com is_online=false é o caso que a rota recusa com JA_EM_PAUSA.')
}

const { data: orfas, error: eOrf } = await sb
  .from('pausas_colaboradores').select('id, colaborador_id, inicio').is('fim', null).limit(1000)
if (eOrf) throw eOrf
const apontadas = new Set(colabs.map((c) => c.pausa_atual_id))
const semPonteiro = orfas.filter((o) => !apontadas.has(o.id))
console.log(`\n=== INSTÂNCIAS fim IS NULL: ${orfas.length}  (${semPonteiro.length} órfãs, sem ponteiro) ===`)

const { data: vinculos, error: eVin } = await sb
  .from('colaboradores_setores').select('colaborador_id, setor_id').limit(5000)
if (eVin) throw eVin
const comVinculo = new Set(vinculos.map((v) => v.colaborador_id))
const { data: ativos, error: eAtv } = await sb
  .from('colaboradores').select('id, nome').eq('ativo', true).limit(1000)
if (eAtv) throw eAtv
const sem = ativos.filter((c) => !comVinculo.has(c.id))
console.log(`\n=== (C) COLABORADORES ATIVOS SEM VÍNCULO em colaboradores_setores: ${sem.length}/${ativos.length} ===`)
for (const c of sem.slice(0, 15)) console.log(`  ${c.nome}`)
