'use client'

import { useState } from 'react'
import { Check } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export interface MultiSelectOption {
  id: string
  nome: string
  /** Cor opcional do ponto à esquerda (ex.: cor da tag, ou status do atendente). */
  cor?: string | null
}

/**
 * Filtro multi-seleção (botão + popover com checkboxes). Vazio = "todos".
 * Padrão usado nos monitoramentos (Tags, Setores, Subsetor, Atendente).
 */
export function MultiSelectFilter({
  icon: Icon,
  placeholder,
  header,
  pluralWord,
  options,
  selected,
  onChange,
  open,
  onOpenChange,
  searchable = false,
}: {
  icon: any
  placeholder: string
  header: string
  pluralWord: string
  options: MultiSelectOption[]
  selected: string[]
  onChange: (next: string[]) => void
  open: boolean
  onOpenChange: (o: boolean) => void
  searchable?: boolean
}) {
  const [search, setSearch] = useState('')
  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id])
  const filtered = search
    ? options.filter((o) => o.nome.toLowerCase().includes(search.toLowerCase()))
    : options
  const triggerLabel =
    selected.length === 0
      ? placeholder
      : selected.length === 1
        ? options.find((o) => o.id === selected[0])?.nome || placeholder
        : `${selected.length} ${pluralWord}`

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn('gap-2 bg-transparent', selected.length > 0 && 'border-primary text-primary')}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
          <span className="max-w-[150px] truncate">{triggerLabel}</span>
          {selected.length > 0 && (
            <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">{selected.length}</Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-60 p-3" align="end" onCloseAutoFocus={() => setSearch('')}>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{header}</p>
            {selected.length > 0 && (
              <button
                type="button"
                onClick={() => onChange([])}
                className="text-[11px] font-medium text-primary hover:underline"
              >
                Limpar
              </button>
            )}
          </div>
          {searchable && (
            <input
              type="text"
              name="multi-select-search"
              aria-label={`Buscar ${pluralWord}`}
              autoComplete="off"
              placeholder="Buscar…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          )}
          <div className="space-y-1 max-h-[280px] overflow-y-auto">
            {filtered.map((o) => {
              const sel = selected.includes(o.id)
              return (
                <button
                  key={o.id}
                  type="button"
                  aria-pressed={sel}
                  onClick={() => toggle(o.id)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted',
                    sel && 'font-medium text-primary',
                  )}
                >
                  <Check className={cn('h-3.5 w-3.5 shrink-0', !sel && 'invisible')} aria-hidden="true" />
                  {o.cor && (
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: o.cor }}
                      aria-hidden="true"
                    />
                  )}
                  <span className="truncate">{o.nome}</span>
                </button>
              )
            })}
            {filtered.length === 0 && (
              <p className="px-2 py-1.5 text-xs text-muted-foreground">Nenhum resultado</p>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
