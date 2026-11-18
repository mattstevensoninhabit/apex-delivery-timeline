'use client'

import { useId } from 'react'
import { HEX_COLOR } from '@/lib/branding'

export function ColorField({
  label,
  value,
  onChange,
  placeholder,
  optional = false,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  optional?: boolean
}) {
  const id = useId()
  const valid = value === '' ? optional : HEX_COLOR.test(value)
  const swatch = HEX_COLOR.test(value) ? value : (placeholder ?? '#000000')
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-muted-foreground">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={swatch}
          onChange={(e) => onChange(e.target.value)}
          aria-label={`${label} picker`}
          className="h-10 w-12 shrink-0 cursor-pointer rounded-md border border-input bg-background p-1"
        />
        <input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value.trim())}
          placeholder={placeholder ?? '#000000'}
          maxLength={7}
          aria-invalid={!valid}
          className="h-10 w-full rounded-md border border-input bg-background px-3 font-mono text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-invalid:border-destructive"
        />
      </div>
      {!valid ? <p className="text-xs text-destructive">Use a hex color like #1a3f6b.</p> : null}
    </div>
  )
}
