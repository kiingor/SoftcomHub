import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,'')]}))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}})
const CID='df0acfe5-a622-444d-bc5b-5940e84b1017'
const agora = Date.now()
const minAtras = t => t? Math.round((agora - new Date(t).getTime())/60000) : null

const { data: nx, error } = await sb.from('mensagens')
  .select('remetente, enviado_em, ticket_id, phone_number_id, canal_envio')
  .eq('cliente_id', CID).in('remetente',['cliente-nexus','bot-nexus'])
  .order('enviado_em',{ascending:true})
if (error) console.log('ERRO msgs:', error.message)
console.log(`\nMensagens Nexus (${nx?.length||0}):`)
;(nx||[]).forEach(m=>console.log(`  [${m.enviado_em}] ${m.remetente} | ticket_id=${m.ticket_id||'NULL'} | ${minAtras(m.enviado_em)} min atrás | canal=${m.canal_envio||'—'} pnid=${m.phone_number_id||'—'}`))

const lastCli=[...(nx||[])].reverse().find(m=>m.remetente==='cliente-nexus')
const lastBot=[...(nx||[])].reverse().find(m=>m.remetente==='bot-nexus')
console.log(`\nÚltima cliente-nexus: ${lastCli?.enviado_em||'—'} (${minAtras(lastCli?.enviado_em)} min atrás)`)
console.log(`Última bot-nexus:     ${lastBot?.enviado_em||'—'} (${minAtras(lastBot?.enviado_em)} min atrás)`)

const { data: tks, error: et } = await sb.from('tickets').select('id, status, created_at').eq('cliente_id', CID).order('created_at',{ascending:false})
if (et) console.log('ERRO tickets:', et.message)
console.log(`\nTickets (${tks?.length||0}): ${(tks||[]).map(t=>t.status).join(', ')||'nenhum'}`)
const ativos=(tks||[]).filter(t=>['aberto','em_atendimento'].includes(t.status))
console.log(`  ticket ATIVO: ${ativos.length}`)
