// Aplica migration 20260511_auto_close_inativos_v2.sql
// (Opção D — só fecha se última msg foi do atendente)
// Uso: node scripts/apply-auto-close-inativos-v2.js
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

  console.log('\n=== Aplicando migration 20260511_auto_close_inativos_v2.sql ===')
  const sql = fs.readFileSync(
    path.join(__dirname, '..', 'supabase', 'migrations', '20260511_auto_close_inativos_v2.sql'),
    'utf8'
  )
  await client.query(sql)
  console.log('Migration aplicada — cron atualizado com regra nova (opcao D)')

  console.log('\n=== Cron job ===')
  const job = await client.query(
    `SELECT jobid, jobname, schedule, active FROM cron.job WHERE jobname = 'encerrar-tickets-inativos'`
  )
  console.table(job.rows)

  console.log('\n=== Setores ativos ===')
  const setores = await client.query(`
    SELECT id, nome, encerramento_auto_minutos
    FROM setores
    WHERE encerramento_auto_ativo = true
    ORDER BY nome
  `)
  console.table(setores.rows)

  console.log('\nOK. Proxima execucao: a cada 2 minutos. Regra: fecha apenas quando a ULTIMA mensagem do ticket foi do atendente e ja se passou X min sem o cliente retornar.')
  await client.end()
}

run().catch(e => { console.error('ERRO:', e.message); process.exit(1) })
