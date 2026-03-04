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
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const supabase = createClient()
  const { toast } = useToast()

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

    setLoading(false)
  }

  useEffect(() => {
    fetchData()

    // Subscribe to real-time changes on is_online
    const channel = supabase
      .channel('colaboradores-status')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'colaboradores',
        },
        (payload) => {
          setColaboradores((current) =>
            current.map((c) =>
              c.id === payload.new.id
                ? { ...c, is_online: payload.new.is_online, ativo: payload.new.ativo }
                : c
            )
          )
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  function openCreateModal() {
    setEditingColaborador(null)
    setFormData({
      nome: '',
      email: '',
      senha: '',
      setor_id: '',
      permissao_id: '',
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
    })
    setError(null)
    setModalOpen(true)
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
        })
        .eq('id', editingColaborador.id)

      if (updateError) {
        setError('Erro ao atualizar colaborador: ' + updateError.message)
        setSaving(false)
        return
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
        is_online: false,
        ativo: true,
      })

      if (insertError) {
        setError('Erro ao cadastrar colaborador: ' + insertError.message)
        setSaving(false)
        return
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
                    <TableHead>Setor</TableHead>
                    <TableHead>Permissao</TableHead>
                    <TableHead>Status</TableHead>
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
                          {colaborador.setor?.nome || '-'}
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
              <Label htmlFor="setor" className="text-foreground">
                Setor
              </Label>
              <Select
                value={formData.setor_id}
                onValueChange={(value) =>
                  setFormData({ ...formData, setor_id: value })
                }
              >
                <SelectTrigger className="border-border bg-card">
                  <SelectValue placeholder="Selecione um setor" />
                </SelectTrigger>
                <SelectContent>
                  {setores.map((setor) => (
                    <SelectItem key={setor.id} value={setor.id}>
                      {setor.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
