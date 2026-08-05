'use client'

import React from "react"

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { cn } from '@/lib/utils'
import {
  Building2,
  BarChart3,
  MessageCircle,
  X,
  UserCog,
  Headphones,
  Loader2,
  Activity,
  Bot,
  HelpCircle,
  ExternalLink,
  Bug,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { motion } from 'framer-motion'
import { useColaborador } from '@/lib/hooks/use-data'

const baseNavigation = [
  { name: 'Setores', href: '/dashboard', icon: Building2 },
  { name: 'Monitoramento', href: '/dashboard/monitoramento', icon: Activity },
  { name: 'Nexus IA', href: '/dashboard/nexus', icon: Bot },
  { name: 'Dashboard Geral', href: '/dashboard/metricas', icon: BarChart3 },
]

const masterNavigation = [
  { name: 'Supervisores', href: '/dashboard/usuarios', icon: UserCog },
  { name: 'Logs de Erros', href: '/dashboard/logs', icon: Bug },
]

const atendentesNavigation = [
  { name: 'Atendentes', href: '/dashboard/colaboradores', icon: Headphones },
]

interface DashboardSidebarProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Minimizada no desktop: a aside some e o conteúdo ocupa a largura toda. */
  collapsed?: boolean
}

function SidebarContent({ onClose }: { onClose?: () => void }) {
  const pathname = usePathname()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [loadingHref, setLoadingHref] = useState<string | null>(null)
  const { data: colaborador } = useColaborador()
  const permissao = colaborador?.permissoes as { can_view_dashboard?: boolean; nome?: string } | null | undefined
  const canAccessAtendentes =
    colaborador?.is_master ||
    permissao?.can_view_dashboard ||
    permissao?.nome?.toLowerCase() === 'supervisor'

  const navigation = [
    ...baseNavigation,
    ...(canAccessAtendentes ? atendentesNavigation : []),
    ...(colaborador?.is_master ? masterNavigation : []),
  ]

  const handleNavClick = (e: React.MouseEvent, href: string) => {
    e.preventDefault()
    if (pathname === href) return
    setLoadingHref(href)
    onClose?.()
    startTransition(() => {
      router.push(href)
    })
  }

  return (
    <div className="flex h-full flex-col relative z-10">
      {/* Logo Section */}
      <div className="flex h-16 items-center justify-between px-5">
        <Link href="/dashboard" className="flex items-center gap-3 group">
          <div className="relative flex h-10 w-10 items-center justify-center rounded-md bg-primary transition-transform duration-300 group-hover:scale-105">
            <MessageCircle className="h-5 w-5 text-primary-foreground" />
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-foreground tracking-tight text-base leading-tight">
              Portal Hub
            </span>
            <span className="text-[10px] text-muted-foreground font-medium tracking-wide uppercase">
              Gestao de atendimento
            </span>
          </div>
        </Link>
        {onClose && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="lg:hidden rounded-md hover:bg-muted"
          >
            <X className="h-5 w-5" />
            <span className="sr-only">Fechar menu</span>
          </Button>
        )}
      </div>

      {/* Separator */}
      <div className="mx-5 h-px bg-border" />

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Menu
        </p>
        {navigation.map((item) => {
          const isActive = pathname === item.href
          const isLoading = loadingHref === item.href && isPending
          return (
            <a
              key={item.name}
              href={item.href}
              onClick={(e) => handleNavClick(e, item.href)}
              className={cn(
                'group relative flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-all cursor-pointer select-none outline-none active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0',
                isActive
                  ? 'text-foreground'
                  : 'text-muted-foreground glass-nav-hover hover:text-foreground',
                isLoading && 'opacity-70'
              )}
            >
              {isActive && (
                <motion.div
                  layoutId="activeNav"
                  className="absolute inset-0 rounded-md glass-nav-active"
                  transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                />
              )}

              <div
                className={cn(
                  'relative z-10 flex h-8 w-8 items-center justify-center rounded-md transition-all duration-300',
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground group-hover:text-foreground'
                )}
              >
                {isLoading ? (
                  <Loader2 className="h-[18px] w-[18px] animate-spin" />
                ) : (
                  <item.icon className="h-[18px] w-[18px]" />
                )}
              </div>

              <span className="relative z-10 flex-1">{item.name}</span>

              {isActive && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="relative z-10 h-1.5 w-1.5 rounded-full bg-primary"
                />
              )}
            </a>
          )
        })}
      </nav>

      {/* Separator */}
      <div className="mx-5 h-px bg-border" />

      {/* Footer - Support Card */}
      <div className="p-4">
        <div className="glass-card-elevated rounded-lg p-4 overflow-hidden">
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
              <HelpCircle className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-foreground">
                Precisa de ajuda?
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground leading-relaxed">
                Acesse nossa central de suporte
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full mt-3 h-8 rounded-md text-xs font-medium text-primary hover:bg-primary/10 hover:text-primary gap-1.5"
          >
            Central de Ajuda
            <ExternalLink className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  )
}

export function DashboardSidebar({ open, onOpenChange, collapsed }: DashboardSidebarProps) {
  return (
    <>
      {/* Desktop sidebar — minimizada (collapsed) simplesmente não renderiza no lg+ */}
      {!collapsed && (
        <aside
          className="inset-y-0 left-0 z-50 hidden w-64 lg:block glass-panel"
          style={{ position: 'fixed', top: 0, bottom: 0, left: 0, width: '16rem' }}
        >
          <SidebarContent />
        </aside>
      )}

      {/* Mobile sidebar */}
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="left" className="w-72 p-0 glass-panel border-r-0">
          <SheetTitle className="sr-only">Menu de navegacao</SheetTitle>
          <SidebarContent onClose={() => onOpenChange(false)} />
        </SheetContent>
      </Sheet>
    </>
  )
}
