// Setup da feature "foto de perfil":
//   1) cria/garante o bucket público "avatars" (Storage REST API)
//   2) adiciona a coluna colaboradores.foto_url (ALTER TABLE via Postgres)
//
// Uso: node --use-system-ca scripts/setup-foto-perfil.mjs
//
// Obs.: usa rejectUnauthorized:false na conexão Postgres porque a rede
// corporativa intercepta o TLS; o pooler ainda valida usuário/senha.
import { readFileSync } from 'node:fs'
import pg from 'pg'

const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
const get = (k) => {
  const m = env.match(new RegExp(`^${k}="?([^"\\n]+)"?`, 'm'))
  return m ? m[1] : null
}
const SUPABASE_URL = get('NEXT_PUBLIC_SUPABASE_URL')
const SERVICE_KEY = get('SUPABASE_SERVICE_ROLE_KEY')
const PG_URL = get('POSTGRES_URL_NON_POOLING') || get('POSTGRES_URL')

async function createBucket() {
  const headers = {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
  }
  const body = JSON.stringify({
    id: 'avatars',
    name: 'avatars',
    public: true,
    file_size_limit: 5242880, // 5MB
    allowed_mime_types: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
  })
  const list = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, { headers }).then((r) => r.json())
  const exists = Array.isArray(list) && list.some((b) => b.id === 'avatars')
  if (exists) {
    const r = await fetch(`${SUPABASE_URL}/storage/v1/bucket/avatars`, { method: 'PUT', headers, body })
    console.log(`[bucket] já existia — atualizado para público (status ${r.status})`)
  } else {
    const r = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, { method: 'POST', headers, body })
    console.log(`[bucket] criado (status ${r.status}): ${await r.text()}`)
  }
}

async function addColumn() {
  const client = new pg.Client({
    connectionString: PG_URL,
    ssl: { rejectUnauthorized: false },
  })
  await client.connect()
  await client.query('ALTER TABLE colaboradores ADD COLUMN IF NOT EXISTS foto_url text')
  await client.end()
  console.log('[coluna] colaboradores.foto_url garantida (ADD COLUMN IF NOT EXISTS)')
}

async function main() {
  await createBucket()
  await addColumn()
  console.log('\nOK — bucket "avatars" e coluna foto_url prontos.')
}

main().catch((e) => {
  console.error('ERRO:', e.message)
  process.exit(1)
})
