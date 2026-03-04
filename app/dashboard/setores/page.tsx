'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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
import { Building2, Plus, Pencil, Loader2, AlertCircle } from 'lucide-react'

interface Setor {
  id: string
  nome: string
  descricao: string | null
  template_id: string | null
  phone_number_id: string | null
  created_at: string
}

export default function SetoresPage() {
  const [setores, setSetores] = useState<Setor[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingSetor, setEditingSetor] = useState<Setor | null>(null)
  const [formData, setFormData] = useState({ nome: '', descricao: '', template_id: '', phone_number_id: '' })
  const [saving, setSaving] = useState(false)

  const supabase = createClient()

  async function fetchSetores() {
    setLoading(true)
    setError(null)
    try {
      const { data, error: fetchError } = await supabase
        .from('setores')
        .select('*')
        .order('created_at', { ascending: false })

      if (fetchError) {
        console.error('[v0] Error fetching setores:', fetchError)
        setError(fetchError.message)
        return
      }

      setSetores(data || [])
    } catch (err: any) {
      console.error('[v0] Exception fetching setores:', err)
      setError(err.message || 'Erro ao carregar setores')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchSetores()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function openCreateModal() {
    setEditingSetor(null)
    setFormData({ nome: '', descricao: '', template_id: '', phone_number_id: '' })
    setModalOpen(true)
  }

  function openEditModal(setor: Setor) {
    setEditingSetor(setor)
    setFormData({ nome: setor.nome, descricao: setor.descricao || '', template_id: setor.template_id || '', phone_number_id: setor.phone_number_id || '' })
    setModalOpen(true)
  }

  async function handleSave() {
    if (!formData.nome.trim()) return

    setSaving(true)

    const payload = {
      nome: formData.nome.trim(),
      descricao: formData.descricao.trim() || null,
      template_id: formData.template_id.trim() || null,
      phone_number_id: formData.phone_number_id.trim() || null,
    }

    if (editingSetor) {
      const { error } = await supabase
        .from('setores')
        .update(payload)
        .eq('id', editingSetor.id)

      if (!error) {
        setModalOpen(false)
        fetchSetores()
      }
    } else {
      const { error } = await supabase.from('setores').insert(payload)

      if (!error) {
        setModalOpen(false)
        fetchSetores()
      }
    }

    setSaving(false)
  }

  function formatDate(dateString: string) {
    return new Date(dateString).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Setores
        </h1>
        <p className="text-muted-foreground">
          Gerencie os setores da sua empresa para organizar os atendimentos.
        </p>
      </div>

      <Card className="glass-card-elevated rounded-2xl border-0">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            Lista de Setores
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="rounded-full bg-destructive/10 p-4">
                <AlertCircle className="h-8 w-8 text-destructive" />
              </div>
              <h3 className="mt-4 text-lg font-semibold text-foreground">
                Erro ao carregar setores
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {error}
              </p>
              <Button onClick={fetchSetores} variant="outline" className="mt-4">
                Tentar novamente
              </Button>
            </div>
          ) : setores.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="rounded-full bg-primary/10 p-4">
                <Building2 className="h-8 w-8 text-primary" />
              </div>
              <h3 className="mt-4 text-lg font-semibold text-foreground">
                Nenhum setor cadastrado
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Comece criando o primeiro setor da sua empresa
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Descricao</TableHead>
                  <TableHead>Template ID</TableHead>
                  <TableHead>Phone Number ID</TableHead>
                  <TableHead>Criado em</TableHead>
                  <TableHead className="text-right">Acoes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                  {setores.map((setor) => (
                    <TableRow key={setor.id}>
                      <TableCell className="font-medium">{setor.nome}</TableCell>
                      <TableCell className="text-muted-foreground max-w-[200px] truncate">
                        {setor.descricao || '-'}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs font-mono">
                        {setor.template_id || <span className="text-muted-foreground/50">Nao configurado</span>}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs font-mono">
                        {setor.phone_number_id || <span className="text-muted-foreground/50">Nao configurado</span>}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(setor.created_at)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditModal(setor)}
                          className="hover:bg-primary/20"
                        >
                          <Pencil className="mr-1 h-4 w-4" />
                          Editar
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Floating Action Button */}
      <div className="fixed right-6 bottom-6">
        <Button
          onClick={openCreateModal}
          size="lg"
          className="h-14 w-14 rounded-full bg-primary text-primary-foreground glass-fab"
        >
          <Plus className="h-6 w-6" />
          <span className="sr-only">Novo Setor</span>
        </Button>
      </div>

      {/* Modal for Create/Edit */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="glass-card-elevated rounded-3xl border-0">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground">
              <Building2 className="h-5 w-5 text-primary" />
              {editingSetor ? 'Editar Setor' : 'Novo Setor'}
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="nome" className="text-foreground">
                Nome do Setor *
              </Label>
              <Input
                id="nome"
                placeholder="Ex: Suporte, Comercial, Ouvidoria..."
                value={formData.nome}
                onChange={(e) =>
                  setFormData({ ...formData, nome: e.target.value })
                }
                className="border-border bg-card"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="descricao" className="text-foreground">
                Descricao
              </Label>
              <Textarea
                id="descricao"
                placeholder="Descreva as responsabilidades deste setor..."
                value={formData.descricao}
                onChange={(e) =>
                  setFormData({ ...formData, descricao: e.target.value })
                }
                className="min-h-24 resize-none border-border bg-card"
              />
            </div>

            <div className="border-t border-border pt-4 mt-2">
              <p className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wide">Configuracoes WhatsApp (Disparo)</p>
              
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="template_id" className="text-foreground">
                    Template ID
                  </Label>
                  <Input
                    id="template_id"
                    placeholder="Ex: atendimento_inicio"
                    value={formData.template_id}
                    onChange={(e) =>
                      setFormData({ ...formData, template_id: e.target.value })
                    }
                    className="border-border bg-card"
                  />
                  <p className="text-[10px] text-muted-foreground">ID do template aprovado na Meta para disparo de mensagens</p>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="phone_number_id" className="text-foreground">
                    Phone Number ID
                  </Label>
                  <Input
                    id="phone_number_id"
                    placeholder="Ex: 123456789012345"
                    value={formData.phone_number_id}
                    onChange={(e) =>
                      setFormData({ ...formData, phone_number_id: e.target.value })
                    }
                    className="border-border bg-card"
                  />
                  <p className="text-[10px] text-muted-foreground">ID do numero de telefone da API do WhatsApp Business</p>
                </div>
              </div>
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
              {editingSetor ? 'Atualizar' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
