// SOMENTE LEITURA — caso #97240: confere o estado da coluna
// setores.oc_obrigatoria_para_encerrar depois da migration.
//
// O que precisa ser verdade para a migration ser inofensiva:
//   (A) a coluna existe e o embed do PostgREST devolve o campo
//   (B) TODO setor nasceu false — nenhum passa a exigir OC sozinho
//   (C) `select('*')` em setores continua funcionando (o codigo em producao
//       nao le a coluna, mas le a tabela)
//
// Rodar: node --use-system-ca scripts/diag-oc-coluna.mjs
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] })
)
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

console.log('=== (A) a coluna existe? ===')
const { data: comColuna, error: eCol } = await sb
  .from('setores')
  .select('id, nome, oc_obrigatoria_para_encerrar')
  .order('nome')
  .limit(200)

if (eCol) {
  console.log(`  NAO -> ${eCol.code}: ${eCol.message}`)
  console.log('  (42703/PGRST204 = coluna ausente; a rota trata como "nao exige")')
  process.exit(0)
}
console.log(`  SIM — ${comColuna.length} setores lidos com o campo`)

console.log('\n=== (B) algum setor ja nasceu exigindo OC? ===')
const ligados = comColuna.filter((s) => s.oc_obrigatoria_para_encerrar === true)
const naoBooleano = comColuna.filter((s) => typeof s.oc_obrigatoria_para_encerrar !== 'boolean')
if (ligados.length === 0) {
  console.log('  Nenhum. Todos false — nenhum setor trava encerramento sozinho.')
} else {
  console.log(`  ATENCAO: ${ligados.length} setor(es) com a exigencia LIGADA:`)
  for (const s of ligados) console.log(`    ${s.nome}`)
}
if (naoBooleano.length) {
  console.log(`  ATENCAO: ${naoBooleano.length} com valor nao-booleano (esperado boolean NOT NULL)`)
}

console.log('\n=== (C) o embed que /api/oc usa devolve o opt-in? ===')
const { data: ticket, error: eTic } = await sb
  .from('tickets')
  .select('numero, setor_id, is_disparo, disparo_em, setores:setor_id(oc_obrigatoria_para_encerrar)')
  .not('numero', 'is', null)
  .order('numero', { ascending: false })
  .limit(1)
  .maybeSingle()

if (eTic) {
  console.log(`  embed FALHOU -> ${eTic.code}: ${eTic.message}`)
  console.log('  (a rota cai no fallback sem setor e trata como "nao exige")')
} else if (!ticket) {
  console.log('  nenhum ticket com numero para testar')
} else {
  const bruto = ticket.setores
  const registro = Array.isArray(bruto) ? bruto[0] : bruto
  console.log(`  ticket #${ticket.numero} -> embed = ${JSON.stringify(bruto)}`)
  console.log(`  lerOptInDoSetor devolveria: ${typeof registro?.oc_obrigatoria_para_encerrar === 'boolean'
    ? registro.oc_obrigatoria_para_encerrar
    : 'null (nao exige)'}`)
}

console.log('\n=== (D) select(*) em setores continua ok (o codigo em prod le a tabela) ===')
const { data: estrela, error: eEst } = await sb.from('setores').select('*').limit(1).maybeSingle()
if (eEst) console.log(`  FALHOU -> ${eEst.code}: ${eEst.message}`)
else console.log(`  ok — ${Object.keys(estrela || {}).length} colunas, inclui oc_obrigatoria_para_encerrar=${'oc_obrigatoria_para_encerrar' in (estrela || {})}`)
