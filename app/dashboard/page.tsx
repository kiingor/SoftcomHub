'use client'

import { useState, useMemo, useTransition, useCallback } from 'react'
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
  Sparkles,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Skeleton } from '@/components/ui/skeleton'
import { useColaborador, useSetores } from '@/lib/hooks/use-data'
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
import { cn } from '@/lib/utils'

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

interface Setor {
  id: string
  nome: string
  descricao: string | null
  cor: string | null
  icon_url: string | null
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
  })
  const [saving, setSaving] = useState(false)
  const supabase = createClient()

  const handleSetorClick = useCallback(
    (setorId: string) => {
      setNavigatingTo(setorId)
      startTransition(() => {
        router.push(`/setor/${setorId}`)
      })
    },
    [router]
  )

  const { data: colaborador, isLoading: loadingColab } = useColaborador()
  const { data: setores = [], isLoading: loadingSetores, mutate } = useSetores(
    colaborador?.id,
    colaborador?.is_master
  )

  const filteredSetores = useMemo(() => {
    if (!searchTerm) return setores as Setor[]
    return (setores as Setor[]).filter((s) =>
      s.nome.toLowerCase().includes(searchTerm.toLowerCase())
    )
  }, [searchTerm, setores])

  async function handleCreateSetor() {
    if (!newSetor.nome.trim()) return
    setSaving(true)
    try {
      await supabase.from('setores').insert({
        nome: newSetor.nome,
        descricao: newSetor.descricao || null,
        cor: newSetor.cor,
        icon_url: newSetor.icon_url,
      })
      setIsCreateOpen(false)
      setNewSetor({ nome: '', descricao: '', cor: '#3B82F6', icon_url: 'MessageCircle' })
      mutate()
    } catch {
      // Error silently handled — toast could be added here
    } finally {
      setSaving(false)
    }
  }

  const isLoading = loadingColab || (colaborador && loadingSetores)
  const PreviewIcon = getIconComponent(newSetor.icon_url)

  return (
    <div className="space-y-8">
      {/* ─── Header ─── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10">
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Setores</h1>
          </div>
          <p className="text-muted-foreground text-sm ml-[42px]">
            Selecione um setor para gerenciar
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
            <Input
              placeholder="Buscar setor..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-64 pl-10 h-10 rounded-2xl glass-input text-sm placeholder:text-muted-foreground/50"
            />
          </div>
          {colaborador?.is_master && (
            <Button
              onClick={() => setIsCreateOpen(true)}
              className="gap-2 h-10 rounded-2xl shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-shadow"
            >
              <Plus className="h-4 w-4" />
              Novo Setor
            </Button>
          )}
        </div>
      </div>

      {/* ─── Content ─── */}
      {isLoading ? (
        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="glass-card-elevated rounded-3xl p-5 space-y-4">
              <div className="flex items-center gap-3.5">
                <Skeleton className="h-12 w-12 rounded-2xl shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-3 w-full" />
                </div>
              </div>
              <div className="space-y-2.5 pt-1">
                <Skeleton className="h-3 w-12" />
                <div className="flex gap-2">
                  <Skeleton className="h-6 w-20 rounded-full" />
                  <Skeleton className="h-6 w-24 rounded-full" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : filteredSetores.length === 0 ? (
        <div className="glass-card-elevated rounded-3xl p-20">
          <div className="flex flex-col items-center justify-center text-center">
            <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-3xl bg-muted/40 glass-card">
              <MessageCircle className="h-9 w-9 text-muted-foreground/60" />
            </div>
            <h3 className="text-lg font-semibold">Nenhum setor encontrado</h3>
            <p className="mt-1.5 text-sm text-muted-foreground max-w-xs">
              {colaborador?.is_master
                ? 'Crie seu primeiro setor para começar a organizar seus atendimentos'
                : 'Você não tem setores atribuídos no momento'}
            </p>
          </div>
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          <AnimatePresence mode="popLayout">
            {filteredSetores.map((setor, index) => {
              const SetorIcon = getIconComponent(setor.icon_url)
              const setorColor = setor.cor || '#3B82F6'
              const isNavigating = navigatingTo === setor.id && isPending

              // Active channels from setor_canais
              const activeCanais: Array<{ tipo: string; ativo: boolean }> =
                (setor.setor_canais ?? []).filter((c) => c.ativo)

              return (
                <motion.div
                  key={setor.id}
                  initial={{ opacity: 0, y: 16, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{
                    delay: index * 0.04,
                    duration: 0.35,
                    ease: [0.23, 1, 0.32, 1],
                  }}
                  layout
                >
                  <div
                    className={cn(
                      'group relative glass-card-elevated glass-shimmer-hover rounded-3xl overflow-hidden cursor-pointer',
                      'active:scale-[0.98] transition-transform duration-150',
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
                    {/* Color accent bar at top */}
                    <div
                      className="h-1 w-full"
                      style={{
                        background: `linear-gradient(90deg, ${setorColor}, ${hexToRgba(setorColor, 0.3)})`,
                      }}
                    />

                    {/* Subtle color tint overlay */}
                    <div
                      className="absolute inset-0 pointer-events-none opacity-[0.04] group-hover:opacity-[0.07] transition-opacity duration-500"
                      style={{
                        background: `radial-gradient(ellipse at top left, ${setorColor} 0%, transparent 70%)`,
                      }}
                    />

                    <div className="relative p-5 space-y-4">
                      {/* ─── Top row: Icon + Name + Arrow ─── */}
                      <div className="flex items-start gap-3.5">
                        {/* Icon with glow */}
                        <div
                          className="glass-icon-glow shrink-0 flex h-12 w-12 items-center justify-center rounded-2xl shadow-sm"
                          style={{ backgroundColor: setorColor }}
                        >
                          <SetorIcon className="h-6 w-6 text-white drop-shadow-sm" />
                        </div>

                        <div className="flex-1 min-w-0 pt-0.5">
                          <h3 className="font-semibold text-[15px] leading-snug line-clamp-1 tracking-tight">
                            {setor.nome}
                          </h3>
                          {setor.descricao ? (
                            <p className="text-xs text-muted-foreground/70 mt-0.5 line-clamp-2 leading-relaxed">
                              {setor.descricao}
                            </p>
                          ) : (
                            <p className="text-xs text-muted-foreground/35 mt-0.5 italic">
                              Sem descrição
                            </p>
                          )}
                        </div>

                        {/* Floating arrow button */}
                        <div
                          className={cn(
                            'glass-fab shrink-0',
                            'h-8 w-8 rounded-xl',
                            'flex items-center justify-center',
                            'opacity-0 group-hover:opacity-100',
                            'translate-x-1 group-hover:translate-x-0',
                            'transition-all duration-300',
                          )}
                        >
                          {isNavigating ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                          ) : (
                            <ArrowUpRight className="h-3.5 w-3.5 text-foreground/70" />
                          )}
                        </div>
                      </div>

                      {/* ─── Divider ─── */}
                      <div className="h-px bg-gradient-to-r from-border/50 via-border/20 to-transparent" />

                      {/* ─── Channels section ─── */}
                      <div className="space-y-2">
                        <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-widest">
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
                                  className="glass-badge inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-medium"
                                  style={{
                                    backgroundColor: cfg.bg,
                                    color: cfg.color,
                                  }}
                                >
                                  <span className="text-[9px]">{cfg.icon}</span>
                                  {cfg.label}
                                </span>
                              )
                            })}
                          </div>
                        ) : (
                          <p className="text-[10px] text-muted-foreground/40 italic">
                            Nenhum canal ativo
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>
      )}

      {/* ─── Create Dialog ─── */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="glass-card-elevated rounded-3xl max-w-lg max-h-[90vh] overflow-y-auto border-0">
          <DialogHeader>
            <DialogTitle className="text-lg">Novo Setor</DialogTitle>
            <DialogDescription>
              Crie um novo setor para organizar seus atendimentos
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-4">
            {/* Preview */}
            <div className="flex justify-center pb-5">
              <div className="text-center">
                <div
                  className="glass-icon-glow mx-auto mb-3 flex h-18 w-18 items-center justify-center rounded-3xl shadow-lg"
                  style={{ backgroundColor: newSetor.cor }}
                >
                  <PreviewIcon className="h-9 w-9 text-white drop-shadow-sm" />
                </div>
                <p className="text-sm font-semibold tracking-tight">
                  {newSetor.nome || 'Nome do Setor'}
                </p>
              </div>
            </div>

            <div className="h-px bg-gradient-to-r from-transparent via-border/50 to-transparent" />

            <div className="space-y-2">
              <Label htmlFor="nome">Nome do Setor</Label>
              <Input
                id="nome"
                value={newSetor.nome}
                onChange={(e) => setNewSetor((prev) => ({ ...prev, nome: e.target.value }))}
                placeholder="Ex: Suporte Técnico"
                className="rounded-xl glass-input"
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
                className="rounded-xl glass-input"
              />
            </div>

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
                      'flex h-10 w-10 items-center justify-center rounded-xl border-2 transition-all duration-200',
                      newSetor.icon_url === iconItem.name
                        ? 'border-primary bg-primary/10 shadow-sm'
                        : 'border-border/50 hover:border-primary/40 hover:bg-muted/50'
                    )}
                    title={iconItem.name}
                  >
                    <iconItem.icon className="h-5 w-5" />
                  </button>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsCreateOpen(false)}
              disabled={saving}
              className="rounded-xl"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleCreateSetor}
              disabled={saving || !newSetor.nome.trim()}
              className="rounded-xl shadow-lg shadow-primary/20"
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
    </div>
  )
}
