import { cn } from '@/lib/utils'
import type { Milestone, MilestoneStatus, Project } from '@/lib/milestones'

type FinalMilestone = NonNullable<Project['finalMilestone']>

const statusLabel: Record<MilestoneStatus, string> = {
  delivered: 'Complete',
  'at-risk': 'At risk',
  'in-progress': 'In progress',
  'not-started': 'Planned',
}

function StatusDot({ status, className }: { status: MilestoneStatus; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'block size-5 shrink-0 rounded-full border-2',
        status === 'delivered' && 'border-primary bg-primary',
        status === 'at-risk' && 'border-warning bg-warning',
        status === 'in-progress' && 'border-primary bg-background',
        status === 'not-started' && 'border-border bg-background',
        className,
      )}
    />
  )
}

function TodayMarker() {
  return (
    <span
      aria-hidden="true"
      className="block size-0 border-x-[7px] border-b-[11px] border-x-transparent border-b-today"
    />
  )
}

function MilestoneLabel({ milestone }: { milestone: Milestone }) {
  const muted = milestone.status === 'not-started'
  return (
    <div className="flex flex-col items-center gap-1 text-center">
      <span
        className={cn(
          'text-xs font-bold uppercase tracking-wide',
          muted ? 'text-muted-foreground' : 'text-primary',
        )}
      >
        Milestone {milestone.id}
      </span>
      <span className="text-pretty text-sm leading-snug text-foreground">{milestone.title}</span>
      <span
        className={cn(
          'text-xs',
          milestone.dateSlipped ? 'font-semibold text-today' : 'text-muted-foreground',
        )}
      >
        {milestone.date}
      </span>
    </div>
  )
}

function HorizontalTimeline({ project }: { project: Project }) {
  const { milestones, todayMilestoneId, finalMilestone } = project
  return (
    <ol
      className="hidden md:grid"
      style={{ gridTemplateColumns: `repeat(${milestones.length}, minmax(0, 1fr)) auto` }}
    >
      {milestones.map((milestone, index) => {
        const above = index % 2 === 0
        const isToday = milestone.id === todayMilestoneId
        return (
          <li key={milestone.id} className="flex flex-col items-center">
            <span className="sr-only">
              {`Milestone ${milestone.id}: ${milestone.title}, ${milestone.date}, ${statusLabel[milestone.status]}${isToday ? ', current' : ''}`}
            </span>
            <div aria-hidden="true" className="flex h-36 w-full flex-col items-center justify-end gap-2 px-1">
              {above && (
                <>
                  <MilestoneLabel milestone={milestone} />
                  <span className="h-3 w-px bg-border" />
                </>
              )}
            </div>
            <div aria-hidden="true" className="relative flex h-6 w-full items-center justify-center">
              <span
                className={cn(
                  'absolute inset-x-0 top-1/2 h-1 -translate-y-1/2',
                  milestone.status === 'delivered' ? 'bg-primary' : 'bg-border',
                  index === 0 && 'left-1/2',
                )}
              />
              {index === 0 && <span className="absolute left-1/2 top-1/2 h-6 w-1 -translate-x-4 -translate-y-1/2 bg-warning" />}
              <StatusDot status={milestone.status} className="relative" />
              {isToday && (
                <span className="absolute left-1/2 top-full translate-x-1 -translate-y-2">
                  <TodayMarker />
                </span>
              )}
            </div>
            <div aria-hidden="true" className="flex h-36 w-full flex-col items-center gap-2 px-1">
              {!above && (
                <>
                  <span className="h-3 w-px bg-border" />
                  <MilestoneLabel milestone={milestone} />
                </>
              )}
            </div>
          </li>
        )
      })}
      <li className="flex flex-col items-stretch">
        <div className="h-36" />
        <div className="relative flex h-6 items-center">
          <span aria-hidden="true" className="h-1 w-6 bg-border" />
          <span aria-hidden="true" className="h-8 w-1 bg-foreground" />
        </div>
        <div className="flex h-36 items-start pl-4 pt-3">
          {finalMilestone && <FinalBadge milestone={finalMilestone} />}
        </div>
      </li>
    </ol>
  )
}

function VerticalTimeline({ project }: { project: Project }) {
  const { milestones, todayMilestoneId, finalMilestone } = project
  return (
    <ol className="flex flex-col md:hidden">
      {milestones.map((milestone, index) => {
        const isToday = milestone.id === todayMilestoneId
        return (
          <li key={milestone.id} className="flex gap-4">
            <div className="flex flex-col items-center">
              <StatusDot status={milestone.status} className="mt-0.5" />
              {index < milestones.length - 1 && (
                <span
                  aria-hidden="true"
                  className={cn(
                    'w-1 flex-1',
                    milestone.status === 'delivered' ? 'bg-primary' : 'bg-border',
                  )}
                />
              )}
            </div>
            <div className="flex flex-col gap-0.5 pb-6">
              <span className="flex items-center gap-2">
                <span
                  className={cn(
                    'text-xs font-bold uppercase tracking-wide',
                    milestone.status === 'not-started' ? 'text-muted-foreground' : 'text-primary',
                  )}
                >
                  Milestone {milestone.id}
                </span>
                {isToday && (
                  <span className="flex items-center gap-1 text-xs font-semibold text-today">
                    <span className="rotate-90">
                      <TodayMarker />
                    </span>
                    Today
                  </span>
                )}
              </span>
              <span className="text-pretty text-sm leading-relaxed text-foreground">{milestone.title}</span>
              <span className="text-xs text-muted-foreground">
                {milestone.date}
                <span className="sr-only">{`, ${statusLabel[milestone.status]}`}</span>
              </span>
            </div>
          </li>
        )
      })}
      {finalMilestone && (
        <li className="pt-2">
          <FinalBadge milestone={finalMilestone} />
        </li>
      )}
    </ol>
  )
}

function FinalBadge({ milestone }: { milestone: FinalMilestone }) {
  return (
    <div className="flex flex-col items-center gap-0.5 rounded-md bg-foreground px-5 py-3 text-center text-background">
      <span className="text-[11px] font-medium uppercase tracking-widest opacity-70">
        Milestone {milestone.id}
      </span>
      <span className="whitespace-nowrap text-sm font-bold uppercase tracking-widest">
        {milestone.title}
      </span>
      <span className="text-xs font-semibold uppercase tracking-widest">{milestone.date}</span>
    </div>
  )
}

function Legend() {
  const items: { label: string; node: React.ReactNode }[] = [
    { label: 'Complete', node: <StatusDot status="delivered" /> },
    { label: 'In progress', node: <StatusDot status="in-progress" /> },
    { label: 'Planned', node: <StatusDot status="not-started" /> },
    { label: 'Today', node: <TodayMarker /> },
  ]
  return (
    <div className="flex flex-col gap-4 border-t border-border pt-5 md:flex-row md:items-center md:justify-between">
      <ul className="flex flex-wrap gap-x-8 gap-y-3" aria-label="Legend">
        {items.map((item) => (
          <li key={item.label} className="flex items-center gap-2 text-sm text-muted-foreground">
            {item.node}
            {item.label}
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">Dates shown as TBC are not yet agreed.</p>
    </div>
  )
}

function EmptyTimeline() {
  return (
    <div className="flex flex-col items-center gap-2 rounded-md border-2 border-dashed border-border px-6 py-16 text-center">
      <p className="text-base font-semibold text-foreground">Milestones not yet defined</p>
      <p className="max-w-md text-pretty text-sm leading-relaxed text-muted-foreground">
        Add this project&apos;s milestones to see its delivery timeline here.
      </p>
    </div>
  )
}

export function DeliveryTimeline({ project }: { project: Project }) {
  const titleId = `timeline-title-${project.slug}`
  const hasMilestones = project.milestones.length > 0
  return (
    <section
      aria-labelledby={titleId}
      className="flex flex-col gap-6 rounded-lg bg-card p-6 text-card-foreground md:p-10"
    >
      <h2
        id={titleId}
        className="text-balance border-b-2 border-foreground pb-3 text-base font-bold uppercase tracking-widest text-primary md:text-lg"
      >
        {project.timelineTitle}
      </h2>
      {hasMilestones ? (
        <>
          <HorizontalTimeline project={project} />
          <VerticalTimeline project={project} />
          <Legend />
        </>
      ) : (
        <EmptyTimeline />
      )}
    </section>
  )
}
