import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,'')]}))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}})
const CID='df0acfe5-a622-444d-bc5b-5940e84b1017'
const agora = new Date('2026-07-16T18:00:00Z') // ~15h BRT
console.log('Ref agora (aprox):', agora.toISOString())

// 1) mensagens Nexus desse cliente: quando, e têm ticket_id?
const { data: nx } = await sb.from('mensagens')
  .select('remetente, enviado_em, ticket_id, setor_id')
  .eq('cliente_id', CID).in('remetente',['cliente-nexus','bot-nexus'])
  .order('enviado_em',{ascending:true})
console.log(`\nMensagens Nexus (${nx?.length||0}):`)
;(nx||[]).forEach(m=>console.log(`  [${m.enviado_em}] ${m.remetente} | ticket_id=${m.ticket_id||'NULL'} | setor_id=${m.setor_id||'—'}`))

// 2) última cliente-nexus e última bot-nexus + minutos atrás
const lastCli = [...(nx||[])].reverse().find(m=>m.remetente==='cliente-nexus')
const lastBot = [...(nx||[])].reverse().find(m=>m.remetente==='bot-nexus')
const minAtras = t => t? Math.round((agora - new Date(t))/60000) : null
console.log(`\nÚltima cliente-nexus: ${lastCli?.enviado_em||'—'} (${minAtras(lastCli?.enviado_em)} min atrás)`)
console.log(`Última bot-nexus:     ${lastBot?.enviado_em||'—'} (${minAtras(lastBot?.enviado_em)} min atrás)`)

// 3) tickets desse cliente e status
const { data: tks } = await sb.from('tickets').select('id, status, setor_id, created_at, updated_at').eq('cliente_id', CID).order('created_at',{ascending:false}).limit(10)
console.log(`\nTickets (${tks?.length||0}):`)
;(tks||[]).forEach(t=>console.log(`  ${t.id} | status=${t.status} | setor=${t.setor_id} | criado=${t.created_at}`))
const ativos=(tks||[]).filter(t=>['aberto','em_atendimento'].includes(t.status))
console.log(`  -> ticket ATIVO (aberto/em_atendimento): ${ativos.length}`)

// 4) ocorrencias nexus abertas
const { data: oco } = await sb.from('nexus_ocorrencias').select('id, status, criado_em').eq('cliente_id', CID).order('criado_em',{ascending:false}).limit(5)
console.log(`\nnexus_ocorrencias (${oco?.length||0}):`, JSON.stringify(oco))
