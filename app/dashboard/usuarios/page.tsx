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
import { Plus, Pencil, Search, UserCog, Building2 } from 'lucide-react'
import { motion } from 'framer-motion'

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
  return {
    colaboradores: colabsRes.data || [],
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

  const [formData, setFormData] = useState({
    nome: '',
    email: '',
    senha: '',
    is_master: false,
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
      is_master: false,
      permissao_id: '',
      setores_selecionados: [],
    })
    setIsModalOpen(true)
  }

  function openEditModal(user: Colaborador) {
    setEditingUser(user)
    setFormData({
      nome: user.nome,
      email: user.email,
      senha: '',
      is_master: user.is_master,
      permissao_id: user.permissao_id || '',
      setores_selecionados: getSetoresDoColaborador(user.id),
    })
    setIsModalOpen(true)
  }

  async function handleSave() {
    if (!formData.nome || !formData.email) return

    setSaving(true)
    try {
      if (editingUser) {
        // Update existing user
        await supabase
          .from('colaboradores')
          .update({
            nome: formData.nome,
            is_master: formData.is_master,
            permissao_id: formData.permissao_id || null,
          })
          .eq('id', editingUser.id)

        // Update setores relationships
        // First, remove all existing
        await supabase
          .from('colaborador_setores')
          .delete()
          .eq('colaborador_id', editingUser.id)

        // Then add new ones (only if not master)
        if (!formData.is_master && formData.setores_selecionados.length > 0) {
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
            is_master: formData.is_master,
            permissao_id: formData.permissao_id || null,
            ativo: true,
            is_online: false,
          })
          .select()
          .single()

        if (colabError) throw colabError

        // Add setor relationships (only if not master)
        if (!formData.is_master && formData.setores_selecionados.length > 0 && newColab) {
          const relations = formData.setores_selecionados.map((setorId) => ({
            colaborador_id: newColab.id,
            setor_id: setorId,
          }))
          await supabase.from('colaborador_setores').insert(relations)
        }
      }

      setIsModalOpen(false)
      mutate()
    } catch (error) {
      console.error('Error saving user:', error)
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Usuários Master</h1>
          <p className="text-muted-foreground">
            Gerencie usuários e defina quais setores cada um pode acessar
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
      <Card className="glass-card-elevated rounded-2xl border-0">
        <CardContent className="p-0 max-h-[calc(100vh-220px)] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Permissão</TableHead>
                <TableHead>Setores</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-20">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
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
                      <TableCell className="font-medium">{user.nome}</TableCell>
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
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditModal(user)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </motion.tr>
                  )
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create/Edit Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto glass-card-elevated rounded-2xl border-0">
          <DialogHeader>
            <DialogTitle>
              {editingUser ? 'Editar Usuário' : 'Novo Usuário'}
            </DialogTitle>
            <DialogDescription>
              {editingUser
                ? 'Atualize as informações do usuário e seus setores'
                : 'Cadastre um novo usuário e defina seus acessos'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-6 py-4">
            {/* Basic Info */}
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

              <div className="flex items-center gap-3 pt-6">
                <Switch
                  id="is_master"
                  checked={formData.is_master}
                  onCheckedChange={(checked) =>
                    setFormData((prev) => ({ ...prev, is_master: checked }))
                  }
                />
                <Label htmlFor="is_master" className="cursor-pointer">
                  Usuário Admin (acesso a todos os setores)
                </Label>
              </div>
            </div>

            {/* Setores Selection */}
            {!formData.is_master && (
              <div className="space-y-3">
                <Label>Setores que o usuário pode acessar</Label>
                <Card className="glass-card-elevated rounded-2xl border-0">
                  <CardContent className="p-4">
                    {setores.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        Nenhum setor cadastrado
                      </p>
                    ) : (
                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {setores.map((setor) => (
                          <div
                            key={setor.id}
                            className="flex items-center gap-2 rounded-lg border p-3 transition-colors hover:bg-muted/50"
                          >
                            <Checkbox
                              id={`setor-${setor.id}`}
                              checked={formData.setores_selecionados.includes(
                                setor.id
                              )}
                              onCheckedChange={() =>
                                toggleSetorSelection(setor.id)
                              }
                            />
                            <Label
                              htmlFor={`setor-${setor.id}`}
                              className="flex cursor-pointer items-center gap-2"
                            >
                              <Building2 className="h-4 w-4 text-muted-foreground" />
                              {setor.nome}
                            </Label>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsModalOpen(false)}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Salvando...' : editingUser ? 'Salvar' : 'Criar Usuário'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
