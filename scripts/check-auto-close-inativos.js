// Diagnóstico do cron encerrar-tickets-inativos
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

const TICKETS_REPORTADOS = [114713, 114716, 117456, 117458, 117472, 117485, 117451, 119006]

async function run() {
  // Conexao via POSTGRES_URL_NON_POOLING (pooler de sessao) — POSTGRES_HOST direto nao
  // resolve pelo DNS de redes externas. User precisa ser postgres.PROJECT_REF.
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

  console.log('\n=== 1. Cron job encerrar-tickets-inativos ===')
  const job = await client.query(
    `SELECT jobid, jobname, schedule, active FROM cron.job WHERE jobname = 'encerrar-tickets-inativos'`
  )
  if (job.rows.length === 0) {
    console.log('NAO EXISTE — migration 20260424_auto_close_inativos.sql nao foi aplicada')
  } else {
    console.table(job.rows)
  }

  console.log('\n=== 2. Ultimas 10 execucoes ===')
  const runs = await client.query(`
    SELECT status, return_message, start_time, end_time
    FROM cron.job_run_details
    WHERE jobid IN (SELECT jobid FROM cron.job WHERE jobname = 'encerrar-tickets-inativos')
    ORDER BY start_time DESC LIMIT 10
  `)
  if (runs.rows.length === 0) {
    console.log('Nenhuma execucao registrada')
  } else {
    console.table(runs.rows)
  }

  console.log('\n=== 3. Setores com encerramento_auto_ativo = true ===')
  const setores = await client.query(`
    SELECT id, nome, encerramento_auto_ativo, encerramento_auto_minutos
    FROM setores
    WHERE encerramento_auto_ativo = true
    ORDER BY nome
  `)
  if (setores.rows.length === 0) {
    console.log('NENHUM setor tem encerramento_auto_ativo=true — cliente nao habilitou de fato')
  } else {
    console.table(setores.rows)
  }

  console.log('\n=== 4. Estado dos tickets reportados ===')
  const tickets = await client.query(`
    SELECT
      t.id_publico,
      t.status,
      t.is_disparo,
      s.nome AS setor,
      s.encerramento_auto_ativo AS auto_ativo,
      s.encerramento_auto_minutos AS auto_min,
      (SELECT MAX(enviado_em) FROM mensagens WHERE ticket_id = t.id) AS ultima_msg,
      (SELECT remetente FROM mensagens WHERE ticket_id = t.id ORDER BY enviado_em DESC LIMIT 1) AS ultimo_rem,
      ROUND(EXTRACT(EPOCH FROM (NOW() - COALESCE(
        (SELECT MAX(enviado_em) FROM mensagens WHERE ticket_id = t.id),
        t.criado_em
      )))/60)::int AS min_inativo
    FROM tickets t
    JOIN setores s ON s.id = t.setor_id
    WHERE t.id_publico = ANY($1::int[])
    ORDER BY t.id_publico
  `, [TICKETS_REPORTADOS])
  if (tickets.rows.length === 0) {
    console.log('Nenhum dos tickets reportados encontrado')
  } else {
    console.table(tickets.rows)
  }

  console.log('\n=== 5. Tickets que DEVERIAM estar encerrados mas estao abertos ===')
  const parados = await client.query(`
    SELECT s.nome AS setor,
           COUNT(*)::int AS total,
           MIN(t.id_publico) AS menor_id,
           MAX(t.id_publico) AS maior_id
    FROM tickets t
    JOIN setores s ON s.id = t.setor_id
    WHERE s.encerramento_auto_ativo = true
      AND t.status IN ('aberto', 'em_atendimento')
      AND COALESCE(t.is_disparo, false) = false
      AND COALESCE(
        (SELECT MAX(m.enviado_em) FROM mensagens m WHERE m.ticket_id = t.id),
        t.criado_em
      ) < NOW() - (s.encerramento_auto_minutos || ' minutes')::interval
    GROUP BY s.nome
    ORDER BY total DESC
  `)
  if (parados.rows.length === 0) {
    console.log('Nenhum ticket parado — ou cron esta funcionando, ou nao ha setor ativo')
  } else {
    console.table(parados.rows)
  }

  console.log('\n=== 6. Resumo / diagnostico ===')
  if (job.rows.length === 0) {
    console.log('CAUSA: cron NAO existe — aplicar migration 20260424_auto_close_inativos.sql')
  } else if (!job.rows[0].active) {
    console.log('CAUSA: cron existe mas esta INATIVO — reativar com cron.alter_job')
  } else if (setores.rows.length === 0) {
    console.log('CAUSA: nenhum setor com encerramento_auto_ativo=true')
  } else if (parados.rows.length > 0) {
    console.log('CAUSA: cron registrado mas nao processa — investigar pg_cron permissions / erros')
  } else {
    console.log('Cron parece funcionar. Tickets reportados podem ter mensagens recentes (ver tabela 4).')
  }

  await client.end()
}

run().catch(e => { console.error('ERRO:', e.message); process.exit(1) })
