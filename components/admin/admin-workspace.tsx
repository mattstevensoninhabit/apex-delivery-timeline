'use client'

import { useState } from 'react'
import type { Project } from '@/lib/milestones'
import { cn } from '@/lib/utils'
import { ProjectEditor } from './project-editor'

export function AdminWorkspace({ projects }: { projects: Project[] }) {
  const [activeSlug, setActiveSlug] = useState(projects[0]?.slug)
  const active = projects.find((p) => p.slug === activeSlug) ?? projects[0]

  if (!active) {
    return <p className="text-muted-foreground">No projects found.</p>
  }

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Select project" className="flex flex-col gap-2 sm:flex-row">
        {projects.map((project, index) => {
          const selected = project.slug === active.slug
          return (
            <button
              key={project.slug}
              type="button"
              aria-pressed={selected}
              onClick={() => setActiveSlug(project.slug)}
              className={cn(
                'flex flex-1 flex-col items-start gap-0.5 rounded-lg border-2 px-5 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                selected
                  ? 'border-primary bg-card text-card-foreground'
                  : 'border-transparent bg-card/50 text-muted-foreground hover:bg-card hover:text-card-foreground',
              )}
            >
              <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Tab {index + 1}
              </span>
              <span className={cn('text-base font-bold', selected && 'text-primary')}>{project.tabLabel}</span>
            </button>
          )
        })}
      </nav>
      <ProjectEditor key={active.slug} project={active} />
    </div>
  )
}
