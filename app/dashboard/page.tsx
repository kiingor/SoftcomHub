'use client'

import { useState, useMemo, useTransition, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  MessageCircle,
  Search,
  Plus,
  Loader2,
  Headphones,
  Phone,
  Mail,
  Users,
  Building2,
  Briefcase,
  ShoppingCart,
  Heart,
  Star,
  Zap,
  Globe,
  Smile,
  ThumbsUp,
  Bell,
  Calendar,
  Target,
  Award,
  Coffee,
  Rocket,
  Shield,
  Truck,
  CreditCard,
  HelpCircle,
  ArrowUpRight,
  Tag,
  Pencil,
  Trash2,
  X,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Skeleton } from '@/components/ui/skeleton'
import { useDashboardData } from '@/lib/hooks/use-data'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

// Available icons for sectors
const AVAILABLE_ICONS = [
  { name: 'MessageCircle', icon: MessageCircle },
  { name: 'Headphones', icon: Headphones },
  { name: 'Phone', icon: Phone },
  { name: 'Mail', icon: Mail },
  { name: 'Users', icon: Users },
  { name: 'Building2', icon: Building2 },
  { name: 'Briefcase', icon: Briefcase },
  { name: 'ShoppingCart', icon: ShoppingCart },
  { name: 'Heart', icon: Heart },
  { name: 'Star', icon: Star },
  { name: 'Zap', icon: Zap },
  { name: 'Globe', icon: Globe },
  { name: 'Smile', icon: Smile },
  { name: 'ThumbsUp', icon: ThumbsUp },
  { name: 'Bell', icon: Bell },
  { name: 'Calendar', icon: Calendar },
  { name: 'Target', icon: Target },
  { name: 'Award', icon: Award },
  { name: 'Coffee', icon: Coffee },
  { name: 'Rocket', icon: Rocket },
  { name: 'Shield', icon: Shield },
  { name: 'Truck', icon: Truck },
  { name: 'CreditCard', icon: CreditCard },
  { name: 'HelpCircle', icon: HelpCircle },
]

// Available colors
const AVAILABLE_COLORS = [
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

// Canal badge config
const CANAL_CONFIG: Record<string, { label: string; icon: string; color: string; bg: string }> = {
  whatsapp: { label: 'WhatsApp', icon: '💬', color: '#ffffff', bg: 'rgba(34, 197, 94, 0.85)' },
  evolution_api: { label: 'Evolution', icon: '🔗', color: '#ffffff', bg: 'rgba(14, 165, 233, 0.85)' },
  discord: { label: 'Discord', icon: '🎮', color: '#ffffff', bg: 'rgba(99, 102, 241, 0.85)' },
}

// Get icon component by name
function getIconComponent(iconName: string | null) {
  if (!iconName) return MessageCircle
  const found = AVAILABLE_ICONS.find((i) => i.name === iconName)
  return found ? found.icon : MessageCircle
}

// Helper: lighten a hex color for glass tinting
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

interface TagItem {
  id: string
  nome: string
  cor: string
  ordem: number
}

interface Setor {
  id: string
  nome: string
  descricao: string | null
  cor: string | null
  icon_url: string | null
  tag_id: string | null
  tags?: TagItem | null
  setor_canais?: Array<{ tipo: string; ativo: boolean }>
}

export default function DashboardPage() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [navigatingTo, setNavigatingTo] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [newSetor, setNewSetor] = useState({
    nome: '',
    descricao: '',
    cor: '#3B82F6',
    icon_url: 'MessageCircle',
    tag_id: '' as string,
  })
  const [saving, setSaving] = useState(false)

  // Tags state
  const [tags, setTags] = useState<TagItem[]>([])
  const [loadingTags, setLoadingTags] = useState(false)
  const [isTagsDialogOpen, setIsTagsDialogOpen] = useState(false)
  const [tagForm, setTagForm] = useState({ nome: '', cor: '#6B7280', ordem: 0 })
  const [editingTag, setEditingTag] = useState<TagItem | null>(null)
  const [savingTag, setSavingTag] = useState(false)
  const [deletingTagId, setDeletingTagId] = useState<string | null>(null)

  const supabase = createClient()
  const fetchTags = useCallback(async () => {
    setLoadingTags(true)
    const { data } = await supabase.from('tags').select('*').order('ordem').order('nome')
    if (data) setTags(data)
    setLoadingTags(false)
  }, [supabase])

  useEffect(() => {
    fetchTags()
  }, [fetchTags])

  const handleSetorClick = useCallback(
    (setorId: string) => {
      setNavigatingTo(setorId)
      startTransition(() => {
        router.push(`/setor/${setorId}`)
      })
    },
    [router]
  )

  const { data: dashboardData, isLoading: isLoading, mutate } = useDashboardData()
  const colaborador = dashboardData?.colaborador ?? null
  const setores = dashboardData?.setores ?? []

  const filteredSetores = useMemo(() => {
    const all = setores as Setor[]
    if (!searchTerm) return all
    return all.filter((s) =>
      s.nome.toLowerCase().includes(searchTerm.toLowerCase())
    )
  }, [searchTerm, setores])

  // Group sectors by tag
  const groupedSetores = useMemo(() => {
    const groups: { tag: TagItem | null; setores: Setor[] }[] = []
    const tagMap = new Map<string, { tag: TagItem; setores: Setor[] }>()

    for (const setor of filteredSetores) {
      if (setor.tag_id && setor.tags) {
        const existing = tagMap.get(setor.tag_id)
        if (existing) {
          existing.setores.push(setor)
        } else {
          tagMap.set(setor.tag_id, { tag: setor.tags, setores: [setor] })
        }
      }
    }

    // Sort tag groups by ordem, then by name
    const tagGroups = Array.from(tagMap.values()).sort((a, b) => {
      const ordemDiff = (a.tag.ordem ?? 0) - (b.tag.ordem ?? 0)
      return ordemDiff !== 0 ? ordemDiff : a.tag.nome.localeCompare(b.tag.nome)
    })
    groups.push(...tagGroups)

    // Untagged setores
    const untagged = filteredSetores.filter((s) => !s.tag_id)
    if (untagged.length > 0) {
      groups.push({ tag: null, setores: untagged })
    }

    return groups
  }, [filteredSetores])

  async function handleCreateSetor() {
    if (!newSetor.nome.trim()) return
    setSaving(true)
    try {
      const { data: setorCriado, error: setorError } = await supabase
        .from('setores')
        .insert({
          nome: newSetor.nome,
          descricao: newSetor.descricao || null,
          cor: newSetor.cor,
          icon_url: newSetor.icon_url,
          tag_id: newSetor.tag_id || null,
        })
        .select('id')
        .single()

      if (setorError || !setorCriado) throw setorError

      // Inserir horários padrão: segunda a sexta, 08:00–18:00
      const horariosDefault = [0, 1, 2, 3, 4, 5, 6].map((dia) => ({
        setor_id: setorCriado.id,
        dia_semana: dia,
        hora_inicio: '08:00',
        hora_fim: '18:00',
        ativo: dia >= 1 && dia <= 5,
      }))
      await supabase.from('horarios_atendimento').insert(horariosDefault)

      setIsCreateOpen(false)
      setNewSetor({ nome: '', descricao: '', cor: '#3B82F6', icon_url: 'MessageCircle', tag_id: '' })
      mutate()
    } catch {
      toast.error('Erro ao criar setor')
    } finally {
      setSaving(false)
    }
  }

  // Tag CRUD
  async function handleSaveTag() {
    if (!tagForm.nome.trim()) {
      toast.error('Digite um nome para a tag')
      return
    }
    setSavingTag(true)
    try {
      if (editingTag) {
        const { error } = await supabase
          .from('tags')
          .update({ nome: tagForm.nome.trim(), cor: tagForm.cor, ordem: tagForm.ordem })
          .eq('id', editingTag.id)
        if (error) throw error
        toast.success('Tag atualizada!')
      } else {
        const { error } = await supabase
          .from('tags')
          .insert({ nome: tagForm.nome.trim(), cor: tagForm.cor, ordem: tagForm.ordem })
        if (error) throw error
        toast.success('Tag criada!')
      }
      setEditingTag(null)
      setTagForm({ nome: '', cor: '#6B7280', ordem: 0 })
      await fetchTags()
      mutate()
    } catch {
      toast.error('Erro ao salvar tag')
    } finally {
      setSavingTag(false)
    }
  }

  async function handleDeleteTag(tag: TagItem) {
    setDeletingTagId(tag.id)
    try {
      const { error } = await supabase.from('tags').delete().eq('id', tag.id)
      if (error) throw error
      toast.success('Tag excluída!')
      await fetchTags()
      mutate()
    } catch {
      toast.error('Erro ao excluir tag')
    } finally {
      setDeletingTagId(null)
    }
  }

  const PreviewIcon = getIconComponent(newSetor.icon_url)

  // ─── Sector Card ───
  function SetorCard({ setor, index }: { setor: Setor; index: number }) {
    const SetorIcon = getIconComponent(setor.icon_url)
    const setorColor = setor.cor || '#3B82F6'
    const isNavigating = navigatingTo === setor.id && isPending
    const activeCanais: Array<{ tipo: string; ativo: boolean }> =
      (setor.setor_canais ?? []).filter((c) => c.ativo)

    return (
      <motion.div
        key={setor.id}
        initial={{ opacity: 0, y: 16, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ delay: index * 0.04, duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
        layout
      >
        <div
          className={cn(
            'group relative glass-card-elevated rounded-lg overflow-hidden cursor-pointer',
            'active:scale-[0.99] transition-transform duration-150',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            isNavigating && 'opacity-70 pointer-events-none'
          )}
          onClick={() => handleSetorClick(setor.id)}
          role="button"
          tabIndex={0}
          aria-label={`Acessar setor ${setor.nome}`}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') handleSetorClick(setor.id)
          }}
        >
          {/* Faixa de identidade do setor (cor do setor, não-sinal) */}
          <div
            className="h-0.5 w-full"
            style={{ background: `linear-gradient(90deg, ${setorColor}, ${hexToRgba(setorColor, 0.25)})` }}
          />

          <div className="relative p-5 space-y-4">
            {/* ─── Top row: Icon + Name + Arrow ─── */}
            <div className="flex items-start gap-3.5">
              <div
                className="shrink-0 flex h-11 w-11 items-center justify-center rounded-md"
                style={{ backgroundColor: setorColor }}
              >
                <SetorIcon className="h-5 w-5 text-white" />
              </div>

              <div className="flex-1 min-w-0 pt-0.5">
                <h3 className="font-semibold text-[15px] leading-snug line-clamp-1 tracking-tight">
                  {setor.nome}
                </h3>
                {setor.descricao ? (
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
                    {setor.descricao}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground/50 mt-0.5">Sem descrição</p>
                )}
              </div>

              {/* Indicador de navegação (sem sombra/levante) */}
              <div
                className={cn(
                  'shrink-0 h-8 w-8 rounded-md border border-border bg-card',
                  'flex items-center justify-center',
                  'opacity-0 group-hover:opacity-100',
                  'transition-opacity duration-200',
                )}
              >
                {isNavigating ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                ) : (
                  <ArrowUpRight className="h-3.5 w-3.5 text-foreground" />
                )}
              </div>
            </div>

            {/* ─── Divider ─── */}
            <div className="h-px bg-border" />

            {/* ─── Channels section ─── */}
            <div className="space-y-2">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
                Canais
              </p>
              {activeCanais.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {activeCanais.map((canal, idx) => {
                    const cfg = CANAL_CONFIG[canal.tipo]
                    if (!cfg) return null
                    return (
                      <span
                        key={idx}
                        className="glass-badge inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium text-foreground"
                      >
                        <span className="text-[9px]">{cfg.icon}</span>
                        {cfg.label}
                      </span>
                    )
                  })}
                </div>
              ) : (
                <p className="text-[10px] text-muted-foreground/60">Nenhum canal ativo</p>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    )
  }

  return (
    <div className="space-y-8">
      {/* ─── Hero + Pulse ─── */}
      <div className="space-y-5 anim-rise">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              SoftcomHub
            </p>
            <h1 className="mt-2 text-3xl sm:text-4xl font-semibold tracking-tight text-foreground text-balance">
              Setores
            </h1>
            <p className="mt-2 text-sm text-muted-foreground text-balance">
              Selecione um setor para gerenciar atendimentos, canais e equipes.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
              <Input
                placeholder="Buscar setor..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-64 pl-10 pr-14 h-10 rounded-md glass-input text-sm placeholder:text-muted-foreground/50"
                aria-label="Buscar setor"
              />
              <kbd
                className="kbd pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 hidden sm:inline-flex"
                aria-hidden
              >
                ⌘K
              </kbd>
            </div>
            {colaborador?.is_master && (
              <>
                <Button
                  variant="outline"
                  onClick={() => {
                    setEditingTag(null)
                    setTagForm({ nome: '', cor: '#6B7280', ordem: 0 })
                    setIsTagsDialogOpen(true)
                  }}
                  className="gap-2 h-10 rounded-md"
                >
                  <Tag className="h-4 w-4" />
                  Tags
                </Button>
                <Button
                  onClick={() => setIsCreateOpen(true)}
                  className="gap-2 h-10 rounded-md"
                >
                  <Plus className="h-4 w-4" />
                  Novo Setor
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Faixa pulse — operação ao vivo (apenas dados já carregados) */}
        {!isLoading && setores.length > 0 && (
          <div className="anim-rise flex flex-wrap items-center gap-x-7 gap-y-2 border-t border-border pt-4">
            <span className="inline-flex items-center gap-2 text-xs font-medium text-foreground">
              <span className="signal-dot" aria-hidden />
              Operação ao vivo
            </span>
            <span className="inline-flex items-baseline gap-1.5 text-xs text-muted-foreground">
              <span className="tabnums text-sm font-semibold text-foreground">{setores.length}</span>
              {setores.length === 1 ? 'setor ativo' : 'setores ativos'}
            </span>
            {tags.length > 0 && (
              <span className="inline-flex items-baseline gap-1.5 text-xs text-muted-foreground">
                <span className="tabnums text-sm font-semibold text-foreground">{tags.length}</span>
                {tags.length === 1 ? 'tag' : 'tags'}
              </span>
            )}
            {searchTerm && (
              <span className="inline-flex items-baseline gap-1.5 text-xs text-muted-foreground">
                <span className="tabnums text-sm font-semibold text-foreground">{filteredSetores.length}</span>
                em resultado
              </span>
            )}
          </div>
        )}
      </div>

      {/* ─── Content ─── */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="glass-card-elevated rounded-lg p-5 space-y-4">
              <div className="flex items-center gap-3.5">
                <Skeleton className="h-11 w-11 rounded-md shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-3 w-full" />
                </div>
              </div>
              <div className="space-y-2.5 pt-1">
                <Skeleton className="h-3 w-12" />
                <div className="flex gap-2">
                  <Skeleton className="h-6 w-20 rounded-md" />
                  <Skeleton className="h-6 w-24 rounded-md" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : filteredSetores.length === 0 ? (
        <div className="anim-rise glass-card-elevated rounded-lg p-20">
          <div className="flex flex-col items-center justify-center text-center">
            <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-lg bg-muted">
              <MessageCircle className="h-8 w-8 text-muted-foreground/60" />
            </div>
            <h3 className="text-lg font-semibold tracking-tight">
              {searchTerm ? 'Nenhum resultado para a busca' : 'Nenhum setor encontrado'}
            </h3>
            <p className="mt-1.5 text-sm text-muted-foreground max-w-xs text-balance">
              {searchTerm
                ? 'Tente outro termo ou limpe a busca para ver todos os setores.'
                : colaborador?.is_master
                ? 'Crie seu primeiro setor para começar a organizar seus atendimentos.'
                : 'Você não tem setores atribuídos no momento.'}
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          {groupedSetores.map((group, gi) => (
            <div key={group.tag?.id ?? 'sem-tag'} className="anim-rise">
              {/* Group header */}
              <div className="flex items-center gap-3 mb-4">
                <div className="flex items-center gap-2.5">
                  {group.tag ? (
                    <span className="inline-flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground">
                      <span
                        className="h-2.5 w-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: group.tag.cor }}
                      />
                      {group.tag.nome}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-2 text-sm font-semibold tracking-tight text-muted-foreground">
                      <span className="h-2.5 w-2.5 rounded-full shrink-0 bg-muted-foreground/40" />
                      Sem tag
                    </span>
                  )}
                  <span className="tabnums text-xs text-muted-foreground">
                    {group.setores.length} {group.setores.length === 1 ? 'setor' : 'setores'}
                  </span>
                </div>
                <div className="flex-1 h-px bg-border" />
              </div>

              {/* Sectors grid */}
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                <AnimatePresence mode="popLayout">
                  {group.setores.map((setor, index) => (
                    <SetorCard key={setor.id} setor={setor} index={index + gi * 4} />
                  ))}
                </AnimatePresence>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ─── Create Setor Dialog ─── */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="glass-card-elevated rounded-lg max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-lg">Novo Setor</DialogTitle>
            <DialogDescription>
              Crie um novo setor para organizar seus atendimentos
            </DialogDescription>
          </DialogHeader>

          {/* Scrollable content area */}
          <div className="overflow-y-auto max-h-[65vh] -mx-6 px-6">
            <div className="space-y-5 pb-2">
              {/* Preview */}
              <div className="flex justify-center pb-3">
                <div className="text-center">
                  <div
                    className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-lg"
                    style={{ backgroundColor: newSetor.cor }}
                  >
                    <PreviewIcon className="h-8 w-8 text-white" />
                  </div>
                  <p className="text-sm font-semibold tracking-tight">
                    {newSetor.nome || 'Nome do Setor'}
                  </p>
                </div>
              </div>

              <div className="h-px bg-border" />

              <div className="space-y-2">
                <Label htmlFor="nome">Nome do Setor</Label>
                <Input
                  id="nome"
                  value={newSetor.nome}
                  onChange={(e) => setNewSetor((prev) => ({ ...prev, nome: e.target.value }))}
                  placeholder="Ex: Suporte Técnico"
                  className="rounded-md glass-input"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="descricao">Descrição</Label>
                <Textarea
                  id="descricao"
                  value={newSetor.descricao}
                  onChange={(e) => setNewSetor((prev) => ({ ...prev, descricao: e.target.value }))}
                  placeholder="Descrição do setor..."
                  rows={2}
                  className="rounded-md glass-input"
                />
              </div>

              {/* Tag selector */}
              {tags.length > 0 && (
                <div className="space-y-2">
                  <Label>Tag</Label>
                  <Select
                    value={newSetor.tag_id || 'none'}
                    onValueChange={(v) => setNewSetor((prev) => ({ ...prev, tag_id: v === 'none' ? '' : v }))}
                  >
                    <SelectTrigger className="rounded-md glass-input">
                      <SelectValue placeholder="Selecionar tag..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sem tag</SelectItem>
                      {tags.map((tag) => (
                        <SelectItem key={tag.id} value={tag.id}>
                          <div className="flex items-center gap-2">
                            <span
                              className="h-3 w-3 rounded-full shrink-0"
                              style={{ backgroundColor: tag.cor }}
                            />
                            {tag.nome}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Color Picker */}
              <div className="space-y-2.5">
                <Label>Cor do Setor</Label>
                <div className="grid grid-cols-9 gap-2.5">
                  {AVAILABLE_COLORS.map((color) => (
                    <button
                      key={color.value}
                      type="button"
                      onClick={() => setNewSetor((prev) => ({ ...prev, cor: color.value }))}
                      className={cn(
                        'h-8 w-8 rounded-full border-2 transition-all duration-200',
                        newSetor.cor === color.value
                          ? 'border-foreground scale-110 ring-2 ring-offset-2 ring-foreground/20'
                          : 'border-transparent hover:scale-110'
                      )}
                      style={{ backgroundColor: color.value }}
                      title={color.name}
                    />
                  ))}
                </div>
              </div>

              {/* Icon Picker */}
              <div className="space-y-2.5">
                <Label>Ícone do Setor</Label>
                <div className="grid grid-cols-8 gap-2">
                  {AVAILABLE_ICONS.map((iconItem) => (
                    <button
                      key={iconItem.name}
                      type="button"
                      onClick={() => setNewSetor((prev) => ({ ...prev, icon_url: iconItem.name }))}
                      className={cn(
                        'flex h-10 w-10 items-center justify-center rounded-md border transition-colors duration-150',
                        newSetor.icon_url === iconItem.name
                          ? 'border-primary bg-primary/10'
                          : 'border-border hover:border-[var(--border-strong)] hover:bg-muted'
                      )}
                      title={iconItem.name}
                    >
                      <iconItem.icon className="h-5 w-5" />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsCreateOpen(false)}
              disabled={saving}
              className="rounded-md"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleCreateSetor}
              disabled={saving || !newSetor.nome.trim()}
              className="rounded-md"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Criando...
                </>
              ) : (
                'Criar Setor'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Tags Management Dialog ─── */}
      <Dialog open={isTagsDialogOpen} onOpenChange={setIsTagsDialogOpen}>
        <DialogContent className="glass-card-elevated rounded-lg max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Tag className="h-5 w-5 text-primary" />
              Gerenciar Tags
            </DialogTitle>
            <DialogDescription>
              Crie tags para organizar e agrupar seus setores
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Tag form */}
            <div className="glass-card rounded-md p-4 space-y-3">
              <p className="text-sm font-medium">
                {editingTag ? 'Editar Tag' : 'Nova Tag'}
              </p>
              <div className="flex gap-3">
                <div className="flex-1 space-y-2">
                  <Label htmlFor="tag-nome">Nome</Label>
                  <Input
                    id="tag-nome"
                    placeholder="Ex: Comercial, Suporte..."
                    value={tagForm.nome}
                    onChange={(e) => setTagForm((prev) => ({ ...prev, nome: e.target.value }))}
                    className="glass-input rounded-md"
                    onKeyDown={(e) => e.key === 'Enter' && handleSaveTag()}
                  />
                </div>
                <div className="w-20 space-y-2">
                  <Label htmlFor="tag-ordem">Ordem</Label>
                  <Input
                    id="tag-ordem"
                    type="number"
                    min={0}
                    placeholder="0"
                    value={tagForm.ordem}
                    onChange={(e) =>
                      setTagForm((prev) => ({ ...prev, ordem: parseInt(e.target.value, 10) || 0 }))
                    }
                    className="glass-input rounded-md text-center"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Cor</Label>
                <div className="flex flex-wrap gap-2">
                  {AVAILABLE_COLORS.map((color) => (
                    <button
                      key={color.value}
                      type="button"
                      onClick={() => setTagForm((prev) => ({ ...prev, cor: color.value }))}
                      className={cn(
                        'h-7 w-7 rounded-full border-2 transition-all duration-200',
                        tagForm.cor === color.value
                          ? 'border-foreground scale-110 ring-2 ring-offset-2 ring-foreground/20'
                          : 'border-transparent hover:scale-110'
                      )}
                      style={{ backgroundColor: color.value }}
                      title={color.name}
                    />
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                {editingTag && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEditingTag(null)
                      setTagForm({ nome: '', cor: '#6B7280', ordem: 0 })
                    }}
                  >
                    <X className="h-4 w-4 mr-1" />
                    Cancelar
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={handleSaveTag}
                  disabled={savingTag || !tagForm.nome.trim()}
                  className="ml-auto"
                >
                  {savingTag ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  ) : editingTag ? (
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

            {/* Tags list */}
            <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
              {loadingTags ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : tags.length === 0 ? (
                <div className="text-center py-6">
                  <Tag className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
                  <p className="text-sm font-medium tracking-tight text-foreground">Nenhuma tag criada ainda</p>
                  <p className="mt-1 text-xs text-muted-foreground">Crie tags para agrupar seus setores.</p>
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
                          setEditingTag(tag)
                          setTagForm({ nome: tag.nome, cor: tag.cor, ordem: tag.ordem ?? 0 })
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                        disabled={deletingTagId === tag.id}
                        onClick={() => handleDeleteTag(tag)}
                      >
                        {deletingTagId === tag.id ? (
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
            <Button variant="outline" onClick={() => setIsTagsDialogOpen(false)} className="rounded-md">
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
