'use client'

import { useState } from 'react'
import { ChevronRight, Copy, Check, Lock, Server, Users, BarChart3, Ticket, Menu, X } from 'lucide-react'

const BASE_URL = 'https://www.softcomhub.com'

const NAV_ITEMS = [
  { id: 'auth', label: 'Autenticação', icon: Lock },
  { id: 'setores', label: 'Setores', icon: Server },
  { id: 'atendentes', label: 'Atendentes', icon: Users },
  { id: 'produtividade', label: 'Produtividade', icon: BarChart3 },
  { id: 'tickets', label: 'Tickets', icon: Ticket },
]

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }}
      className="absolute top-3 right-3 p-1.5 rounded-md bg-white/5 hover:bg-white/10 transition-colors text-gray-400 hover:text-gray-200"
      title="Copiar"
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
    </button>
  )
}

function CodeBlock({ children, lang = 'bash' }: { children: string; lang?: string }) {
  return (
    <div className="relative group rounded-lg bg-[#1a1d27] border border-white/5 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/5 bg-white/[0.02]">
        <span className="text-xs text-gray-500 uppercase tracking-wider">{lang}</span>
        <CopyButton text={children.trim()} />
      </div>
      <pre className="p-4 overflow-x-auto text-[13px] leading-relaxed font-mono">
        <code className="text-gray-300 font-mono">{children.trim()}</code>
      </pre>
    </div>
  )
}

function Badge({ method = 'GET' }: { method?: string }) {
  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
      {method}
    </span>
  )
}

function ParamTable({ params }: { params: { name: string; type: string; required: boolean; description: string }[] }) {
  return (
    <div className="rounded-lg border border-white/5 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-white/[0.03] border-b border-white/5">
            <th className="text-left px-4 py-2.5 text-gray-400 font-medium">Parâmetro</th>
            <th className="text-left px-4 py-2.5 text-gray-400 font-medium">Tipo</th>
            <th className="text-left px-4 py-2.5 text-gray-400 font-medium">Obrigatório</th>
            <th className="text-left px-4 py-2.5 text-gray-400 font-medium">Descrição</th>
          </tr>
        </thead>
        <tbody>
          {params.map((p) => (
            <tr key={p.name} className="border-b border-white/5 last:border-0">
              <td className="px-4 py-2.5">
                <code className="text-violet-400 text-xs bg-violet-500/10 px-1.5 py-0.5 rounded">{p.name}</code>
              </td>
              <td className="px-4 py-2.5 text-gray-400 text-xs">{p.type}</td>
              <td className="px-4 py-2.5">
                {p.required ? (
                  <span className="text-amber-400 text-xs">Sim</span>
                ) : (
                  <span className="text-gray-500 text-xs">Não</span>
                )}
              </td>
              <td className="px-4 py-2.5 text-gray-300 text-xs">{p.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ResponseField({ fields }: { fields: { name: string; type: string; description: string }[] }) {
  return (
    <div className="rounded-lg border border-white/5 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-white/[0.03] border-b border-white/5">
            <th className="text-left px-4 py-2.5 text-gray-400 font-medium">Campo</th>
            <th className="text-left px-4 py-2.5 text-gray-400 font-medium">Tipo</th>
            <th className="text-left px-4 py-2.5 text-gray-400 font-medium">Descrição</th>
          </tr>
        </thead>
        <tbody>
          {fields.map((f) => (
            <tr key={f.name} className="border-b border-white/5 last:border-0">
              <td className="px-4 py-2.5">
                <code className="text-emerald-400 text-xs bg-emerald-500/10 px-1.5 py-0.5 rounded">{f.name}</code>
              </td>
              <td className="px-4 py-2.5 text-gray-400 text-xs">{f.type}</td>
              <td className="px-4 py-2.5 text-gray-300 text-xs">{f.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20">
      <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
        <ChevronRight size={20} className="text-violet-400" />
        {title}
      </h2>
      <div className="space-y-6">{children}</div>
    </section>
  )
}

export default function DocPage() {
  const [mobileNav, setMobileNav] = useState(false)

  return (
    <div className="flex">
      {/* Sidebar */}
      <aside className="hidden lg:flex flex-col w-64 fixed top-0 left-0 h-screen border-r border-white/5 bg-[#0b0d13]">
        <div className="p-6 border-b border-white/5">
          <h1 className="text-lg font-bold text-white">SoftcomHub</h1>
          <p className="text-xs text-gray-500 mt-1">API Documentation v1.0</p>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {NAV_ITEMS.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
            >
              <item.icon size={16} />
              {item.label}
            </a>
          ))}
        </nav>
        <div className="p-4 border-t border-white/5">
          <p className="text-xs text-gray-600">Base URL</p>
          <code className="text-xs text-violet-400 break-all">{BASE_URL}</code>
        </div>
      </aside>

      {/* Mobile nav toggle */}
      <button
        onClick={() => setMobileNav(!mobileNav)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 rounded-lg bg-[#1a1d27] border border-white/10 text-gray-400"
      >
        {mobileNav ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Mobile nav overlay */}
      {mobileNav && (
        <div className="lg:hidden fixed inset-0 z-40 bg-black/60" onClick={() => setMobileNav(false)}>
          <aside className="w-64 h-full bg-[#0b0d13] border-r border-white/5 p-6" onClick={(e) => e.stopPropagation()}>
            <h1 className="text-lg font-bold text-white mb-1">SoftcomHub</h1>
            <p className="text-xs text-gray-500 mb-6">API Documentation v1.0</p>
            <nav className="space-y-1">
              {NAV_ITEMS.map((item) => (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  onClick={() => setMobileNav(false)}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
                >
                  <item.icon size={16} />
                  {item.label}
                </a>
              ))}
            </nav>
          </aside>
        </div>
      )}

      {/* Main content */}
      <main className="flex-1 lg:ml-64 px-6 py-12 lg:px-16 max-w-4xl mx-auto space-y-16">
        {/* Header */}
        <div>
          <h1 className="text-4xl font-bold text-white mb-3">API do Painel de Atendimentos</h1>
          <p className="text-gray-400 text-lg leading-relaxed">
            Endpoints para integração com o painel de atendimentos da plataforma SoftcomHub.
            Todos os endpoints retornam JSON e requerem autenticação via HTTP Basic Auth.
          </p>
          <div className="mt-6 flex items-center gap-3 text-sm">
            <span className="px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs">
              Produção
            </span>
            <code className="text-gray-400 text-xs">{BASE_URL}/api/painel</code>
          </div>
        </div>

        {/* Autenticação */}
        <Section id="auth" title="Autenticação">
          <p className="text-gray-400 leading-relaxed">
            Todos os endpoints utilizam <strong className="text-white">HTTP Basic Authentication</strong>.
            Inclua o header <code className="text-violet-400 bg-violet-500/10 px-1.5 py-0.5 rounded text-sm">Authorization</code> em
            todas as requisições com suas credenciais codificadas em Base64.
          </p>

          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
            <p className="text-amber-400 text-sm font-medium mb-1">Importante</p>
            <p className="text-gray-400 text-sm">
              Requisições sem autenticação ou com credenciais inválidas retornam <code className="text-white">401 Unauthorized</code>.
            </p>
          </div>

          <h3 className="text-lg font-semibold text-white mt-4">Formato da requisição (cURL)</h3>
          <p className="text-gray-400 text-sm mb-3">
            Todas as requisições seguem este formato. O header <code className="text-violet-400 bg-violet-500/10 px-1 py-0.5 rounded text-xs">Authorization</code> deve
            conter <code className="text-violet-400 bg-violet-500/10 px-1 py-0.5 rounded text-xs">Basic</code> seguido das credenciais em Base64 (<code className="text-violet-400 bg-violet-500/10 px-1 py-0.5 rounded text-xs">usuario:senha</code>).
          </p>
          <CodeBlock lang="bash">{`curl --request GET \\
  --url "${BASE_URL}/api/painel/setores" \\
  --header "Content-Type: application/json" \\
  --header "Authorization: Basic $(echo -n 'usuario:senha' | base64)"`}</CodeBlock>

        </Section>

        {/* GET Setores */}
        <Section id="setores" title="Setores">
          <div className="flex items-center gap-3 mb-4">
            <Badge />
            <code className="text-gray-300 text-sm">/api/painel/setores</code>
          </div>
          <p className="text-gray-400">Retorna a lista de todos os setores cadastrados na plataforma.</p>

          <h3 className="text-lg font-semibold text-white mt-4">Parâmetros</h3>
          <p className="text-gray-500 text-sm italic">Nenhum parâmetro necessário.</p>

          <h3 className="text-lg font-semibold text-white mt-4">Campos da resposta</h3>
          <ResponseField
            fields={[
              { name: 'id', type: 'UUID', description: 'Identificador único do setor' },
              { name: 'nome', type: 'string', description: 'Nome do setor' },
              { name: 'descricao', type: 'string | null', description: 'Descrição do setor' },
              { name: 'created_at', type: 'ISO 8601', description: 'Data de criação' },
            ]}
          />

          <h3 className="text-lg font-semibold text-white mt-4">Exemplo de resposta</h3>
          <CodeBlock lang="json">{`{
  "setores": [
    {
      "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "nome": "Suporte Técnico",
      "descricao": "Atendimento de suporte ao cliente",
      "created_at": "2025-01-15T10:30:00.000Z"
    }
  ]
}`}</CodeBlock>

          <h3 className="text-lg font-semibold text-white mt-4">Exemplo cURL</h3>
          <CodeBlock lang="bash">{`curl --request GET \\
  --url "${BASE_URL}/api/painel/setores" \\
  --header "Content-Type: application/json" \\
  --header "Authorization: Basic $(echo -n 'usuario:senha' | base64)"`}</CodeBlock>
        </Section>

        {/* GET Atendentes */}
        <Section id="atendentes" title="Atendentes">
          <div className="flex items-center gap-3 mb-4">
            <Badge />
            <code className="text-gray-300 text-sm">/api/painel/atendentes</code>
          </div>
          <p className="text-gray-400">
            Retorna a lista de atendentes com métricas de atendimento. Permite filtrar por setor e período
            para cálculo de tickets abertos, fechados e tempos médios.
          </p>

          <h3 className="text-lg font-semibold text-white mt-4">Parâmetros (query string)</h3>
          <ParamTable
            params={[
              { name: 'setor_id', type: 'UUID', required: false, description: 'Filtra atendentes vinculados a este setor' },
              { name: 'date_from', type: 'ISO 8601', required: false, description: 'Início do período para métricas de tickets (default: início do dia atual)' },
              { name: 'date_to', type: 'ISO 8601', required: false, description: 'Fim do período para métricas de tickets (default: agora)' },
            ]}
          />

          <h3 className="text-lg font-semibold text-white mt-4">Campos da resposta</h3>
          <ResponseField
            fields={[
              { name: 'identity', type: 'UUID', description: 'Identificador único do atendente' },
              { name: 'full_name', type: 'string', description: 'Nome completo do atendente' },
              { name: 'email', type: 'string', description: 'E-mail do atendente' },
              { name: 'status', type: 'string', description: 'Status atual: "Online", "Pausa" ou "Offline"' },
              { name: 'is_enabled', type: 'boolean', description: 'Se o atendente está ativo no sistema' },
              { name: 'team', type: 'array', description: 'Lista de setores vinculados (objetos com id e nome)' },
              { name: 'current_status_at', type: 'ISO 8601 | null', description: 'Data/hora da última atualização de status' },
              { name: 'synced_at', type: 'ISO 8601 | null', description: 'Data/hora do último heartbeat/sincronização' },
              { name: 'opened_tickets', type: 'number', description: 'Tickets abertos no período' },
              { name: 'closed_tickets', type: 'number', description: 'Tickets fechados no período' },
              { name: 'break_reason', type: 'string | null', description: 'Motivo da pausa atual (ex: "Almoço")' },
              { name: 'break_duration_seconds', type: 'number | null', description: 'Duração da pausa atual em segundos' },
              { name: 'avg_attendance_time_seconds', type: 'number | null', description: 'Tempo médio de atendimento (TMA) em segundos' },
              { name: 'avg_response_time_seconds', type: 'number | null', description: 'Tempo médio de resposta (TMR) em segundos' },
              { name: 'tickets_count', type: 'number', description: 'Total de tickets no período' },
            ]}
          />

          <h3 className="text-lg font-semibold text-white mt-4">Exemplo de resposta</h3>
          <CodeBlock lang="json">{`{
  "atendentes": [
    {
      "identity": "f1e2d3c4-b5a6-7890-abcd-ef1234567890",
      "full_name": "João Silva",
      "email": "joao@empresa.com",
      "status": "Online",
      "is_enabled": true,
      "team": [
        { "id": "a1b2c3d4-...", "nome": "Suporte Técnico" }
      ],
      "current_status_at": "2025-03-27T14:30:00.000Z",
      "synced_at": "2025-03-27T14:30:00.000Z",
      "opened_tickets": 3,
      "closed_tickets": 12,
      "break_reason": null,
      "break_duration_seconds": null,
      "avg_attendance_time_seconds": 1800,
      "avg_response_time_seconds": 120,
      "tickets_count": 15
    }
  ]
}`}</CodeBlock>

          <h3 className="text-lg font-semibold text-white mt-4">Exemplo cURL</h3>
          <CodeBlock lang="bash">{`# Todos os atendentes
curl --request GET \\
  --url "${BASE_URL}/api/painel/atendentes" \\
  --header "Content-Type: application/json" \\
  --header "Authorization: Basic $(echo -n 'usuario:senha' | base64)"

# Filtrar por setor e período
curl --request GET \\
  --url "${BASE_URL}/api/painel/atendentes?setor_id=UUID&date_from=2025-03-01T00:00:00Z&date_to=2025-03-31T23:59:59Z" \\
  --header "Content-Type: application/json" \\
  --header "Authorization: Basic $(echo -n 'usuario:senha' | base64)"`}</CodeBlock>
        </Section>

        {/* GET Produtividade */}
        <Section id="produtividade" title="Atendentes - Produtividade">
          <div className="flex items-center gap-3 mb-4">
            <Badge />
            <code className="text-gray-300 text-sm">/api/painel/atendentes/produtividade</code>
          </div>
          <p className="text-gray-400">
            Retorna dados de produtividade dos atendentes para uma data específica,
            incluindo tempo de login, tempo online, pausas e tempo offline.
          </p>

          <h3 className="text-lg font-semibold text-white mt-4">Parâmetros (query string)</h3>
          <ParamTable
            params={[
              { name: 'setor_id', type: 'UUID', required: false, description: 'Filtra atendentes vinculados a este setor' },
              { name: 'date', type: 'YYYY-MM-DD', required: false, description: 'Data de referência (default: hoje)' },
            ]}
          />

          <h3 className="text-lg font-semibold text-white mt-4">Campos da resposta</h3>
          <ResponseField
            fields={[
              { name: 'identity', type: 'UUID', description: 'Identificador único do atendente' },
              { name: 'full_name', type: 'string', description: 'Nome completo do atendente' },
              { name: 'email', type: 'string', description: 'E-mail do atendente' },
              { name: 'date', type: 'YYYY-MM-DD', description: 'Data de referência dos dados' },
              { name: 'login_minutes', type: 'number', description: 'Minutos totais logado (online + pausa)' },
              { name: 'online_minutes', type: 'number', description: 'Minutos com status "Online" (descontando pausas)' },
              { name: 'paused_minutes', type: 'number', description: 'Minutos em pausa' },
              { name: 'offline_minutes', type: 'number', description: 'Minutos offline no dia' },
              { name: 'current_status_at', type: 'ISO 8601 | null', description: 'Data/hora da última atualização de status' },
            ]}
          />

          <h3 className="text-lg font-semibold text-white mt-4">Exemplo de resposta</h3>
          <CodeBlock lang="json">{`{
  "produtividade": [
    {
      "identity": "f1e2d3c4-b5a6-7890-abcd-ef1234567890",
      "full_name": "João Silva",
      "email": "joao@empresa.com",
      "date": "2025-03-27",
      "login_minutes": 420,
      "online_minutes": 360,
      "paused_minutes": 60,
      "offline_minutes": 540,
      "current_status_at": "2025-03-27T14:30:00.000Z"
    }
  ]
}`}</CodeBlock>

          <h3 className="text-lg font-semibold text-white mt-4">Exemplo cURL</h3>
          <CodeBlock lang="bash">{`# Produtividade de hoje
curl --request GET \\
  --url "${BASE_URL}/api/painel/atendentes/produtividade" \\
  --header "Content-Type: application/json" \\
  --header "Authorization: Basic $(echo -n 'usuario:senha' | base64)"

# Produtividade de uma data específica, filtrada por setor
curl --request GET \\
  --url "${BASE_URL}/api/painel/atendentes/produtividade?date=2025-03-15&setor_id=UUID" \\
  --header "Content-Type: application/json" \\
  --header "Authorization: Basic $(echo -n 'usuario:senha' | base64)"`}</CodeBlock>
        </Section>

        {/* GET Tickets */}
        <Section id="tickets" title="Tickets">
          <div className="flex items-center gap-3 mb-4">
            <Badge />
            <code className="text-gray-300 text-sm">/api/painel/tickets</code>
          </div>
          <p className="text-gray-400">
            Retorna a lista de tickets com informações do atendente, cliente e setor.
            Suporta paginação e filtros por setor, status e período.
          </p>

          <h3 className="text-lg font-semibold text-white mt-4">Parâmetros (query string)</h3>
          <ParamTable
            params={[
              { name: 'setor_id', type: 'UUID', required: false, description: 'Filtra tickets deste setor' },
              { name: 'status', type: 'string', required: false, description: 'Filtra por status: "aberto", "em_atendimento" ou "encerrado"' },
              { name: 'date_from', type: 'ISO 8601', required: false, description: 'Início do período (filtra por data de abertura)' },
              { name: 'date_to', type: 'ISO 8601', required: false, description: 'Fim do período' },
              { name: 'page', type: 'number', required: false, description: 'Página (default: 1)' },
              { name: 'per_page', type: 'number', required: false, description: 'Itens por página (default: 50, max: 100)' },
            ]}
          />

          <h3 className="text-lg font-semibold text-white mt-4">Campos da resposta</h3>
          <ResponseField
            fields={[
              { name: 'id', type: 'UUID', description: 'Identificador único do ticket' },
              { name: 'ticket', type: 'number', description: 'Número sequencial do ticket' },
              { name: 'status', type: 'string', description: 'Status: "aberto", "em_atendimento" ou "encerrado"' },
              { name: 'team', type: 'object | null', description: 'Setor responsável (id e nome)' },
              { name: 'attendant_identity', type: 'UUID | null', description: 'ID do atendente responsável' },
              { name: 'attendant_name', type: 'string | null', description: 'Nome do atendente' },
              { name: 'customer_identity', type: 'UUID', description: 'ID do cliente' },
              { name: 'requester_name', type: 'string | null', description: 'Nome do cliente/solicitante' },
              { name: 'provider', type: 'string', description: 'Canal de origem (ex: "whatsapp", "discord")' },
              { name: 'open_at', type: 'ISO 8601', description: 'Data/hora de abertura' },
              { name: 'status_at', type: 'ISO 8601', description: 'Data/hora da última mudança de status' },
              { name: 'closed_at', type: 'ISO 8601 | null', description: 'Data/hora de encerramento' },
              { name: 'closed', type: 'boolean', description: 'Se o ticket está encerrado' },
              { name: 'closed_by', type: 'UUID | null', description: 'ID do atendente que encerrou' },
              { name: 'messages', type: 'number', description: 'Quantidade de mensagens no ticket' },
              { name: 'first_response_at', type: 'ISO 8601 | null', description: 'Data/hora da primeira resposta' },
              { name: 'priority', type: 'string', description: 'Prioridade: "normal" ou "urgente"' },
              { name: 'automatic_distribution', type: 'boolean', description: 'Se foi distribuído automaticamente' },
            ]}
          />

          <h3 className="text-lg font-semibold text-white mt-4">Paginação</h3>
          <p className="text-gray-400 text-sm">
            A resposta inclui os campos <code className="text-violet-400 bg-violet-500/10 px-1 py-0.5 rounded text-xs">total</code>,{' '}
            <code className="text-violet-400 bg-violet-500/10 px-1 py-0.5 rounded text-xs">page</code> e{' '}
            <code className="text-violet-400 bg-violet-500/10 px-1 py-0.5 rounded text-xs">per_page</code> para controle de paginação.
          </p>

          <h3 className="text-lg font-semibold text-white mt-4">Exemplo de resposta</h3>
          <CodeBlock lang="json">{`{
  "tickets": [
    {
      "id": "d4e5f6a7-b8c9-0123-def4-567890abcdef",
      "ticket": 1234,
      "status": "em_atendimento",
      "team": { "id": "a1b2c3d4-...", "nome": "Suporte Técnico" },
      "attendant_identity": "f1e2d3c4-...",
      "attendant_name": "João Silva",
      "customer_identity": "c1d2e3f4-...",
      "requester_name": "Maria Souza",
      "provider": "whatsapp",
      "open_at": "2025-03-27T09:15:00.000Z",
      "status_at": "2025-03-27T09:16:30.000Z",
      "closed_at": null,
      "closed": false,
      "closed_by": null,
      "messages": 8,
      "first_response_at": "2025-03-27T09:16:30.000Z",
      "priority": "normal",
      "automatic_distribution": true
    }
  ],
  "total": 156,
  "page": 1,
  "per_page": 50
}`}</CodeBlock>

          <h3 className="text-lg font-semibold text-white mt-4">Exemplo cURL</h3>
          <CodeBlock lang="bash">{`# Tickets abertos de um setor
curl --request GET \\
  --url "${BASE_URL}/api/painel/tickets?setor_id=UUID&status=aberto" \\
  --header "Content-Type: application/json" \\
  --header "Authorization: Basic $(echo -n 'usuario:senha' | base64)"

# Tickets encerrados em março, página 2
curl --request GET \\
  --url "${BASE_URL}/api/painel/tickets?status=encerrado&date_from=2025-03-01T00:00:00Z&date_to=2025-03-31T23:59:59Z&page=2&per_page=25" \\
  --header "Content-Type: application/json" \\
  --header "Authorization: Basic $(echo -n 'usuario:senha' | base64)"`}</CodeBlock>
        </Section>

        {/* Footer */}
        <footer className="border-t border-white/5 pt-8 pb-12 text-center">
          <p className="text-gray-600 text-sm">
            SoftcomHub API v1.0
          </p>
        </footer>
      </main>
    </div>
  )
}
