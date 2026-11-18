'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, ChevronUp, Plus, X } from 'lucide-react'
import { createBrand } from '@/app/actions/brands'
import { createProject, reorderProjects } from '@/app/actions/projects'
import type { Brand } from '@/lib/branding'
import type { Project } from '@/lib/milestones'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { BrandEditor } from './brand-editor'
import { ProjectEditor } from './project-editor'

const inputClass =
  'h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

function AddBrandForm({ onCreated, onCancel }: { onCreated: (slug: string) => void; onCancel: () => void }) {
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const effectiveSlug = slugTouched ? slug : slugify(name)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await createBrand({ name, slug: effectiveSlug })
      if (!result.ok) {
        setError(result.error)
        return
      }
      onCreated(result.slug)
    })
  }

  return (
    <form
      onSubmit={handleSubmit}
      aria-label="Add a new brand"
      className="flex flex-col gap-3 rounded-lg border-2 border-dashed border-primary/60 bg-card p-4 text-card-foreground md:flex-row md:items-end"
    >
      <label className="flex flex-1 flex-col gap-1.5 text-sm font-medium">
        <span className="text-muted-foreground">Brand name</span>
        <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} autoFocus placeholder="e.g. Acme" />
      </label>
      <label className="flex flex-1 flex-col gap-1.5 text-sm font-medium">
        <span className="text-muted-foreground">URL slug</span>
        <input
          className={cn(inputClass, 'font-mono')}
          value={effectiveSlug}
          onChange={(e) => {
            setSlugTouched(true)
            setSlug(slugify(e.target.value))
          }}
          required
          maxLength={60}
          placeholder="acme"
        />
      </label>
      <div className="flex gap-2">
        <Button type="submit" disabled={pending || !name.trim() || !effectiveSlug}>
          {pending ? 'Creating…' : 'Create brand'}
        </Button>
        <Button type="button" variant="ghost" size="icon" onClick={onCancel} disabled={pending}>
          <X aria-hidden="true" />
          <span className="sr-only">Cancel adding brand</span>
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive md:basis-full">
          {error}
        </p>
      ) : null}
    </form>
  )
}

export function AdminWorkspace({ brands, projects }: { brands: Brand[]; projects: Project[] }) {
  const router = useRouter()
  const [activeBrandSlug, setActiveBrandSlug] = useState(() => (brands.find((b) => b.isDefault) ?? brands[0])?.slug)
  const [showCreateBrand, setShowCreateBrand] = useState(false)
  const [activeSlug, setActiveSlug] = useState<string | undefined>()
  const [order, setOrder] = useState(() => projects.map((p) => p.slug))
  const [orderError, setOrderError] = useState<string | null>(null)
  const [isSavingOrder, startSavingOrder] = useTransition()

  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)
  const [isCreating, startCreating] = useTransition()

  const activeBrand = brands.find((b) => b.slug === activeBrandSlug) ?? brands[0]
  const brandProjects = projects.filter((p) => p.brandSlug === activeBrand?.slug)
  const bySlug = new Map(brandProjects.map((p) => [p.slug, p]))
  const ordered = [
    ...order.flatMap((slug) => bySlug.get(slug) ?? []),
    ...brandProjects.filter((p) => !order.includes(p.slug)),
  ]
  const active = ordered.find((p) => p.slug === activeSlug) ?? ordered[0]

  function selectBrand(slug: string) {
    setActiveBrandSlug(slug)
    setActiveSlug(undefined)
    setShowCreate(false)
    setOrderError(null)
  }

  function move(index: number, delta: -1 | 1) {
    if (!activeBrand) return
    const target = index + delta
    if (target < 0 || target >= ordered.length) return
    const next = ordered.map((p) => p.slug)
    ;[next[index], next[target]] = [next[target], next[index]]
    const previousOrder = order
    setOrder([...next, ...order.filter((slug) => !next.includes(slug))])
    setOrderError(null)
    startSavingOrder(async () => {
      const result = await reorderProjects(activeBrand.slug, next)
      if (!result.ok) {
        setOrder(previousOrder)
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
    if (!activeBrand) return
    setCreateError(null)
    startCreating(async () => {
      const result = await createProject({ name: newName, description: newDescription, brandSlug: activeBrand.slug })
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
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-4">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Brands</p>
          {!showCreateBrand && (
            <Button type="button" size="sm" variant="outline" onClick={() => setShowCreateBrand(true)}>
              <Plus aria-hidden="true" />
              Add brand
            </Button>
          )}
        </div>
        {showCreateBrand && (
          <AddBrandForm
            onCancel={() => setShowCreateBrand(false)}
            onCreated={(slug) => {
              setShowCreateBrand(false)
              selectBrand(slug)
              router.refresh()
            }}
          />
        )}
        <nav aria-label="Select brand" className="flex flex-wrap gap-2">
          {brands.map((brand) => {
            const selected = brand.slug === activeBrand?.slug
            return (
              <button
                key={brand.slug}
                type="button"
                aria-pressed={selected}
                onClick={() => selectBrand(brand.slug)}
                className={cn(
                  'flex items-center gap-2 rounded-full border-2 px-4 py-1.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  selected ? 'border-primary bg-card text-primary' : 'border-transparent bg-card/50 text-muted-foreground hover:bg-card hover:text-card-foreground',
                )}
              >
                <span aria-hidden="true" className="size-2.5 rounded-full" style={{ backgroundColor: brand.colors.accent }} />
                {brand.name}
              </button>
            )
          })}
        </nav>
      </div>

      {activeBrand ? <BrandEditor key={activeBrand.slug} brand={activeBrand} /> : null}

      {activeBrand ? (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-4">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{activeBrand.name} projects</p>
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
              <p className="text-muted-foreground">No projects for this brand yet. Add one to get started.</p>
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
                        <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Project {index + 1}</span>
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
          {active ? <ProjectEditor key={active.slug} project={active} brands={brands} /> : null}
        </div>
      ) : (
        <p className="text-muted-foreground">Add a brand to start adding projects.</p>
      )}
    </div>
  )
}
