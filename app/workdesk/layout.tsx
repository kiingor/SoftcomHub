'use client'

import React from 'react'
import { useEffect, useState, useCallback } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { User, LogOut, MessageCircle, Volume2, Play, KeyRound } from 'lucide-react'
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
import { DisponibilidadePanel } from '@/components/workdesk/disponibilidade-panel'
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
  setores_vinculados?: ColaboradorSetor[]
}

export default function WorkdeskLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [colaborador, setColaborador] = useState<Colaborador | null>(null)
  const [loading, setLoading] = useState(true)
  const [ticketSound, setTicketSound] = useState<TicketSoundType>('default')
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
    // Skip auth check for login page
    if (pathname === '/workdesk/login') {
      setLoading(false)
      return
    }

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
      .select('id, nome, email, is_online, pausa_atual_id')
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
    }
    setLoading(false)
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
          // Update local state with the new status from database
          setColaborador((prev) =>
            prev
              ? {
                  ...prev,
                  is_online: newData.is_online,
                  pausa_atual_id: newData.pausa_atual_id,
                }
              : null
          )
        }
      )
      .subscribe()

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
      await supabase.from('colaboradores').update({ is_online: false }).eq('id', colaborador.id)
    }
    await supabase.auth.signOut()
    router.push('/workdesk/login')
  }

  // — Alterar senha
  const [senhaDialogOpen, setSenhaDialogOpen] = useState(false)
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

    // Marcar offline e fazer logout
    if (colaborador?.id) {
      await supabase.from('colaboradores').update({ is_online: false }).eq('id', colaborador.id)
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

  // Render login page without auth wrapper
  if (pathname === '/workdesk/login') {
    return <>{children}</>
  }

  if (!colaborador) {
    return null
  }

  return (
    <div className="min-h-svh bg-[#F0F1F5] dark:bg-[#0A0A12]">
      {/* Decorative background blobs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -top-40 -left-40 h-[500px] w-[500px] rounded-full bg-purple-300/20 dark:bg-purple-500/10 blur-3xl" />
        <div className="absolute top-1/3 right-0 h-[400px] w-[400px] rounded-full bg-blue-300/20 dark:bg-blue-500/10 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-[350px] w-[350px] rounded-full bg-pink-300/15 dark:bg-pink-500/10 blur-3xl" />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-40 flex h-16 items-center justify-between glass-header px-4 lg:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary shadow-md">
            <MessageCircle className="h-5 w-5 text-primary-foreground" />
          </div>
          <h1 className="text-base font-bold text-foreground tracking-tight">WorkDesk</h1>
        </div>

        <div className="flex items-center gap-2">
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
              <Button variant="ghost" className="gap-2 rounded-xl hover:bg-white/50 dark:hover:bg-white/10">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 ring-2 ring-primary/20">
                  <User className="h-4 w-4 text-primary" />
                </div>
                <span className="hidden text-sm font-medium md:inline">{colaborador.nome}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64 glass-dropdown rounded-2xl border-0">
              <div className="px-3 py-2">
                <p className="text-sm font-medium">{colaborador.nome}</p>
                <p className="text-xs text-muted-foreground">{colaborador.email}</p>
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
                  className={`w-full flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm transition-colors ${
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
                  className={`w-full flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm transition-colors ${
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
                onClick={() => { resetSenhaDialog(); setSenhaDialogOpen(true) }}
                className="rounded-xl mx-1"
              >
                <KeyRound className="mr-2 h-4 w-4" />
                Alterar Senha
              </DropdownMenuItem>

              <DropdownMenuItem onClick={handleLogout} className="text-destructive rounded-xl mx-1 mb-1">
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
        </div>
      </header>

      {/* Page content */}
      <main className="relative z-10">{children}</main>
    </div>
  )
}
