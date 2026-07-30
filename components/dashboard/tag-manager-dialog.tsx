'use client'

import { useState } from 'react'
import { Loader2, Pencil, Plus, Tag, Trash2, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

export type TagRegistro = {
  id: string
  nome: string
  cor: string
  ordem: number
}

const CORES_DISPONIVEIS = [
  { name: 'Azul', value: '#3B82F6' },
  { name: 'Verde', value: '#22C55E' },
  { name: 'Amarelo', value: '#EAB308' },
  { name: 'Laranja', value: '#F97316' },
  { name: 'Vermelho', value: '#EF4444' },
  { name: 'Rosa', value: '#EC4899' },
  { name: 'Roxo', value: '#8B5CF6' },
  { name: 'Ciano', value: '#06B6D4' },
  { name: 'Cinza', value: '#6B7280' },
]

const COR_PADRAO = '#6B7280'

/**
 * CRUD de tags, servindo os dois registros que têm o mesmo formato: `tags`
 * (origem do canal — Matriz, Filial, PEV...) e `tags_setor` (operação do
 * atendente dentro do canal — Suporte Chat, Pit Stop). São tabelas distintas de
 * propósito: uma 2ª chave estrangeira de `setores` para `tags` tornaria o embed
 * `tags(...)` ambíguo e o PostgREST passaria a responder 300.
 *
 * `tags_setor` é por canal, então exige `setorId`. `tags` é global e não usa.
 */
export function TagManagerDialog({
  open,
  onOpenChange,
  tabela,
  setorId,
  titulo,
  descricao,
  exemploNome,
  tags,
  carregando,
  onChanged,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Tabela de destino: 'tags' ou 'tags_setor'. */
  tabela: 'tags' | 'tags_setor'
  /** Canal dono das tags. Obrigatório para 'tags_setor', ignorado em 'tags'. */
  setorId?: string
  titulo: string
  descricao: string
  exemploNome: string
  tags: TagRegistro[]
  carregando: boolean
  /** Chamado depois de gravar — quem abriu recarrega a lista e os canais. */
  onChanged: () => void | Promise<void>
}) {
  const supabase = createClient()
  const [form, setForm] = useState({ nome: '', cor: COR_PADRAO, ordem: 0 })
  const [editando, setEditando] = useState<TagRegistro | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [excluindoId, setExcluindoId] = useState<string | null>(null)

  function limparForm() {
    setEditando(null)
    setForm({ nome: '', cor: COR_PADRAO, ordem: 0 })
  }

  async function salvar() {
    const nome = form.nome.trim()
    if (!nome) {
      toast.error('Digite um nome para a tag')
      return
    }
    if (tabela === 'tags_setor' && !setorId) {
      toast.error('Canal não identificado')
      return
    }
    setSalvando(true)
    try {
      const valores = { nome, cor: form.cor, ordem: form.ordem }
      // `setor_id` só na criação: mover tag de canal mudaria o recorte de quem
      // já está marcado com ela, sem aviso.
      const paraInserir =
        tabela === 'tags_setor' ? { ...valores, setor_id: setorId } : valores
      const { error } = editando
        ? await supabase.from(tabela).update(valores).eq('id', editando.id)
        : await supabase.from(tabela).insert(paraInserir)
      if (error) throw error
      toast.success(editando ? 'Tag atualizada!' : 'Tag criada!')
      limparForm()
      await onChanged()
    } catch (err: any) {
      // Índice único (setor_id, lower(nome)) — nome repetido no mesmo canal.
      toast.error(
        err?.code === '23505'
          ? 'Já existe uma tag com esse nome neste canal'
          : 'Erro ao salvar tag',
      )
    } finally {
      setSalvando(false)
    }
  }

  async function excluir(tag: TagRegistro) {
    setExcluindoId(tag.id)
    try {
      const { error } = await supabase.from(tabela).delete().eq('id', tag.id)
      if (error) throw error
      // A FK é ON DELETE SET NULL: o canal não some, só volta a ficar sem tag.
      toast.success('Tag excluída!')
      await onChanged()
    } catch {
      toast.error('Erro ao excluir tag')
    } finally {
      setExcluindoId(null)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(aberto) => {
        if (!aberto) limparForm()
        onOpenChange(aberto)
      }}
    >
      <DialogContent className="glass-card-elevated rounded-lg max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Tag className="h-5 w-5 text-primary" />
            {titulo}
          </DialogTitle>
          <DialogDescription>{descricao}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="glass-card rounded-md p-4 space-y-3">
            <p className="text-sm font-medium">{editando ? 'Editar Tag' : 'Nova Tag'}</p>
            <div className="flex gap-3">
              <div className="flex-1 space-y-2">
                <Label htmlFor={`${tabela}-nome`}>Nome</Label>
                <Input
                  id={`${tabela}-nome`}
                  placeholder={exemploNome}
                  value={form.nome}
                  onChange={(e) => setForm((prev) => ({ ...prev, nome: e.target.value }))}
                  className="glass-input rounded-md"
                  onKeyDown={(e) => e.key === 'Enter' && salvar()}
                />
              </div>
              <div className="w-20 space-y-2">
                <Label htmlFor={`${tabela}-ordem`}>Ordem</Label>
                <Input
                  id={`${tabela}-ordem`}
                  type="number"
                  min={0}
                  placeholder="0"
                  value={form.ordem}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, ordem: parseInt(e.target.value, 10) || 0 }))
                  }
                  className="glass-input rounded-md text-center"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Cor</Label>
              <div className="flex flex-wrap gap-2">
                {CORES_DISPONIVEIS.map((cor) => (
                  <button
                    key={cor.value}
                    type="button"
                    onClick={() => setForm((prev) => ({ ...prev, cor: cor.value }))}
                    className={cn(
                      'h-7 w-7 rounded-full border-2 transition-all duration-200',
                      form.cor === cor.value
                        ? 'border-foreground scale-110 ring-2 ring-offset-2 ring-foreground/20'
                        : 'border-transparent hover:scale-110',
                    )}
                    style={{ backgroundColor: cor.value }}
                    title={cor.name}
                  />
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              {editando && (
                <Button variant="ghost" size="sm" onClick={limparForm}>
                  <X className="h-4 w-4 mr-1" />
                  Cancelar
                </Button>
              )}
              <Button
                size="sm"
                onClick={salvar}
                disabled={salvando || !form.nome.trim()}
                className="ml-auto"
              >
                {salvando ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : editando ? (
                  'Salvar'
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-1" />
                    Adicionar
                  </>
                )}
              </Button>
            </div>
          </div>

          <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
            {carregando ? (
              <div className="stagger space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 p-3 rounded-md border border-border bg-muted/30"
                  >
                    <div className="skeleton h-4 w-4 rounded-full shrink-0" />
                    <div className="skeleton h-3.5 flex-1" />
                    <div className="skeleton h-3.5 w-8" />
                  </div>
                ))}
              </div>
            ) : tags.length === 0 ? (
              <div className="text-center py-6">
                <Tag className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
                <p className="text-sm font-medium tracking-tight text-foreground">
                  Nenhuma tag criada ainda
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{descricao}</p>
              </div>
            ) : (
              tags.map((tag) => (
                <div
                  key={tag.id}
                  className="flex items-center gap-3 p-3 rounded-md border border-border bg-muted/30"
                >
                  <span
                    className="h-4 w-4 rounded-full shrink-0"
                    style={{ backgroundColor: tag.cor }}
                  />
                  <span className="flex-1 text-sm font-medium">{tag.nome}</span>
                  <span className="font-mono tabnums text-xs text-muted-foreground w-8 text-center">
                    #{tag.ordem ?? 0}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => {
                        setEditando(tag)
                        setForm({ nome: tag.nome, cor: tag.cor, ordem: tag.ordem ?? 0 })
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                      disabled={excluindoId === tag.id}
                      onClick={() => excluir(tag)}
                    >
                      {excluindoId === tag.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-md">
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
