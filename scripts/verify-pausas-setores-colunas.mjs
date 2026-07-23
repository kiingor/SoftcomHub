// Verificação read-only de colunas necessárias para as novas features (pausas.tempo_maximo_minutos, setores.travar_ordenacao_chat).
// Uso: node --use-system-ca scripts/verify-pausas-setores-colunas.mjs
import { readFileSync } from 'node:fs'

const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
const get = (k) => {
  const m = env.match(new RegExp(`^${k}="?([^"\\n]+)"?`, 'm'))
  return m ? m[1] : null
}
const URL_ = get('NEXT_PUBLIC_SUPABASE_URL')
const KEY = get('SUPABASE_SERVICE_ROLE_KEY')
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` }

const r1 = await fetch(`${URL_}/rest/v1/pausas?select=id,tempo_maximo_minutos&limit=1`, { headers: H })
const b1 = await r1.text()
console.log('pausas.tempo_maximo_minutos:', r1.status === 200 ? 'OK (existe)' : `FALHOU (status ${r1.status}): ${b1.slice(0, 200)}`)

const r2 = await fetch(`${URL_}/rest/v1/setores?select=id,travar_ordenacao_chat&limit=1`, { headers: H })
const b2 = await r2.text()
console.log('setores.travar_ordenacao_chat:', r2.status === 200 ? 'OK (existe)' : `FALHOU (status ${r2.status}): ${b2.slice(0, 200)}`)
