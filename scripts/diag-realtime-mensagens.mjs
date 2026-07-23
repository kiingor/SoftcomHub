// Diagnóstico: verifica se o Supabase Realtime está entregando eventos INSERT
// pra tabela `mensagens` (mesmo canal/config usado pelo WorkDesk no frontend).
// Uso: node --use-system-ca scripts/diag-realtime-mensagens.mjs
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
const get = (k) => { const m = env.match(new RegExp(`^${k}="?([^"\\n]+)"?`, 'm')); return m ? m[1] : null }
const URL_ = get('NEXT_PUBLIC_SUPABASE_URL')
const ANON_KEY = get('NEXT_PUBLIC_SUPABASE_ANON_KEY')

console.log('Conectando ao Realtime com a anon key (mesma usada pelo frontend)...')
const supabase = createClient(URL_, ANON_KEY)

let received = 0
const channel = supabase
  .channel('diag-all-messages')
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensagens' }, (payload) => {
    received++
    console.log(`[EVENTO RECEBIDO #${received}]`, payload.new.id, payload.new.remetente, (payload.new.conteudo || '').slice(0, 40))
  })
  .subscribe((status, err) => {
    console.log('[STATUS DA INSCRIÇÃO]', status, err ? err.message : '')
  })

await new Promise((resolve) => setTimeout(resolve, 25000))
console.log(`\nTotal de eventos recebidos em 25s: ${received}`)
await supabase.removeChannel(channel)
process.exit(0)
