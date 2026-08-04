'use client'

import { useCallback, useEffect, useState } from 'react'
import { Plus, Copy, ChevronDown, Globe, ArrowRightLeft, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'

interface Widget {
  id: string
  api_key: string
  nome: string
  canal?: string | null
  allowed_domains: string[]
  created_at: string
}

interface RoutingOption {
  tipo: string
  label: string
  destino_nome: string | null
}

/**
 * Gestão do widget de chat dentro do setor. As opções que o cliente vê são
 * espelhadas do "Roteamento de Atendimento" deste setor — configure lá quais
 * tipos aparecem e para qual setor cada um vai.
 */
export function WidgetManager({ setorId }: { setorId: string }) {
  const [widgets, setWidgets] = useState<Widget[]>([])
  const [routing, setRouting] = useState<RoutingOption[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/setores/${setorId}/widgets`)
      if (!res.ok) throw new Error()
      const data = await res.json()
      setWidgets(data.widgets || [])
      setRouting(data.routing || [])
    } catch {
      toast.error('Erro ao carregar widgets')
    } finally {
      setLoading(false)
    }
  }, [setorId])

  useEffect(() => {
    load()
  }, [load])

  const origin =
    typeof window !== 'undefined'
      ? window.location.origin
      : 'https://seu-dominio.com'

  const embedCode = (key: string) =>
    `<script src="${origin}/embed-widget.js?key=${key}"></script>`

  const copy = (t: string) => {
    navigator.clipboard.writeText(t)
    toast.success('Copiado!')
  }

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    setCreating(true)
    try {
      const res = await fetch(`/api/setores/${setorId}/widgets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: form.get('nome'),
          canal: String(form.get('canal') || '').trim() || null,
          allowed_domains: String(form.get('allowed_domains') || '')
            .split(',')
            .map((d) => d.trim())
            .filter(Boolean),
        }),
      })
      if (!res.ok) throw new Error()
      toast.success('Widget criado!')
      setCreateOpen(false)
      await load()
    } catch {
      toast.error('Erro ao criar widget')
    } finally {
      setCreating(false)
    }
  }

  return (
    <Card className="glass-card-elevated rounded-2xl border-0 flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 shrink-0 pb-2">
        <div>
          <CardTitle>Widget de Chat</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Gere um chat para incorporar no seu site. As opções seguem o
            Roteamento de Atendimento deste setor.
          </p>
        </div>
        <Button onClick={() => setCreateOpen((o) => !o)} size="sm" className="gap-1.5">
          <Plus className="h-3.5 w-3.5" /> Novo widget
        </Button>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Preview das opções (vêm do Roteamento de Atendimento) */}
        <div className="rounded-xl border px-2.5 py-2 bg-black/5">
          <p className="text-xs font-medium flex items-center gap-1.5 mb-2">
            <ArrowRightLeft className="h-3.5 w-3.5" />
            Opções que o cliente verá
          </p>
          {routing.length === 0 ? (
            <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              Nenhum tipo configurado. Defina o Roteamento de Atendimento acima
              para o widget ter opções.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {routing.map((r) => (
                <span
                  key={r.tipo}
                  className="inline-flex items-center gap-1 rounded-full bg-background border px-2 py-0.5 text-xs"
                >
                  {r.label}
                  {r.destino_nome && (
                    <span className="text-muted-foreground">→ {r.destino_nome}</span>
                  )}
                </span>
              ))}
            </div>
          )}
        </div>

        {createOpen && (
          <form
            onSubmit={handleCreate}
            className="border rounded-xl p-3 space-y-2 bg-black/5"
          >
            <div>
              <label className="text-sm font-medium block mb-1">
                Nome do widget
              </label>
              <input
                name="nome"
                required
                placeholder="Ex: Atendimento do site"
                className="w-full px-2.5 py-1.5 border rounded-lg text-sm bg-background"
              />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">
                Identificador do canal (relatório)
              </label>
              <input
                name="canal"
                placeholder="Ex: landpag, softcomshop, softshop..."
                className="w-full px-2.5 py-1.5 border rounded-lg text-sm bg-background"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Aparece como “canal” do ticket nos relatórios. Em branco, usa “widget”.
              </p>
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">
                Domínios permitidos (separados por vírgula)
              </label>
              <input
                name="allowed_domains"
                placeholder="Ex: site.com.br, www.site.com.br"
                className="w-full px-2.5 py-1.5 border rounded-lg text-sm bg-background"
              />
            </div>
            <div className="flex gap-1.5">
              <Button type="submit" size="sm" disabled={creating}>
                {creating ? 'Criando...' : 'Criar'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setCreateOpen(false)}
              >
                Cancelar
              </Button>
            </div>
          </form>
        )}

        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : widgets.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum widget ainda. Crie um para incorporar no site.
          </p>
        ) : (
          widgets.map((w) => {
            const isOpen = expanded === w.id
            return (
              <div key={w.id} className="border rounded-xl overflow-hidden">
                <button
                  onClick={() => setExpanded(isOpen ? null : w.id)}
                  className="w-full px-2.5 py-2 flex items-center justify-between hover:bg-black/5"
                >
                  <div className="text-left">
                    <p className="font-medium text-sm flex items-center gap-1.5">
                      {w.nome}
                      {w.canal && (
                        <span className="text-[10px] font-normal rounded-full bg-primary/10 text-primary px-2 py-0.5">
                          {w.canal}
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {w.allowed_domains?.length
                        ? w.allowed_domains.join(', ')
                        : 'Sem domínios restritos'}
                    </p>
                  </div>
                  <ChevronDown
                    className={`h-3.5 w-3.5 transition-transform ${
                      isOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {isOpen && (
                  <div className="px-2.5 py-2 border-t space-y-2 bg-black/5">
                    <div>
                      <p className="text-xs font-medium mb-1">
                        Código de incorporação
                      </p>
                      <div className="flex items-start gap-1.5 bg-background border rounded-lg p-2">
                        <pre className="flex-1 text-[11px] overflow-x-auto whitespace-pre-wrap">
                          {embedCode(w.api_key)}
                        </pre>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 shrink-0"
                          onClick={() => copy(embedCode(w.api_key))}
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>

                    {w.allowed_domains?.length > 0 && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Globe className="h-3 w-3" /> {w.allowed_domains.join(', ')}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}
      </CardContent>
    </Card>
  )
}
