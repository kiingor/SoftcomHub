'use client'

import { useEffect } from "react"

import { useState, useMemo } from 'react'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Plus, Pencil, Search, UserCog, Building2, Trash2, Eye, EyeOff } from 'lucide-react'
import { motion } from 'framer-motion'
import { useColaborador } from '@/lib/hooks/use-data'
import { canManageUsers } from '@/lib/permissions'

const SENHA_MINIMA = 6

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
  is_master: boolean
  ativo: boolean
  permissao_id: string | null
  permissoes: Permissao | null
  setores_atribuidos?: string[]
}

interface ColaboradorSetor {
  colaborador_id: string
  setor_id: string
}

const supabase = createClient()

async function fetchUsuariosData() {
  const [colabsRes, setoresRes, permissoesRes, colabSetoresRes] = await Promise.all([
    supabase.from('colaboradores').select('*, permissoes:permissao_id(*)').order('nome'),
    supabase.from('setores').select('*').order('nome'),
    supabase.from('permissoes').select('*').order('nome'),
    supabase.from('colaborador_setores').select('*'),
  ])

  const dashboardUsers = (colabsRes.data || []).filter((colaborador: any) =>
    colaborador.is_master || colaborador.permissoes?.can_view_dashboard
  )

  return {
    colaboradores: dashboardUsers,
    setores: setoresRes.data || [],
    permissoes: permissoesRes.data || [],
    colaboradorSetores: colabSetoresRes.data || [],
  }
}

export default function UsuariosPage() {
  const [searchTerm, setSearchTerm] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<Colaborador | null>(null)
  const [saving, setSaving] = useState(false)
  const [deletingUser, setDeletingUser] = useState<Colaborador | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [mostrarNovaSenha, setMostrarNovaSenha] = useState(false)

  const { data: colaboradorLogado } = useColaborador()
  const canResetPassword =
    colaboradorLogado?.is_master === true || canManageUsers(colaboradorLogado?.permissoes)

  const [formData, setFormData] = useState({
    nome: '',
    email: '',
    senha: '',
    novaSenha: '',
    confirmarNovaSenha: '',
    is_master: true,
    permissao_id: '',
    setores_selecionados: [] as string[],
  })

  const { data, isLoading, mutate } = useSWR('usuarios-data', fetchUsuariosData, {
    revalidateOnFocus: false,
    dedupingInterval: 30000,
  })

  const colaboradores = data?.colaboradores || []
  const setores = data?.setores || []
  const permissoes = data?.permissoes || []
  const colaboradorSetores = data?.colaboradorSetores || []
  const selectedPermissao = permissoes.find((permissao: Permissao) => permissao.id === formData.permissao_id)
  const isAdminPermission = selectedPermissao?.nome?.toLowerCase() === 'admin'

  const filteredColaboradores = useMemo(() => {
    if (!searchTerm) return colaboradores
    return colaboradores.filter((c: any) =>
      c.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.email.toLowerCase().includes(searchTerm.toLowerCase())
    )
  }, [colaboradores, searchTerm])

  function getSetoresDoColaborador(colaboradorId: string): string[] {
    return colaboradorSetores
      .filter((cs: any) => cs.colaborador_id === colaboradorId)
      .map((cs: any) => cs.setor_id)
  }

  function openCreateModal() {
    setEditingUser(null)
    setFormData({
      nome: '',
      email: '',
      senha: '',
      novaSenha: '',
      confirmarNovaSenha: '',
      is_master: false,
      permissao_id: '',
      setores_selecionados: [],
    })
    setMostrarNovaSenha(false)
    setIsModalOpen(true)
  }

  function openEditModal(user: Colaborador) {
    setEditingUser(user)
    setFormData({
      nome: user.nome,
      email: user.email,
      senha: '',
      novaSenha: '',
      confirmarNovaSenha: '',
      is_master: user.is_master,
      permissao_id: user.permissao_id || '',
      setores_selecionados: getSetoresDoColaborador(user.id),
    })
    setMostrarNovaSenha(false)
    setIsModalOpen(true)
  }

  async function handleSave() {
    if (!formData.nome || !formData.email) return

    const trocandoSenha = !!(editingUser && canResetPassword && formData.novaSenha)
    if (trocandoSenha) {
      if (formData.novaSenha.length < SENHA_MINIMA) {
        toast.error(`A nova senha deve ter no mínimo ${SENHA_MINIMA} caracteres`)
        return
      }
      if (formData.novaSenha !== formData.confirmarNovaSenha) {
        toast.error('As senhas não coincidem')
        return
      }
    }

    setSaving(true)
    try {
      const nextIsMaster = isAdminPermission

      if (editingUser) {
        // A senha mora no Supabase Auth, não em `colaboradores`: só a rota com
        // service_role sobrescreve. Vai antes do resto para que uma falha aqui
        // não deixe metade da edição aplicada.
        if (trocandoSenha) {
          const response = await fetch('/api/admin/update-user-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: editingUser.email,
              newPassword: formData.novaSenha,
            }),
          })
          const resultado = await response.json()
          if (!response.ok) throw new Error(resultado.error || 'Erro ao redefinir senha')
        }

        // Update existing user
        await supabase
          .from('colaboradores')
          .update({
            nome: formData.nome,
            is_master: nextIsMaster,
            permissao_id: formData.permissao_id || null,
          })
          .eq('id', editingUser.id)

        // Update setores relationships
        // First, remove all existing
        await supabase
          .from('colaborador_setores')
          .delete()
          .eq('colaborador_id', editingUser.id)

        // Then add new ones for non-admin dashboard users.
        if (!nextIsMaster && formData.setores_selecionados.length > 0) {
          const newRelations = formData.setores_selecionados.map((setorId) => ({
            colaborador_id: editingUser.id,
            setor_id: setorId,
          }))
          await supabase.from('colaborador_setores').insert(newRelations)
        }
      } else {
        // Create new user via Supabase Auth
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: formData.email,
          password: formData.senha,
          options: {
            emailRedirectTo: `${window.location.origin}/dashboard`,
          },
        })

        if (authError) throw authError

        // Create colaborador record
        const { data: newColab, error: colabError } = await supabase
          .from('colaboradores')
          .insert({
            nome: formData.nome,
            email: formData.email,
            is_master: nextIsMaster,
            permissao_id: formData.permissao_id || null,
            ativo: true,
            is_online: false,
          })
          .select()
          .single()

        if (colabError) throw colabError

        // Add setor relationships for non-admin dashboard users.
        if (!nextIsMaster && formData.setores_selecionados.length > 0 && newColab) {
          const relations = formData.setores_selecionados.map((setorId) => ({
            colaborador_id: newColab.id,
            setor_id: setorId,
          }))
          await supabase.from('colaborador_setores').insert(relations)
        }
      }

      if (trocandoSenha) {
        toast.success(`Nova senha definida para ${formData.nome}`)
      }

      setIsModalOpen(false)
      mutate()
    } catch (error) {
      console.error('Error saving user:', error)
      toast.error(error instanceof Error ? error.message : 'Erro ao salvar usuário')
    } finally {
      setSaving(false)
    }
  }

  function toggleSetorSelection(setorId: string) {
    setFormData((prev) => ({
      ...prev,
      setores_selecionados: prev.setores_selecionados.includes(setorId)
        ? prev.setores_selecionados.filter((id) => id !== setorId)
        : [...prev.setores_selecionados, setorId],
    }))
  }

  async function handleDelete() {
    if (!deletingUser) return
    setDeleting(true)
    try {
      const res = await fetch('/api/admin/delete-user', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          colaboradorId: deletingUser.id,
          email: deletingUser.email,
        }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Erro ao deletar')
      toast.success(`Usuário "${deletingUser.nome}" removido com sucesso`)
      setDeletingUser(null)
      mutate()
    } catch (error: any) {
      toast.error(error.message || 'Erro ao deletar usuário')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="flex flex-col gap-6 h-[calc(100vh-130px)]">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Supervisores</h1>
          <p className="text-muted-foreground">
            Gerencie supervisores com acesso ao dashboard. Atendentes são gerenciados em &quot;Atendentes&quot;.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar usuário..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-64 pl-9 rounded-2xl glass-input"
            />
          </div>
          <Button onClick={openCreateModal} className="gap-2">
            <Plus className="h-4 w-4" />
            Novo Usuário
          </Button>
        </div>
      </div>

      {/* Users Table */}
      <Card className="glass-card-elevated rounded-2xl border-0 flex flex-col flex-1 min-h-0">
        <CardContent className="p-0 overflow-y-auto flex-1">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-5">Nome</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Permissão</TableHead>
                <TableHead>Setores</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-24">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell className="pl-5"><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-12" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-8" /></TableCell>
                  </TableRow>
                ))
              ) : filteredColaboradores.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center">
                    <div className="flex flex-col items-center justify-center text-muted-foreground">
                      <UserCog className="mb-2 h-8 w-8" />
                      <p>Nenhum usuário encontrado</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filteredColaboradores.map((user: any, index: number) => {
                  const userSetores = getSetoresDoColaborador(user.id)
                  const setorNames = setores
                    .filter((s) => userSetores.includes(s.id))
                    .map((s) => s.nome)

                  return (
                    <motion.tr
                      key={user.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.03 }}
                      className="border-b"
                    >
                      <TableCell className="font-medium pl-5">{user.nome}</TableCell>
                      <TableCell>{user.email}</TableCell>
                      <TableCell>
                        {user.is_master ? (
                          <Badge className="bg-primary text-primary-foreground">
                            Admin
                          </Badge>
                        ) : (
                          <Badge variant="outline">Usuário</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {user.permissoes?.nome || (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {user.is_master ? (
                          <span className="text-sm text-muted-foreground">
                            Todos os setores
                          </span>
                        ) : setorNames.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {setorNames.slice(0, 2).map((nome) => (
                              <Badge key={nome} variant="secondary" className="text-xs">
                                {nome}
                              </Badge>
                            ))}
                            {setorNames.length > 2 && (
                              <Badge variant="secondary" className="text-xs">
                                +{setorNames.length - 2}
                              </Badge>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">Nenhum</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={user.ativo ? 'default' : 'secondary'}
                          className={
                            user.ativo
                              ? 'bg-green-100 text-green-800'
                              : 'bg-gray-100 text-gray-600'
                          }
                        >
                          {user.ativo ? 'Ativo' : 'Inativo'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEditModal(user)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => setDeletingUser(user)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </motion.tr>
                  )
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingUser} onOpenChange={(open) => !open && setDeletingUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deletar usuário</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja deletar <strong>{deletingUser?.nome}</strong>?
              <br />
              Esta ação removerá o colaborador e seu acesso ao sistema. Não é possível desfazer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? 'Deletando...' : 'Deletar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Create/Edit Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-2xl glass-card-elevated rounded-2xl border-0 flex flex-col max-h-[88vh] p-0 gap-0">
          {/* Header fixo */}
          <DialogHeader className="px-6 pt-6 pb-4 shrink-0 border-b border-border/50">
            <DialogTitle>
              {editingUser ? 'Editar Usuário' : 'Novo Usuário'}
            </DialogTitle>
            <DialogDescription>
              {editingUser
                ? 'Atualize as informações do usuário e seus setores'
                : 'Cadastre um novo usuário e defina seus acessos'}
            </DialogDescription>
          </DialogHeader>

          {/* Conteúdo rolável */}
          <div className="flex-1 overflow-y-auto px-6 py-5">
            <div className="grid gap-5">
              {/* Nome + E-mail */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="nome">Nome</Label>
                  <Input
                    id="nome"
                    value={formData.nome}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, nome: e.target.value }))
                    }
                    placeholder="Nome completo"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">E-mail</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, email: e.target.value }))
                    }
                    placeholder="email@exemplo.com"
                    disabled={!!editingUser}
                  />
                </div>
              </div>

              {/* Senha (apenas criação) */}
              {!editingUser && (
                <div className="space-y-2">
                  <Label htmlFor="senha">Senha</Label>
                  <Input
                    id="senha"
                    type="password"
                    value={formData.senha}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, senha: e.target.value }))
                    }
                    placeholder="Mínimo 8 caracteres"
                  />
                </div>
              )}

              {editingUser && canResetPassword && (
                <div className="space-y-3 rounded-lg border border-border p-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">Trocar senha</p>
                    <p className="text-xs text-muted-foreground">
                      Deixe em branco para manter a senha atual
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="nova-senha">Nova senha</Label>
                    <div className="relative">
                      <Input
                        id="nova-senha"
                        type={mostrarNovaSenha ? 'text' : 'password'}
                        placeholder={`Mínimo ${SENHA_MINIMA} caracteres`}
                        autoComplete="new-password"
                        value={formData.novaSenha}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, novaSenha: e.target.value }))
                        }
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setMostrarNovaSenha(!mostrarNovaSenha)}
                        aria-label={mostrarNovaSenha ? 'Ocultar senha' : 'Mostrar senha'}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {mostrarNovaSenha ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirmar-nova-senha">Confirmar nova senha</Label>
                    <Input
                      id="confirmar-nova-senha"
                      type={mostrarNovaSenha ? 'text' : 'password'}
                      placeholder="Repita a nova senha"
                      autoComplete="new-password"
                      value={formData.confirmarNovaSenha}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, confirmarNovaSenha: e.target.value }))
                      }
                    />
                    {formData.confirmarNovaSenha &&
                      formData.novaSenha !== formData.confirmarNovaSenha && (
                        <p className="text-xs text-destructive">As senhas não coincidem</p>
                      )}
                  </div>
                </div>
              )}

              {/* Permissão + Admin toggle */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="permissao">Permissão</Label>
                  <Select
                    value={formData.permissao_id}
                    onValueChange={(value) =>
                      setFormData((prev) => ({ ...prev, permissao_id: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione uma permissão" />
                    </SelectTrigger>
                    <SelectContent>
                      {permissoes.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Nesta tela gerenciamos usuários com acesso ao dashboard.
                    A permissão Admin libera todos os setores automaticamente. */}
                <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 h-fit mt-auto">
                  <UserCog className="h-4 w-4 text-primary shrink-0" />
                  <span className="text-sm text-foreground">
                    {isAdminPermission ? 'Admin — todos os setores' : 'Supervisor — setores selecionados'}
                  </span>
                </div>
              </div>

              {/* Setores */}
              {!isAdminPermission && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Setores que o usuário pode acessar</Label>
                    {formData.setores_selecionados.length > 0 && (
                      <span className="text-xs text-muted-foreground">
                        {formData.setores_selecionados.length} selecionado{formData.setores_selecionados.length > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  {setores.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhum setor cadastrado</p>
                  ) : (
                    <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 max-h-56 overflow-y-auto pr-1">
                      {setores.map((setor) => {
                        const isSelected = formData.setores_selecionados.includes(setor.id)
                        return (
                          <button
                            key={setor.id}
                            type="button"
                            onClick={() => toggleSetorSelection(setor.id)}
                            className={cn(
                              'flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors',
                              isSelected
                                ? 'border-primary bg-primary/10 text-primary font-medium'
                                : 'border-border/60 bg-background hover:bg-muted/50 text-foreground'
                            )}
                          >
                            <Building2 className="h-3.5 w-3.5 shrink-0 opacity-60" />
                            <span className="truncate leading-tight">{setor.nome}</span>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Footer fixo */}
          <div className="flex justify-end gap-2 px-6 py-4 shrink-0 border-t border-border/50">
            <Button
              variant="outline"
              onClick={() => setIsModalOpen(false)}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Salvando...' : editingUser ? 'Salvar alterações' : 'Criar Usuário'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
