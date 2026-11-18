'use client'

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react'
import { BrandHeader } from '@/components/brand-header'
import type { HeaderInfo } from '@/lib/branding'
import { cn } from '@/lib/utils'

type Tab = {
  slug: string
  eyebrow?: string
  label: string
  description: string
  panel: ReactNode
  header?: HeaderInfo
  style?: CSSProperties
}

export function ProjectTabs({ tabs, initialTab }: { tabs: Tab[]; initialTab?: string }) {
  const [active, setActive] = useState(
    tabs.some((tab) => tab.slug === initialTab) ? initialTab : tabs[0]?.slug,
  )
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])
  const activeTab = tabs.find((tab) => tab.slug === active) ?? tabs[0]
  const header = activeTab?.header ?? tabs[0]?.header

  useEffect(() => {
    if (header) document.title = header.documentTitle
  }, [header])

  function select(slug: string) {
    setActive(slug)
    const url = new URL(window.location.href)
    if (slug === tabs[0]?.slug) url.searchParams.delete('tab')
    else url.searchParams.set('tab', slug)
    window.history.replaceState(window.history.state, '', url)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = tabs.findIndex((tab) => tab.slug === active)
    let next = index
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length
    else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = tabs.length - 1
    else return
    event.preventDefault()
    select(tabs[next].slug)
    tabRefs.current[next]?.focus()
  }

  return (
    <div className="flex flex-col gap-6" style={activeTab?.style}>
      {header ? <BrandHeader header={header} /> : null}
      <div
        role="tablist"
        aria-label="Projects"
        onKeyDown={handleKeyDown}
        className="flex flex-col gap-2 sm:flex-row"
      >
        {tabs.map((tab, index) => {
          const selected = tab.slug === active
          return (
            <button
              key={tab.slug}
              ref={(el) => {
                tabRefs.current[index] = el
              }}
              type="button"
              role="tab"
              id={`tab-${tab.slug}`}
              aria-selected={selected}
              aria-controls={`panel-${tab.slug}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => select(tab.slug)}
              className={cn(
                'flex flex-1 flex-col items-start gap-0.5 rounded-lg border-2 px-5 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                selected
                  ? 'border-primary bg-card text-card-foreground'
                  : 'border-transparent bg-card/50 text-muted-foreground hover:bg-card hover:text-card-foreground',
              )}
            >
              <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                {tab.eyebrow ?? `Project ${index + 1}`}
              </span>
              <span className={cn('text-base font-bold', selected && 'text-primary')}>{tab.label}</span>
              <span className="text-sm">{tab.description}</span>
            </button>
          )
        })}
      </div>
      {tabs.map((tab) => (
        <div
          key={tab.slug}
          role="tabpanel"
          id={`panel-${tab.slug}`}
          aria-labelledby={`tab-${tab.slug}`}
          hidden={tab.slug !== active}
        >
          {tab.panel}
        </div>
      ))}
    </div>
  )
}
