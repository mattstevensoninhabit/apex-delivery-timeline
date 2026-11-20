import { Check, Clock, Flag, Lock, LockOpen, Pause, TriangleAlert } from 'lucide-react'
import { formatMilestoneDate } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { TimelineExport } from '@/components/timeline-export'
import {
  buildExecutiveProject,
  buildPortfolio,
  type Drift,
  type ExecutiveProject,
  type KeyMilestone,
  type KeyStatus,
  type PortfolioRow,
} from '@/lib/executive-view'
import type { PdfBranding } from '@/lib/branding'
import type { Project } from '@/lib/milestones'
import type { DeliveryStatus } from '@/lib/schedule'

const STATUS_TEXT: Record<KeyStatus, string> = {
  delivered: 'Complete',
  'in-progress': 'In progress',
  'at-risk': 'At risk',
  'not-started': 'Planned',
  deferred: 'Deferred',
  final: 'Go-live',
}

function shortDate(value?: string) {
  return value ? formatMilestoneDate(value) : 'TBC'
}

function dayCount(days: number) {
  return `${days} day${days === 1 ? '' : 's'}`
}

export function StatusIcon({ status, size = 'md' }: { status: KeyStatus; size?: 'sm' | 'md' | 'lg' }) {
  const box = size === 'lg' ? 'size-11' : size === 'md' ? 'size-8' : 'size-6'
  const icon = size === 'lg' ? 'size-5' : size === 'md' ? 'size-4' : 'size-3'
  const Icon =
    status === 'delivered'
      ? Check
      : status === 'in-progress'
        ? Clock
        : status === 'at-risk'
          ? TriangleAlert
          : status === 'deferred'
            ? Pause
            : status === 'final'
              ? Flag
              : null
  return (
    <span
      aria-hidden="true"
      className={cn(
        'relative flex shrink-0 items-center justify-center rounded-full border-2',
        box,
        status === 'delivered' && 'border-primary bg-primary text-primary-foreground',
        status === 'in-progress' && 'border-primary bg-background text-primary',
        status === 'at-risk' && 'border-warning bg-warning text-background',
        status === 'not-started' && 'border-border bg-background text-muted-foreground',
        status === 'deferred' && 'border-dashed border-muted-foreground bg-background text-muted-foreground',
        status === 'final' && 'border-foreground bg-foreground text-background',
      )}
    >
      {Icon && <Icon className={icon} strokeWidth={2.75} />}
    </span>
  )
}

export function DriftChip({ drift, className }: { drift: Drift; className?: string }) {
  if (drift.kind === 'unlocked') return null
  const text =
    drift.kind === 'on-plan'
      ? 'On plan'
      : drift.kind === 'ahead'
        ? `${drift.days}d ahead`
        : `${drift.days}d behind`
  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide',
        drift.kind === 'on-plan' && 'bg-primary/10 text-primary',
        drift.kind === 'ahead' && 'bg-ahead/10 text-ahead',
        drift.kind === 'behind' && 'bg-today/10 text-today',
        className,
      )}
    >
      {text}
    </span>
  )
}

function deliveryCopy(delivery: DeliveryStatus, project: Project) {
  if (project.milestonesDefining || project.milestones.length === 0) {
    return { label: 'Being defined', tone: 'neutral' as const }
  }
  switch (delivery.kind) {
    case 'behind':
      return { label: `${dayCount(delivery.days)} behind`, tone: 'behind' as const }
    case 'ahead':
      return { label: `${dayCount(delivery.days)} ahead`, tone: 'ahead' as const }
    case 'on-schedule':
      return { label: 'On plan', tone: 'on-plan' as const }
    case 'tbc':
      return { label: 'Go-live TBC', tone: 'neutral' as const }
    default:
      return { label: 'Plan not locked', tone: 'unlocked' as const }
  }
}

function DeliveryBadge({ summary, size = 'sm' }: { summary: ExecutiveProject; size?: 'sm' | 'lg' }) {
  const { label, tone } = deliveryCopy(summary.delivery, summary.project)
  const LockIcon = tone === 'unlocked' ? LockOpen : null
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 self-start whitespace-nowrap rounded-full font-bold uppercase tracking-wide',
        size === 'lg' ? 'px-4 py-1.5 text-sm' : 'px-2.5 py-1 text-[11px]',
        tone === 'behind' && 'bg-today text-background',
        tone === 'ahead' && 'bg-ahead text-background',
        tone === 'on-plan' && 'bg-primary text-primary-foreground',
        tone === 'unlocked' && 'border border-dashed border-muted-foreground text-muted-foreground',
        tone === 'neutral' && 'bg-card text-muted-foreground',
      )}
    >
      {LockIcon && <LockIcon aria-hidden="true" className={size === 'lg' ? 'size-4' : 'size-3'} />}
      {label}
    </span>
  )
}

function PanelHeader({
  eyebrow,
  title,
  titleId,
  children,
}: {
  eyebrow: string
  title: string
  titleId: string
  children?: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-4 border-b border-border pb-5 md:flex-row md:items-end md:justify-between">
      <div className="flex flex-col gap-3">
        <p className="flex items-center gap-3 text-xs font-bold uppercase tracking-[0.2em] text-primary">
          <span aria-hidden="true" className="h-0.5 w-10 bg-primary" />
          {eyebrow}
        </p>
        <h2
          id={titleId}
          className="text-balance text-2xl font-extrabold uppercase leading-tight tracking-tight text-foreground md:text-3xl"
        >
          {title}
        </h2>
      </div>
      {children}
    </div>
  )
}

function LockNote({ locked }: { locked: boolean }) {
  return (
    <p className="flex items-center gap-2 text-xs leading-relaxed text-muted-foreground">
      {locked ? (
        <Lock aria-hidden="true" className="size-3.5 shrink-0" />
      ) : (
        <LockOpen aria-hidden="true" className="size-3.5 shrink-0" />
      )}
      {locked
        ? 'Plan locked. Hollow markers show the locked plan date; the bar shows how far each milestone has moved.'
        : 'Plan not locked yet. Ahead / behind tracking starts once the plan is locked in Admin.'}
    </p>
  )
}

function ExecutiveLegend({ locked }: { locked: boolean }) {
  const statuses: KeyStatus[] = ['delivered', 'in-progress', 'at-risk', 'not-started', 'final']
  return (
    <div className="flex flex-col gap-3 border-t border-border pt-5">
      <ul className="flex flex-wrap items-center gap-x-6 gap-y-3" aria-label="Legend">
        {statuses.map((status) => (
          <li key={status} className="flex items-center gap-2 text-sm text-muted-foreground">
            <StatusIcon status={status} size="sm" />
            {STATUS_TEXT[status]}
          </li>
        ))}
        <li className="flex items-center gap-2 text-sm text-muted-foreground">
          <span aria-hidden="true" className="h-5 w-0.5 bg-today" />
          Today
        </li>
        {locked && (
          <>
            <li className="flex items-center gap-2 text-sm text-muted-foreground">
              <span aria-hidden="true" className="h-1.5 w-6 rounded-full bg-ahead" />
              Ahead of plan
            </li>
            <li className="flex items-center gap-2 text-sm text-muted-foreground">
              <span aria-hidden="true" className="h-1.5 w-6 rounded-full bg-today" />
              Behind plan
            </li>
          </>
        )}
      </ul>
      <LockNote locked={locked} />
    </div>
  )
}

/* ---------------------------------- Individual project ---------------------------------- */

function HeadlineFacts({ summary }: { summary: ExecutiveProject }) {
  const final = summary.milestones.find((m) => m.isFinal)
  return (
    <dl className="grid gap-3 md:grid-cols-3">
      <div className="flex flex-col gap-2 rounded-xl border border-border bg-background/80 p-5">
        <dt className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Delivery</dt>
        <dd className="flex flex-col gap-2">
          <DeliveryBadge summary={summary} size="lg" />
          {final && (
            <span className="text-sm text-muted-foreground">
              {`Go-live ${shortDate(final.forecast)}`}
              {final.baseline && final.baseline !== final.forecast && (
                <span className="line-through decoration-muted-foreground/60">{` ${shortDate(final.baseline)}`}</span>
              )}
            </span>
          )}
        </dd>
      </div>
      <div className="flex flex-col gap-2 rounded-xl border border-border bg-background/80 p-5">
        <dt className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Key milestones</dt>
        <dd className="flex flex-col gap-2.5">
          <span className="text-2xl font-extrabold leading-none text-foreground">
            {summary.complete}
            <span className="text-base font-semibold text-muted-foreground">{` of ${summary.total} complete`}</span>
          </span>
          <span aria-hidden="true" className="flex gap-1">
            {summary.milestones
              .filter((m) => !m.isFinal)
              .map((m) => (
                <span
                  key={m.key}
                  className={cn(
                    'h-2 flex-1 rounded-full',
                    m.status === 'delivered' && 'bg-primary',
                    m.status === 'in-progress' && 'bg-primary/40',
                    m.status === 'at-risk' && 'bg-warning',
                    (m.status === 'not-started' || m.status === 'deferred') && 'bg-border',
                  )}
                />
              ))}
          </span>
        </dd>
      </div>
      <div className="flex flex-col gap-2 rounded-xl border border-border bg-background/80 p-5">
        <dt className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Next up</dt>
        <dd className="flex flex-col gap-1">
          {summary.next ? (
            <>
              <span className="text-pretty text-base font-bold leading-snug text-foreground">{summary.next.title}</span>
              <span className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                {shortDate(summary.next.forecast)}
                <DriftChip drift={summary.next.drift} />
              </span>
            </>
          ) : (
            <span className="text-base font-semibold text-muted-foreground">Nothing scheduled</span>
          )}
        </dd>
      </div>
    </dl>
  )
}

function TodayPin({ side }: { side: 'left' | 'right' }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'absolute inset-y-0 z-10 flex w-0.5 flex-col items-center bg-today',
        side === 'left' ? 'left-0 -translate-x-1/2' : 'right-0 translate-x-1/2',
      )}
    >
      <span className="-translate-y-full rounded-sm bg-today px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-background">
        Today
      </span>
    </span>
  )
}

function stationLabel(m: KeyMilestone) {
  const drift =
    m.drift.kind === 'ahead'
      ? `, ${dayCount(m.drift.days)} ahead of plan`
      : m.drift.kind === 'behind'
        ? `, ${dayCount(m.drift.days)} behind plan`
        : m.drift.kind === 'on-plan'
          ? ', on plan'
          : ''
  return `${m.isFinal ? 'Go-live: ' : ''}${m.title}, ${shortDate(m.forecast)}, ${STATUS_TEXT[m.status]}${drift}`
}

function MilestoneStations({ summary }: { summary: ExecutiveProject }) {
  const { milestones, todayIndex } = summary
  return (
    <ol
      className="hidden pt-6 md:grid"
      style={{ gridTemplateColumns: `repeat(${milestones.length}, minmax(0, 1fr))` }}
      aria-label="Key milestones"
    >
      {milestones.map((m, index) => {
        const reached = m.status === 'delivered'
        return (
          <li key={m.key} className="relative flex flex-col items-center gap-3 px-2">
            {index === todayIndex && <TodayPin side="left" />}
            {index === milestones.length - 1 && todayIndex === milestones.length && <TodayPin side="right" />}
            <span className="sr-only">{stationLabel(m)}</span>
            <span
              aria-hidden="true"
              className={cn(
                'text-[11px] font-bold uppercase tracking-widest',
                m.status === 'at-risk' ? 'text-warning' : m.status === 'delivered' ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              {STATUS_TEXT[m.status]}
            </span>
            <div aria-hidden="true" className="relative flex w-full items-center justify-center">
              <span
                className={cn(
                  'absolute top-1/2 h-1.5 -translate-y-1/2',
                  index === 0 ? 'left-1/2' : 'left-0',
                  index === milestones.length - 1 ? 'right-1/2' : 'right-0',
                  reached ? 'bg-primary' : 'bg-border',
                )}
              />
              <StatusIcon status={m.status} size="lg" />
            </div>
            <div aria-hidden="true" className="flex flex-col items-center gap-1.5 text-center">
              <span
                className={cn(
                  'text-pretty text-sm font-bold leading-snug text-foreground',
                  m.isFinal && 'uppercase tracking-wide',
                )}
              >
                {m.title}
              </span>
              <span className="text-sm text-muted-foreground">{shortDate(m.forecast)}</span>
              {m.baseline && m.baseline !== m.forecast && (
                <span className="text-xs text-muted-foreground line-through decoration-muted-foreground/60">
                  {`Plan ${shortDate(m.baseline)}`}
                </span>
              )}
              <DriftChip drift={m.drift} />
            </div>
          </li>
        )
      })}
    </ol>
  )
}

function MilestoneStationsMobile({ summary }: { summary: ExecutiveProject }) {
  return (
    <ol className="flex flex-col md:hidden" aria-label="Key milestones">
      {summary.milestones.map((m, index) => (
        <li key={m.key} className="flex flex-col">
          {index === summary.todayIndex && <MobileTodayRule />}
          <div className="flex gap-4">
            <div className="flex flex-col items-center">
              <StatusIcon status={m.status} />
              {index < summary.milestones.length - 1 && (
                <span
                  aria-hidden="true"
                  className={cn('w-1 flex-1', m.status === 'delivered' ? 'bg-primary' : 'bg-border')}
                />
              )}
            </div>
            <div className="flex flex-col gap-1 pb-6">
              <span className="text-pretty text-sm font-bold leading-snug text-foreground">{m.title}</span>
              <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {`${shortDate(m.forecast)} · ${STATUS_TEXT[m.status]}`}
                <DriftChip drift={m.drift} />
              </span>
            </div>
          </div>
          {index === summary.milestones.length - 1 && summary.todayIndex === summary.milestones.length && (
            <MobileTodayRule />
          )}
        </li>
      ))}
    </ol>
  )
}

function MobileTodayRule() {
  return (
    <span className="mb-4 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-today">
      <span aria-hidden="true" className="h-0.5 flex-1 bg-today" />
      Today
      <span aria-hidden="true" className="h-0.5 flex-1 bg-today" />
    </span>
  )
}

export function ExecutiveProjectTimeline({ project, branding }: { project: Project; branding?: PdfBranding }) {
  const summary = buildExecutiveProject(project)
  const titleId = `exec-title-${project.slug}`
  const exportId = `exec-export-${project.slug}`
  const hasMilestones = summary.milestones.length > 0
  return (
    <section id={exportId} aria-labelledby={titleId} className="timeline-panel flex flex-col gap-8 rounded-3xl p-6 md:p-10">
      <PanelHeader
        eyebrow="Executive view"
        title={project.timelineTitle.replace(/\s+—\s+Delivery Timeline$/i, '')}
        titleId={titleId}
      >
        {hasMilestones && (
          <TimelineExport
            targetId={exportId}
            fileName={`${project.slug}-executive-timeline`}
            projects={[project]}
            branding={branding}
          />
        )}
      </PanelHeader>
      {hasMilestones ? (
        <>
          <HeadlineFacts summary={summary} />
          {project.executiveNote ? (
            <p className="text-pretty border-l-4 border-primary pl-4 text-base leading-relaxed text-foreground">
              {project.executiveNote}
            </p>
          ) : null}
          <MilestoneStations summary={summary} />
          <MilestoneStationsMobile summary={summary} />
          <ExecutiveLegend locked={summary.locked} />
        </>
      ) : (
        <div className="flex flex-col items-center gap-2 rounded-md border-2 border-dashed border-border px-6 py-16 text-center">
          <p className="text-base font-semibold text-foreground">Milestones not yet defined</p>
          <p className="max-w-md text-pretty text-sm leading-relaxed text-muted-foreground">
            Key milestones will appear here once the plan is drafted.
          </p>
        </div>
      )}
    </section>
  )
}

/* ---------------------------------- Consolidated ---------------------------------- */

const TRACK_Y = 22
const LABEL_TOP = 44
const LABEL_ROW_H = 44
const ROW_BOTTOM_PAD = 12

function labelAlign(position: number) {
  if (position > 85) return 'right'
  if (position < 15) return 'left'
  return 'center'
}

function DriftBar({ from, to, drift }: { from: number; to: number; drift: Drift }) {
  if (drift.kind !== 'ahead' && drift.kind !== 'behind') return null
  const left = Math.min(from, to)
  const width = Math.abs(to - from)
  return (
    <span
      aria-hidden="true"
      className={cn('absolute h-1.5 -translate-y-1/2 rounded-full', drift.kind === 'ahead' ? 'bg-ahead' : 'bg-today')}
      style={{ left: `${left}%`, width: `${width}%`, top: TRACK_Y }}
    />
  )
}

function PortfolioMarker({ m, projectLabel }: { m: PortfolioRow['plotted'][number]; projectLabel: string }) {
  const align = labelAlign(m.position)
  const labelTop = LABEL_TOP + m.labelRow * LABEL_ROW_H
  const showGhost = m.baselinePosition !== undefined && Math.abs(m.baselinePosition - m.position) > 0.01
  return (
    <>
      {showGhost && (
        <>
          <DriftBar from={m.baselinePosition!} to={m.position} drift={m.drift} />
          <span
            aria-hidden="true"
            className="absolute size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-dashed border-muted-foreground bg-background"
            style={{ left: `${m.baselinePosition}%`, top: TRACK_Y }}
          />
        </>
      )}
      <span className="absolute z-10 -translate-x-1/2 -translate-y-1/2" style={{ left: `${m.position}%`, top: TRACK_Y }}>
        <StatusIcon status={m.status} size="sm" />
      </span>
      {m.labelRow > 0 && (
        <span
          aria-hidden="true"
          className="absolute w-px bg-border"
          style={{ left: `${m.position}%`, top: TRACK_Y + 12, height: labelTop - TRACK_Y - 14 }}
        />
      )}
      <span
        className={cn(
          'absolute flex w-28 flex-col gap-0.5',
          align === 'center' && '-translate-x-1/2 items-center text-center',
          align === 'right' && '-translate-x-full items-end text-right',
          align === 'left' && 'items-start text-left',
        )}
        style={{ left: `${m.position}%`, top: labelTop }}
      >
        <span className="sr-only">{`${projectLabel}: `}</span>
        <span className={cn('line-clamp-1 text-xs font-bold leading-tight text-foreground', m.isFinal && 'uppercase')}>
          {m.title}
        </span>
        <span className="flex items-center gap-1 text-[11px] leading-tight text-muted-foreground">
          {shortDate(m.forecast)}
          <span className="sr-only">{`, ${STATUS_TEXT[m.status]}`}</span>
          {(m.drift.kind === 'ahead' || m.drift.kind === 'behind') && (
            <span className={cn('font-bold', m.drift.kind === 'ahead' ? 'text-ahead' : 'text-today')}>
              {m.drift.kind === 'ahead' ? `−${m.drift.days}d` : `+${m.drift.days}d`}
              <span className="sr-only">{m.drift.kind === 'ahead' ? ' ahead of plan' : ' behind plan'}</span>
            </span>
          )}
        </span>
      </span>
    </>
  )
}

function PortfolioChart({ portfolio }: { portfolio: ReturnType<typeof buildPortfolio> }) {
  const { rows, axis } = portfolio
  return (
    <div className="hidden md:block">
      <div className="grid grid-cols-[13rem_minmax(0,1fr)_9rem]">
        <div />
        <div className="relative h-14 border-b-2 border-foreground" aria-hidden="true">
          {axis.months.map((month) => (
            <span
              key={month.label}
              className="absolute bottom-1.5 whitespace-nowrap border-l-2 border-foreground pl-1.5 text-xs font-bold uppercase tracking-wider text-foreground"
              style={{ left: `${month.position}%` }}
            >
              {month.label}
            </span>
          ))}
          {axis.todayPosition !== undefined && (
            <span
              className="absolute top-0 z-20 -translate-x-1/2 rounded-sm bg-today px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-background"
              style={{ left: `${axis.todayPosition}%` }}
            >
              Today
            </span>
          )}
        </div>
        <div className="flex items-end border-b-2 border-foreground pb-1.5 pl-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Go-live
        </div>

        {rows.map((row) => {
          const height = LABEL_TOP + row.labelRows * LABEL_ROW_H + ROW_BOTTOM_PAD
          const final = row.milestones.find((m) => m.isFinal)
          return (
            <div key={row.project.slug} className="contents">
              <div className="flex flex-col gap-2 border-b border-border py-4 pr-4">
                <span className="text-base font-bold leading-tight text-foreground">{row.project.tabLabel}</span>
                <DeliveryBadge summary={row} />
              </div>
              <div className="relative border-b border-border" style={{ height }}>
                {axis.months.map((month) => (
                  <span
                    key={month.label}
                    aria-hidden="true"
                    className="absolute inset-y-0 w-px bg-border/60"
                    style={{ left: `${month.position}%` }}
                  />
                ))}
                {axis.todayPosition !== undefined && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-y-0 z-10 w-0.5 -translate-x-1/2 bg-today"
                    style={{ left: `${axis.todayPosition}%` }}
                  />
                )}
                {row.plotted.length === 0 ? (
                  <p className="absolute inset-x-4 text-sm text-muted-foreground" style={{ top: TRACK_Y - 10 }}>
                    {row.milestones.length === 0 ? 'Milestones being defined' : 'Dates to be confirmed'}
                  </p>
                ) : (
                  <>
                    <span
                      aria-hidden="true"
                      className="absolute h-1 -translate-y-1/2 rounded-full bg-border"
                      style={{
                        top: TRACK_Y,
                        left: `${row.plotted[0].position}%`,
                        width: `${row.plotted[row.plotted.length - 1].position - row.plotted[0].position}%`,
                      }}
                    />
                    <ol aria-label={`${row.project.tabLabel} key milestones`}>
                      {row.plotted.map((m) => (
                        <li key={m.key}>
                          <PortfolioMarker m={m} projectLabel={row.project.tabLabel} />
                        </li>
                      ))}
                    </ol>
                  </>
                )}
              </div>
              <div className="flex flex-col justify-center gap-1.5 border-b border-border pl-4">
                {final ? (
                  <>
                    <span className="text-sm font-bold text-foreground">{shortDate(final.forecast)}</span>
                    <DriftChip drift={final.drift} className="self-start" />
                  </>
                ) : (
                  <span className="text-sm text-muted-foreground">TBC</span>
                )}
                {row.unscheduled.filter((m) => !m.isFinal).length > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {`${row.unscheduled.filter((m) => !m.isFinal).length} undated`}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function PortfolioMobile({ rows }: { rows: PortfolioRow[] }) {
  return (
    <ul className="flex flex-col gap-4 md:hidden">
      {rows.map((row) => (
        <li key={row.project.slug} className="flex flex-col gap-3 rounded-xl border border-border bg-background/80 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-base font-bold text-foreground">{row.project.tabLabel}</span>
            <DeliveryBadge summary={row} />
          </div>
          {row.milestones.length === 0 ? (
            <span className="text-sm text-muted-foreground">Milestones being defined</span>
          ) : (
            <ol className="flex flex-col gap-2.5">
              {row.milestones.map((m) => (
                <li key={m.key} className="flex items-center gap-3">
                  <StatusIcon status={m.status} size="sm" />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-semibold text-foreground">{m.title}</span>
                    <span className="text-xs text-muted-foreground">{`${shortDate(m.forecast)} · ${STATUS_TEXT[m.status]}`}</span>
                  </span>
                  <DriftChip drift={m.drift} />
                </li>
              ))}
            </ol>
          )}
        </li>
      ))}
    </ul>
  )
}

function PortfolioHeadline({ counts, total }: { counts: ReturnType<typeof buildPortfolio>['counts']; total: number }) {
  const items = [
    { label: 'Behind', value: counts.behind, className: 'bg-today text-background' },
    { label: 'On plan', value: counts.onPlan, className: 'bg-primary text-primary-foreground' },
    { label: 'Ahead', value: counts.ahead, className: 'bg-ahead text-background' },
    { label: 'Plan not locked', value: counts.unlocked, className: 'border border-dashed border-muted-foreground text-muted-foreground' },
  ].filter((item) => item.value > 0)
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <p className="text-pretty text-lg font-semibold leading-snug text-foreground">
        {`${total} project${total === 1 ? '' : 's'} · key milestones and go-live dates`}
      </p>
      <ul className="flex flex-wrap gap-2" aria-label="Portfolio status">
        {items.map((item) => (
          <li
            key={item.label}
            className={cn('flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide', item.className)}
          >
            <span className="text-sm">{item.value}</span>
            {item.label}
          </li>
        ))}
      </ul>
    </div>
  )
}

export function ExecutivePortfolioTimeline({
  projects,
  lead = 'AI Pod',
  fileName = 'executive-timeline',
  branding,
}: {
  projects: Project[]
  lead?: string
  fileName?: string
  branding?: PdfBranding
}) {
  const portfolio = buildPortfolio(projects)
  const exportId = 'exec-export-all'
  const anyLocked = portfolio.rows.some((row) => row.locked)
  return (
    <section
      id={exportId}
      aria-labelledby="exec-title-all"
      className="timeline-panel flex flex-col gap-8 rounded-3xl p-6 md:p-10"
    >
      <PanelHeader eyebrow="Executive view" title={`All ${lead} projects`} titleId="exec-title-all">
        <TimelineExport targetId={exportId} fileName={fileName} projects={projects} branding={branding} />
      </PanelHeader>
      <PortfolioHeadline counts={portfolio.counts} total={portfolio.rows.length} />
      <PortfolioChart portfolio={portfolio} />
      <PortfolioMobile rows={portfolio.rows} />
      <ExecutiveLegend locked={anyLocked} />
    </section>
  )
}
