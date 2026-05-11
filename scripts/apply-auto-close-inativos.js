// Aplica migration 20260424_auto_close_inativos.sql (cron pg_cron encerrar-tickets-inativos)
// Uso: node scripts/apply-auto-close-inativos.js
const { Client } = require('pg')
const fs = require('fs')
const path = require('path')

const envPath = path.join(__dirname, '..', '.env.local')
const env = Object.fromEntries(
  fs.readFileSync(envPath, 'utf8')
    .split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]
    })
)

async function run() {
  const rawUrl = env.POSTGRES_URL_NON_POOLING.replace(/[?&]sslmode=[^&]*/, '')
  const u = new URL(rawUrl)
  const client = new Client({
    host: u.hostname,
    port: Number(u.port || 5432),
    user: decodeURIComponent(u.username),
    password: process.env.PGPASS_OVERRIDE || decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, ''),
    ssl: { rejectUnauthorized: false },
  })
  await client.connect()

  console.log('\n=== Aplicando migration 20260424_auto_close_inativos.sql ===')
  const sql = fs.readFileSync(
    path.join(__dirname, '..', 'supabase', 'migrations', '20260424_auto_close_inativos.sql'),
    'utf8'
  )
  await client.query(sql)
  console.log('Migration aplicada')

  console.log('\n=== Confirmando cron criado ===')
  const job = await client.query(
    `SELECT jobid, jobname, schedule, active FROM cron.job WHERE jobname = 'encerrar-tickets-inativos'`
  )
  if (job.rows.length === 0) {
    console.log('AVISO: cron NAO foi criado — verifique permissoes pg_cron')
  } else {
    console.table(job.rows)
  }

  console.log('\n=== Setores com encerramento_auto_ativo=true ===')
  const setores = await client.query(`
    SELECT id, nome, encerramento_auto_ativo, encerramento_auto_minutos
    FROM setores
    WHERE encerramento_auto_ativo = true
    ORDER BY nome
  `)
  if (setores.rows.length === 0) {
    console.log('Nenhum setor tem encerramento ativo — cliente nao habilitou nas configuracoes')
  } else {
    console.table(setores.rows)
  }

  console.log('\nOK. O cron rodara a cada 2 minutos e encerrara tickets inativos automaticamente.')
  await client.end()
}

run().catch(e => { console.error('ERRO:', e.message); process.exit(1) })
