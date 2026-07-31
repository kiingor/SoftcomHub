'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useTheme } from 'next-themes'
import {
  Bell,
  BellOff,
  Bot,
  Building2,
  Camera,
  Headset,
  Laptop,
  LayoutDashboard,
  LogOut,
  Moon,
  Sun,
} from 'lucide-react'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import { useColaborador, useSetores } from '@/lib/hooks/use-data'
import { canViewDashboard } from '@/lib/permissions'
import { unsubscribeCurrentBrowser, usePushNotifications } from '@/lib/use-push-notifications'
import { ProfilePhotoDialog } from '@/components/profile-photo-dialog'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

/**
 * Command palette global (⌘K / Ctrl+K) — navegação rápida + ações da conta
 * (tema, notificações, trocar foto, sair). Montado nos layouts autenticados.
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [fotoOpen, setFotoOpen] = useState(false)
  const router = useRouter()
  const pathname = usePathname()
  const { theme, setTheme } = useTheme()
  const { data: colaborador, mutate: mutateColaborador } = useColaborador()
  const { data: setores = [] } = useSetores(
    colaborador?.id,
    colaborador?.is_master,
  )
  const {
    state: pushState,
    supported: pushSupported,
    busy: pushBusy,
    enable: enablePush,
    disable: disablePush,
  } = usePushNotifications()

  // Atendente (só WorkDesk) não tem acesso à retaguarda — esconde Dashboard,
  // Nexus IA e a navegação por Setores. As ações de conta abaixo valem pra todos.
  const canSeeDashboard =
    !!colaborador?.is_master || canViewDashboard(colaborador?.permissoes as any)
  const pushSubscribed = pushState === 'subscribed'

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const go = (path: string) => {
    setOpen(false)
    router.push(path)
  }

  const applyTheme = (value: 'light' | 'dark' | 'system') => {
    setOpen(false)
    setTheme(value)
  }

  const togglePush = async () => {
    setOpen(false)
    try {
      if (pushSubscribed) {
        await disablePush()
        toast.success('Notificações desativadas')
      } else {
        await enablePush()
        if (typeof Notification !== 'undefined' && Notification.permission !== 'granted') {
          toast.error(
            Notification.permission === 'denied'
              ? 'Permissão bloqueada no navegador. Libere nas configurações do site.'
              : 'A permissão de notificações não foi concedida.',
          )
        } else {
          toast.success('Notificações ativadas')
        }
      }
    } catch {
      toast.error('Não foi possível alterar as notificações')
    }
  }

  const abrirFoto = () => {
    setOpen(false)
    setFotoOpen(true)
  }

  const sair = async () => {
    setOpen(false)
    const supabase = createClient()
    await unsubscribeCurrentBrowser().catch(() => {})
    await supabase.auth.signOut()
    window.location.href = pathname?.startsWith('/workdesk') ? '/workdesk/login' : '/login'
  }

  return (
    <>
      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Buscar"
        description="Navegue pela plataforma e execute ações rápidas"
      >
        <CommandInput placeholder="Buscar setor, ação ou ir para…" />
        <CommandList>
          <CommandEmpty>Nada encontrado.</CommandEmpty>

          <CommandGroup heading="Ir para">
            {canSeeDashboard && (
              <CommandItem
                value="dashboard inicio setores home"
                onSelect={() => go('/dashboard')}
              >
                <LayoutDashboard className="text-muted-foreground" />
                Dashboard
              </CommandItem>
            )}
            <CommandItem
              value="workdesk atendimento chat tickets"
              onSelect={() => go('/workdesk')}
            >
              <Headset className="text-muted-foreground" />
              WorkDesk
            </CommandItem>
            {canSeeDashboard && (
              <CommandItem
                value="nexus ia bot inteligencia"
                onSelect={() => go('/dashboard/nexus')}
              >
                <Bot className="text-muted-foreground" />
                Nexus IA
              </CommandItem>
            )}
          </CommandGroup>

          <CommandSeparator />
          <CommandGroup heading="Ações">
            <CommandItem
              value="tema claro light dia"
              onSelect={() => applyTheme('light')}
            >
              <Sun className="text-muted-foreground" />
              Tema: Claro
              {theme === 'light' && (
                <>
                  <span className="signal-dot ml-auto" aria-hidden="true" />
                  <span className="sr-only">(ativo)</span>
                </>
              )}
            </CommandItem>
            <CommandItem
              value="tema escuro dark noite"
              onSelect={() => applyTheme('dark')}
            >
              <Moon className="text-muted-foreground" />
              Tema: Escuro
              {theme === 'dark' && (
                <>
                  <span className="signal-dot ml-auto" aria-hidden="true" />
                  <span className="sr-only">(ativo)</span>
                </>
              )}
            </CommandItem>
            <CommandItem
              value="tema sistema system automatico"
              onSelect={() => applyTheme('system')}
            >
              <Laptop className="text-muted-foreground" />
              Tema: Sistema
              {theme === 'system' && (
                <>
                  <span className="signal-dot ml-auto" aria-hidden="true" />
                  <span className="sr-only">(ativo)</span>
                </>
              )}
            </CommandItem>

            {pushSupported && (
              <CommandItem
                value="notificacao notificacoes push avisos alertas mensagem"
                onSelect={togglePush}
                disabled={pushBusy}
              >
                {pushSubscribed ? (
                  <BellOff className="text-muted-foreground" />
                ) : (
                  <Bell className="text-muted-foreground" />
                )}
                {pushSubscribed ? 'Desativar notificações' : 'Ativar notificações'}
                {pushSubscribed && (
                  <>
                    <span className="signal-dot ml-auto" aria-hidden="true" />
                    <span className="sr-only">(ativas)</span>
                  </>
                )}
              </CommandItem>
            )}
          </CommandGroup>

          <CommandSeparator />
          <CommandGroup heading="Conta">
            <CommandItem
              value="trocar foto perfil avatar imagem"
              onSelect={abrirFoto}
            >
              <Camera className="text-muted-foreground" />
              Trocar foto
            </CommandItem>
            <CommandItem
              value="sair logout deslogar encerrar sessao"
              onSelect={sair}
              className="text-destructive data-[selected=true]:text-destructive"
            >
              <LogOut className="text-destructive" />
              Sair
            </CommandItem>
          </CommandGroup>

          {canSeeDashboard && setores.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Setores">
                {setores.map((s: any) => (
                  <CommandItem
                    key={s.id}
                    value={`setor ${s.nome}`}
                    onSelect={() => go(`/setor/${s.id}`)}
                  >
                    {s.cor ? (
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: s.cor }}
                        aria-hidden="true"
                      />
                    ) : (
                      <Building2 className="text-muted-foreground" />
                    )}
                    {s.nome}
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}
        </CommandList>

        <div className="border-border text-muted-foreground flex items-center justify-end gap-1.5 border-t px-3 py-2 text-xs">
          <span>Atalho</span>
          <kbd className="kbd">Ctrl K</kbd>
        </div>
      </CommandDialog>

      <ProfilePhotoDialog
        open={fotoOpen}
        onOpenChange={setFotoOpen}
        currentFotoUrl={colaborador?.foto_url}
        nome={colaborador?.nome}
        onUpdated={() => mutateColaborador()}
      />
    </>
  )
}
