'use client'

import { useState } from 'react'
import { Loader2, Presentation } from 'lucide-react'
import type { DeckItem } from '@/components/executive-capture'
import type { PdfBranding } from '@/lib/branding'
import { cn } from '@/lib/utils'

export type PodDeckSection = {
  brandName: string
  lead: string
  branding?: PdfBranding
  items: DeckItem[]
}

function isoToday() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function PodsDeckExport({ sections, branding }: { sections: PodDeckSection[]; branding?: PdfBranding }) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const populated = sections.filter((s) => s.items.length > 0)

  async function handleExport() {
    setPending(true)
    setError(null)
    try {
      const [{ captureExecutiveViews }, { downloadPodsDeck }] = await Promise.all([
        import('@/components/executive-capture'),
        import('@/lib/executive-deck'),
      ])
      const images = await captureExecutiveViews(populated.flatMap((s) => s.items))
      let cursor = 0
      await downloadPodsDeck(
        populated.map((section) => ({
          brandName: section.brandName,
          lead: section.lead,
          branding: section.branding,
          items: section.items.map((item) => ({ project: item.project, branding: item.branding, image: images[cursor++] })),
        })),
        {
          title: 'All pods',
          branding,
          fileName: `all-pods-weekly-update-${isoToday()}.pptx`,
        },
      )
    } catch (err) {
      console.error('Pods deck export failed', err)
      setError('Export failed. Please try again.')
    } finally {
      setPending(false)
    }
  }

  if (populated.length === 0) return null

  return (
    <div className="flex flex-col items-start gap-1 md:items-end">
      <button
        type="button"
        onClick={handleExport}
        disabled={pending}
        className="inline-flex items-center gap-2 rounded-md border border-primary/60 bg-background/70 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-foreground transition-colors hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-60"
      >
        {pending ? (
          <Loader2 aria-hidden="true" className="size-4 animate-spin" />
        ) : (
          <Presentation aria-hidden="true" className="size-4" />
        )}
        All pods PowerPoint
      </button>
      <p role="status" className={cn('text-xs text-destructive', !error && 'sr-only')}>
        {error ?? (pending ? 'Exporting PowerPoint…' : '')}
      </p>
    </div>
  )
}
