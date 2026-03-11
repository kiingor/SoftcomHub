'use client'

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
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Menu, LogOut, User as UserIcon, ChevronDown, Bell } from 'lucide-react'
import { ThemeToggle } from '@/components/theme-toggle'
import { useColaborador } from '@/lib/hooks/use-data'

interface DashboardHeaderProps {
  user: User
  onMenuClick: () => void
}

export function DashboardHeader({ user, onMenuClick }: DashboardHeaderProps) {
  const router = useRouter()
  const { data: colaborador } = useColaborador()

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
      </div>
    </header>
  )
}
