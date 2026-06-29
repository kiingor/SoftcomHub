'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import {
  Bot,
  Building2,
  Headset,
  Laptop,
  LayoutDashboard,
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

/**
 * Command palette global (⌘K / Ctrl+K) — navegação rápida pela plataforma e
 * busca de setores. Montado nos layouts autenticados (dashboard/workdesk/setor).
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const { theme, setTheme } = useTheme()
  const { data: colaborador } = useColaborador()
  const { data: setores = [] } = useSetores(
    colaborador?.id,
    colaborador?.is_master,
  )

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

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Buscar"
      description="Navegue pela plataforma e pelos setores"
    >
      <CommandInput placeholder="Buscar setor ou ir para…" />
      <CommandList>
        <CommandEmpty>Nada encontrado.</CommandEmpty>

        <CommandGroup heading="Ir para">
          <CommandItem
            value="dashboard inicio setores home"
            onSelect={() => go('/dashboard')}
          >
            <LayoutDashboard className="text-muted-foreground" />
            Dashboard
          </CommandItem>
          <CommandItem
            value="workdesk atendimento chat tickets"
            onSelect={() => go('/workdesk')}
          >
            <Headset className="text-muted-foreground" />
            WorkDesk
          </CommandItem>
          <CommandItem
            value="nexus ia bot inteligencia"
            onSelect={() => go('/dashboard/nexus')}
          >
            <Bot className="text-muted-foreground" />
            Nexus IA
          </CommandItem>
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
        </CommandGroup>

        {setores.length > 0 && (
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
  )
}
