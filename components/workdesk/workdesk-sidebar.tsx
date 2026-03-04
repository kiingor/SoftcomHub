'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import {
  Ticket,
  LogOut,
  MessageCircle,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { motion } from 'framer-motion'
import { DisponibilidadePanel } from '@/components/workdesk/disponibilidade-panel'

const navigation = [
  { name: 'Meus Tickets', href: '/workdesk', icon: Ticket },
]

interface WorkdeskSidebarProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  colaboradorId: string
  isOnline: boolean
  onStatusChange: (status: boolean) => void
}

function SidebarContent({ 
  onClose,
  colaboradorId,
  isOnline,
  onStatusChange,
}: { 
  onClose?: () => void
  colaboradorId: string
  isOnline: boolean
  onStatusChange: (status: boolean) => void
}) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  const handleLogout = async () => {
    await supabase
      .from('colaboradores')
      .update({ is_online: false })
      .eq('id', colaboradorId)
    await supabase.auth.signOut()
    router.push('/workdesk/login')
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-4">
        <Link href="/workdesk" className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary shadow-md">
            <MessageCircle className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="font-bold text-sidebar-foreground">WorkDesk</span>
        </Link>
        {onClose && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="lg:hidden"
          >
            <X className="h-5 w-5" />
            <span className="sr-only">Fechar menu</span>
          </Button>
        )}
      </div>

      <nav className="flex-1 space-y-1 p-4">
        {navigation.map((item) => {
          const isActive = pathname === item.href
          return (
            <Link
              key={item.name}
              href={item.href}
              onClick={onClose}
              className={cn(
                'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all',
                isActive
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent/50'
              )}
            >
              {isActive && (
                <motion.div
                  layoutId="activeNavWorkdesk"
                  className="absolute inset-0 rounded-xl bg-sidebar-accent"
                  transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                />
              )}
              <item.icon className={cn(
                'relative z-10 h-5 w-5 transition-colors',
                isActive ? 'text-sidebar-primary' : 'text-sidebar-foreground/70'
              )} />
              <span className="relative z-10">{item.name}</span>
            </Link>
          )
        })}
      </nav>

      <div className="border-t border-sidebar-border p-4 space-y-3">
        {/* Disponibilidade Panel */}
        <div className="rounded-xl bg-card p-3 border border-border">
          <p className="text-xs font-medium text-muted-foreground mb-2">Status</p>
          <DisponibilidadePanel
            colaboradorId={colaboradorId}
            isOnline={isOnline}
            onStatusChange={onStatusChange}
          />
        </div>

        {/* Logout Button */}
        <Button
          variant="ghost"
          className="w-full justify-start gap-3 text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={handleLogout}
        >
          <LogOut className="h-5 w-5" />
          Sair
        </Button>
      </div>
    </div>
  )
}

export function WorkdeskSidebar({ 
  open, 
  onOpenChange,
  colaboradorId,
  isOnline,
  onStatusChange,
}: WorkdeskSidebarProps) {
  return (
    <>
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-50 hidden w-64 border-r border-sidebar-border bg-sidebar lg:block">
        <SidebarContent 
          colaboradorId={colaboradorId}
          isOnline={isOnline}
          onStatusChange={onStatusChange}
        />
      </aside>

      {/* Mobile sidebar */}
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="left" className="w-64 bg-sidebar p-0">
          <SheetTitle className="sr-only">Menu de navegacao</SheetTitle>
          <SidebarContent 
            onClose={() => onOpenChange(false)}
            colaboradorId={colaboradorId}
            isOnline={isOnline}
            onStatusChange={onStatusChange}
          />
        </SheetContent>
      </Sheet>
    </>
  )
}
