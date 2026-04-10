'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { Checkbox } from '@/components/ui/checkbox'
import { Users, Plus, Pencil, UserX, Loader2, Circle } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useToast } from '@/hooks/use-toast'

interface Setor {
  id: string
  nome: string
}

interface Permissao {
  id: string
  nome: string
}

interface Colaborador {
  id: string
  nome: string
  email: string
  setor_id: string | null
  permissao_id: string | null
  is_online: boolean
  ativo: boolean
  created_at: string
  setor?: Setor | null
  permissao?: Permissao | null
}

export default function ColaboradoresPage() {
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([])
  const [setores, setSetores] = useState<Setor[]>([])
  const [permissoes, setPermissoes] = useState<Permissao[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingColaborador, setEditingColaborador] = useState<Colaborador | null>(null)
  const [deactivateDialogOpen, setDeactivateDialogOpen] = useState(false)
  const [colaboradorToDeactivate, setColaboradorToDeactivate] = useState<Colaborador | null>(null)
  const [formData, setFormData] = useState({
    nome: '',
    email: '',
    senha: '',
    setor_id: '',
    permissao_id: '',
    suporte_id: '',
    setores_selecionados: [] as string[],
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const supabase = createClient()
  const { toast } = useToast()

  const [colaboradorSetores, setColaboradorSetores] = useState<{ colaborador_id: string; setor_id: string }[]>([])
  const [mediasNPS, setMediasNPS] = useState<Map<string, { media: number; total: number }>>(new Map())

  function getSetoresDoColaborador(colaboradorId: string): string[] {
    return colaboradorSetores
      .filter((cs) => cs.colaborador_id === colaboradorId)
      .map((cs) => cs.setor_id)
  }

  async function fetchData() {
    setLoading(true)

    // Fetch colaboradores with joins
    const { data: colaboradoresData, error: colaboradoresError } = await supabase
      .from('colaboradores')
      .select(`
        *,
        setor:setores(id, nome),
        permissao:permissoes(id, nome)
      `)
      .order('created_at', { ascending: false })

    if (!colaboradoresError && colaboradoresData) {
      setColaboradores(colaboradoresData)
    }

    // Fetch setores
    const { data: setoresData } = await supabase
      .from('setores')
      .select('id, nome')
      .order('nome')

    if (setoresData) {
      setSetores(setoresData)
    }

    // Fetch permissoes
    const { data: permissoesData } = await supabase
      .from('permissoes')
      .select('id, nome')
      .order('nome')

    if (permissoesData) {
      setPermissoes(permissoesData)
    }

    // Fetch colaborador_setores (join table)
    const { data: colabSetoresData } = await supabase
      .from('colaborador_setores')
      .select('colaborador_id, setor_id')

    if (colabSetoresData) {
      setColaboradorSetores(colabSetoresData)
    }

    // Fetch avaliacoes para NPS
    const { data: avaliacoesData } = await supabase
      .from('avaliacoes')
      .select('colaborador_id, nota')

    const npsMap = new Map<string, { media: number; total: number }>()
    if (avaliacoesData) {
      const grouped = new Map<string, number[]>()
      for (const a of avaliacoesData) {
        if (!grouped.has(a.colaborador_id)) grouped.set(a.colaborador_id, [])
        grouped.get(a.colaborador_id)!.push(a.nota)
      }
      for (const [id, notas] of grouped) {
        npsMap.set(id, { media: notas.reduce((s, n) => s + n, 0) / notas.length, total: notas.length })
      }
    }
    setMediasNPS(npsMap)

    setLoading(false)
  }

  useEffect(() => {
    fetchData()

    // Admin page: polling every 30s instead of a global unfiltered realtime channel
    // on `colaboradores` (which was broadcasting every status update to every admin).
    const interval = setInterval(fetchData, 30000)
    return () => clearInterval(interval)
  }, [])

  function openCreateModal() {
    setEditingColaborador(null)
    setFormData({
      nome: '',
      email: '',
      senha: '',
      setor_id: '',
      permissao_id: '',
      suporte_id: '',
      setores_selecionados: [],
    })
    setError(null)
    setModalOpen(true)
  }

  function openEditModal(colaborador: Colaborador) {
    setEditingColaborador(colaborador)
    setFormData({
      nome: colaborador.nome,
      email: colaborador.email,
      senha: '',
      setor_id: colaborador.setor_id || '',
      permissao_id: colaborador.permissao_id || '',
      suporte_id: (colaborador as any).suporte_id || '',
      setores_selecionados: getSetoresDoColaborador(colaborador.id),
    })
    setError(null)
    setModalOpen(true)
  }

  function toggleSetorSelection(setorId: string) {
    setFormData((prev) => ({
      ...prev,
      setores_selecionados: prev.setores_selecionados.includes(setorId)
        ? prev.setores_selecionados.filter((id) => id !== setorId)
        : [...prev.setores_selecionados, setorId],
    }))
  }

  function openDeactivateDialog(colaborador: Colaborador) {
    setColaboradorToDeactivate(colaborador)
    setDeactivateDialogOpen(true)
  }

  async function handleSave() {
    if (!formData.nome.trim()) {
      setError('Nome e obrigatorio')
      return
    }

    setSaving(true)
    setError(null)

    if (editingColaborador) {
      // Update existing colaborador
      const { error: updateError } = await supabase
        .from('colaboradores')
        .update({
          nome: formData.nome.trim(),
          setor_id: formData.setor_id || null,
          permissao_id: formData.permissao_id || null,
          suporte_id: formData.suporte_id.trim() || null,
        })
        .eq('id', editingColaborador.id)

      if (updateError) {
        setError('Erro ao atualizar colaborador: ' + updateError.message)
        setSaving(false)
        return
      }

      // Update colaborador_setores join table
      await supabase
        .from('colaborador_setores')
        .delete()
        .eq('colaborador_id', editingColaborador.id)

      if (formData.setores_selecionados.length > 0) {
        const relations = formData.setores_selecionados.map((setorId) => ({
          colaborador_id: editingColaborador.id,
          setor_id: setorId,
        }))
        await supabase.from('colaborador_setores').insert(relations)
      }

      toast({
        title: 'Colaborador atualizado',
        description: 'As alteracoes foram salvas com sucesso.',
      })
    } else {
      // Create new colaborador
      if (!formData.email.trim() || !formData.senha.trim()) {
        setError('E-mail e senha sao obrigatorios para novos colaboradores')
        setSaving(false)
        return
      }

      // 1. Create user in Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: formData.email.trim().toLowerCase(),
        password: formData.senha,
        options: {
          emailRedirectTo: process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL ||
            `${window.location.origin}/workdesk`,
        },
      })

      if (authError) {
        if (authError.message.includes('already registered')) {
          setError('Este e-mail ja esta cadastrado')
        } else {
          setError('Erro ao criar usuario: ' + authError.message)
        }
        setSaving(false)
        return
      }

      if (!authData.user) {
        setError('Erro ao criar usuario no sistema de autenticacao')
        setSaving(false)
        return
      }

      // 2. Insert into colaboradores table
      const { error: insertError } = await supabase.from('colaboradores').insert({
        id: authData.user.id,
        nome: formData.nome.trim(),
        email: formData.email.trim().toLowerCase(),
        setor_id: formData.setor_id || null,
        permissao_id: formData.permissao_id || null,
        suporte_id: formData.suporte_id.trim() || null,
        is_online: false,
        ativo: true,
      })

      if (insertError) {
        setError('Erro ao cadastrar colaborador: ' + insertError.message)
        setSaving(false)
        return
      }

      // 3. Insert into colaborador_setores join table
      if (formData.setores_selecionados.length > 0) {
        const relations = formData.setores_selecionados.map((setorId) => ({
          colaborador_id: authData.user!.id,
          setor_id: setorId,
        }))
        await supabase.from('colaborador_setores').insert(relations)
      }

      toast({
        title: 'Colaborador criado',
        description: 'O novo colaborador foi cadastrado com sucesso.',
      })
    }

    setModalOpen(false)
    fetchData()
    setSaving(false)
  }

  async function handleDeactivate() {
    if (!colaboradorToDeactivate) return

    const newStatus = colaboradorToDeactivate.ativo ? false : true

    const { error } = await supabase
      .from('colaboradores')
      .update({ ativo: newStatus, is_online: false })
      .eq('id', colaboradorToDeactivate.id)

    if (!error) {
      toast({
        title: newStatus ? 'Colaborador reativado' : 'Colaborador desativado',
        description: newStatus
          ? 'O colaborador pode acessar o sistema novamente.'
          : 'O colaborador nao podera mais acessar o sistema.',
      })
      fetchData()
    }

    setDeactivateDialogOpen(false)
    setColaboradorToDeactivate(null)
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Colaboradores
          </h1>
          <p className="text-muted-foreground">
            Gerencie usuarios, setores e permissoes
          </p>
        </div>
        <Button
          onClick={openCreateModal}
          className="mt-4 bg-primary text-primary-foreground hover:bg-primary/90 sm:mt-0"
        >
          <Plus className="mr-2 h-4 w-4" />
          Novo Colaborador
        </Button>
      </div>

      <Card className="glass-card-elevated rounded-2xl border-0">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Lista de Colaboradores
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : colaboradores.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="rounded-full bg-primary/10 p-4">
                <Users className="h-8 w-8 text-primary" />
              </div>
              <h3 className="mt-4 text-lg font-semibold text-foreground">
                Nenhum colaborador cadastrado
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Comece cadastrando o primeiro colaborador
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>E-mail</TableHead>
                    <TableHead>Setores</TableHead>
                    <TableHead>Permissao</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>NPS</TableHead>
                    <TableHead className="text-right">Acoes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <AnimatePresence>
                    {colaboradores.map((colaborador, index) => (
                      <motion.tr
                        key={colaborador.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ delay: index * 0.05 }}
                        className={`border-b transition-colors hover:bg-muted/50 ${
                          !colaborador.ativo ? 'opacity-50' : ''
                        }`}
                      >
                        <TableCell className="font-medium">
                          {colaborador.nome}
                          {!colaborador.ativo && (
                            <Badge variant="secondary" className="ml-2">
                              Inativo
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {colaborador.email}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {(() => {
                            const setorIds = getSetoresDoColaborador(colaborador.id)
                            if (setorIds.length === 0) return <span className="text-muted-foreground">Nenhum</span>
                            return (
                              <div className="flex flex-wrap gap-1">
                                {setorIds.map((sid) => {
                                  const s = setores.find((st) => st.id === sid)
                                  return s ? (
                                    <Badge key={sid} variant="secondary" className="text-xs">
                                      {s.nome}
                                    </Badge>
                                  ) : null
                                })}
                              </div>
                            )
                          })()}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {colaborador.permissao?.nome || '-'}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Circle
                              className={`h-3 w-3 ${
                                colaborador.is_online && colaborador.ativo
                                  ? 'fill-green-500 text-green-500'
                                  : 'fill-gray-300 text-gray-300'
                              }`}
                            />
                            <span className="text-sm text-muted-foreground">
                              {colaborador.is_online && colaborador.ativo
                                ? 'Online'
                                : 'Offline'}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {mediasNPS.get(colaborador.id) ? (
                            <div className="flex items-center gap-1 text-xs">
                              <span className={cn(
                                'font-semibold',
                                mediasNPS.get(colaborador.id)!.media >= 9 ? 'text-green-600' :
                                mediasNPS.get(colaborador.id)!.media >= 7 ? 'text-yellow-600' :
                                'text-red-600'
                              )}>
                                {mediasNPS.get(colaborador.id)!.media.toFixed(1)}
                              </span>
                              <span className="text-muted-foreground">({mediasNPS.get(colaborador.id)!.total})</span>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEditModal(colaborador)}
                              className="hover:bg-primary/20"
                            >
                              <Pencil className="mr-1 h-4 w-4" />
                              Editar
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openDeactivateDialog(colaborador)}
                              className={
                                colaborador.ativo
                                  ? 'text-destructive hover:bg-destructive/10 hover:text-destructive'
                                  : 'text-green-600 hover:bg-green-100 hover:text-green-600'
                              }
                            >
                              <UserX className="mr-1 h-4 w-4" />
                              {colaborador.ativo ? 'Desativar' : 'Reativar'}
                            </Button>
                          </div>
                        </TableCell>
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal for Create/Edit */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="glass-card-elevated rounded-3xl border-0 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground">
              <Users className="h-5 w-5 text-primary" />
              {editingColaborador ? 'Editar Colaborador' : 'Novo Colaborador'}
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="grid gap-2">
              <Label htmlFor="nome" className="text-foreground">
                Nome *
              </Label>
              <Input
                id="nome"
                placeholder="Nome completo"
                value={formData.nome}
                onChange={(e) =>
                  setFormData({ ...formData, nome: e.target.value })
                }
                className="border-border bg-card"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="email" className="text-foreground">
                E-mail *
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="email@empresa.com"
                value={formData.email}
                onChange={(e) =>
                  setFormData({ ...formData, email: e.target.value })
                }
                disabled={!!editingColaborador}
                className="border-border bg-card disabled:opacity-50"
              />
              {editingColaborador && (
                <p className="text-xs text-muted-foreground">
                  O e-mail nao pode ser alterado
                </p>
              )}
            </div>

            {!editingColaborador && (
              <div className="grid gap-2">
                <Label htmlFor="senha" className="text-foreground">
                  Senha *
                </Label>
                <Input
                  id="senha"
                  type="password"
                  placeholder="Senha de acesso"
                  value={formData.senha}
                  onChange={(e) =>
                    setFormData({ ...formData, senha: e.target.value })
                  }
                  className="border-border bg-card"
                />
              </div>
            )}

            <div className="grid gap-2">
              <Label htmlFor="suporte_id" className="text-foreground">
                ID Suporte (opcional)
              </Label>
              <Input
                id="suporte_id"
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="Ex: 12345"
                value={formData.suporte_id}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, '')
                  setFormData({ ...formData, suporte_id: value })
                }}
                className="border-border bg-card"
              />
              <p className="text-xs text-muted-foreground">
                ID do atendente no sistema externo de suporte
              </p>
            </div>

            <div className="grid gap-2">
              <Label className="text-foreground">
                Setores
              </Label>
              <div className="max-h-40 overflow-y-auto rounded-md border border-border bg-card p-3 space-y-2">
                {setores.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum setor cadastrado</p>
                ) : (
                  setores.map((setor) => (
                    <div key={setor.id} className="flex items-center gap-2">
                      <Checkbox
                        id={`setor-${setor.id}`}
                        checked={formData.setores_selecionados.includes(setor.id)}
                        onCheckedChange={() => toggleSetorSelection(setor.id)}
                      />
                      <label
                        htmlFor={`setor-${setor.id}`}
                        className="text-sm text-foreground cursor-pointer"
                      >
                        {setor.nome}
                      </label>
                    </div>
                  ))
                )}
              </div>
              {formData.setores_selecionados.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {formData.setores_selecionados.length} setor(es) selecionado(s)
                </p>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="permissao" className="text-foreground">
                Permissao
              </Label>
              <Select
                value={formData.permissao_id}
                onValueChange={(value) =>
                  setFormData({ ...formData, permissao_id: value })
                }
              >
                <SelectTrigger className="border-border bg-card">
                  <SelectValue placeholder="Selecione uma permissao" />
                </SelectTrigger>
                <SelectContent>
                  {permissoes.map((permissao) => (
                    <SelectItem key={permissao.id} value={permissao.id}>
                      {permissao.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setModalOpen(false)}
              className="border-border"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || !formData.nome.trim()}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingColaborador ? 'Atualizar' : 'Cadastrar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deactivate Confirmation Dialog */}
      <AlertDialog open={deactivateDialogOpen} onOpenChange={setDeactivateDialogOpen}>
        <AlertDialogContent className="glass-card-elevated rounded-2xl border-0">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {colaboradorToDeactivate?.ativo
                ? 'Desativar colaborador?'
                : 'Reativar colaborador?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {colaboradorToDeactivate?.ativo
                ? `O colaborador "${colaboradorToDeactivate?.nome}" nao podera mais acessar o sistema. Voce podera reativa-lo a qualquer momento.`
                : `O colaborador "${colaboradorToDeactivate?.nome}" podera acessar o sistema novamente.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeactivate}
              className={
                colaboradorToDeactivate?.ativo
                  ? 'bg-destructive text-white hover:bg-destructive/90'
                  : 'bg-green-600 text-white hover:bg-green-700'
              }
            >
              {colaboradorToDeactivate?.ativo ? 'Desativar' : 'Reativar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
