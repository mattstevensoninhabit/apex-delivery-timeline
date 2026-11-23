'use client'

import { useState, type ReactNode } from 'react'
import { ClipboardList, Download, FileText, Images, ImageIcon, Loader2, Presentation } from 'lucide-react'
import type { DeckItem } from '@/components/executive-capture'
import type { PdfBranding } from '@/lib/branding'
import { downloadBlob, EXPORT_IGNORE_ATTR, renderToJpeg, triggerDownload } from '@/lib/capture'
import type { Project } from '@/lib/milestones'
import { cn } from '@/lib/utils'

type Format = 'jpeg' | 'pdf' | 'summary' | 'jpegs' | 'pptx'

const PENDING_LABEL: Record<Format, string> = {
  jpeg: 'JPEG',
  pdf: 'PDF',
  summary: 'executive summary',
  jpegs: 'executive JPEGs',
  pptx: 'PowerPoint',
}

export type DeckConfig = {
  brandName: string
  brandSlug: string
  lead: string
  branding?: PdfBranding
  items: DeckItem[]
}

function isoToday() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

async function exportExecutiveJpegs(deck: DeckConfig) {
  const [{ captureExecutiveViews }, { default: JSZip }] = await Promise.all([
    import('@/components/executive-capture'),
    import('jszip'),
  ])
  const images = await captureExecutiveViews(deck.items)
  const zip = new JSZip()
  images.forEach((image, i) => {
    if (!image) return
    zip.file(`${deck.items[i].project.slug}-executive.jpg`, image.dataUrl.split(',')[1], { base64: true })
  })
  downloadBlob(await zip.generateAsync({ type: 'blob' }), `${deck.brandSlug}-executive-views.zip`)
}

async function exportDeck(deck: DeckConfig) {
  const [{ captureExecutiveViews }, { downloadExecutiveDeck }] = await Promise.all([
    import('@/components/executive-capture'),
    import('@/lib/executive-deck'),
  ])
  const images = await captureExecutiveViews(deck.items)
  await downloadExecutiveDeck(
    deck.items.map((item, i) => ({ project: item.project, branding: item.branding, image: images[i] })),
    {
      brandName: deck.brandName,
      lead: deck.lead,
      branding: deck.branding,
      fileName: `${deck.brandSlug}-weekly-update-${isoToday()}.pptx`,
    },
  )
}

export function TimelineExport({
  targetId,
  fileName,
  projects,
  branding,
  deck,
}: {
  targetId: string
  fileName: string
  projects: Project[]
  branding?: PdfBranding
  deck?: DeckConfig
}) {
  const [pending, setPending] = useState<Format | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleExport(format: Format) {
    const target = document.getElementById(targetId)
    if (!target) return
    setPending(format)
    setError(null)
    try {
      if (format === 'summary') {
        const { downloadExecutiveSummary } = await import('@/lib/executive-summary')
        await downloadExecutiveSummary(projects, `${fileName}-executive-summary`, { branding })
        return
      }
      if (format === 'jpegs' && deck) {
        await exportExecutiveJpegs(deck)
        return
      }
      if (format === 'pptx' && deck) {
        await exportDeck(deck)
        return
      }
      const { dataUrl, width, height } = await renderToJpeg(target)
      if (format === 'jpeg') {
        triggerDownload(dataUrl, `${fileName}.jpg`)
      } else {
        const { jsPDF } = await import('jspdf')
        const pdf = new jsPDF({
          orientation: width >= height ? 'landscape' : 'portrait',
          unit: 'pt',
          format: [width, height],
        })
        pdf.addImage(dataUrl, 'JPEG', 0, 0, width, height)
        pdf.save(`${fileName}.pdf`)
      }
    } catch (err) {
      console.error('Timeline export failed', err)
      setError('Export failed. Please try again.')
    } finally {
      setPending(null)
    }
  }

  const buttonClass =
    'inline-flex items-center gap-2 rounded-md border border-border bg-background/70 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-foreground transition-colors hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-60'

  function ExportButton({ format, icon, label, className }: { format: Format; icon: ReactNode; label: string; className?: string }) {
    return (
      <button
        type="button"
        className={cn(buttonClass, className)}
        disabled={pending !== null}
        onClick={() => handleExport(format)}
      >
        {pending === format ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : icon}
        {label}
      </button>
    )
  }

  return (
    <div {...{ [EXPORT_IGNORE_ATTR]: '' }} className="flex flex-col items-start gap-1 md:items-end">
      <div className="flex flex-wrap items-center gap-2 md:justify-end" role="group" aria-label="Export timeline">
        <Download aria-hidden="true" className="size-4 text-muted-foreground" />
        <ExportButton format="jpeg" icon={<ImageIcon aria-hidden="true" className="size-4" />} label="JPEG" />
        <ExportButton format="pdf" icon={<FileText aria-hidden="true" className="size-4" />} label="PDF" />
        <ExportButton
          format="summary"
          icon={<ClipboardList aria-hidden="true" className="size-4" />}
          label="Executive summary"
          className="border-primary/60"
        />
        {deck && deck.items.length > 0 ? (
          <>
            <ExportButton format="jpegs" icon={<Images aria-hidden="true" className="size-4" />} label="Executive JPEGs" />
            <ExportButton
              format="pptx"
              icon={<Presentation aria-hidden="true" className="size-4" />}
              label="PowerPoint"
              className="border-primary/60"
            />
          </>
        ) : null}
      </div>
      <p role="status" className={cn('text-xs text-destructive', !error && 'sr-only')}>
        {error ?? (pending ? `Exporting ${PENDING_LABEL[pending]}…` : '')}
      </p>
    </div>
  )
}
