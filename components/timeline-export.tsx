'use client'

import { useState } from 'react'
import { ClipboardList, Download, FileText, ImageIcon, Loader2 } from 'lucide-react'
import type { Project } from '@/lib/milestones'
import { cn } from '@/lib/utils'

type Format = 'jpeg' | 'pdf' | 'summary'

const PENDING_LABEL: Record<Format, string> = {
  jpeg: 'JPEG',
  pdf: 'PDF',
  summary: 'executive summary',
}

const EXPORT_IGNORE_ATTR = 'data-export-ignore'

async function renderTimeline(target: HTMLElement) {
  const { toJpeg } = await import('html-to-image')
  const backgroundColor = getComputedStyle(document.body).backgroundColor
  const { width, height } = target.getBoundingClientRect()
  const dataUrl = await toJpeg(target, {
    quality: 0.95,
    pixelRatio: 2,
    backgroundColor,
    cacheBust: true,
    filter: (node) => !(node instanceof HTMLElement && node.hasAttribute(EXPORT_IGNORE_ATTR)),
  })
  return { dataUrl, width, height }
}

function triggerDownload(href: string, filename: string) {
  const link = document.createElement('a')
  link.href = href
  link.download = filename
  link.click()
}

export function TimelineExport({
  targetId,
  fileName,
  projects,
}: {
  targetId: string
  fileName: string
  projects: Project[]
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
        await downloadExecutiveSummary(projects, `${fileName}-executive-summary`)
        return
      }
      const { dataUrl, width, height } = await renderTimeline(target)
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

  return (
    <div {...{ [EXPORT_IGNORE_ATTR]: '' }} className="flex flex-col items-start gap-1 md:items-end">
      <div className="flex items-center gap-2" role="group" aria-label="Export timeline">
        <Download aria-hidden="true" className="size-4 text-muted-foreground" />
        <button
          type="button"
          className={buttonClass}
          disabled={pending !== null}
          onClick={() => handleExport('jpeg')}
        >
          {pending === 'jpeg' ? (
            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
          ) : (
            <ImageIcon aria-hidden="true" className="size-4" />
          )}
          JPEG
        </button>
        <button
          type="button"
          className={buttonClass}
          disabled={pending !== null}
          onClick={() => handleExport('pdf')}
        >
          {pending === 'pdf' ? (
            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
          ) : (
            <FileText aria-hidden="true" className="size-4" />
          )}
          PDF
        </button>
        <button
          type="button"
          className={cn(buttonClass, 'border-primary/60')}
          disabled={pending !== null}
          onClick={() => handleExport('summary')}
        >
          {pending === 'summary' ? (
            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
          ) : (
            <ClipboardList aria-hidden="true" className="size-4" />
          )}
          Executive summary
        </button>
      </div>
      <p role="status" className={cn('text-xs text-destructive', !error && 'sr-only')}>
        {error ?? (pending ? `Exporting ${PENDING_LABEL[pending]}…` : '')}
      </p>
    </div>
  )
}
