'use client'

import { useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
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
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Menu, LogOut, User as UserIcon, ChevronDown, Bell, KeyRound } from 'lucide-react'
import { ThemeToggle } from '@/components/theme-toggle'
import { useColaborador } from '@/lib/hooks/use-data'

interface DashboardHeaderProps {
  user: User
  onMenuClick: () => void
}

export function DashboardHeader({ user, onMenuClick }: DashboardHeaderProps) {
  const router = useRouter()
  const { data: colaborador } = useColaborador()

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
    const supabase = createClient()

    // Verificar senha atual
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: user.email!,
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

    // Logout para forçar novo login com nova senha
    await supabase.auth.signOut()
    router.push('/login')
  }

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  const userInitials = user.email
    ? user.email.slice(0, 2).toUpperCase()
    : 'U'

  const userDisplayName = colaborador?.nome || (user.email
    ? user.email.split('@')[0]
    : 'Usuario')

  const userRole = colaborador?.is_master
    ? 'Administrador'
    : (colaborador?.permissoes as { nome?: string } | null)?.nome || 'Usuário'

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center justify-between glass-header px-4 lg:px-6">
      {/* Left side */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={onMenuClick}
          className="lg:hidden h-9 w-9 rounded-xl hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
        >
          <Menu className="h-5 w-5" />
          <span className="sr-only">Abrir menu</span>
        </Button>

      </div>

      {/* Right side */}
      <div className="flex items-center gap-1.5">
        {/* Notifications placeholder */}
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9 rounded-xl hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
        >
          <Bell className="h-[18px] w-[18px] text-muted-foreground" />
          <span className="sr-only">Notificacoes</span>
        </Button>

        {/* Theme toggle */}
        <ThemeToggle />

        {/* Divider */}
        <div className="hidden md:block h-6 w-px bg-gradient-to-b from-transparent via-black/10 to-transparent dark:via-white/10 mx-1" />

        {/* User dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="flex items-center gap-2.5 pl-2 pr-3 h-10 rounded-2xl hover:bg-black/5 dark:hover:bg-white/10 transition-all"
            >
              <Avatar className="h-8 w-8 glass-avatar-ring">
                <AvatarFallback className="bg-primary text-primary-foreground text-xs font-bold">
                  {userInitials}
                </AvatarFallback>
              </Avatar>
              <div className="hidden md:flex flex-col items-start">
                <span className="text-sm font-medium text-foreground leading-tight capitalize">
                  {userDisplayName}
                </span>
                <span className="text-[10px] text-muted-foreground leading-tight">
                  {userRole}
                </span>
              </div>
              <ChevronDown className="hidden md:block h-3.5 w-3.5 text-muted-foreground ml-0.5" />
            </Button>
          </DropdownMenuTrigger>

          <DropdownMenuContent
            align="end"
            className="w-60 rounded-2xl glass-dropdown p-1.5"
          >
            {/* User info header */}
            <div className="px-3 py-3">
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10 glass-avatar-ring">
                  <AvatarFallback className="bg-primary text-primary-foreground text-sm font-bold">
                    {userInitials}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate capitalize">
                    {userDisplayName}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {user.email}
                  </p>
                </div>
              </div>
            </div>

            <DropdownMenuSeparator className="bg-black/5 dark:bg-white/8 mx-1" />

            <DropdownMenuItem className="rounded-xl py-2.5 px-3 gap-2.5 cursor-pointer focus:bg-black/5 dark:focus:bg-white/5">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted">
                <UserIcon className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <span className="text-sm">Meu Perfil</span>
            </DropdownMenuItem>

            <DropdownMenuItem
              onClick={() => { resetSenhaDialog(); setSenhaDialogOpen(true) }}
              className="rounded-xl py-2.5 px-3 gap-2.5 cursor-pointer focus:bg-black/5 dark:focus:bg-white/5"
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted">
                <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <span className="text-sm">Alterar Senha</span>
            </DropdownMenuItem>

            <DropdownMenuSeparator className="bg-black/5 dark:bg-white/8 mx-1" />

            <DropdownMenuItem
              onClick={handleSignOut}
              className="rounded-xl py-2.5 px-3 gap-2.5 cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/5"
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-destructive/10">
                <LogOut className="h-3.5 w-3.5 text-destructive" />
              </div>
              <span className="text-sm">Sair da conta</span>
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
                <Label htmlFor="senha-atual">Senha atual</Label>
                <Input
                  id="senha-atual"
                  type="password"
                  placeholder="Digite sua senha atual"
                  value={senhaAtual}
                  onChange={(e) => setSenhaAtual(e.target.value)}
                  disabled={senhaLoading}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nova-senha">Nova senha</Label>
                <Input
                  id="nova-senha"
                  type="password"
                  placeholder="Mínimo 6 caracteres"
                  value={novaSenha}
                  onChange={(e) => setNovaSenha(e.target.value)}
                  disabled={senhaLoading}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirmar-senha">Confirmar nova senha</Label>
                <Input
                  id="confirmar-senha"
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
  )
}
