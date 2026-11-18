'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Star } from 'lucide-react'
import { saveBrand, setDefaultBrand } from '@/app/actions/brands'
import { Button } from '@/components/ui/button'
import { HEX_COLOR, brandStyle, type Brand, type BrandColors } from '@/lib/branding'
import { ColorField } from './color-field'
import { LogoUploader } from './logo-uploader'

const inputClass =
  'h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

const COLOR_FIELDS: { key: keyof BrandColors; label: string }[] = [
  { key: 'background', label: 'Page background' },
  { key: 'surface', label: 'Card surface' },
  { key: 'accent', label: 'Accent' },
  { key: 'timelineAccent', label: 'Timeline accent' },
]

export function BrandEditor({ brand }: { brand: Brand }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)
  const [name, setName] = useState(brand.name)
  const [headerLead, setHeaderLead] = useState(brand.headerLead)
  const [headerAccent, setHeaderAccent] = useState(brand.headerAccent)
  const [logoAlt, setLogoAlt] = useState(brand.logoAlt)
  const [colors, setColors] = useState<BrandColors>(brand.colors)
  const colorsValid = Object.values(colors).every((c) => HEX_COLOR.test(c))

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage(null)
    startTransition(async () => {
      const result = await saveBrand(brand.slug, { name, headerLead, headerAccent, logoAlt, colors })
      setMessage(result.ok ? { type: 'ok', text: 'Brand saved.' } : { type: 'error', text: result.error })
      if (result.ok) router.refresh()
    })
  }

  function handleMakeDefault() {
    startTransition(async () => {
      const result = await setDefaultBrand(brand.slug)
      setMessage(result.ok ? { type: 'ok', text: `${brand.name} is now the default brand.` } : { type: 'error', text: result.error })
      if (result.ok) router.refresh()
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5 text-card-foreground">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-lg font-bold">Brand</h2>
          <p className="text-sm text-muted-foreground">
            Page URL: <span className="font-mono">/{brand.slug}</span>
          </p>
        </div>
        {brand.isDefault ? (
          <span className="inline-flex items-center gap-1.5 self-start rounded-full bg-primary/15 px-2.5 py-1 text-xs font-semibold text-primary">
            <Star aria-hidden="true" className="size-3.5" />
            Default brand
          </span>
        ) : (
          <Button type="button" variant="outline" size="sm" onClick={handleMakeDefault} disabled={pending}>
            <Star aria-hidden="true" />
            Make default
          </Button>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          <span className="text-muted-foreground">Brand name</span>
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          <span className="text-muted-foreground">Header label</span>
          <input className={inputClass} value={headerLead} onChange={(e) => setHeaderLead(e.target.value)} maxLength={60} placeholder="AI Pod" />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          <span className="text-muted-foreground">Header accent</span>
          <input
            className={inputClass}
            value={headerAccent}
            onChange={(e) => setHeaderAccent(e.target.value)}
            maxLength={60}
            placeholder="Delivery Timelines"
          />
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <LogoUploader
          target="brand"
          slug={brand.slug}
          logo={brand.logo}
          label="Brand logo"
          hint="SVG, PNG, JPG or WebP, up to 1 MB. Shown on the page header and PDF."
        />
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          <span className="text-muted-foreground">Logo alt text</span>
          <input className={inputClass} value={logoAlt} onChange={(e) => setLogoAlt(e.target.value)} maxLength={120} placeholder={name} />
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {COLOR_FIELDS.map(({ key, label }) => (
          <ColorField key={key} label={label} value={colors[key]} onChange={(value) => setColors((c) => ({ ...c, [key]: value }))} />
        ))}
      </div>

      {colorsValid ? (
        <div style={brandStyle(colors)} aria-label="Header preview" className="flex flex-col gap-1 rounded-md bg-background p-4">
          <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Preview</span>
          <span className="text-xl font-extrabold uppercase tracking-tight text-foreground">
            {headerLead} <span className="text-primary">{headerAccent}</span>
          </span>
          <span className="h-1 w-16 rounded-full bg-[var(--brand-timeline-accent)]" />
        </div>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
        {message ? (
          <p role={message.type === 'error' ? 'alert' : 'status'} className={message.type === 'error' ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}>
            {message.text}
          </p>
        ) : null}
        <Button type="submit" disabled={pending || !colorsValid || !name.trim()}>
          {pending ? 'Saving…' : 'Save brand'}
        </Button>
      </div>
    </form>
  )
}
