import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { brandStyle, brandingTitle, resolveBranding, type Brand } from '@/lib/branding'
import { formatMilestoneDate, parseIsoDate } from '@/lib/dates'
import type { Project } from '@/lib/milestones'
import { nextMilestone, overallHealth, progress, startOfToday, type HealthTone } from '@/lib/project-health'
import { cn } from '@/lib/utils'

const TONE_CLASS: Record<HealthTone, string> = {
  'on-track': 'bg-primary/15 text-primary',
  attention: 'bg-destructive/15 text-destructive',
  defining: 'border border-dashed border-muted-foreground/60 text-muted-foreground',
  unplanned: 'bg-muted text-muted-foreground',
}

export type Pod = { brand: Brand; projects: Project[] }

function ProjectRow({ brand, project, today }: { brand: Brand; project: Project; today: number }) {
  const branding = resolveBranding(brand, project)
  const health = overallHealth(project)
  const { complete, total, ratio } = progress(project)
  const next = nextMilestone(project, today)
  return (
    <li>
      <Link
        href={`/${brand.slug}?tab=${project.slug}`}
        className="flex flex-col gap-3 rounded-lg px-4 py-3 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:flex-row md:items-center md:gap-6"
      >
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {project.logo ? (
            <img src={project.logo.url || '/placeholder.svg'} alt="" className="h-6 w-auto max-w-20 shrink-0" />
          ) : null}
          <div className="flex min-w-0 flex-col">
            <span className="truncate font-bold text-card-foreground">{project.tabLabel}</span>
            <span className="truncate text-sm text-muted-foreground">
              {branding.pageTitle || project.tabDescription}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3 md:w-40">
          <div
            className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-label={`${project.tabLabel} progress`}
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={complete}
          >
            <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round(ratio * 100)}%` }} />
          </div>
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {complete}/{total}
          </span>
        </div>
        <span
          className={cn(
            'self-start whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold md:self-center',
            TONE_CLASS[health.tone],
          )}
        >
          {health.label}
        </span>
        <div className="flex flex-col text-sm md:w-56">
          <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Next</span>
          <span className="truncate text-card-foreground">
            {next ? `${next.title}${next.date ? ` · ${formatMilestoneDate(next.date)}` : ''}` : 'All complete'}
          </span>
        </div>
      </Link>
    </li>
  )
}

function PodCard({ pod, today, wide }: { pod: Pod; today: number; wide: boolean }) {
  const { brand, projects } = pod
  return (
    <section
      style={brandStyle(brand.colors)}
      aria-labelledby={`pod-${brand.slug}`}
      className={cn(
        'flex flex-col gap-4 rounded-xl border border-border bg-card p-5 text-card-foreground md:p-6',
        wide && 'lg:col-span-2',
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-2">
          {brand.logo ? (
            <img src={brand.logo.url || '/placeholder.svg'} alt={brand.logoAlt || brand.name} className="h-8 w-auto self-start" />
          ) : (
            <p className="text-sm font-bold uppercase tracking-widest text-muted-foreground">{brand.name}</p>
          )}
          <h2 id={`pod-${brand.slug}`} className="text-balance text-xl font-extrabold uppercase tracking-tight">
            {brand.headerLead} <span className="text-primary">{brand.headerAccent}</span>
          </h2>
          <p className="text-sm text-muted-foreground">
            {projects.length} project{projects.length === 1 ? '' : 's'}
          </p>
        </div>
        <Link
          href={`/${brand.slug}`}
          className="inline-flex items-center gap-2 self-start rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          View timelines
          <ArrowRight aria-hidden="true" className="size-4" />
          <span className="sr-only">for {brandingTitle(resolveBranding(brand))}</span>
        </Link>
      </div>
      {projects.length === 0 ? (
        <p className="text-sm text-muted-foreground">No projects in this pod yet.</p>
      ) : (
        <ul className="-mx-4 flex flex-col divide-y divide-border">
          {projects.map((project) => (
            <ProjectRow key={project.slug} brand={brand} project={project} today={today} />
          ))}
        </ul>
      )}
    </section>
  )
}

function Summary({ pods, today }: { pods: Pod[]; today: number }) {
  const all = pods.flatMap((p) => p.projects)
  const attention = all.filter((p) => overallHealth(p).tone === 'attention').length
  const upcoming = all
    .map((p) => ({ project: p, m: nextMilestone(p, today) }))
    .map((e) => ({ ...e, t: e.m ? parseIsoDate(e.m.date)?.getTime() : undefined }))
    .filter((e) => e.t !== undefined && e.t >= today)
    .sort((a, b) => (a.t ?? 0) - (b.t ?? 0))[0]

  const items = [
    { label: 'Pods', value: String(pods.length) },
    { label: 'Projects', value: String(all.length) },
    { label: 'Needs attention', value: String(attention) },
    {
      label: 'Next milestone',
      value: upcoming?.m ? formatMilestoneDate(upcoming.m.date) : '—',
      detail: upcoming?.m ? `${upcoming.project.tabLabel}: ${upcoming.m.title}` : undefined,
    },
  ]
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border md:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="flex flex-col gap-1 bg-card px-5 py-4">
          <dt className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{item.label}</dt>
          <dd className="text-2xl font-extrabold text-card-foreground">{item.value}</dd>
          {item.detail ? <dd className="truncate text-sm text-muted-foreground">{item.detail}</dd> : null}
        </div>
      ))}
    </dl>
  )
}

export function PodLanding({ pods, shell }: { pods: Pod[]; shell?: Brand }) {
  const today = startOfToday()
  return (
    <div style={shell ? brandStyle(shell.colors) : undefined} className="min-h-screen bg-background text-foreground">
      <main className="mx-auto flex max-w-screen-xl flex-col gap-8 px-4 py-10 md:px-8 md:py-14">
        <header className="flex flex-col gap-2">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">All pods</p>
          <h1 className="text-balance text-3xl font-extrabold uppercase tracking-tight md:text-4xl">
            Delivery <span className="text-primary">Timelines</span>
          </h1>
        </header>
        {pods.length === 0 ? (
          <p className="text-muted-foreground">
            No pods yet.{' '}
            <Link href="/admin" className="font-medium text-primary underline-offset-4 hover:underline">
              Add a brand in Admin
            </Link>
            .
          </p>
        ) : (
          <>
            <Summary pods={pods} today={today} />
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {pods.map((pod) => (
                <PodCard key={pod.brand.slug} pod={pod} today={today} wide={pods.length === 1} />
              ))}
            </div>
          </>
        )}
        <Link
          href="/admin"
          className="self-end text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Admin
        </Link>
      </main>
    </div>
  )
}
