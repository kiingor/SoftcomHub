'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
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
  Search,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'

interface DisparoLog {
  id: string
  criado_em: string
  cliente_nome: string
  cliente_telefone: string
  template_name: string | null
  colaborador_nome: string | null
  status: string
  colaboradores: { nome: string } | null
}

export function DisparoLogsSection({ setorId }: { setorId: string }) {
  const supabase = createClient()
  const [logs, setLogs] = useState<DisparoLog[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [totalCount, setTotalCount] = useState(0)
  const [todayCount, setTodayCount] = useState(0)
  const [maxLimit, setMaxLimit] = useState(0)
  const pageSize = 20

  const fetchLogs = async () => {
    setLoading(true)

    // Get limit config
    const { data: setor } = await supabase
      .from('setores')
      .select('max_disparos_dia')
      .eq('id', setorId)
      .single()

    setMaxLimit(setor?.max_disparos_dia || 0)

    // Get today count
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    const { count: todayTotal } = await supabase
      .from('disparo_logs')
      .select('*', { count: 'exact', head: true })
      .eq('setor_id', setorId)
      .gte('criado_em', todayStart.toISOString())

    setTodayCount(todayTotal || 0)

    // Get total count for pagination
    let countQuery = supabase
      .from('disparo_logs')
      .select('*', { count: 'exact', head: true })
      .eq('setor_id', setorId)

    if (search) {
      countQuery = countQuery.or(`cliente_nome.ilike.%${search}%,cliente_telefone.ilike.%${search}%`)
    }

    const { count } = await countQuery
    setTotalCount(count || 0)

    // Get logs with pagination
    let query = supabase
      .from('disparo_logs')
      .select('*, colaboradores(nome)')
      .eq('setor_id', setorId)
      .order('criado_em', { ascending: false })
      .range(page * pageSize, (page + 1) * pageSize - 1)

    if (search) {
      query = query.or(`cliente_nome.ilike.%${search}%,cliente_telefone.ilike.%${search}%`)
    }

    const { data } = await query
    setLogs((data as DisparoLog[]) || [])
    setLoading(false)
  }

  useEffect(() => {
    fetchLogs()
  }, [setorId, page, search])

  const totalPages = Math.ceil(totalCount / pageSize)

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const formatPhone = (phone: string) => {
    if (!phone) return '-'
    const clean = phone.replace(/\D/g, '')
    if (clean.length === 13) {
      return `+${clean.slice(0, 2)} (${clean.slice(2, 4)}) ${clean.slice(4, 9)}-${clean.slice(9)}`
    }
    return phone
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold tracking-tight">Log de Disparos</h2>
        <p className="text-sm text-muted-foreground">
          Historico de todos os disparos realizados neste setor
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-3 md:grid-cols-3">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <Megaphone className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Disparos Hoje</p>
                <p className="text-xl font-bold">
                  {todayCount}
                  {maxLimit > 0 && (
                    <span className="text-xs font-normal text-muted-foreground">
                      {' '}/ {maxLimit}
                    </span>
                  )}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                <Megaphone className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total de Disparos</p>
                <p className="text-xl font-bold">{totalCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {maxLimit > 0 && (
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${todayCount >= maxLimit ? 'bg-destructive/10' : 'bg-green-500/10'}`}>
                  <Megaphone className={`h-4 w-4 ${todayCount >= maxLimit ? 'text-destructive' : 'text-green-600'}`} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Status do Limite</p>
                  <Badge variant={todayCount >= maxLimit ? 'destructive' : 'secondary'}>
                    {todayCount >= maxLimit ? 'Limite atingido' : `${maxLimit - todayCount} restantes`}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Search + Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-base">Historico</CardTitle>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome ou telefone..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(0) }}
                className="pl-9 h-8 w-[250px]"
              />
            </div>
            <Button variant="outline" size="icon-sm" onClick={fetchLogs}>
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Megaphone className="h-9 w-9 mb-3 opacity-40" />
              <p className="text-sm font-medium">Nenhum disparo registrado</p>
              <p className="text-xs">Os disparos realizados aparecerão aqui</p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Data/Hora</TableHead>
                    <TableHead className="text-xs">Cliente</TableHead>
                    <TableHead className="text-xs">Telefone</TableHead>
                    <TableHead className="text-xs">Template</TableHead>
                    <TableHead className="text-xs">Realizado por</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-xs whitespace-nowrap">
                        {formatDate(log.criado_em)}
                      </TableCell>
                      <TableCell className="text-sm font-medium">
                        {log.cliente_nome}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground font-mono">
                        {formatPhone(log.cliente_telefone)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-mono text-xs">
                          {log.template_name || '-'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">
                        {log.colaboradores?.nome || log.colaborador_nome || '-'}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={log.status === 'enviado' ? 'default' : 'destructive'}
                          className="text-xs"
                        >
                          {log.status === 'enviado' ? 'Enviado' : log.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-3">
                  <p className="text-xs text-muted-foreground">
                    Mostrando {page * pageSize + 1}-{Math.min((page + 1) * pageSize, totalCount)} de {totalCount}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="icon-sm"
                      onClick={() => setPage(p => Math.max(0, p - 1))}
                      disabled={page === 0}
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      {page + 1} / {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="icon-sm"
                      onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                      disabled={page >= totalPages - 1}
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
