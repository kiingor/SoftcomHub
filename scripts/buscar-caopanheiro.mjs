import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,'')]}))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}})

const cols='id, nome, telefone, email, "PDV", "CNPJ", "Registro", fluxo, software, created_at'
const mapa=new Map()
// por nome (fragmentos)
for (const frag of ['caopanheiro','caopanhe','casa de racao','CAOPANHEIRO']) {
  const { data } = await sb.from('clientes').select(cols).ilike('nome',`%${frag}%`)
  ;(data||[]).forEach(c=>mapa.set(c.id,c))
}
// por telefone (final estável 9645713)
for (const frag of ['9645713','99645713']) {
  const { data } = await sb.from('clientes').select(cols).ilike('telefone',`%${frag}%`)
  ;(data||[]).forEach(c=>mapa.set(c.id,c))
}
const achados=[...mapa.values()]
console.log(`Clientes encontrados: ${achados.length}\n`)
for (const c of achados) {
  console.log(JSON.stringify({nome:c.nome,telefone:c.telefone,id:c.id,fluxo:c.fluxo,software:c.software,PDV:c.PDV,CNPJ:c.CNPJ,Registro:c.Registro,created_at:c.created_at}))
  // checar tags de remetente das mensagens desse cliente
  const { data: msgs } = await sb.from('mensagens').select('remetente, enviado_em').eq('cliente_id', c.id).order('enviado_em',{ascending:false})
  const cont={}; (msgs||[]).forEach(m=>cont[m.remetente]=(cont[m.remetente]||0)+1)
  const nexus=(msgs||[]).filter(m=>m.remetente==='cliente-nexus'||m.remetente==='bot-nexus')
  console.log(`   msgs: ${msgs?.length||0} | remetentes: ${JSON.stringify(cont)} | Nexus: ${nexus.length}`)
  if (msgs?.length) console.log(`   última msg: ${msgs[0].enviado_em} (${msgs[0].remetente})`)
  console.log('')
}
