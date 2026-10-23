import { buildConsolidatedTimeline, type Lane, type PlottedMilestone } from '@/lib/consolidated'
import { formatMilestoneDate } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { Legend, statusLabel } from '@/components/delivery-timeline'
import { TimelineExport } from '@/components/timeline-export'
import type { Milestone, MilestoneStatus, Project } from '@/lib/milestones'

const ROW_HEIGHT = 32
const TOP_PAD = 22
const FINAL_AREA = 52

const laneSwatch = ['bg-lane-1', 'bg-lane-2', 'bg-lane-3']
const swatchFor = (index: number) => laneSwatch[index % laneSwatch.length]

function dotClass(status: MilestoneStatus) {
  return cn(
    'flex size-6 items-center justify-center rounded-full border-2 text-[10px] font-bold leading-none',
    status === 'delivered' && 'border-primary bg-primary text-primary-foreground',
    status === 'at-risk' && 'border-warning bg-warning text-foreground',
    status === 'in-progress' && 'border-primary bg-background text-foreground',
    status === 'not-started' && 'border-border bg-background text-muted-foreground',
  )
}

function tooltipAlign(position: number) {
  if (position > 70) return 'right-0'
  if (position < 30) return 'left-0'
  return 'left-1/2 -translate-x-1/2'
}

function Swatch({ index, className }: { index: number; className?: string }) {
  return <span aria-hidden="true" className={cn('block size-2.5 shrink-0 rounded-sm', swatchFor(index), className)} />
}

function Tooltip({ align, children }: { align: string; children: React.ReactNode }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'pointer-events-none invisible absolute bottom-full z-20 mb-2 flex w-56 flex-col gap-0.5 rounded-md bg-foreground px-3 py-2 text-left text-xs leading-snug text-background opacity-0 shadow-lg transition-opacity group-hover:visible group-hover:opacity-100 group-focus-visible:visible group-focus-visible:opacity-100',
        align,
      )}
    >
      {children}
    </span>
  )
}

function laneGeometry(lane: Lane) {
  const lineY = TOP_PAD + (lane.rows - 1) * ROW_HEIGHT + 12
  return { lineY, height: lineY + FINAL_AREA }
}

function PlottedDot({ milestone, lane, lineY }: { milestone: PlottedMilestone; lane: Lane; lineY: number }) {
  const centerY = lineY - milestone.row * ROW_HEIGHT
  return (
    <>
      {milestone.row > 0 && (
        <span
          aria-hidden="true"
          className="absolute w-px bg-border"
          style={{ left: `${milestone.position}%`, top: centerY, height: lineY - centerY }}
        />
      )}
      <button
        type="button"
        className="group absolute -translate-x-1/2 -translate-y-1/2 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        style={{ left: `${milestone.position}%`, top: centerY }}
        aria-label={`${lane.project.tabLabel}, milestone ${milestone.id}: ${milestone.title}, ${formatMilestoneDate(milestone.date)}, ${statusLabel[milestone.status]}`}
      >
        <span className={dotClass(milestone.status)}>{milestone.id}</span>
        <Tooltip align={tooltipAlign(milestone.position)}>
          <span className="font-bold uppercase tracking-wide opacity-70">
            {lane.project.tabLabel} · M{milestone.id}
          </span>
          <span className="text-pretty font-semibold">{milestone.title}</span>
          <span className="opacity-80">
            {`${formatMilestoneDate(milestone.date)} · ${statusLabel[milestone.status]}`}
          </span>
        </Tooltip>
      </button>
    </>
  )
}

function FinalFlag({ lane, lineY }: { lane: Lane; lineY: number }) {
  const final = lane.final
  if (!final || final.position === undefined) return null
  const alignRight = final.position > 70
  return (
    <div
      className={cn('absolute flex flex-col', alignRight ? 'items-end' : 'items-start')}
      style={{
        top: lineY - 10,
        ...(alignRight ? { right: `${100 - final.position}%` } : { left: `${final.position}%` }),
      }}
    >
      <span aria-hidden="true" className="h-6 w-1 bg-foreground" />
      <span className="whitespace-nowrap rounded-md bg-primary px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-primary-foreground">
        {`M${final.id} · ${final.title} · ${formatMilestoneDate(final.date)}`}
      </span>
    </div>
  )
}

function GridLines({ ticks, todayPosition }: { ticks: { position: number }[]; todayPosition?: number }) {
  return (
    <>
      {ticks.map((tick) => (
        <span
          key={tick.position}
          aria-hidden="true"
          className="absolute inset-y-0 w-px bg-border/50"
          style={{ left: `${tick.position}%` }}
        />
      ))}
      {todayPosition !== undefined && (
        <span
          aria-hidden="true"
          className="absolute inset-y-0 z-10 w-0.5 -translate-x-1/2 bg-today"
          style={{ left: `${todayPosition}%` }}
        />
      )}
    </>
  )
}

function UnscheduledCell({ lane }: { lane: Lane }) {
  const items: { key: string; label: string; status?: MilestoneStatus }[] = lane.unscheduled.map((m) => ({
    key: String(m.id),
    label: `M${m.id} · ${m.title}`,
    status: m.status,
  }))
  if (lane.final && lane.final.position === undefined) {
    items.push({ key: 'final', label: `M${lane.final.id} · ${lane.final.title} (final)` })
  }
  if (items.length === 0) {
    return <span className="text-xs text-muted-foreground">None</span>
  }
  return (
    <button
      type="button"
      className="group relative flex flex-col items-start gap-1.5 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={`${items.length} unscheduled for ${lane.project.tabLabel}: ${items.map((i) => i.label).join('; ')}`}
    >
      <span className="text-sm font-bold text-foreground">{`${items.length} TBC`}</span>
      <span aria-hidden="true" className="flex flex-wrap gap-1">
        {items.map((item) => (
          <span
            key={item.key}
            className={cn(
              'block size-2.5 rounded-full border-2',
              item.status === 'delivered' && 'border-primary bg-primary',
              item.status === 'at-risk' && 'border-warning bg-warning',
              item.status === 'in-progress' && 'border-primary bg-background',
              item.status === 'not-started' && 'border-border bg-background',
              !item.status && 'border-foreground bg-foreground',
            )}
          />
        ))}
      </span>
      <Tooltip align="right-0">
        <span className="font-bold uppercase tracking-wide opacity-70">Unscheduled</span>
        {items.map((item) => (
          <span key={item.key} className="text-pretty">
            {item.label}
          </span>
        ))}
      </Tooltip>
    </button>
  )
}

function LaneLabel({ lane }: { lane: Lane }) {
  return (
    <div className="flex flex-col gap-1 py-4 pr-4">
      <span className="flex items-center gap-2 text-sm font-bold text-foreground">
        <Swatch index={lane.index} />
        {lane.project.tabLabel}
      </span>
      <span className="text-xs leading-relaxed text-muted-foreground">{lane.project.tabDescription}</span>
    </div>
  )
}

function SwimlaneChart({ data }: { data: ReturnType<typeof buildConsolidatedTimeline> }) {
  const { lanes, ticks, months, todayPosition } = data
  return (
    <div className="hidden md:block">
      <div className="grid grid-cols-[12rem_minmax(0,1fr)_7rem]">
        <div />
        <div className="relative h-14 border-b border-border" aria-hidden="true">
          {months.map((month) => (
            <span
              key={month.label}
              className="absolute top-0 whitespace-nowrap border-l-2 border-foreground pl-1.5 text-xs font-bold uppercase tracking-wider text-foreground"
              style={{ left: `${month.position}%` }}
            >
              {month.label}
            </span>
          ))}
          {ticks.map((tick) => (
            <span
              key={tick.position}
              className="absolute bottom-0 flex -translate-x-1/2 flex-col items-center gap-0.5 text-[11px] text-muted-foreground"
              style={{ left: `${tick.position}%` }}
            >
              {tick.label}
              <span className="h-1.5 w-px bg-border" />
            </span>
          ))}
          {todayPosition !== undefined && (
            <span
              className="absolute bottom-0 z-10 flex -translate-x-1/2 flex-col items-center"
              style={{ left: `${todayPosition}%` }}
            >
              <span className="rounded-sm bg-today px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-background">
                Today
              </span>
              <span className="h-2 w-0.5 bg-today" />
            </span>
          )}
        </div>
        <div className="flex items-end justify-start border-b border-border pb-1 pl-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Unscheduled
        </div>

        {lanes.map((lane) => {
          const { lineY, height } = laneGeometry(lane)
          return (
            <div key={lane.project.slug} className="contents">
              <div className="border-b border-border">
                <LaneLabel lane={lane} />
              </div>
              <div className="relative border-b border-border" style={{ height }}>
                <GridLines ticks={ticks} todayPosition={todayPosition} />
                {lane.total === 0 ? (
                  <p className="absolute inset-x-4 text-sm text-muted-foreground" style={{ top: lineY - 10 }}>
                    Milestones not yet defined
                  </p>
                ) : (
                  <>
                    <span
                      aria-hidden="true"
                      className={cn('absolute inset-x-0 h-1 -translate-y-1/2 opacity-40', swatchFor(lane.index))}
                      style={{ top: lineY }}
                    />
                    {lane.dated.map((milestone) => (
                      <PlottedDot key={milestone.id} milestone={milestone} lane={lane} lineY={lineY} />
                    ))}
                    <FinalFlag lane={lane} lineY={lineY} />
                  </>
                )}
              </div>
              <div className="flex items-center border-b border-border pl-4">
                <UnscheduledCell lane={lane} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function SummaryStrip({ lanes }: { lanes: Lane[] }) {
  return (
    <ul className="grid gap-3 md:grid-cols-3">
      {lanes.map((lane) => (
        <li key={lane.project.slug} className="flex flex-col gap-2 rounded-xl border border-border bg-background/70 p-4">
          <span className="flex items-center gap-2 text-sm font-bold text-foreground">
            <Swatch index={lane.index} />
            {lane.project.tabLabel}
          </span>
          {lane.total === 0 ? (
            <span className="text-sm text-muted-foreground">Milestones not yet defined</span>
          ) : (
            <>
              <span className="text-sm text-foreground">
                <span className="font-bold">{`${lane.complete} of ${lane.total}`}</span> complete
                {lane.inProgress > 0 && <span className="text-muted-foreground">{` · ${lane.inProgress} in progress`}</span>}
                {lane.atRisk > 0 && <span className="font-semibold text-warning">{` · ${lane.atRisk} at risk`}</span>}
              </span>
              <span aria-hidden="true" className="flex h-1.5 overflow-hidden rounded-full bg-border">
                <span className="bg-primary" style={{ width: `${(lane.complete / lane.total) * 100}%` }} />
              </span>
              {lane.next && (
                <span className="text-xs leading-relaxed text-muted-foreground">
                  <span className="font-bold uppercase tracking-wider">Next: </span>
                  {`M${lane.next.id} ${lane.next.title} · ${formatMilestoneDate(lane.next.date)}`}
                </span>
              )}
            </>
          )}
        </li>
      ))}
    </ul>
  )
}

function MobileRow({
  index,
  projectLabel,
  milestone,
  isFinal,
}: {
  index: number
  projectLabel: string
  milestone: Milestone | NonNullable<Project['finalMilestone']>
  isFinal: boolean
}) {
  const status = 'status' in milestone ? milestone.status : undefined
  return (
    <li className="flex items-start gap-3 border-b border-border py-3 last:border-b-0">
      {status ? (
        <span className={cn(dotClass(status), 'mt-0.5')} aria-hidden="true">
          {milestone.id}
        </span>
      ) : (
        <span
          aria-hidden="true"
          className="mt-0.5 flex size-6 items-center justify-center rounded-md bg-primary text-[10px] font-bold text-primary-foreground"
        >
          {milestone.id}
        </span>
      )}
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
          <Swatch index={index} />
          {projectLabel}
        </span>
        <span className="text-pretty text-sm font-semibold leading-snug text-foreground">
          {isFinal ? `${milestone.title} (final)` : milestone.title}
        </span>
        <span className="text-xs text-muted-foreground">
          {formatMilestoneDate(milestone.date)}
          {status && ` · ${statusLabel[status]}`}
        </span>
      </div>
    </li>
  )
}

function MobileList({ data }: { data: ReturnType<typeof buildConsolidatedTimeline> }) {
  const unscheduled = data.lanes.flatMap((lane) => [
    ...lane.unscheduled.map((m) => ({ lane, milestone: m as Milestone | NonNullable<Project['finalMilestone']>, isFinal: false })),
    ...(lane.final && lane.final.position === undefined ? [{ lane, milestone: lane.final, isFinal: true }] : []),
  ])
  const groups = [
    ...data.monthGroups.map((group) => ({ key: group.key, label: group.label, items: group.items })),
    ...(unscheduled.length > 0 ? [{ key: 'tbc', label: 'Unscheduled', items: unscheduled }] : []),
  ]
  return (
    <div className="flex flex-col gap-6 md:hidden">
      {groups.map((group) => (
        <section key={group.key} aria-label={group.label} className="flex flex-col">
          <h3 className="border-b-2 border-foreground pb-1 text-xs font-bold uppercase tracking-widest text-foreground">
            {group.label}
          </h3>
          <ol>
            {group.items.map((item) => (
              <MobileRow
                key={`${item.lane.project.slug}-${item.isFinal ? 'final' : item.milestone.id}`}
                index={item.lane.index}
                projectLabel={item.lane.project.tabLabel}
                milestone={item.milestone}
                isFinal={item.isFinal}
              />
            ))}
          </ol>
        </section>
      ))}
    </div>
  )
}

export function ConsolidatedTimeline({ projects }: { projects: Project[] }) {
  const data = buildConsolidatedTimeline(projects)
  const exportId = 'timeline-export-all'
  return (
    <section
      id={exportId}
      aria-labelledby="timeline-title-all"
      className="timeline-panel flex flex-col gap-6 rounded-3xl p-6 md:p-10"
    >
      <div className="flex flex-col gap-4 border-b border-border pb-5 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-3">
          <p className="flex items-center gap-3 text-xs font-bold uppercase tracking-[0.2em] text-primary">
            <span aria-hidden="true" className="h-0.5 w-10 bg-primary" />
            Consolidated timeline
          </p>
          <h2
            id="timeline-title-all"
            className="text-balance text-2xl font-extrabold uppercase leading-tight tracking-tight text-foreground md:text-3xl"
          >
            All AI Pod projects
          </h2>
        </div>
        <TimelineExport targetId={exportId} fileName="ai-pod-consolidated-timeline" projects={projects} />
      </div>
      <SummaryStrip lanes={data.lanes} />
      {!data.hasDated && (
        <p className="text-sm text-muted-foreground">
          Add dates in Admin to plot milestones on the shared timeline.
        </p>
      )}
      <SwimlaneChart data={data} />
      <MobileList data={data} />
      <Legend />
    </section>
  )
}
