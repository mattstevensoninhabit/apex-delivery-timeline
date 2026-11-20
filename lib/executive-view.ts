import { buildAxis, type Axis } from './consolidated'
import { parseIsoDate } from './dates'
import type { MilestoneStatus, Project } from './milestones'
import { deliveryStatus, executiveMilestones, forecastDate, milestoneVariance, type DeliveryStatus } from './schedule'

const LABEL_COLLISION_PERCENT = 25
const MAX_LABEL_ROWS = 4

export type Drift =
  | { kind: 'unlocked' }
  | { kind: 'on-plan' }
  | { kind: 'ahead'; days: number }
  | { kind: 'behind'; days: number }

export type KeyStatus = MilestoneStatus | 'final'

export type KeyMilestone = {
  key: string
  title: string
  status: KeyStatus
  forecast?: string
  baseline?: string
  forecastTime?: number
  baselineTime?: number
  drift: Drift
  isFinal: boolean
  isNext: boolean
}

export type ExecutiveProject = {
  project: Project
  locked: boolean
  delivery: DeliveryStatus
  milestones: KeyMilestone[]
  complete: number
  total: number
  next?: KeyMilestone
  todayIndex: number
}

export const MAX_STATIONS_PER_ROW = 6

export type StationRow<T> = { items: T[]; start: number }

/** Splits stations into balanced rows so long plans wrap instead of squeezing labels. */
export function stationRows<T>(items: T[], max = MAX_STATIONS_PER_ROW): { rows: StationRow<T>[]; perRow: number } {
  if (items.length === 0) return { rows: [], perRow: 0 }
  const perRow = Math.ceil(items.length / Math.ceil(items.length / max))
  const rows: StationRow<T>[] = []
  for (let start = 0; start < items.length; start += perRow) {
    rows.push({ items: items.slice(start, start + perRow), start })
  }
  return { rows, perRow }
}

function timeOf(value: string | undefined) {
  return value ? parseIsoDate(value)?.getTime() : undefined
}

function driftOf(
  m: { date: string; completedDate?: string; baselineDate?: string },
  locked: boolean,
): Drift {
  if (!locked || !m.baselineDate) return { kind: 'unlocked' }
  const days = milestoneVariance(m)
  if (days === undefined) return { kind: 'unlocked' }
  if (days === 0) return { kind: 'on-plan' }
  return days > 0 ? { kind: 'behind', days } : { kind: 'ahead', days: -days }
}

function startOfDay(now: Date) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
}

export function buildExecutiveProject(project: Project, now = new Date()): ExecutiveProject {
  const today = startOfDay(now)
  const locked = Boolean(project.baselinedAt)
  const picked = executiveMilestones(project, today)
  const nextOpen = picked.find((m) => m.status !== 'delivered' && m.status !== 'deferred' && (timeOf(m.date) ?? today) >= today)

  const keys: KeyMilestone[] = picked.map((m) => {
    const forecast = forecastDate(m)
    return {
      key: String(m.id),
      title: m.title,
      status: m.status,
      forecast,
      baseline: locked ? m.baselineDate : undefined,
      forecastTime: timeOf(forecast),
      baselineTime: locked ? timeOf(m.baselineDate) : undefined,
      drift: driftOf(m, locked),
      isFinal: false,
      isNext: m.id === nextOpen?.id,
    }
  })

  keys.sort((a, b) => {
    if (a.forecastTime === undefined) return b.forecastTime === undefined ? 0 : 1
    if (b.forecastTime === undefined) return -1
    return a.forecastTime - b.forecastTime
  })

  const final = project.finalMilestone
  if (final) {
    const forecast = forecastDate(final)
    keys.push({
      key: 'final',
      title: final.title,
      status: final.completedDate ? 'delivered' : 'final',
      forecast,
      baseline: locked ? final.baselineDate : undefined,
      forecastTime: timeOf(forecast),
      baselineTime: locked ? timeOf(final.baselineDate) : undefined,
      drift: driftOf(final, locked),
      isFinal: true,
      isNext: false,
    })
  }

  const regular = keys.filter((k) => !k.isFinal)
  return {
    project,
    locked,
    delivery: deliveryStatus(project),
    milestones: keys,
    complete: regular.filter((k) => k.status === 'delivered').length,
    total: regular.length,
    next: regular.find((k) => k.isNext),
    todayIndex: keys.filter((k) => k.forecastTime !== undefined && k.forecastTime < today).length,
  }
}

export type PlottedKey = KeyMilestone & {
  position: number
  baselinePosition?: number
  labelRow: number
  forecastTime: number
}

export type PortfolioRow = ExecutiveProject & {
  plotted: PlottedKey[]
  unscheduled: KeyMilestone[]
  labelRows: number
}

export type Portfolio = {
  rows: PortfolioRow[]
  axis: Axis
  counts: { behind: number; ahead: number; onPlan: number; unlocked: number }
}

function assignLabelRows(positions: number[]) {
  const rowEnds: number[] = []
  return positions.map((position) => {
    let row = rowEnds.findIndex((end) => position - end >= LABEL_COLLISION_PERCENT)
    if (row === -1) {
      row = Math.min(rowEnds.length, MAX_LABEL_ROWS - 1)
      if (row === rowEnds.length) rowEnds.push(position)
    }
    rowEnds[row] = position
    return row
  })
}

export function buildPortfolio(projects: Project[], now = new Date()): Portfolio {
  const summaries = projects.map((p) => buildExecutiveProject(p, now))
  const times = summaries.flatMap((s) =>
    s.milestones.flatMap((m) => [m.forecastTime, m.baselineTime]).filter((t): t is number => t !== undefined),
  )
  const axis = buildAxis(times, now)

  const rows = summaries.map((summary) => {
    const dated = summary.milestones.filter(
      (m): m is KeyMilestone & { forecastTime: number } => m.forecastTime !== undefined,
    )
    const positions = dated.map((m) => axis.toPosition(m.forecastTime))
    const labelRowsFor = assignLabelRows(positions)
    const plotted: PlottedKey[] = dated.map((m, i) => ({
      ...m,
      position: positions[i],
      baselinePosition: m.baselineTime !== undefined ? axis.toPosition(m.baselineTime) : undefined,
      labelRow: labelRowsFor[i],
    }))
    return {
      ...summary,
      plotted,
      unscheduled: summary.milestones.filter((m) => m.forecastTime === undefined),
      labelRows: Math.max(1, ...labelRowsFor.map((r) => r + 1)),
    }
  })

  const counts = { behind: 0, ahead: 0, onPlan: 0, unlocked: 0 }
  for (const row of rows) {
    if (row.delivery.kind === 'behind') counts.behind++
    else if (row.delivery.kind === 'ahead') counts.ahead++
    else if (row.delivery.kind === 'on-schedule') counts.onPlan++
    else counts.unlocked++
  }

  return { rows, axis, counts }
}
