// Verificação read-only do setup da foto de perfil (bucket + coluna).
// Uso: node --use-system-ca scripts/verify-foto-setup.mjs
import { readFileSync } from 'node:fs'

const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
const get = (k) => {
  const m = env.match(new RegExp(`^${k}="?([^"\\n]+)"?`, 'm'))
  return m ? m[1] : null
}
const URL_ = get('NEXT_PUBLIC_SUPABASE_URL')
const KEY = get('SUPABASE_SERVICE_ROLE_KEY')
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` }

// 1) bucket avatars
const buckets = await fetch(`${URL_}/storage/v1/bucket`, { headers: H }).then((r) => r.json())
const av = Array.isArray(buckets) ? buckets.find((b) => b.id === 'avatars') : null
console.log('bucket "avatars":', av ? `OK (public=${av.public})` : 'NAO ENCONTRADO')

// 2) coluna foto_url
const r = await fetch(`${URL_}/rest/v1/colaboradores?select=id,foto_url&limit=1`, { headers: H })
const body = await r.text()
console.log(
  'coluna foto_url:',
  r.status === 200 ? 'OK (existe)' : `FALHOU (status ${r.status}): ${body.slice(0, 140)}`,
)
