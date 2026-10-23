'use client'

import { useState } from 'react'
import { CalendarIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { formatMilestoneDate, parseIsoDate, toIsoDate } from '@/lib/dates'
import { cn } from '@/lib/utils'

export function DatePicker({
  value,
  onChange,
  label,
}: {
  value: string
  onChange: (value: string) => void
  label: string
}) {
  const [open, setOpen] = useState(false)
  const selected = parseIsoDate(value)
  const isTbc = !value || value === 'TBC'

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={`${label}: ${formatMilestoneDate(value)}`}
        className={cn(
          'flex h-10 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          isTbc ? 'text-muted-foreground' : 'text-foreground',
        )}
      >
        <span className="truncate">{formatMilestoneDate(value)}</span>
        <CalendarIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected}
          onSelect={(date) => {
            if (date) onChange(toIsoDate(date))
            setOpen(false)
          }}
        />
        <div className="flex justify-end border-t border-border p-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              onChange('TBC')
              setOpen(false)
            }}
          >
            Set as TBC
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
