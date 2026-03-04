'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { CalendarIcon } from 'lucide-react'
import { DateRange } from 'react-day-picker'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

interface DatePeriodFilterProps {
  dateFilter: string
  onDateFilterChange: (value: string) => void
  customRange: DateRange | undefined
  onCustomRangeChange: (range: DateRange | undefined) => void
  showToday?: boolean
  className?: string
  triggerClassName?: string
}

export function DatePeriodFilter({
  dateFilter,
  onDateFilterChange,
  customRange,
  onCustomRangeChange,
  showToday = true,
  className,
  triggerClassName,
}: DatePeriodFilterProps) {
  const [calendarOpen, setCalendarOpen] = useState(false)

  const getLabel = () => {
    if (dateFilter === 'custom' && customRange?.from) {
      const fromStr = format(customRange.from, 'dd/MM/yy', { locale: ptBR })
      const toStr = customRange.to
        ? format(customRange.to, 'dd/MM/yy', { locale: ptBR })
        : fromStr
      return `${fromStr} - ${toStr}`
    }
    if (dateFilter === 'today') return 'Hoje'
    if (dateFilter === 'all' || dateFilter === '0') return 'Todo periodo'
    return `Ultimos ${dateFilter} dias`
  }

  const handleSelectChange = (value: string) => {
    if (value === 'custom') {
      setCalendarOpen(true)
      onDateFilterChange('custom')
    } else {
      onDateFilterChange(value)
      onCustomRangeChange(undefined)
    }
  }

  const handleRangeSelect = (range: DateRange | undefined) => {
    onCustomRangeChange(range)
    if (range?.from && range?.to) {
      // Auto close after both dates selected
      setTimeout(() => setCalendarOpen(false), 300)
    }
  }

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Select
        value={dateFilter}
        onValueChange={handleSelectChange}
      >
        <SelectTrigger className={cn('w-48 bg-card border-border', triggerClassName)}>
          <SelectValue>{getLabel()}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {showToday && <SelectItem value="today">Hoje</SelectItem>}
          <SelectItem value="7">Ultimos 7 dias</SelectItem>
          <SelectItem value="30">Ultimos 30 dias</SelectItem>
          <SelectItem value="90">Ultimos 90 dias</SelectItem>
          <SelectItem value="all">Todo periodo</SelectItem>
          <SelectItem value="custom">Personalizado</SelectItem>
        </SelectContent>
      </Select>

      {dateFilter === 'custom' && (
        <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                'justify-start text-left font-normal gap-2',
                !customRange?.from && 'text-muted-foreground'
              )}
            >
              <CalendarIcon className="h-4 w-4" />
              {customRange?.from ? (
                customRange.to ? (
                  <>
                    {format(customRange.from, 'dd/MM/yyyy', { locale: ptBR })} - {format(customRange.to, 'dd/MM/yyyy', { locale: ptBR })}
                  </>
                ) : (
                  format(customRange.from, 'dd/MM/yyyy', { locale: ptBR })
                )
              ) : (
                'Selecione o periodo'
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="range"
              selected={customRange}
              onSelect={handleRangeSelect}
              numberOfMonths={2}
              locale={ptBR}
              disabled={{ after: new Date() }}
            />
          </PopoverContent>
        </Popover>
      )}
    </div>
  )
}

/**
 * Helper to compute a date cutoff from dateFilter + customRange
 */
export function getDateCutoffs(
  dateFilter: string,
  customRange?: DateRange
): { from: string | null; to: string | null } {
  if (dateFilter === 'custom' && customRange?.from) {
    const from = new Date(customRange.from)
    from.setHours(0, 0, 0, 0)
    const to = customRange.to ? new Date(customRange.to) : new Date(customRange.from)
    to.setHours(23, 59, 59, 999)
    return { from: from.toISOString(), to: to.toISOString() }
  }

  const now = new Date()

  if (dateFilter === 'today') {
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    return { from: startOfDay.toISOString(), to: null }
  }

  if (dateFilter === 'all' || dateFilter === '0') {
    return { from: null, to: null }
  }

  const days = parseInt(dateFilter, 10)
  if (!isNaN(days) && days > 0) {
    const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
    return { from: cutoff.toISOString(), to: null }
  }

  return { from: null, to: null }
}
