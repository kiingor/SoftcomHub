'use client'

import { useEffect, useState } from 'react'
import { Plus, Copy, Trash2, Settings, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

interface Widget {
  id: string
  api_key: string
  nome: string
  descricao?: string
  allowed_domains: string[]
  max_queue_size?: number
  created_at: string
}

interface MappedSetor {
  id: string
  setor_id: string
  setores: { id: string; nome: string }
  display_order: number
  setor_transbordo_id?: string
  transbordo?: { id: string; nome: string }
}

export default function WidgetsPage() {
  const [widgets, setWidgets] = useState<Widget[]>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [selectedWidget, setSelectedWidget] = useState<string | null>(null)
  const [expandedWidget, setExpandedWidget] = useState<string | null>(null)
  const [mappedSetores, setMappedSetores] = useState<MappedSetor[]>([])
  const [availableSetores, setAvailableSetores] = useState<any[]>([])

  // Basic Auth do painel. A credencial é digitada em runtime e guardada só na
  // sessão do navegador — nunca vai pro bundle/código-fonte.
  const [painelAuth, setPainelAuth] = useState<string | null>(null)
  const [authReady, setAuthReady] = useState(false)

  useEffect(() => {
    const saved = sessionStorage.getItem('painel_auth')
    if (saved) setPainelAuth(saved)
    setAuthReady(true)
  }, [])

  // fetch que injeta o header de auth e força novo login em 401.
  const authedFetch = async (url: string, opts: RequestInit = {}) => {
    const res = await fetch(url, {
      ...opts,
      headers: { ...(opts.headers || {}), Authorization: painelAuth || '' },
    })
    if (res.status === 401) {
      sessionStorage.removeItem('painel_auth')
      setPainelAuth(null)
      throw new Error('Sessão expirada — faça login novamente')
    }
    return res
  }

  // Carrega widgets quando autenticado
  useEffect(() => {
    if (painelAuth) fetchWidgets()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [painelAuth])

  const handleLogin = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const user = String(form.get('user') || '')
    const pass = String(form.get('pass') || '')
    const header = 'Basic ' + btoa(`${user}:${pass}`)
    sessionStorage.setItem('painel_auth', header)
    setPainelAuth(header)
  }

  const fetchWidgets = async () => {
    try {
      const res = await authedFetch('/api/painel/widgets')
      const data = await res.json()
      setWidgets(data.widgets || [])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao carregar widgets')
    } finally {
      setLoading(false)
    }
  }

  // Carrega setores do widget selecionado
  const fetchWidgetSetores = async (widgetId: string) => {
    try {
      const res = await authedFetch(`/api/painel/widgets/${widgetId}/sectors`)
      const data = await res.json()
      setMappedSetores(data.mapped || [])
      setAvailableSetores(data.available || [])
    } catch (error) {
      toast.error('Erro ao carregar setores')
    }
  }

  const handleCreateWidget = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)

    try {
      const res = await authedFetch('/api/painel/widgets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: formData.get('nome'),
          descricao: formData.get('descricao'),
          allowed_domains: (formData.get('allowed_domains') as string)
            .split(',')
            .map((d) => d.trim())
            .filter(Boolean),
          max_queue_size: formData.get('max_queue_size')
            ? parseInt(formData.get('max_queue_size') as string)
            : null,
        }),
      })

      if (!res.ok) throw new Error('Erro ao criar widget')

      const data = await res.json()
      setWidgets([data.widget, ...widgets])
      setCreateOpen(false)
      toast.success('Widget criado com sucesso!')
      ;(e.target as HTMLFormElement).reset()
    } catch (error) {
      toast.error('Erro ao criar widget')
    }
  }

  const handleAddSetor = async (widgetId: string, setorId: string) => {
    try {
      const res = await authedFetch(`/api/painel/widgets/${widgetId}/sectors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ setor_id: setorId }),
      })

      if (!res.ok) throw new Error('Erro ao adicionar setor')

      await fetchWidgetSetores(widgetId)
      toast.success('Setor adicionado!')
    } catch (error) {
      toast.error('Erro ao adicionar setor')
    }
  }

  const handleRemoveSetor = async (widgetId: string, mappingId: string) => {
    try {
      const res = await authedFetch(`/api/painel/widgets/${widgetId}/sectors/${mappingId}`, {
        method: 'DELETE',
      })

      if (!res.ok) throw new Error('Erro ao remover setor')

      await fetchWidgetSetores(widgetId)
      toast.success('Setor removido!')
    } catch (error) {
      toast.error('Erro ao remover setor')
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    toast.success('Copiado para a área de transferência!')
  }

  const getEmbedCode = (apiKey: string) => {
    return `<div id="softcom-widget"></div>
<script src="https://seu-dominio.com/embed-widget.js?key=${apiKey}"></script>`
  }

  // Gate de login: enquanto não autenticar, só mostra o formulário.
  if (authReady && !painelAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <form
          onSubmit={handleLogin}
          className="w-full max-w-sm border rounded-lg p-6 space-y-4"
        >
          <div>
            <h1 className="text-lg font-semibold">Painel — Acesso restrito</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Entre com as credenciais do painel para gerenciar widgets.
            </p>
          </div>
          <input
            name="user"
            placeholder="Usuário"
            autoComplete="username"
            className="w-full px-3 py-2 border rounded-lg text-sm"
          />
          <input
            name="pass"
            type="password"
            placeholder="Senha"
            autoComplete="current-password"
            className="w-full px-3 py-2 border rounded-lg text-sm"
          />
          <Button type="submit" className="w-full">
            Entrar
          </Button>
        </form>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Widgets de Chat</h1>
        <Button onClick={() => setCreateOpen(!createOpen)} className="gap-2">
          <Plus className="h-4 w-4" />
          Novo Widget
        </Button>
      </div>

      {/* Form Criar Widget */}
      {createOpen && (
        <form
          onSubmit={handleCreateWidget}
          className="mb-6 p-4 border rounded-lg bg-gray-50 space-y-4"
        >
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Nome</label>
              <input
                name="nome"
                required
                placeholder="Ex: Widget Suporte"
                className="w-full px-3 py-2 border rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Descrição</label>
              <input
                name="descricao"
                placeholder="Ex: Chat para suporte técnico"
                className="w-full px-3 py-2 border rounded-lg text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Domínios Permitidos (separados por vírgula)
            </label>
            <input
              name="allowed_domains"
              placeholder="Ex: seu-site.com, www.seu-site.com, localhost:3000"
              className="w-full px-3 py-2 border rounded-lg text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Limite de Fila (opcional)</label>
            <input
              name="max_queue_size"
              type="number"
              placeholder="Ex: 50"
              className="w-full px-3 py-2 border rounded-lg text-sm"
            />
          </div>

          <div className="flex gap-2">
            <Button type="submit">Criar Widget</Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setCreateOpen(false)}
            >
              Cancelar
            </Button>
          </div>
        </form>
      )}

      {/* Lista de Widgets */}
      <div className="space-y-4">
        {loading ? (
          <p className="text-center text-muted-foreground">Carregando...</p>
        ) : widgets.length === 0 ? (
          <p className="text-center text-muted-foreground">Nenhum widget criado ainda</p>
        ) : (
          widgets.map((widget) => (
            <div key={widget.id} className="border rounded-lg overflow-hidden">
              {/* Header */}
              <button
                onClick={() => {
                  setExpandedWidget(
                    expandedWidget === widget.id ? null : widget.id,
                  )
                  if (expandedWidget !== widget.id) {
                    fetchWidgetSetores(widget.id)
                    setSelectedWidget(widget.id)
                  }
                }}
                className="w-full p-4 bg-white hover:bg-gray-50 flex items-center justify-between"
              >
                <div className="text-left">
                  <h3 className="font-semibold">{widget.nome}</h3>
                  <p className="text-xs text-muted-foreground">
                    {widget.descricao || 'Sem descrição'}
                  </p>
                </div>
                <ChevronDown
                  className={`h-5 w-5 transition-transform ${
                    expandedWidget === widget.id ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {/* Expanded Content */}
              {expandedWidget === widget.id && (
                <div className="p-4 border-t bg-gray-50 space-y-4">
                  {/* API Key */}
                  <div>
                    <p className="text-sm font-medium mb-2">API Key</p>
                    <div className="flex items-center gap-2 bg-white p-2 rounded border font-mono text-xs">
                      <code className="flex-1 truncate">{widget.api_key}</code>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => copyToClipboard(widget.api_key)}
                        className="h-8 w-8"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Embed Code */}
                  <div>
                    <p className="text-sm font-medium mb-2">Código de Embed</p>
                    <div className="flex items-start gap-2 bg-white p-2 rounded border">
                      <pre className="flex-1 text-xs overflow-x-auto">
                        {getEmbedCode(widget.api_key)}
                      </pre>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => copyToClipboard(getEmbedCode(widget.api_key))}
                        className="h-8 w-8 shrink-0"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Setores */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-medium">Setores</p>
                      <select
                        onChange={(e) => {
                          if (e.target.value) {
                            handleAddSetor(widget.id, e.target.value)
                            e.target.value = ''
                          }
                        }}
                        className="text-xs px-2 py-1 border rounded"
                        disabled={availableSetores.length === 0}
                      >
                        <option value="">+ Adicionar setor</option>
                        {availableSetores.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.nome}
                          </option>
                        ))}
                      </select>
                    </div>

                    {mappedSetores.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        Nenhum setor configurado
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {mappedSetores.map((mapping) => (
                          <li
                            key={mapping.id}
                            className="flex items-center justify-between bg-white p-2 rounded text-sm"
                          >
                            <span>
                              {mapping.setores.nome}
                              {mapping.transbordo && (
                                <span className="text-xs text-muted-foreground ml-2">
                                  → {mapping.transbordo.nome}
                                </span>
                              )}
                            </span>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() =>
                                handleRemoveSetor(widget.id, mapping.id)
                              }
                              className="h-6 w-6"
                            >
                              <Trash2 className="h-3 w-3 text-red-600" />
                            </Button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {/* Metadata */}
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p>
                      Domínios:{' '}
                      {widget.allowed_domains?.join(', ') || 'Nenhum'}
                    </p>
                    {widget.max_queue_size && (
                      <p>Limite de fila: {widget.max_queue_size} tickets</p>
                    )}
                    <p>
                      Criado em:{' '}
                      {new Date(widget.created_at).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
