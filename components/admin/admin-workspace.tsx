'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, ChevronUp, Plus, X } from 'lucide-react'
import { createProject, reorderProjects } from '@/app/actions/projects'
import type { Project } from '@/lib/milestones'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ProjectEditor } from './project-editor'

const inputClass =
  'h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

export function AdminWorkspace({ projects }: { projects: Project[] }) {
  const router = useRouter()
  const [activeSlug, setActiveSlug] = useState(projects[0]?.slug)
  const [order, setOrder] = useState(() => projects.map((p) => p.slug))
  const [orderError, setOrderError] = useState<string | null>(null)
  const [isSavingOrder, startSavingOrder] = useTransition()

  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)
  const [isCreating, startCreating] = useTransition()

  const bySlug = new Map(projects.map((p) => [p.slug, p]))
  const ordered = [
    ...order.flatMap((slug) => bySlug.get(slug) ?? []),
    ...projects.filter((p) => !order.includes(p.slug)),
  ]
  const active = ordered.find((p) => p.slug === activeSlug) ?? ordered[0]

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

  function closeCreate() {
    setShowCreate(false)
    setNewName('')
    setNewDescription('')
    setCreateError(null)
  }

  function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setCreateError(null)
    startCreating(async () => {
      const result = await createProject({ name: newName, description: newDescription })
      if (!result.ok) {
        setCreateError(result.error)
        return
      }
      setOrder((list) => [...list, result.slug])
      setActiveSlug(result.slug)
      closeCreate()
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-4">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Project order</p>
          <div className="flex items-center gap-4">
            <p className="hidden text-xs text-muted-foreground sm:block" aria-live="polite">
              {isSavingOrder ? 'Saving order…' : orderError ? '' : 'Use the arrows to reorder projects'}
            </p>
            {!showCreate && (
              <Button type="button" size="sm" onClick={() => setShowCreate(true)}>
                <Plus aria-hidden="true" />
                Add project
              </Button>
            )}
          </div>
        </div>

        {showCreate && (
          <form
            onSubmit={handleCreate}
            aria-label="Add a new project"
            className="flex flex-col gap-3 rounded-lg border-2 border-dashed border-primary/60 bg-card p-4 text-card-foreground md:flex-row md:items-end"
          >
            <label className="flex flex-1 flex-col gap-1.5 text-sm font-medium">
              <span className="text-muted-foreground">Project name</span>
              <input
                className={inputClass}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                required
                maxLength={80}
                autoFocus
                placeholder="e.g. Resident Portal"
              />
            </label>
            <label className="flex flex-1 flex-col gap-1.5 text-sm font-medium">
              <span className="text-muted-foreground">Description (optional)</span>
              <input
                className={inputClass}
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                maxLength={120}
                placeholder="Short summary shown under the name"
              />
            </label>
            <div className="flex gap-2">
              <Button type="submit" disabled={isCreating || !newName.trim()}>
                {isCreating ? 'Creating…' : 'Create project'}
              </Button>
              <Button type="button" variant="ghost" size="icon" onClick={closeCreate} disabled={isCreating}>
                <X aria-hidden="true" />
                <span className="sr-only">Cancel adding project</span>
              </Button>
            </div>
            {createError ? (
              <p role="alert" className="text-sm text-destructive md:basis-full">
                {createError}
              </p>
            ) : null}
          </form>
        )}

        {ordered.length === 0 ? (
          <p className="text-muted-foreground">No projects yet. Add one to get started.</p>
        ) : (
          <nav aria-label="Select project" className="flex flex-col flex-wrap gap-2 sm:flex-row">
            {ordered.map((project, index) => {
              const selected = project.slug === active?.slug
              return (
                <div
                  key={project.slug}
                  className={cn(
                    'flex flex-1 items-stretch rounded-lg border-2 transition-colors sm:min-w-56',
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
                      Project {index + 1}
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
        )}
        {orderError ? (
          <p role="alert" className="text-sm text-destructive">
            {orderError}
          </p>
        ) : null}
      </div>
      {active ? <ProjectEditor key={active.slug} project={active} /> : null}
    </div>
  )
}
