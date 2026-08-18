// SOMENTE LEITURA (não grava nada) — caso #97520: a transcrição de áudio
// realmente funciona no gateway configurado no setor?
//
// Checa, na ordem:
//   (A) quais modelos o gateway expõe em GET /models  → alimenta o seletor de modelo
//   (B) POST /audio/transcriptions com o modelo hardcoded 'whisper-1'
//       (app/api/ia/transcrever-audio/route.ts:73) usando um áudio real do setor
//
// Rodar: node --use-system-ca scripts/diag-transcricao-gateway.mjs
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] })
)
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const SETOR_ALVO = process.argv[2] || '32784b5b-58eb-4494-a7e6-d4a279358b84'

const { data: setor, error } = await sb
  .from('setores')
  .select('id, nome, openai_ativo, openai_api_key, openai_url_personalizada, openai_base_url')
  .eq('id', SETOR_ALVO)
  .single()
if (error) throw error

console.log(`setor: ${setor.nome}`)
console.log(`  openai_ativo=${setor.openai_ativo}  url_personalizada=${setor.openai_url_personalizada}`)
console.log(`  base_url=${setor.openai_base_url}`)

// mesma normalização de lib/ai-provider.ts
const base = new URL(setor.openai_base_url)
const path = base.pathname.replace(/\/+$/, '').replace(/\/(chat\/completions|audio\/transcriptions)$/, '')
const urlDe = (endpoint) => { const u = new URL(base); u.pathname = `${path}/${endpoint}`; u.hash = ''; return u.toString() }

// ─── (A) catálogo de modelos ──────────────────────────────────────────────
console.log(`\n=== (A) GET ${urlDe('models')} ===`)
try {
  const res = await fetch(urlDe('models'), { headers: { Authorization: `Bearer ${setor.openai_api_key}` } })
  const texto = await res.text()
  console.log(`status ${res.status}`)
  try {
    const json = JSON.parse(texto)
    const ids = (json.data || []).map((m) => m.id)
    console.log(`modelos (${ids.length}):`)
    for (const id of ids) console.log(`  ${id}`)
  } catch {
    console.log(texto.slice(0, 800))
  }
} catch (e) {
  console.log(`FALHOU: ${e.message}`)
}

// ─── (B) transcrição com um áudio real ────────────────────────────────────
const { data: audios } = await sb
  .from('mensagens')
  .select('id, url_imagem, media_type, tipo, enviado_em')
  .eq('tipo', 'audio')
  .order('enviado_em', { ascending: false })
  .limit(20)

const comUrl = (audios || []).find((m) => m.url_imagem)
if (!comUrl) {
  console.log('\n=== (B) nenhum áudio com URL encontrado — pulei o teste de transcrição ===')
  process.exit(0)
}
const audioUrl = comUrl.url_imagem
console.log(`\n=== (B) POST ${urlDe('audio/transcriptions')} ===`)
console.log(`áudio de teste: ${audioUrl.slice(0, 110)}…`)

const audioRes = await fetch(audioUrl)
if (!audioRes.ok) {
  console.log(`falha ao baixar o áudio: ${audioRes.status}`)
  process.exit(0)
}
const buf = await audioRes.arrayBuffer()
const contentType = audioRes.headers.get('content-type') || 'audio/ogg'
console.log(`baixado: ${(buf.byteLength / 1024).toFixed(1)} KB, content-type=${contentType}`)

// ─── (C) o chat responde em JSON ou em SSE sem `stream:false`? ────────────
// melhorar-mensagem faz response.json(); se vier text/event-stream, quebra.
console.log(`\n=== (C) POST ${urlDe('chat/completions')} — formato da resposta ===`)
for (const comFlag of [false, true]) {
  const corpo = {
    model: 'cx/gpt-5.4',
    messages: [{ role: 'user', content: 'responda apenas: ok' }],
    max_tokens: 10,
    ...(comFlag ? { stream: false } : {}),
  }
  try {
    const res = await fetch(urlDe('chat/completions'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${setor.openai_api_key}` },
      body: JSON.stringify(corpo),
    })
    const texto = await res.text()
    console.log(`  ${comFlag ? 'com' : 'sem'} stream:false → status ${res.status}, content-type=${res.headers.get('content-type')}`)
    console.log(`    ${texto.slice(0, 160).replace(/\n/g, ' ')}`)
  } catch (e) {
    console.log(`  ${comFlag ? 'com' : 'sem'} stream:false → FALHOU: ${e.message}`)
  }
}

for (const modelo of ['whisper-1', ...(process.argv.slice(3))]) {
  const form = new FormData()
  form.append('file', new Blob([buf], { type: contentType }), 'audio.ogg')
  form.append('model', modelo)
  form.append('language', 'pt')
  try {
    const res = await fetch(urlDe('audio/transcriptions'), {
      method: 'POST',
      headers: { Authorization: `Bearer ${setor.openai_api_key}` },
      body: form,
    })
    const texto = await res.text()
    console.log(`\n  model=${modelo} → status ${res.status}`)
    console.log(`  ${texto.slice(0, 500)}`)
  } catch (e) {
    console.log(`\n  model=${modelo} → FALHOU: ${e.message}`)
  }
}
