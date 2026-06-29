'use client'

import React from 'react'
import { useEffect, useState, useCallback } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { CommandPalette } from '@/components/command-palette'
import { Button } from '@/components/ui/button'
import { User, LogOut, MessageCircle, Volume2, Play, KeyRound, Star, Info, Camera } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ThemeToggle } from '@/components/theme-toggle'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { ProfilePhotoDialog } from '@/components/profile-photo-dialog'
import { DisponibilidadePanel } from '@/components/workdesk/disponibilidade-panel'
import { PushToggle } from '@/components/push-toggle'
import { NotificacoesPanel } from '@/components/workdesk/notificacoes-panel'
import { useAudioAlert, type TicketSoundType } from '@/hooks/use-audio-alert'

interface ColaboradorSetor {
  setor_id: string
}

interface Colaborador {
  id: string
  nome: string
  email: string
  is_online: boolean
  foto_url?: string | null
  pausa_atual_id?: string | null
  setores_vinculados?: ColaboradorSetor[]
}

export default function WorkdeskLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [colaborador, setColaborador] = useState<Colaborador | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [ticketSound, setTicketSound] = useState<TicketSoundType>('default')
  const [avaliacaoMedia, setAvaliacaoMedia] = useState<number>(0)
  const [avaliacaoTotal, setAvaliacaoTotal] = useState(0)
  const supabase = createClient()
  const router = useRouter()
  const pathname = usePathname()
  const { setTicketSoundType, getTicketSoundType, playAlert, playBuhBuh, initAudioContext } = useAudioAlert()

  // Carregar preferência de som salva
  useEffect(() => {
    const saved = localStorage.getItem('ticketSoundType') as TicketSoundType | null
    if (saved === 'buhbuh' || saved === 'default') {
      setTicketSound(saved)
    }
  }, [])

  const handleSoundChange = (type: TicketSoundType) => {
    setTicketSound(type)
    setTicketSoundType(type)
    // Pré-visualizar o som selecionado
    initAudioContext()
    if (type === 'buhbuh') {
      playBuhBuh()
    } else {
      playAlert('new_ticket')
    }
  }

  const fetchColaborador = useCallback(async () => {
    // Skip auth check for login and reset-password pages
    if (pathname === '/workdesk/login' || pathname === '/workdesk/reset-password') {
      setLoading(false)
      return
    }

    try {
      setLoadError(false)

      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        router.push('/workdesk/login')
        return
      }

      // First get colaborador
      const { data: colaboradorData } = await supabase
        .from('colaboradores')
        .select('id, nome, email, is_online, pausa_atual_id, foto_url')
        .eq('email', user.email)
        .single()

      if (!colaboradorData) {
        setLoading(false)
        return
      }

      // Then get their setores
      const { data: setoresData } = await supabase
        .from('colaboradores_setores')
        .select('setor_id')
        .eq('colaborador_id', colaboradorData.id)

      const data = {
        ...colaboradorData,
        setores_vinculados: setoresData || [],
      }

      if (data) {
        setColaborador(data)
        // Buscar avaliações do colaborador
        supabase.from('avaliacoes').select('nota').eq('colaborador_id', data.id)
          .then(({ data: avaliacoes }) => {
            if (avaliacoes && avaliacoes.length > 0) {
              const media = avaliacoes.reduce((s, a) => s + a.nota, 0) / avaliacoes.length
              setAvaliacaoMedia(Math.round(media * 10) / 10)
              setAvaliacaoTotal(avaliacoes.length)
            }
          })
      }
    } catch (error) {
      console.warn('[WorkDesk Layout] Erro ao carregar colaborador:', error)
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }, [supabase, router, pathname])

  useEffect(() => {
    fetchColaborador()
  }, [fetchColaborador])

  // Real-time subscription to sync status across all sessions/browsers
  useEffect(() => {
    if (!colaborador?.id) return

    const channel = supabase
      .channel(`colaborador-status-${colaborador.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'colaboradores',
          filter: `id=eq.${colaborador.id}`,
        },
        (payload) => {
          const newData = payload.new as any
          if (!newData) return
          // Update local state with the new status from database
          setColaborador((prev) =>
            prev
              ? {
                  ...prev,
                  is_online: newData.is_online ?? prev.is_online,
                  pausa_atual_id: newData.pausa_atual_id ?? prev.pausa_atual_id,
                }
              : null
          )
        }
      )
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          console.log('[WorkDesk Layout] Colaborador status subscription connected')
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn(`[WorkDesk Layout] Colaborador status subscription error: ${status}`, err)
          // Retry: remove canal para forçar remontagem do useEffect
          setTimeout(() => supabase.removeChannel(channel), 5000)
        }
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [colaborador?.id, supabase])

  // Note: We intentionally DO NOT set offline on page close
  // The status is GLOBAL and should only change when user explicitly changes it
  // Multiple tabs/browsers share the same status

  const handleStatusChange = (newStatus: boolean) => {
    setColaborador((prev) => (prev ? { ...prev, is_online: newStatus } : null))
  }

  const handleLogout = async () => {
    if (colaborador?.id) {
      // Usa API route (service role) para garantir que o offline seja escrito
      // Supabase client-side com RLS bloqueia silenciosamente esta escrita
      await fetch('/api/colaborador/toggle-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ colaboradorId: colaborador.id, isOnline: false, pausaAtualId: null }),
      }).catch(() => {})
    }
    await supabase.auth.signOut()
    router.push('/workdesk/login')
  }

  // — Alterar senha
  const [senhaDialogOpen, setSenhaDialogOpen] = useState(false)
  const [fotoDialogOpen, setFotoDialogOpen] = useState(false)
  const [senhaAtual, setSenhaAtual] = useState('')
  const [novaSenha, setNovaSenha] = useState('')
  const [confirmarSenha, setConfirmarSenha] = useState('')
  const [senhaLoading, setSenhaLoading] = useState(false)
  const [senhaError, setSenhaError] = useState<string | null>(null)

  const resetSenhaDialog = () => {
    setSenhaAtual('')
    setNovaSenha('')
    setConfirmarSenha('')
    setSenhaError(null)
    setSenhaLoading(false)
  }

  const handleAlterarSenha = async () => {
    setSenhaError(null)

    if (!senhaAtual || !novaSenha || !confirmarSenha) {
      setSenhaError('Preencha todos os campos.')
      return
    }
    if (novaSenha.length < 6) {
      setSenhaError('A nova senha deve ter pelo menos 6 caracteres.')
      return
    }
    if (novaSenha !== confirmarSenha) {
      setSenhaError('A confirmação não coincide com a nova senha.')
      return
    }

    setSenhaLoading(true)

    // Verificar senha atual
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: colaborador!.email,
      password: senhaAtual,
    })
    if (authError) {
      setSenhaError('Senha atual incorreta.')
      setSenhaLoading(false)
      return
    }

    // Atualizar para nova senha
    const { error: updateError } = await supabase.auth.updateUser({ password: novaSenha })
    if (updateError) {
      setSenhaError('Erro ao atualizar senha. Tente novamente.')
      setSenhaLoading(false)
      return
    }

    // Marcar offline e fazer logout via API route (service role)
    if (colaborador?.id) {
      await fetch('/api/colaborador/toggle-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ colaboradorId: colaborador.id, isOnline: false, pausaAtualId: null }),
      }).catch(() => {})
    }
    await supabase.auth.signOut()
    router.push('/workdesk/login')
  }

  if (loading) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background">
        <div className="flex items-center gap-2 text-muted-foreground">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span>Carregando...</span>
        </div>
      </div>
    )
  }

  // Render login and reset-password pages without auth wrapper
  if (pathname === '/workdesk/login' || pathname === '/workdesk/reset-password') {
    return <>{children}</>
  }

  if (loadError) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4 text-center px-4">
          <div className="text-4xl">⚠️</div>
          <p className="text-sm text-muted-foreground max-w-xs">
            Nao foi possivel conectar ao servidor. Verifique sua conexao e tente novamente.
          </p>
          <Button
            onClick={() => {
              setLoading(true)
              fetchColaborador()
            }}
            variant="outline"
            className="gap-2"
          >
            Tentar novamente
          </Button>
        </div>
      </div>
    )
  }

  if (!colaborador) {
    return null
  }

  return (
    <div className="min-h-svh bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 flex h-16 items-center justify-between glass-header px-3 sm:px-4 lg:px-6">
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
            <MessageCircle className="h-5 w-5 text-primary-foreground" />
          </div>
          {/* Title escondido em mobile (375px) pra economizar espaço com o lado direito */}
          <h1 className="hidden sm:block text-base font-bold text-foreground tracking-tight">WorkDesk</h1>
          {/* Hint visual do command palette global (⌘K / Ctrl+K) — apenas indicativo */}
          <kbd className="kbd hidden lg:inline-flex" aria-hidden="true">Ctrl K</kbd>
        </div>

        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          {/* Status Panel */}
          <DisponibilidadePanel
            colaboradorId={colaborador.id}
            isOnline={colaborador.is_online}
            onStatusChange={handleStatusChange}
            setorIds={colaborador.setores_vinculados?.map((s) => s.setor_id) || []}
          />

          {/* Notifications */}
          <NotificacoesPanel
            colaboradorId={colaborador.id}
            setorIds={colaborador.setores_vinculados?.map((s) => s.setor_id) || []}
          />

          <ThemeToggle />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="gap-2 rounded-md hover:bg-muted">
                <Avatar className="h-8 w-8 ring-2 ring-primary/20">
                  {colaborador.foto_url && (
                    <AvatarImage src={colaborador.foto_url} alt={colaborador.nome} className="object-cover" />
                  )}
                  <AvatarFallback className="bg-primary/10 text-primary">
                    <User className="h-4 w-4" />
                  </AvatarFallback>
                </Avatar>
                <span className="hidden text-sm font-medium md:inline">{colaborador.nome}</span>
                <div className="hidden md:flex items-center gap-1 group relative">
                  <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />
                  <span className="tabnums text-xs font-semibold">{avaliacaoMedia.toFixed(1)}</span>
                  <div className="absolute right-0 top-8 z-50 hidden group-hover:block w-44 rounded-lg border bg-popover px-3 py-2 text-[10px] text-popover-foreground shadow-md">
                    NPS médio dos seus atendimentos ({avaliacaoTotal} {avaliacaoTotal === 1 ? 'avaliação' : 'avaliações'})
                  </div>
                </div>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64 glass-dropdown rounded-lg border-0">
              <div className="px-3 py-2">
                <p className="text-sm font-medium">{colaborador.nome}</p>
                <p className="text-xs text-muted-foreground">{colaborador.email}</p>
              </div>

              <DropdownMenuSeparator className="mx-2" />

              {/* Notificações (Web Push) */}
              <DropdownMenuLabel className="px-3 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                Notificações
              </DropdownMenuLabel>
              <div className="px-2 pb-1">
                <PushToggle variant="menu" />
              </div>

              <DropdownMenuSeparator className="mx-2" />

              {/* Som de novo ticket */}
              <DropdownMenuLabel className="px-3 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Volume2 className="h-3 w-3" />
                Som — Novo Ticket
              </DropdownMenuLabel>

              <div className="px-2 pb-1 space-y-0.5">
                {/* Opção Padrão */}
                <button
                  onClick={() => handleSoundChange('default')}
                  className={`w-full flex items-center justify-between gap-2 rounded-md px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    ticketSound === 'default'
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'hover:bg-black/5 dark:hover:bg-white/5 text-foreground'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="text-base">🔔</span>
                    Padrão
                  </span>
                  {ticketSound === 'default' && (
                    <Play className="h-3 w-3 shrink-0 opacity-60" />
                  )}
                </button>

                {/* Opção Buh Buh */}
                <button
                  onClick={() => handleSoundChange('buhbuh')}
                  className={`w-full flex items-center justify-between gap-2 rounded-md px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    ticketSound === 'buhbuh'
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'hover:bg-black/5 dark:hover:bg-white/5 text-foreground'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="text-base">📣</span>
                    Buh Buh
                  </span>
                  {ticketSound === 'buhbuh' && (
                    <Play className="h-3 w-3 shrink-0 opacity-60" />
                  )}
                </button>
              </div>

              <DropdownMenuSeparator className="mx-2" />

              <DropdownMenuItem
                onClick={() => setFotoDialogOpen(true)}
                className="rounded-md mx-1"
              >
                <Camera className="mr-2 h-4 w-4" />
                Alterar foto
              </DropdownMenuItem>

              <DropdownMenuItem
                onClick={() => { resetSenhaDialog(); setSenhaDialogOpen(true) }}
                className="rounded-md mx-1"
              >
                <KeyRound className="mr-2 h-4 w-4" />
                Alterar Senha
              </DropdownMenuItem>

              <DropdownMenuItem onClick={handleLogout} className="text-destructive rounded-md mx-1 mb-1">
                <LogOut className="mr-2 h-4 w-4" />
                Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Dialog — Alterar Senha */}
          <Dialog open={senhaDialogOpen} onOpenChange={(open) => { if (!open) resetSenhaDialog(); setSenhaDialogOpen(open) }}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <KeyRound className="h-4 w-4" />
                  Alterar Senha
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4 py-2">
                <div className="space-y-1.5">
                  <Label htmlFor="wk-senha-atual">Senha atual</Label>
                  <Input
                    id="wk-senha-atual"
                    type="password"
                    placeholder="Digite sua senha atual"
                    value={senhaAtual}
                    onChange={(e) => setSenhaAtual(e.target.value)}
                    disabled={senhaLoading}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="wk-nova-senha">Nova senha</Label>
                  <Input
                    id="wk-nova-senha"
                    type="password"
                    placeholder="Mínimo 6 caracteres"
                    value={novaSenha}
                    onChange={(e) => setNovaSenha(e.target.value)}
                    disabled={senhaLoading}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="wk-confirmar-senha">Confirmar nova senha</Label>
                  <Input
                    id="wk-confirmar-senha"
                    type="password"
                    placeholder="Repita a nova senha"
                    value={confirmarSenha}
                    onChange={(e) => setConfirmarSenha(e.target.value)}
                    disabled={senhaLoading}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleAlterarSenha() }}
                  />
                </div>
                {senhaError && (
                  <p className="text-sm text-destructive">{senhaError}</p>
                )}
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setSenhaDialogOpen(false)}
                  disabled={senhaLoading}
                >
                  Cancelar
                </Button>
                <Button onClick={handleAlterarSenha} disabled={senhaLoading}>
                  {senhaLoading ? 'Salvando...' : 'Salvar e sair'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Dialog — Foto de perfil */}
          <ProfilePhotoDialog
            open={fotoDialogOpen}
            onOpenChange={setFotoDialogOpen}
            currentFotoUrl={colaborador.foto_url}
            nome={colaborador.nome}
            onUpdated={(url) => setColaborador((prev) => (prev ? { ...prev, foto_url: url } : prev))}
          />
        </div>
      </header>

      <CommandPalette />

      {/* Page content */}
      <main className="relative z-10">{children}</main>
    </div>
  )
}
