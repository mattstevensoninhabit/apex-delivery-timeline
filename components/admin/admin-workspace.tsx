'use client'

import { useState, useTransition } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { reorderProjects } from '@/app/actions/projects'
import type { Project } from '@/lib/milestones'
import { cn } from '@/lib/utils'
import { ProjectEditor } from './project-editor'

export function AdminWorkspace({ projects }: { projects: Project[] }) {
  const [activeSlug, setActiveSlug] = useState(projects[0]?.slug)
  const [order, setOrder] = useState(() => projects.map((p) => p.slug))
  const [orderError, setOrderError] = useState<string | null>(null)
  const [isSavingOrder, startSavingOrder] = useTransition()

  const bySlug = new Map(projects.map((p) => [p.slug, p]))
  const ordered = [
    ...order.flatMap((slug) => bySlug.get(slug) ?? []),
    ...projects.filter((p) => !order.includes(p.slug)),
  ]
  const active = ordered.find((p) => p.slug === activeSlug) ?? ordered[0]

  if (!active) {
    return <p className="text-muted-foreground">No projects found.</p>
  }

  function move(index: number, delta: -1 | 1) {
    const target = index + delta
    if (target < 0 || target >= ordered.length) return
    const previous = ordered.map((p) => p.slug)
    const next = [...previous]
    ;[next[index], next[target]] = [next[target], next[index]]
    setOrder(next)
    setOrderError(null)
    startSavingOrder(async () => {
      const result = await reorderProjects(next)
      if (!result.ok) {
        setOrder(previous)
        setOrderError(result.error)
      }
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-4">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Tab order</p>
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {isSavingOrder ? 'Saving order…' : orderError ? '' : 'Use the arrows to reorder tabs'}
          </p>
        </div>
        <nav aria-label="Select project" className="flex flex-col gap-2 sm:flex-row">
          {ordered.map((project, index) => {
            const selected = project.slug === active.slug
            return (
              <div
                key={project.slug}
                className={cn(
                  'flex flex-1 items-stretch rounded-lg border-2 transition-colors',
                  selected ? 'border-primary bg-card' : 'border-transparent bg-card/50 hover:bg-card',
                )}
              >
                <button
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setActiveSlug(project.slug)}
                  className={cn(
                    'flex flex-1 flex-col items-start gap-0.5 rounded-l-md px-5 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    selected ? 'text-card-foreground' : 'text-muted-foreground hover:text-card-foreground',
                  )}
                >
                  <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    Tab {index + 1}
                  </span>
                  <span className={cn('text-base font-bold', selected && 'text-primary')}>{project.tabLabel}</span>
                </button>
                <div className="flex flex-col justify-center gap-1 px-2 sm:flex-row sm:items-center">
                  <button
                    type="button"
                    onClick={() => move(index, -1)}
                    disabled={index === 0 || isSavingOrder}
                    aria-label={`Move ${project.tabLabel} earlier`}
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-30"
                  >
                    <ChevronUp className="size-4 sm:-rotate-90" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(index, 1)}
                    disabled={index === ordered.length - 1 || isSavingOrder}
                    aria-label={`Move ${project.tabLabel} later`}
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-30"
                  >
                    <ChevronDown className="size-4 sm:-rotate-90" aria-hidden="true" />
                  </button>
                </div>
              </div>
            )
          })}
        </nav>
        {orderError ? (
          <p role="alert" className="text-sm text-destructive">
            {orderError}
          </p>
        ) : null}
      </div>
      <ProjectEditor key={active.slug} project={active} />
    </div>
  )
}
