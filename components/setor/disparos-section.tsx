'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Megaphone,
  Plus,
  RefreshCw,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { DisparosWizard } from '@/components/setor/disparos-wizard'

interface Setor {
  id: string
  nome: string
  evolution_base_url?: string | null
  evolution_api_key?: string | null
  openai_ativo?: boolean | null
  openai_api_key?: string | null
  max_disparos_dia?: number | null
}

interface Lote {
  id: string
  tipo_origem: 'xls' | 'clientes_hub'
  mensagem: string
  destino_tipo: 'subsetor' | 'atendentes'
  subsetor_id: string | null
  atendentes_ids: string[] | null
  total_destinatarios: number
  total_enviados: number
  total_falhados: number
  status: 'pendente' | 'processando' | 'concluido' | 'falhado'
  criado_em: string
  concluido_em: string | null
  colaboradores: { nome: string } | null
  subsetores: { nome: string } | null
}

const PAGE_SIZE = 20

function statusBadge(status: Lote['status']) {
  const map: Record<Lote['status'], { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
    pendente: { label: 'Pendente', variant: 'secondary' },
    processando: { label: 'Processando', variant: 'outline' },
    concluido: { label: 'Concluído', variant: 'default' },
    falhado: { label: 'Falhado', variant: 'destructive' },
  }
  const entry = map[status]
  return <Badge variant={entry.variant}>{entry.label}</Badge>
}

export function DisparosSection({ setor }: { setor: Setor }) {
  const [lotes, setLotes] = useState<Lote[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [wizardOpen, setWizardOpen] = useState(false)

  const evolutionOk = Boolean(
    (setor.evolution_base_url || '').trim() && (setor.evolution_api_key || '').trim(),
  )

  const supabase = createClient()

  const fetchLotes = useCallback(async () => {
    if (!evolutionOk) {
      setLoading(false)
      return
    }
    setLoading(true)
    const { data, count, error } = await supabase
      .from('disparos_lote')
      .select(
        'id, tipo_origem, mensagem, destino_tipo, subsetor_id, atendentes_ids, total_destinatarios, total_enviados, total_falhados, status, criado_em, concluido_em, colaboradores(nome), subsetores(nome)',
        { count: 'exact' },
      )
      .eq('setor_id', setor.id)
      .order('criado_em', { ascending: false })
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)

    if (!error && data) {
      setLotes(data as unknown as Lote[])
      setTotal(count || 0)
    }
    setLoading(false)
  }, [setor.id, page, evolutionOk, supabase])

  useEffect(() => {
    fetchLotes()
  }, [fetchLotes])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  if (!evolutionOk) {
    return (
      <Card className="glass-card-elevated rounded-2xl border-0">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Megaphone className="h-5 w-5" />
            Disparos
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-3 p-4 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-amber-900 dark:text-amber-100">
                Evolution API não configurada neste setor
              </p>
              <p className="text-sm text-amber-800 dark:text-amber-200 mt-1">
                Os disparos em massa só funcionam em setores com Evolution configurada. Vá em{' '}
                <strong>Configurações</strong> do setor, preencha os campos de Evolution e salve.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <Card className="glass-card-elevated rounded-2xl border-0">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Megaphone className="h-5 w-5" />
              Disparos
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Envie uma mensagem em massa para múltiplos clientes via Evolution. Cada disparo cria
              tickets individuais para os atendentes escolhidos.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={fetchLotes} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            <Button onClick={() => setWizardOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Novo Disparo
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading && lotes.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground">Carregando...</div>
          ) : lotes.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground">
              Nenhum disparo realizado ainda. Clique em &quot;Novo Disparo&quot; para começar.
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Criador</TableHead>
                    <TableHead>Origem</TableHead>
                    <TableHead>Destino</TableHead>
                    <TableHead className="text-right">Destinatários</TableHead>
                    <TableHead className="text-right">Enviados</TableHead>
                    <TableHead className="text-right">Falhados</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lotes.map((lote) => {
                    const data = new Date(lote.criado_em).toLocaleString('pt-BR')
                    const destino =
                      lote.destino_tipo === 'subsetor'
                        ? `Subsetor: ${lote.subsetores?.nome || '—'}`
                        : `${lote.atendentes_ids?.length || 0} atendente(s)`
                    return (
                      <TableRow key={lote.id}>
                        <TableCell className="font-mono text-xs">{data}</TableCell>
                        <TableCell>{lote.colaboradores?.nome || '—'}</TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {lote.tipo_origem === 'xls' ? 'Planilha' : 'Hub'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">{destino}</TableCell>
                        <TableCell className="text-right font-mono">
                          {lote.total_destinatarios}
                        </TableCell>
                        <TableCell className="text-right font-mono text-emerald-600">
                          {lote.total_enviados}
                        </TableCell>
                        <TableCell className="text-right font-mono text-red-600">
                          {lote.total_falhados}
                        </TableCell>
                        <TableCell>{statusBadge(lote.status)}</TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>

              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <span className="text-sm text-muted-foreground">
                    Página {page} de {totalPages} — {total} lote(s)
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {wizardOpen && (
        <DisparosWizard
          setor={setor}
          onClose={() => setWizardOpen(false)}
          onSuccess={() => {
            setWizardOpen(false)
            fetchLotes()
          }}
        />
      )}
    </div>
  )
}
