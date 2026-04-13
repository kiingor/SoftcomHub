# Plano Completo de Otimização de Performance — SoftcomHub
**Especialista em Performance Frontend & Full Stack**
**Data:** 2026-04-07
**Stack:** Next.js 16, React 19, Supabase, SWR, Recharts, Framer Motion, Tailwind v4

---

## 1. Diagnóstico Consolidado

### Mapa de Impacto por Problema

| # | Arquivo | Problema | Categoria | Impacto no Usuário | Esforço |
|---|---------|----------|-----------|-------------------|---------|
| 1 | `metricas/page.tsx:148–329` | 5 queries buscando até 50.000 rows cada, calculando médias no JS do cliente | Data fetching | **CRÍTICO** — 5–25 s de TTFB em produção com volume real | Médio |
| 2 | `monitoramento/page.tsx:150–153` | `setInterval(1s)` no componente de 1.731 linhas | Re-render | **CRÍTICO** — 60 re-renders/min no componente mais pesado do sistema | Baixo |
| 3 | `monitoramento/page.tsx:178–315` | SWR `refreshInterval: 5000` executando query `SELECT *` com 4 JOINs sem LIMIT | Data fetching | ALTO — 12 queries/min com payload enorme transferido a cada 5 s | Médio |
| 4 | `dashboard-shell.tsx:22–40` | 4 blurs CSS (`blur-[100px–150px]`) fixos na tela | Rendering/GPU | ALTO — Paint contínuo a cada scroll/transição, travamentos em GPU integrada | Baixo |
| 5 | `metricas/page.tsx:355–368` | `containerVariants`/`itemVariants` criados no corpo do render | Re-render | MÉDIO — Objetos novos a cada render invalidam memoização do Framer Motion | Baixo |
| 6 | `metricas/page.tsx:63` e `dashboard/page.tsx:161` | `createClient()` no corpo do componente | Instanciação | MÉDIO — Nova instância WebSocket/HTTP a cada render, leak potencial | Baixo |
| 7 | `dashboard/page.tsx:328–446` | `SetorCard` definido dentro de `DashboardPage` | Re-render | MÉDIO — Novo tipo de componente a cada render do pai, remount via Framer `layout` | Baixo |
| 8 | `metricas/page.tsx:462 (aprox)` | Sort inline no JSX do BarChart | Re-render | BAIXO — Novo array a cada render, dificulta React reconciliation | Baixo |
| 9 | `metricas/page.tsx:370–737` | 3 gráficos Recharts carregados no bundle inicial, sem lazy loading | Bundle | MÉDIO — Recharts ~150 KB gzip no bundle crítico | Baixo |
| 10 | `dashboard/page.tsx:172–177` | `useCallback` com dep `[supabase]` recriada a cada render | Re-render | BAIXO — Callback nunca estável, re-fetches desnecessários | Baixo |

### Estimativa de Impacto no Carregamento Real

**Metricas page** (cenário com 5.000 tickets, sem otimização):
- 5 queries x 50.000 rows limit = até 25 round-trips HTTP (se paginado) ou 5 transferências massivas
- Cada query traz `criado_em`, `encerrado_em`, `primeira_resposta_em`, `setor_id`, JOIN → ~300–800 bytes/row
- 5.000 rows × 500 bytes médios × 5 queries = ~12,5 MB transferidos por carregamento
- Tempo estimado (rede 10 Mbps): 10–15 s de loading + cálculo JS

**Monitoramento page** (setInterval 1s):
- 1 re-render completo por segundo
- Cada re-render avalia 8+ `useMemo` pesados (filtragem, mapeamento de tickets/atendentes)
- CPU dedicada: ~30–80 ms/render → 3–8% CPU constante apenas pela tela de monitoramento

---

## 2. Top 5 Ofensores por Impacto na Experiência do Usuário

### #1 — Queries de Dados Brutos na Página de Métricas
**Arquivo:** `app/dashboard/metricas/page.tsx`, linhas 169–329
**Por que é o pior:** Transfere dezenas de MB de dados brutos para calcular 4 números (médias e contagens). Em produção com volume crescente, o carregamento cresce linearmente com o número de tickets. Com 50.000 tickets, cada carregamento da página pode transferir 125 MB de dados desnecessários.
**Impacto:** LCP 10–30 s, TTFB degradado, potencial timeout do Supabase (limite padrão 30 s).

### #2 — setInterval de 1 Segundo no Componente Monolítico
**Arquivo:** `app/dashboard/monitoramento/page.tsx`, linhas 150–153
**Por que é crítico:** O componente tem 1.731 linhas com 8+ `useMemo`, arrays derivados de tickets e atendentes, e JSX complexo. Um re-render por segundo significa que qualquer interação do usuário (digitar, clicar) compete com esse ciclo. Em dispositivos lentos, causa jank visível e travamentos de input.
**Impacto:** 3–8% CPU constante, jank em interações, bateria em mobile drenada.

### #3 — SWR SELECT * com JOINs sem LIMIT
**Arquivo:** `app/dashboard/monitoramento/page.tsx`, linha 188
**Por que é crítico:** `select('*, clientes(nome, telefone), colaboradores(...), setores(...), subsetores(...)')` sem `.limit()`. A cada 5 segundos, o Supabase retorna todos os tickets ativos em todos os setores acessíveis, com dados expandidos via JOIN. Em operações com 200+ tickets ativos, isso é uma transferência enorme a cada 5 s.
**Impacto:** 12 queries pesadas por minuto, latência de rede crescente, possível throttling do Supabase.

### #4 — 4 Blurs CSS Fixos no Layout Global
**Arquivo:** `components/dashboard/dashboard-shell.tsx`, linhas 22–40
**Por que é crítico:** `filter: blur(100px–150px)` em elementos de 600–800px força o browser a criar camadas de compositing e pintar a cada frame em que qualquer coisa muda no viewport. Em GPUs integradas (Intel UHD, Apple M-series em modo economia), isso causa frames dropping visível e torna animações Framer Motion instáveis.
**Impacto:** 60 fps impossível em GPUs integradas, animações com jank, alto consumo de memória GPU.

### #5 — createClient() no Corpo dos Componentes
**Arquivos:** `metricas/page.tsx:64`, `dashboard/page.tsx:161`
**Por que é crítico:** Cada render cria uma nova instância do cliente Supabase, que internamente abre/reabre conexões WebSocket (para Realtime) e recria headers de autenticação. Com o `setInterval` do monitoramento ativo, isso significa instâncias potencialmente duplicadas acumulando na memória.
**Impacto:** Memory leaks progressivos, possível duplicação de subscriptions Realtime se adicionadas futuramente.

---

## 3. Quick Wins (Implementáveis Hoje)

### 3.1 — Estabilizar createClient() com useMemo

**Arquivo:** `app/dashboard/metricas/page.tsx`, linha 64
**Arquivo:** `app/dashboard/page.tsx`, linha 161

**BEFORE:**
```tsx
// metricas/page.tsx:64
export default function MetricasPage() {
  const supabase = createClient() // nova instância a cada render
```

**AFTER:**
```tsx
// metricas/page.tsx
import { useMemo } from 'react'

export default function MetricasPage() {
  const supabase = useMemo(() => createClient(), []) // instância única durante a vida do componente
```

**Impacto:** Elimina instanciações repetidas. `useMemo` com `[]` garante referência estável, o que também estabiliza `useCallback` e `useEffect` que dependem de `supabase`. Estimativa: elimina 100% das instâncias duplicadas do cliente.

---

### 3.2 — Mover SetorCard para Fora do Componente Pai

**Arquivo:** `app/dashboard/page.tsx`, linhas 326–446

**BEFORE:**
```tsx
// dashboard/page.tsx:328 — SetorCard definido DENTRO de DashboardPage
export default function DashboardPage() {
  // ... states ...

  function SetorCard({ setor, index }: { setor: Setor; index: number }) {
    // componente completo com lógica e JSX
    return (
      <motion.div layout ...>
        {/* ... */}
      </motion.div>
    )
  }

  return (
    // ...usa SetorCard
  )
}
```

**AFTER:**
```tsx
// dashboard/page.tsx — SetorCard FORA de DashboardPage

interface SetorCardProps {
  setor: Setor
  index: number
  navigatingTo: string | null
  isPending: boolean
  onSetorClick: (id: string) => void
}

// Componente estável: mesma referência de tipo entre renders do pai
const SetorCard = React.memo(function SetorCard({
  setor,
  index,
  navigatingTo,
  isPending,
  onSetorClick,
}: SetorCardProps) {
  const SetorIcon = getIconComponent(setor.icon_url)
  const setorColor = setor.cor || '#3B82F6'
  const isNavigating = navigatingTo === setor.id && isPending
  const activeCanais = (setor.setor_canais ?? []).filter((c) => c.ativo)

  return (
    <motion.div
      key={setor.id}
      initial={{ opacity: 0, y: 16, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ delay: index * 0.04, duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
      layout
    >
      {/* ... JSX do card ... */}
    </motion.div>
  )
})

export default function DashboardPage() {
  // ... sem SetorCard aqui
}
```

**Impacto:** Com `SetorCard` fora do componente pai, o React mantém a mesma referência de tipo entre renders. O Framer Motion `layout` não força remount dos cards quando o pai re-renderiza. Estimativa: elimina remounts desnecessários dos cards, animações de layout mais suaves.

---

### 3.3 — Isolar o setInterval em Componente Filho TicketTimer

**Arquivo:** `app/dashboard/monitoramento/page.tsx`, linhas 150–153

**BEFORE:**
```tsx
// monitoramento/page.tsx:149–153 — setInterval no componente de 1.731 linhas
const [, setTick] = useState(0)

useEffect(() => {
  const interval = setInterval(() => setTick((t) => t + 1), 1000)
  return () => clearInterval(interval)
}, [])

// Usado para formatar durações que atualizam a cada segundo
// Exemplo de uso no JSX: tempoAtendimento: formatDuration(t.criado_em, null)
// formatDuration usa Date.now() internamente, dependendo do tick para re-executar
```

**AFTER — Criar componente isolado:**
```tsx
// components/dashboard/ticket-timer.tsx — NOVO COMPONENTE
'use client'

import { useState, useEffect } from 'react'

interface TicketTimerProps {
  startTime: string | null // ISO string
  className?: string
}

// Este componente carrega o tick APENAS para si mesmo
// O pai NÃO re-renderiza quando o timer atualiza
export function TicketTimer({ startTime, className }: TicketTimerProps) {
  const [elapsed, setElapsed] = useState('')

  useEffect(() => {
    if (!startTime) {
      setElapsed('—')
      return
    }

    function tick() {
      const start = new Date(startTime!).getTime()
      const diff = Date.now() - start
      const h = Math.floor(diff / 3600000).toString().padStart(2, '0')
      const m = Math.floor((diff % 3600000) / 60000).toString().padStart(2, '0')
      const s = Math.floor((diff % 60000) / 1000).toString().padStart(2, '0')
      setElapsed(`${h}:${m}:${s}`)
    }

    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [startTime])

  return <span className={className}>{elapsed}</span>
}
```

**Uso no monitoramento:**
```tsx
// monitoramento/page.tsx — REMOVER:
// const [, setTick] = useState(0)
// useEffect(() => { const interval = setInterval(...) }, [])

// SUBSTITUIR nos cards de ticket:
// BEFORE: <span>{ticket.tempoAtendimento}</span>
// AFTER:
<TicketTimer startTime={ticket.atribuido_em || ticket.criado_em} />

// Para tempoEspera dos tickets aguardando:
<TicketTimer startTime={ticket.criado_em} />
```

**Impacto:** O componente pai (1.731 linhas) para de re-renderizar 60 vezes/minuto. Apenas os `<TicketTimer>` individuais atualizam, que são componentes triviais. Redução de re-renders: de 60/min para 0/min no componente pai. CPU estimada: de 3–8% para <0.1%.

---

### 3.4 — Mover Objetos Framer Motion para Constantes Fora do Componente

**Arquivo:** `app/dashboard/metricas/page.tsx`, linhas 355–368

**BEFORE:**
```tsx
// metricas/page.tsx:355–368 — recriados a cada render
export default function MetricasPage() {
  // ...
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  }

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 }
  }

  return (
    <motion.div variants={containerVariants} ...>
```

**AFTER:**
```tsx
// metricas/page.tsx — ANTES da função do componente, no escopo do módulo

const CONTAINER_VARIANTS = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
} as const

const ITEM_VARIANTS = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 }
} as const

export default function MetricasPage() {
  // containerVariants e itemVariants removidos daqui

  return (
    <motion.div variants={CONTAINER_VARIANTS} ...>
      {metrics.map((metric) => (
        <motion.div variants={ITEM_VARIANTS} ...>
```

**Impacto:** Framer Motion mantém referência estável dos variants, evitando diff interno desnecessário. Estimativa: elimina 100% das recriações de objeto por render.

---

### 3.5 — Mover Sort Inline para useMemo

**Arquivo:** `app/dashboard/metricas/page.tsx` (área do BarChart de Tickets por Setor)

**BEFORE:**
```tsx
// No JSX do BarChart — cria novo array a cada render:
<BarChart data={[...paginatedTicketsBySetor].sort((a, b) => a.count - b.count)}>
```

**AFTER:**
```tsx
// Acima do return, junto com os outros useMemos:
const sortedTicketsBySetor = useMemo(
  () => [...paginatedTicketsBySetor].sort((a, b) => a.count - b.count),
  [paginatedTicketsBySetor]
)

// No JSX:
<BarChart data={sortedTicketsBySetor}>
```

**Impacto:** Elimina criação de array e sort O(n log n) a cada render. O sort só re-executa quando `paginatedTicketsBySetor` muda (mudança de página ou dados).

---

## 4. Otimização das Queries de Métricas

### Por que o Problema é Grave

A função `fetchMetrics` em `metricas/page.tsx:148–329` executa 5 queries que trazem linhas brutas para o cliente:

1. `firstResponseQuery.limit(50000)` → todos os tickets encerrados com `primeira_resposta_em`
2. `resolutionQuery.limit(50000)` → todos os tickets encerrados com `encerrado_em`
3. `ticketQuery.limit(50000)` → todos os tickets com JOIN `setores(nome)` para contar por setor
4. `colaboradorQuery.limit(50000)` → todos os tickets com JOIN `colaboradores(nome)` para contar por colaborador
5. `dailyQuery.limit(50000)` → todos os tickets com `criado_em` para agrupar por dia

**Solução:** Mover todos os cálculos para o PostgreSQL via funções RPC.

### Views e Funções PostgreSQL a Criar no Supabase

#### Função 1: Tempo Médio de Primeira Resposta

```sql
-- Executar no SQL Editor do Supabase
CREATE OR REPLACE FUNCTION get_avg_first_response(
  p_setor_ids  UUID[],
  p_from        TIMESTAMPTZ DEFAULT NULL,
  p_to          TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (avg_minutes NUMERIC)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    ROUND(
      AVG(
        EXTRACT(EPOCH FROM (primeira_resposta_em - criado_em)) / 60
      )::NUMERIC,
      2
    ) AS avg_minutes
  FROM tickets
  WHERE
    status = 'encerrado'
    AND primeira_resposta_em IS NOT NULL
    AND setor_id = ANY(p_setor_ids)
    AND (p_from IS NULL OR criado_em >= p_from)
    AND (p_to   IS NULL OR criado_em <= p_to)
$$;
```

#### Função 2: Tempo Médio de Resolução

```sql
CREATE OR REPLACE FUNCTION get_avg_resolution(
  p_setor_ids  UUID[],
  p_from        TIMESTAMPTZ DEFAULT NULL,
  p_to          TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (avg_minutes NUMERIC)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    ROUND(
      AVG(
        EXTRACT(EPOCH FROM (encerrado_em - criado_em)) / 60
      )::NUMERIC,
      2
    ) AS avg_minutes
  FROM tickets
  WHERE
    status = 'encerrado'
    AND encerrado_em IS NOT NULL
    AND setor_id = ANY(p_setor_ids)
    AND (p_from IS NULL OR criado_em >= p_from)
    AND (p_to   IS NULL OR criado_em <= p_to)
$$;
```

#### Função 3: Volume Diário de Tickets

```sql
CREATE OR REPLACE FUNCTION get_daily_volume(
  p_setor_ids  UUID[],
  p_from        TIMESTAMPTZ DEFAULT NULL,
  p_to          TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
  dia  TEXT,
  count BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    TO_CHAR(criado_em AT TIME ZONE 'America/Sao_Paulo', 'DD/MM') AS dia,
    COUNT(*) AS count
  FROM tickets
  WHERE
    setor_id = ANY(p_setor_ids)
    AND (p_from IS NULL OR criado_em >= p_from)
    AND (p_to   IS NULL OR criado_em <= p_to)
  GROUP BY TO_CHAR(criado_em AT TIME ZONE 'America/Sao_Paulo', 'DD/MM'),
           DATE_TRUNC('day', criado_em AT TIME ZONE 'America/Sao_Paulo')
  ORDER BY DATE_TRUNC('day', criado_em AT TIME ZONE 'America/Sao_Paulo')
$$;
```

#### Função 4: Top N Tickets por Setor

```sql
CREATE OR REPLACE FUNCTION get_tickets_by_setor(
  p_setor_ids  UUID[],
  p_from        TIMESTAMPTZ DEFAULT NULL,
  p_to          TIMESTAMPTZ DEFAULT NULL,
  p_limit       INT DEFAULT 20
)
RETURNS TABLE (
  setor TEXT,
  count BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    s.nome AS setor,
    COUNT(*) AS count
  FROM tickets t
  JOIN setores s ON s.id = t.setor_id
  WHERE
    t.setor_id = ANY(p_setor_ids)
    AND (p_from IS NULL OR t.criado_em >= p_from)
    AND (p_to   IS NULL OR t.criado_em <= p_to)
  GROUP BY s.nome
  ORDER BY count DESC
  LIMIT p_limit
$$;
```

#### Função 5: Top N Tickets por Colaborador

```sql
CREATE OR REPLACE FUNCTION get_tickets_by_colaborador(
  p_setor_ids  UUID[],
  p_from        TIMESTAMPTZ DEFAULT NULL,
  p_to          TIMESTAMPTZ DEFAULT NULL,
  p_limit       INT DEFAULT 20
)
RETURNS TABLE (
  colaborador TEXT,
  count BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    c.nome AS colaborador,
    COUNT(*) AS count
  FROM tickets t
  JOIN colaboradores c ON c.id = t.colaborador_id
  WHERE
    t.status = 'encerrado'
    AND t.colaborador_id IS NOT NULL
    AND t.setor_id = ANY(p_setor_ids)
    AND (p_from IS NULL OR t.criado_em >= p_from)
    AND (p_to   IS NULL OR t.criado_em <= p_to)
  GROUP BY c.nome
  ORDER BY count DESC
  LIMIT p_limit
$$;
```

#### Índices Necessários

```sql
-- Índice composto para todas as queries de métricas
CREATE INDEX IF NOT EXISTS idx_tickets_metrics
  ON tickets (setor_id, status, criado_em)
  INCLUDE (primeira_resposta_em, encerrado_em, colaborador_id);

-- Índice para filtragem por período
CREATE INDEX IF NOT EXISTS idx_tickets_criado_em
  ON tickets (criado_em DESC)
  WHERE status = 'encerrado';
```

### Como a Chamada Supabase Fica Depois

**BEFORE (metricas/page.tsx:148–329):**
```tsx
// 5 queries separadas, cada uma trazendo até 50.000 rows para o cliente
const { data: firstResponseData } = await firstResponseQuery.limit(50000)
// ... cálculo de média no JS cliente ...

const { data: resolutionData } = await resolutionQuery.limit(50000)
// ... cálculo de média no JS cliente ...

const { data: sectorData } = await ticketQuery.limit(50000)
// ... groupBy manual no JS cliente ...

const { data: colaboradorData } = await colaboradorQuery.limit(50000)
// ... groupBy manual no JS cliente ...

const { data: dailyData } = await dailyQuery.limit(50000)
// ... groupBy por data no JS cliente ...
```

**AFTER:**
```tsx
async function fetchMetrics() {
  if (setorIdsAcessiveis.length === 0) return
  setLoading(true)

  const { from: filterDate, to: filterDateTo } = getDateCutoffs(dateFilter, customRange)
  const filterSetorIds = setorFilter !== 'all' ? [setorFilter] : setorIdsAcessiveis

  const params = {
    p_setor_ids: filterSetorIds,
    p_from: filterDate ?? null,
    p_to: filterDateTo ?? null,
  }

  // 7 queries paralelas — todas retornam apenas os dados agregados (1–N rows)
  const [
    { data: avgFirstResp },
    { data: avgResolution },
    { count: totalTickets },
    { count: closedTickets },
    { data: bySetor },
    { data: byColaborador },
    { data: dailyVol },
  ] = await Promise.all([
    supabase.rpc('get_avg_first_response', params),
    supabase.rpc('get_avg_resolution', params),
    supabase
      .from('tickets')
      .select('*', { count: 'exact', head: true })
      .in('setor_id', filterSetorIds)
      .gte('criado_em', filterDate ?? '1970-01-01')
      .lte('criado_em', filterDateTo ?? new Date().toISOString()),
    supabase
      .from('tickets')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'encerrado')
      .in('setor_id', filterSetorIds)
      .gte('criado_em', filterDate ?? '1970-01-01')
      .lte('criado_em', filterDateTo ?? new Date().toISOString()),
    supabase.rpc('get_tickets_by_setor', { ...params, p_limit: 50 }),
    supabase.rpc('get_tickets_by_colaborador', { ...params, p_limit: 50 }),
    supabase.rpc('get_daily_volume', params),
  ])

  // Dados chegam prontos: sem groupBy, sem reduce, sem sort no cliente
  const firstResponseMinutes = avgFirstResp?.[0]?.avg_minutes ?? 0
  const resolutionMinutes = avgResolution?.[0]?.avg_minutes ?? 0

  setMetrics([
    { title: 'Tempo Médio 1ª Resposta', value: formatTime(Math.round(firstResponseMinutes)), ... },
    { title: 'Tempo Médio Resolução', value: formatTime(Math.round(resolutionMinutes)), ... },
    { title: 'Tickets Recebidos', value: String(totalTickets ?? 0), ... },
    { title: 'Tickets Encerrados', value: String(closedTickets ?? 0), ... },
  ])

  setTicketsBySetor(bySetor ?? [])
  setTicketsByColaborador(byColaborador ?? [])
  setDailyVolume(dailyVol ?? [])

  setLoading(false)
}
```

**Ganhos quantificados:**
- Dados transferidos: de ~12,5 MB (50k rows × 5 queries) para ~5 KB (resultados agregados)
- Tempo de carregamento: de 10–30 s para 200–800 ms
- Requests: de 5 sequenciais para 7 paralelos (com `Promise.all`)
- CPU cliente: eliminação de 5 `reduce`/`forEach` sobre arrays de 50.000 elementos

---

## 5. Otimização do Monitoramento

### 5.1 — TicketTimer como Componente Filho Isolado

Conforme descrito no Quick Win 3.3, o `setInterval` deve ser movido para `<TicketTimer>`.

**Localização do timer no monitoramento:** `monitoramento/page.tsx:371` (tempoAtendimento) e `:406` (tempoEspera)

Ao usar `<TicketTimer startTime={...} />` em vez de strings pré-calculadas com `formatDuration(t.criado_em, null)`, os timers atualizam independentemente sem afetar o componente pai.

**Detalhamento da substituição:**

```tsx
// monitoramento/page.tsx — NO MAPPING DE ticketsEmAndamento (aprox. linha 354–379)

// REMOVER: tempoAtendimento: formatDuration(t.atribuido_em || t.criado_em, null)
// (esta propriedade dependia do tick global)

// No JSX da tabela/card de ticket em andamento:
// BEFORE:
<span className="text-sm font-mono">{ticket.tempoAtendimento}</span>

// AFTER:
<TicketTimer
  startTime={ticket.atribuido_em || ticket.criado_em}
  className="text-sm font-mono"
/>

// Para tickets aguardando (tempoEspera):
// BEFORE:
<span>{ticket.tempoEspera}</span>

// AFTER:
<TicketTimer startTime={ticket.criado_em} />
```

**ANTES vs DEPOIS — Re-renders por minuto:**

| Componente | Antes | Depois |
|---|---|---|
| `MonitoramentoPage` (1.731 linhas) | 60/min | 0/min (apenas por dados SWR) |
| `TicketTimer` por ticket | 0 | 60/min (isolado, trivial) |
| `useMemo` pesados (filtragem, atendentes) | 60/min | ~12/min (apenas refresh SWR 5s) |

---

### 5.2 — Limitar a Query SELECT * com Campos Mínimos

**Arquivo:** `monitoramento/page.tsx:186–191`

**BEFORE:**
```tsx
let ticketsQuery = supabase
  .from('tickets')
  .select('*, clientes(nome, telefone), colaboradores(id, nome, is_online, pausa_atual_id), setores(id, nome), subsetores(id, nome)')
  .in('setor_id', targetSetorIds)
  .in('status', ['aberto', 'em_atendimento'])
// Sem .limit() — traz TODOS os tickets ativos
```

**AFTER:**
```tsx
let ticketsQuery = supabase
  .from('tickets')
  .select([
    'id',
    'numero',
    'status',
    'setor_id',
    'subsetor_id',
    'colaborador_id',
    'cliente_id',
    'criado_em',
    'atribuido_em',
    'primeira_resposta_em',
    // Joins apenas com campos necessários
    'clientes(nome, telefone)',
    'colaboradores(id, nome, is_online, pausa_atual_id, last_heartbeat)',
    'setores(id, nome)',
    'subsetores(id, nome)',
  ].join(', '))
  .in('setor_id', targetSetorIds)
  .in('status', ['aberto', 'em_atendimento'])
  .order('criado_em', { ascending: false })
  .limit(500) // Proteção: operações com mais de 500 tickets ativos precisam de UI diferente
```

**Ganhos:**
- Remove campos não usados (`encerrado_em`, `canal`, campos de texto livres, metadados)
- O `*` em Supabase expande todos os campos da tabela, incluindo conteúdo de mensagens ou dados grandes
- Com `.limit(500)`, previne transferências crescentes indefinidamente
- Redução estimada de payload: 40–60% por query

---

### 5.3 — Supabase Realtime em vez de Polling SWR 5s

**Arquivo:** `monitoramento/page.tsx:178–315`

**Implementação com Realtime:**

```tsx
// monitoramento/page.tsx — Substituir o bloco useSWR

import { useEffect, useRef, useState } from 'react'
import { RealtimeChannel } from '@supabase/supabase-js'

function useMonitoramentoRealtime(
  colaborador: any,
  setorIdsFiltrados: string[],
  setorFilter: string
) {
  const [data, setData] = useState<MonitoramentoData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const supabase = useMemo(() => createClient(), [])

  const fetchData = useCallback(async () => {
    const targetSetorIds = setorFilter !== 'all' ? [setorFilter] : setorIdsFiltrados
    if (targetSetorIds.length === 0) return

    // ... queries com campos mínimos (ver 5.2) ...
    // ... mesmo cálculo de stats ...

    setData(result)
    setIsLoading(false)
  }, [setorFilter, setorIdsFiltrados, supabase])

  useEffect(() => {
    if (!colaborador || setorIdsFiltrados.length === 0) return

    // Fetch inicial
    fetchData()

    // Subscription Realtime — escuta mudanças na tabela tickets
    // Filter: apenas setores acessíveis (reduz eventos desnecessários)
    const channel = supabase
      .channel('monitoramento-tickets')
      .on(
        'postgres_changes',
        {
          event: '*', // INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'tickets',
          // Nota: Supabase Realtime não suporta filtro IN diretamente.
          // Para múltiplos setores, use um trigger ou filtre no handler.
        },
        (payload) => {
          // Re-fetch ao detectar mudança
          // Em vez de refetch completo, pode-se fazer patch otimista:
          if (payload.eventType === 'INSERT') {
            const newTicket = payload.new
            if (setorIdsFiltrados.includes(newTicket.setor_id)) {
              fetchData() // ou atualizar estado localmente
            }
          } else if (payload.eventType === 'UPDATE') {
            fetchData()
          } else if (payload.eventType === 'DELETE') {
            fetchData()
          }
        }
      )
      .subscribe()

    channelRef.current = channel

    return () => {
      channel.unsubscribe()
    }
  }, [colaborador, setorIdsFiltrados.join(','), setorFilter])

  const mutate = useCallback(() => fetchData(), [fetchData])

  return { data, isLoading, mutate }
}
```

**Uso:**
```tsx
// BEFORE:
const { data, isLoading, mutate } = useSWR(
  ...,
  async () => { /* 5 queries */ },
  { revalidateOnFocus: false, refreshInterval: 5000 }
)

// AFTER:
const { data, isLoading, mutate } = useMonitoramentoRealtime(
  colaborador,
  setorIdsFiltrados,
  setorFilter
)
```

### Tradeoffs Realtime vs Polling

| Aspecto | Polling SWR (5 s) | Supabase Realtime |
|---------|------------------|-------------------|
| **Latência de atualização** | 0–5 s (depende do ciclo) | ~100–500 ms (quase imediato) |
| **Carga no servidor** | 12 queries pesadas/min por usuário | 1 conexão WebSocket permanente + fetch sob demanda |
| **Escalabilidade (N usuários)** | N × 12 queries/min | N conexões WebSocket (Supabase gerencia pool) |
| **Comportamento em tab inativa** | SWR suspende com `revalidateOnFocus` | WebSocket mantido (depende do browser) |
| **Complexidade de implementação** | Baixa (já existe) | Média (subscription + cleanup correto) |
| **Custo Supabase** | Maior (mais compute de queries) | Menor em compute, mas usa cota de Realtime connections |
| **Consistência** | Eventual (max 5 s de lag) | Eventual mas muito mais rápido |
| **Recomendação para este caso** | Aceitável para métricas históricas | **Ideal** para monitoramento em tempo real |

**Conclusão:** Para a página de monitoramento, Realtime é a escolha correta. O polling de 5 s é aceitável como fallback (manter `refreshInterval: 30000` como segurança), mas a experiência de "tempo real" genuíno requer Realtime.

---

## 6. Lazy Loading dos Gráficos

### Por que é Necessário

Recharts importa internamente D3 e suas utilitárias. O bundle completo com `BarChart`, `LineChart`, `ResponsiveContainer`, `ChartTooltip` etc. soma ~150–200 KB gzip. Esse código é carregado no bundle crítico da página de métricas, mesmo antes dos dados chegarem.

### Implementação com next/dynamic

**Arquivo:** `app/dashboard/metricas/page.tsx`

**BEFORE:**
```tsx
// metricas/page.tsx:20–31 — importação estática bloqueante
import {
  Bar,
  BarChart,
  Line,
  LineChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  Legend,
} from 'recharts'
```

**AFTER — Criar wrappers de gráficos:**

```tsx
// components/charts/tickets-by-setor-chart.tsx — NOVO ARQUIVO
'use client'

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
} from 'recharts'

interface Props {
  data: Array<{ setor: string; count: number }>
  colors: string[]
}

export function TicketsBySetorChart({ data, colors }: Props) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} layout="vertical" margin={{ left: 16, right: 24 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
        <XAxis type="number" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
        <YAxis type="category" dataKey="setor" width={120} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
        <Tooltip />
        <Bar dataKey="count" radius={[0, 4, 4, 0]}>
          {data.map((_, i) => (
            <Cell key={i} fill={colors[i % colors.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
```

```tsx
// components/charts/daily-volume-chart.tsx — NOVO ARQUIVO
'use client'

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts'

interface Props {
  data: Array<{ date: string; count: number }>
}

export function DailyVolumeChart({ data }: Props) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
        <XAxis dataKey="date" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
        <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
        <Tooltip />
        <Line type="monotone" dataKey="count" stroke="#F97316" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}
```

```tsx
// metricas/page.tsx — Lazy imports com next/dynamic
import dynamic from 'next/dynamic'

const TicketsBySetorChart = dynamic(
  () => import('@/components/charts/tickets-by-setor-chart').then(m => m.TicketsBySetorChart),
  {
    ssr: false,
    loading: () => <ChartSkeleton height={300} />,
  }
)

const TicketsByColaboradorChart = dynamic(
  () => import('@/components/charts/tickets-by-colaborador-chart').then(m => m.TicketsByColaboradorChart),
  {
    ssr: false,
    loading: () => <ChartSkeleton height={300} />,
  }
)

const DailyVolumeChart = dynamic(
  () => import('@/components/charts/daily-volume-chart').then(m => m.DailyVolumeChart),
  {
    ssr: false,
    loading: () => <ChartSkeleton height={300} />,
  }
)
```

### Template de Skeleton para os Gráficos

```tsx
// components/charts/chart-skeleton.tsx — NOVO COMPONENTE
import { Skeleton } from '@/components/ui/skeleton'

interface ChartSkeletonProps {
  height?: number
}

export function ChartSkeleton({ height = 300 }: ChartSkeletonProps) {
  return (
    <div className="w-full animate-pulse" style={{ height }}>
      {/* Eixo Y simulado */}
      <div className="flex h-full gap-3 items-end px-4 pb-6 pt-4">
        <div className="flex flex-col gap-1 justify-between h-full w-12 py-2">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-3 w-full opacity-40" />
          ))}
        </div>
        {/* Barras simuladas */}
        <div className="flex-1 flex items-end gap-2">
          {[...Array(8)].map((_, i) => (
            <Skeleton
              key={i}
              className="flex-1 rounded-t opacity-30"
              style={{ height: `${30 + Math.random() * 60}%` }}
            />
          ))}
        </div>
      </div>
      {/* Eixo X simulado */}
      <div className="flex gap-2 px-4 mt-1">
        <div className="w-12" />
        {[...Array(8)].map((_, i) => (
          <Skeleton key={i} className="flex-1 h-3 opacity-30" />
        ))}
      </div>
    </div>
  )
}
```

**Ganhos do Lazy Loading:**
- Bundle inicial da página de métricas: redução de ~150–200 KB gzip
- Os gráficos carregam em paralelo com os dados, após o bundle principal
- LCP da página não é bloqueado pelo download do Recharts
- Em conexões lentas (3G), diferença de 1–2 s no carregamento inicial perceptível

---

## 7. Otimização dos Blurs CSS

### O Problema Técnico

**Arquivo:** `components/dashboard/dashboard-shell.tsx`, linhas 22–40

Os 4 elementos com `blur-[100px–150px]` forçam o browser a:
1. Criar 4 camadas de GPU separadas (stacking contexts)
2. Pintar e compor cada camada a cada frame
3. Aplicar o filtro Gaussian blur (O(n²) em relação ao raio)

Com `blur(150px)`, o browser precisa processar uma matriz de ~300×300 pixels de convolução por elemento, por frame. Em 60 fps, isso é ~21 milhões de operações de pixel por segundo, por elemento.

### Técnica 1: Substituir por PNG/WebP Pré-renderizado

A abordagem mais eficiente para blurs estáticos é pré-renderizar o efeito como imagem:

```tsx
// dashboard-shell.tsx — AFTER (opção recomendada para produção)

// Criar: public/images/ambient-bg.webp
// (imagem 1920×1080, com os gradientes blurred pré-renderizados)

export function DashboardShell({ children, user }: DashboardShellProps) {
  return (
    <>
      {/* ─── Ambient background como imagem estática ─── */}
      {/* Zero custo de GPU em runtime — apenas uma textura */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 opacity-40 dark:opacity-[0.15]"
        style={{
          backgroundImage: 'url(/images/ambient-bg.webp)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      />

      {/* Background base */}
      <div className="fixed inset-0 -z-10 bg-[#F0F1F5] dark:bg-[#0A0A12]" />

      {/* Resto igual */}
    </>
  )
}
```

### Técnica 2: Reduzir Raio + will-change + contain (Mantendo CSS)

Se o efeito dinâmico for necessário (ex.: mudança de tema):

```tsx
// dashboard-shell.tsx — AFTER (opção CSS otimizada)
<>
  {/* Blur reduzido de 100–150px para 40–60px: visualmente similar, 4x mais rápido */}
  <div
    aria-hidden
    className="pointer-events-none fixed -top-40 -left-40 h-[600px] w-[600px] rounded-full opacity-25 dark:opacity-[0.07]"
    style={{
      background: 'radial-gradient(circle, #c084fc 0%, #818cf8 40%, transparent 70%)',
      filter: 'blur(60px)',      // Era blur(100px) — 2.8x mais rápido
      willChange: 'transform',  // Promove para camada GPU separada e estável
      contain: 'paint layout',  // Isolamento: mudanças internas não afetam layout externo
    }}
  />
  <div
    aria-hidden
    className="pointer-events-none fixed top-[40%] -right-48 h-[700px] w-[700px] rounded-full opacity-20 dark:opacity-[0.06]"
    style={{
      background: 'radial-gradient(circle, #60a5fa 0%, #38bdf8 40%, transparent 70%)',
      filter: 'blur(70px)',      // Era blur(120px)
      willChange: 'transform',
      contain: 'paint layout',
    }}
  />
  <div
    aria-hidden
    className="pointer-events-none fixed -bottom-40 left-[25%] h-[500px] w-[500px] rounded-full opacity-15 dark:opacity-[0.05]"
    style={{
      background: 'radial-gradient(circle, #f9a8d4 0%, #fb923c 50%, transparent 70%)',
      filter: 'blur(60px)',      // Era blur(100px)
      willChange: 'transform',
      contain: 'paint layout',
    }}
  />
  {/* 4º blur (150px, o mais custoso): reduzir para 50px ou remover em mobile */}
  <div
    aria-hidden
    className="pointer-events-none fixed top-[20%] left-[50%] -translate-x-1/2 h-[800px] w-[800px] rounded-full opacity-[0.08] dark:opacity-[0.03]"
    style={{
      background: 'radial-gradient(circle, #e9d5ff 0%, transparent 60%)',
      filter: 'blur(50px)',      // Era blur(150px) — 9x mais rápido
      willChange: 'transform',
      contain: 'paint layout',
    }}
  />
</>
```

### Técnica 3: Desabilitar em Dispositivos com GPU Integrada

```css
/* globals.css — adicionar media query */
@media (prefers-reduced-motion: reduce) {
  /* Remove blurs completamente para usuários que pedem menos movimento */
  [aria-hidden][class*="blur"] {
    filter: none !important;
    opacity: 0.05 !important;
  }
}

/* Para GPUs de baixa performance (aproximação via viewport) */
@media (max-device-pixel-ratio: 1) and (max-width: 1366px) {
  [aria-hidden].blur-heavy {
    filter: blur(20px) !important;
    opacity: 0.1 !important;
  }
}
```

**Por que will-change ajuda:**
`will-change: transform` instrui o browser a promover o elemento para uma camada GPU separada antecipadamente. Sem isso, o browser decide dinamicamente quando criar camadas, podendo causar janks. Com a camada estável, o compositor pode reutilizar a textura entre frames sem repintar.

**Por que contain: paint layout ajuda:**
`contain: paint` garante que o conteúdo do elemento não vaze para fora de seu bounding box — o browser não precisa considerar o elemento ao calcular layouts de elementos irmãos. `contain: layout` vai além e isola completamente o elemento do fluxo de layout.

**Impacto estimado:**
- Blur 150px → 50px: redução de ~89% no custo de compositing (quadrático com raio)
- `will-change` + `contain`: elimina repints desnecessários em frames sem mudança
- Remoção completa em mobile: 0 custo de GPU para ~60% dos usuários

---

## 8. Plano de Migração para Server Components

### Princípio de Decisão

Um componente pode ser Server Component se:
- Não usa `useState`, `useEffect`, `useCallback`, `useRef`
- Não usa event listeners
- Não precisa de dados do usuário em tempo real (ou o dado pode ser passado via props)
- Executa apenas no servidor (pode acessar banco diretamente, seguro)

### Partes que Podem Virar Server Components

#### `app/dashboard/metricas/page.tsx` — Arquitetura Híbrida

```
app/dashboard/metricas/
├── page.tsx                    ← Server Component (shell, busca dados iniciais)
├── metricas-shell.tsx          ← Client Component (filtros, estado de UI)
├── metric-cards-server.tsx     ← Server Component (KPIs iniciais)
└── charts-client.tsx           ← Client Component (gráficos interativos)
```

**page.tsx (Server Component — novo):**
```tsx
// app/dashboard/metricas/page.tsx
import { Suspense } from 'react'
import { createServerClient } from '@/lib/supabase/server'
import { MetricasShell } from './metricas-shell'
import { MetricCardsSkeleton } from './metric-cards-skeleton'
import { ChartsSkeleton } from './charts-skeleton'

// Server Component: executa no servidor, sem bundle para o cliente
export default async function MetricasPage() {
  const supabase = createServerClient()

  // Busca dados do colaborador logado (auth já está disponível no servidor)
  const { data: { user } } = await supabase.auth.getUser()
  const { data: colaborador } = await supabase
    .from('colaboradores')
    .select('id, nome, is_master, setor_id')
    .eq('user_id', user!.id)
    .single()

  // Dados iniciais para SSR (sem waterfall de autenticação no cliente)
  const { data: setores } = await supabase
    .from('colaboradores_setores')
    .select('setor_id, setores(id, nome)')
    .eq('colaborador_id', colaborador!.id)

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Métricas</h1>
        <p className="text-muted-foreground">Indicadores de desempenho da operação</p>
      </div>

      {/* Shell Client: recebe dados iniciais do servidor */}
      <Suspense fallback={<MetricCardsSkeleton />}>
        <MetricasShell
          colaboradorId={colaborador!.id}
          isMaster={colaborador!.is_master}
          setoresIniciais={setores ?? []}
        />
      </Suspense>
    </div>
  )
}
```

**MetricasShell (Client Component — mantém estado e interatividade):**
```tsx
// app/dashboard/metricas/metricas-shell.tsx
'use client'

import { useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'

// Recebe dados iniciais do servidor — sem flash de loading na primeira carga
export function MetricasShell({ colaboradorId, isMaster, setoresIniciais }) {
  const supabase = useMemo(() => createClient(), [])
  const [dateFilter, setDateFilter] = useState('30')
  // ... resto do estado de UI ...

  // Apenas queries reativas (mudança de filtros) — dados iniciais já vieram do servidor
}
```

#### `app/dashboard/page.tsx` — Dashboard de Setores

```
app/dashboard/
├── page.tsx          ← Server Component (lista de setores — dados estáticos)
└── setores-grid.tsx  ← Client Component (animações, navegação)
```

A lista de setores raramente muda durante a sessão. Pode ser buscada no servidor e enviada como props ao componente cliente que gerencia animações e navegação.

### Suspense Streaming Progressivo

```tsx
// app/dashboard/metricas/page.tsx (Server Component completo)
import { Suspense } from 'react'

export default async function MetricasPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader />

      {/* KPIs: aparecem primeiro (query rápida no servidor) */}
      <Suspense fallback={<MetricCardsSkeleton />}>
        <MetricCardsServer />
      </Suspense>

      {/* Gráficos: aparecem depois, de forma não-bloqueante */}
      <Suspense fallback={<ChartsSkeleton />}>
        <ChartsSection />
      </Suspense>
    </div>
  )
}

// Cada seção é um Server Component assíncrono
async function MetricCardsServer() {
  const data = await fetchMetricsFromDB() // Direto no Postgres, sem HTTP
  return <MetricCards data={data} />
}

async function ChartsSection() {
  const [bySetor, byColaborador, dailyVolume] = await Promise.all([
    fetchTicketsBySetor(),
    fetchTicketsByColaborador(),
    fetchDailyVolume(),
  ])
  return <ChartsClient bySetor={bySetor} byColaborador={byColaborador} dailyVolume={dailyVolume} />
}
```

**Vantagem do Streaming:** O browser renderiza os KPIs assim que chegam (100–200 ms), enquanto os gráficos ainda carregam. O usuário vê dados úteis imediatamente em vez de uma tela em branco por 10–30 s.

### O que DEVE Permanecer Client Component

- Qualquer componente com `useState`, `useEffect`, `useRef`
- Filtros e selects interativos (DatePeriodFilter, SetorFilter)
- Gráficos Recharts (browser APIs para dimensionamento)
- `TicketTimer` (precisa de `setInterval`)
- Tabelas com paginação local
- Framer Motion animations

---

## 9. Checklist de Medição

### Ferramentas e Metodologia

#### Antes de Qualquer Otimização — Capturar Baseline

```bash
# 1. Chrome DevTools — Performance tab
# Gravar carregamento de /dashboard/metricas:
# - Abrir DevTools (F12) > Performance > Start profiling and reload page
# - Anotar: LCP, TTFB, Total Blocking Time, main thread activity

# 2. Chrome DevTools — Network tab
# - Desabilitar cache (checkbox "Disable cache")
# - Selecionar throttling "Slow 3G" para simular usuário médio
# - Anotar: número de requests, total transferred, DOMContentLoaded, Load

# 3. Supabase Dashboard
# Database > Query Performance
# Anotar as 10 queries mais lentas (tempo médio, chamadas/min)
```

#### Métricas por Página — Metas

| Página | Métrica | Baseline Estimado | Meta Pós-Otimização |
|--------|---------|-------------------|---------------------|
| `/dashboard/metricas` | LCP | 10–30 s | < 2 s |
| `/dashboard/metricas` | TTFB | 500 ms–2 s | < 200 ms |
| `/dashboard/metricas` | Requests de dados | 5–7 sequenciais | 7 paralelos |
| `/dashboard/metricas` | Dados transferidos | 5–125 MB | < 50 KB |
| `/dashboard/monitoramento` | Re-renders/min | 60 (setInterval) | < 12 (SWR refresh) |
| `/dashboard/monitoramento` | CPU uso médio | 3–8% | < 0.5% |
| `/dashboard/monitoramento` | Requests/min | 12 (SWR 5s × 6 queries) | 0 (Realtime) ou 2 (SWR 30s) |
| `/dashboard` | LCP | 2–4 s | < 1 s |
| Todas as páginas | GPU Layer Count | 8–12 layers (blurs) | 2–4 layers |
| Todas as páginas | JS Bundle (metricas) | +200 KB (Recharts) | -150 KB (lazy load) |

#### Como Medir Cada Otimização Específica

**1. createClient() com useMemo:**
```javascript
// DevTools Console — antes e depois
// Monitorar instâncias do cliente:
let clientCount = 0
const origCreate = window.__supabaseCreateClient
window.__supabaseCreateClient = (...args) => {
  clientCount++
  console.log(`Supabase client #${clientCount} created`)
  return origCreate(...args)
}
// Navegar para a página e interagir — contar instâncias
```

**2. setInterval isolado (TicketTimer):**
```javascript
// DevTools Performance — React Profiler
// Instalar React DevTools extension
// Profiler > Record > interagir na página > Stop
// Filtrar por "MonitoramentoPage" — contar renders em 10 segundos
// Meta: de 10 renders/10s para ≤ 2 renders/10s
```

**3. Queries RPC vs Queries brutas:**
```sql
-- Supabase SQL Editor — medir antes
EXPLAIN ANALYZE
SELECT criado_em, primeira_resposta_em
FROM tickets
WHERE status = 'encerrado'
  AND setor_id = ANY(ARRAY['uuid1', 'uuid2'])
  AND criado_em >= NOW() - INTERVAL '30 days'
LIMIT 50000;
-- Anotar: "Planning Time" e "Execution Time"

-- Depois de criar a função:
EXPLAIN ANALYZE
SELECT * FROM get_avg_first_response(
  ARRAY['uuid1', 'uuid2']::UUID[],
  NOW() - INTERVAL '30 days',
  NOW()
);
-- Comparar execution time e rows
```

**4. Blurs CSS:**
```javascript
// Chrome DevTools — Rendering tab
// More tools > Rendering > Paint flashing (ativar)
// Navegar no dashboard — áreas piscando em vermelho = repaint
// Meta: nenhum repaint nas áreas de blur durante scroll/animação

// Layers panel (DevTools > Layers)
// Antes: verificar número de layers com blur aplicado
// Depois: cada elemento com will-change deve ter sua própria layer estável
```

**5. Bundle Recharts (lazy loading):**
```bash
# Analisar bundle antes/depois com @next/bundle-analyzer
npm install -D @next/bundle-analyzer

# next.config.ts
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
})
module.exports = withBundleAnalyzer({})

# Executar:
ANALYZE=true npm run build
# Abrir o relatório e verificar tamanho do chunk de metricas/page
# Meta: chunk principal < 100 KB (Recharts em chunk separado > 150 KB)
```

#### Supabase Query Performance Dashboard

```
Acessar: https://supabase.com/dashboard/project/[ID]/database/query-performance

Métricas a acompanhar:
- "Slowest queries by mean time" — as 5 queries de métricas devem sair da lista
- "Most frequent queries" — verificar que queries count/head não dominam
- "Cache hit ratio" — meta > 99% (queries RPC reutilizam planos)

Após criar as funções RPC:
- Verificar que get_avg_first_response, get_avg_resolution etc. aparecem
- Comparar "mean execution time" vs queries anteriores
- Meta: < 50 ms por função RPC (vs 200–2000 ms nas queries de rows brutas)
```

---

## Roadmap de Implementação

### Fase 1 — Quick Wins (Esta semana, 0–2 horas total)

| Tarefa | Arquivo | Estimativa |
|--------|---------|-----------|
| `useMemo` no createClient | metricas/page.tsx:64, dashboard/page.tsx:161 | 5 min |
| Mover SetorCard para fora do pai | dashboard/page.tsx:328–446 | 20 min |
| Extrair TicketTimer + remover setInterval | monitoramento/page.tsx + novo componente | 30 min |
| Mover containerVariants/itemVariants | metricas/page.tsx:355–368 | 5 min |
| sortedTicketsBySetor via useMemo | metricas/page.tsx (JSX BarChart) | 5 min |
| Reduzir blur CSS de 100–150px para 40–70px | dashboard-shell.tsx:22–40 | 15 min |

**Impacto da Fase 1:**
- CPU monitoramento: redução de ~95% nos re-renders por minuto
- Instâncias Supabase: eliminação de duplicatas
- GPU: redução de ~60–80% no custo de compositing

### Fase 2 — Queries Otimizadas (Esta semana ou próxima, 2–4 horas)

| Tarefa | Onde | Estimativa |
|--------|------|-----------|
| Criar 5 funções RPC no Supabase | SQL Editor do Supabase | 1 h |
| Criar índices compostos | SQL Editor do Supabase | 15 min |
| Refatorar fetchMetrics para Promise.all com rpc() | metricas/page.tsx:148–329 | 1 h |
| Adicionar LIMIT + campos mínimos na query do monitoramento | monitoramento/page.tsx:186–191 | 15 min |

**Impacto da Fase 2:**
- Dados transferidos na página de métricas: redução de 99%+ (de MB para KB)
- Tempo de carregamento: de 10–30 s para < 1 s
- Carga no Supabase: redução proporcional ao volume de tickets

### Fase 3 — Lazy Loading e Realtime (Próxima semana, 3–5 horas)

| Tarefa | Onde | Estimativa |
|--------|------|-----------|
| Extrair componentes de gráfico | components/charts/ | 1 h |
| Implementar next/dynamic com skeletons | metricas/page.tsx | 30 min |
| Implementar useMonitoramentoRealtime | monitoramento/page.tsx | 2 h |
| Ajustar SWR para refreshInterval: 30000 como fallback | monitoramento/page.tsx:314 | 5 min |

### Fase 4 — Server Components (Médio prazo, 1–2 semanas)

| Tarefa | Onde | Estimativa |
|--------|------|-----------|
| Criar createServerClient helper | lib/supabase/server.ts | 30 min |
| Migrar metricas/page.tsx para Server Component | app/dashboard/metricas/ | 1 dia |
| Implementar Suspense streaming | metricas/page.tsx | 2 h |
| Migrar dashboard/page.tsx (lista de setores) | app/dashboard/ | 4 h |

---

## Resumo de Impacto Esperado

| Métrica | Antes | Depois (Fases 1+2) | Depois (Fases 1+2+3+4) |
|---------|-------|-------------------|----------------------|
| Carregamento métricas (5k tickets) | 10–30 s | 0.5–1 s | < 300 ms (SSR) |
| Dados transferidos (métricas) | 5–125 MB | < 50 KB | < 20 KB |
| Re-renders/min (monitoramento) | 60 | 0 (TicketTimer isolado) | 0 |
| CPU média (monitoramento aberto) | 3–8% | < 0.5% | < 0.2% |
| Requests Supabase/min (monitoramento) | 12 | 2 (fallback SWR 30s) | 0 (Realtime) |
| GPU layers (blurs) | 8–12 | 4–6 | 2–4 (ou 1 imagem) |
| Bundle inicial (metricas) | +200 KB | +200 KB | +30 KB (Recharts lazy) |
