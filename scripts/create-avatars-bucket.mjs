// Cria (idempotente) o bucket público "avatars" no Supabase Storage.
// Uso: node --use-system-ca scripts/create-avatars-bucket.mjs
import { readFileSync } from 'node:fs'

const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
const get = (k) => {
  const m = env.match(new RegExp(`^${k}="?([^"\\n]+)"?`, 'm'))
  return m ? m[1] : null
}
const URL_ = get('NEXT_PUBLIC_SUPABASE_URL')
const KEY = get('SUPABASE_SERVICE_ROLE_KEY')
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }

async function main() {
  // já existe?
  const list = await fetch(`${URL_}/storage/v1/bucket`, { headers }).then((r) => r.json())
  const exists = Array.isArray(list) && list.some((b) => b.id === 'avatars')
  if (exists) {
    console.log('bucket "avatars" já existe — garantindo público...')
    const upd = await fetch(`${URL_}/storage/v1/bucket/avatars`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ public: true, file_size_limit: 5242880, allowed_mime_types: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] }),
    })
    console.log('update:', upd.status, await upd.text())
    return
  }
  const res = await fetch(`${URL_}/storage/v1/bucket`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      id: 'avatars',
      name: 'avatars',
      public: true,
      file_size_limit: 5242880, // 5MB
      allowed_mime_types: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
    }),
  })
  console.log('create:', res.status, await res.text())
}
main()
