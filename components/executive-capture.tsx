'use client'

import type { CSSProperties } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { ExecutiveProjectTimeline } from '@/components/executive-timeline'
import type { PdfBranding } from '@/lib/branding'
import { renderToJpeg, type CapturedImage } from '@/lib/capture'
import type { Project } from '@/lib/milestones'

export type DeckItem = {
  project: Project
  style?: CSSProperties
  branding?: PdfBranding
}

const CAPTURE_WIDTH = 1600

function nextFrame() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
}

/** Renders every project's Executive View off screen and returns a JPEG of each, in order. */
export async function captureExecutiveViews(items: DeckItem[]): Promise<(CapturedImage | undefined)[]> {
  const host = document.createElement('div')
  host.setAttribute('aria-hidden', 'true')
  Object.assign(host.style, {
    position: 'fixed',
    left: '-10000px',
    top: '0',
    width: `${CAPTURE_WIDTH}px`,
    pointerEvents: 'none',
  })
  document.body.appendChild(host)
  const root = createRoot(host)

  try {
    flushSync(() => {
      root.render(
        <div className="flex flex-col gap-10">
          {items.map((item) => (
            <div
              key={item.project.slug}
              data-capture={item.project.slug}
              style={item.style}
              className="bg-background p-6 text-foreground"
            >
              <ExecutiveProjectTimeline project={item.project} branding={item.branding} />
            </div>
          ))}
        </div>,
      )
    })
    await document.fonts.ready
    await Promise.all(
      Array.from(host.querySelectorAll('img')).map((img) => img.decode().catch(() => undefined)),
    )
    await nextFrame()
    await nextFrame()

    const results: (CapturedImage | undefined)[] = []
    for (const item of items) {
      const wrapper = host.querySelector<HTMLElement>(`[data-capture="${CSS.escape(item.project.slug)}"]`)
      if (!wrapper) {
        results.push(undefined)
        continue
      }
      results.push(await renderToJpeg(wrapper, getComputedStyle(wrapper).backgroundColor))
    }
    return results
  } finally {
    root.unmount()
    host.remove()
  }
}
