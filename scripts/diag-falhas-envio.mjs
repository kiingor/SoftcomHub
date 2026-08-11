// Diagnóstico SOMENTE LEITURA: do que são feitas as falhas de envio.
//
//   node --use-system-ca scripts/diag-falhas-envio.mjs [dias]
//
// Agrupa `mensagens.erro_envio` por família de erro. A mensagem crua varia
// (traz nome de instância, id, texto do provedor), então agrupar pelo texto
// literal produziria uma lista longa e inútil — a classificação abaixo junta o
// que tem a mesma causa.

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

for (const linha of readFileSync('.env.local', 'utf8').split('\n')) {
  const par = linha.match(/^([A-Z_]+)=(.*)$/)
  if (par && !process.env[par[1]]) process.env[par[1]] = par[2].trim().replace(/^["']|["']$/g, '')
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
)

const dias = Number(process.argv[2] || 30)
const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString()

/** Ordem importa: a primeira que casar vence. */
const FAMILIAS = [
  [/não pertence a este ticket|nao pertence a este ticket/i, 'Citação: mensagem respondida não pertence ao ticket'],
  [/não pertence ao setor atual|nao pertence ao setor atual/i, 'Canal: não pertence ao setor do ticket (CHANNEL_MISMATCH)'],
  [/telefone informado não pertence|telefone informado nao pertence/i, 'Destinatário: telefone não é do cliente'],
  [/Telefone do cliente não encontrado|Telefone do cliente nao encontrado/i, 'Destinatário: ticket sem telefone'],
  [/credentials not configured|não configurad|nao configurad/i, 'Canal sem credenciais configuradas'],
  [/URL do arquivo não é permitida|URL do arquivo nao e permitida/i, 'Mídia: URL não permitida'],
  [/mudou de setor durante o envio/i, 'Corrida: ticket mudou de setor durante o envio'],
  [/offline|não está conectada|nao esta conectada/i, 'Dispositivo/instância offline'],
  [/timeout|ETIMEDOUT|ECONNRESET|socket hang up|fetch failed/i, 'Rede: timeout / conexão caiu'],
  [/rate limit|too many requests|429/i, 'Provedor: rate limit'],
  [/24|janela/i, 'Janela de 24h do WhatsApp'],
  [/EvolutionAPI|Evolution/i, 'Erro genérico da EvolutionAPI'],
  [/WhatsApp|Meta|Graph/i, 'Erro genérico do provedor WhatsApp'],
]

function classificar(erro) {
  for (const [padrao, rotulo] of FAMILIAS) if (padrao.test(erro)) return rotulo
  return 'OUTROS (não classificado)'
}

// Lê por páginas: o PostgREST corta em 1.000 sem avisar, e um corte aqui
// distorceria justamente a contagem que o script existe para produzir.
const linhas = []
for (let pagina = 0; ; pagina += 1) {
  const de = pagina * 1000
  const { data, error } = await supabase
    .from('mensagens')
    .select('erro_envio, enviado_em')
    .eq('status_envio', 'falhou')
    .not('erro_envio', 'is', null)
    .gte('enviado_em', desde)
    .order('id', { ascending: true })
    .range(de, de + 999)
  if (error) throw error
  if (!data || data.length === 0) break
  linhas.push(...data)
  if (data.length < 1000) break
}

const porFamilia = new Map()
const exemplos = new Map()
for (const { erro_envio } of linhas) {
  const familia = classificar(erro_envio)
  porFamilia.set(familia, (porFamilia.get(familia) || 0) + 1)
  if (!exemplos.has(familia)) exemplos.set(familia, erro_envio.slice(0, 120))
}

const total = linhas.length
console.log(`\nFalhas de envio nos últimos ${dias} dias: ${total}\n`)
const ordenado = [...porFamilia.entries()].sort((a, b) => b[1] - a[1])
for (const [familia, quantidade] of ordenado) {
  const pct = total ? ((quantidade / total) * 100).toFixed(1) : '0.0'
  console.log(`${String(quantidade).padStart(5)}  ${pct.padStart(5)}%  ${familia}`)
  if (familia.startsWith('OUTROS')) console.log(`                 ex.: ${exemplos.get(familia)}`)
}

// Denominador: sem ele a contagem acima não diz se 76 é muito ou pouco.
const { count: totalEnviadas } = await supabase
  .from('mensagens')
  .select('id', { count: 'exact', head: true })
  .eq('remetente', 'colaborador')
  .gte('enviado_em', desde)

if (totalEnviadas) {
  console.log(`\nEnvios de atendente no período: ${totalEnviadas}`)
  console.log(`Taxa de falha: ${((total / totalEnviadas) * 100).toFixed(2)}%`)
}
