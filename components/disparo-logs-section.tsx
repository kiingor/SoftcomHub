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
  created_at: string
  cliente_nome: string
  cliente_telefone: string
  template_usado: string
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
      .gte('created_at', todayStart.toISOString())

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
      .order('created_at', { ascending: false })
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
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Log de Disparos</h2>
        <p className="text-muted-foreground">
          Historico de todos os disparos realizados neste setor
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <Megaphone className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Disparos Hoje</p>
                <p className="text-2xl font-bold">
                  {todayCount}
                  {maxLimit > 0 && (
                    <span className="text-sm font-normal text-muted-foreground">
                      {' '}/ {maxLimit}
                    </span>
                  )}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                <Megaphone className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total de Disparos</p>
                <p className="text-2xl font-bold">{totalCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {maxLimit > 0 && (
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${todayCount >= maxLimit ? 'bg-destructive/10' : 'bg-green-500/10'}`}>
                  <Megaphone className={`h-5 w-5 ${todayCount >= maxLimit ? 'text-destructive' : 'text-green-600'}`} />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Status do Limite</p>
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
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="text-base">Historico</CardTitle>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome ou telefone..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(0) }}
                className="pl-9 w-[250px]"
              />
            </div>
            <Button variant="outline" size="icon" onClick={fetchLogs}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Megaphone className="h-10 w-10 mb-3 opacity-40" />
              <p className="font-medium">Nenhum disparo registrado</p>
              <p className="text-sm">Os disparos realizados aparecerão aqui</p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data/Hora</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Telefone</TableHead>
                    <TableHead>Template</TableHead>
                    <TableHead>Realizado por</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-sm whitespace-nowrap">
                        {formatDate(log.created_at)}
                      </TableCell>
                      <TableCell className="font-medium">
                        {log.cliente_nome}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground font-mono">
                        {formatPhone(log.cliente_telefone)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-mono text-xs">
                          {log.template_usado}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {log.colaboradores?.nome || '-'}
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
                <div className="flex items-center justify-between pt-4">
                  <p className="text-sm text-muted-foreground">
                    Mostrando {page * pageSize + 1}-{Math.min((page + 1) * pageSize, totalCount)} de {totalCount}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => Math.max(0, p - 1))}
                      disabled={page === 0}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      {page + 1} / {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                      disabled={page >= totalPages - 1}
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
    </div>
  )
}
