import { parseIsoDate } from './dates'
import type { Milestone, Project } from './milestones'

const DAY_MS = 24 * 60 * 60 * 1000
const PAD_DAYS = 7
const MIN_RANGE_DAYS = 56
const COLLISION_PERCENT = 4.5
const MONTH_LABEL_GAP_PERCENT = 10

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export type PlottedMilestone = Milestone & { time: number; position: number; row: number }

export type LaneFinal = NonNullable<Project['finalMilestone']> & { position?: number }

export type Lane = {
  project: Project
  index: number
  dated: PlottedMilestone[]
  unscheduled: Milestone[]
  final?: LaneFinal
  rows: number
  total: number
  complete: number
  inProgress: number
  atRisk: number
  next?: Milestone
}

export type AxisTick = { position: number; label: string }
export type AxisMonth = { position: number; label: string }

export type MonthGroup = {
  key: string
  label: string
  items: { lane: Lane; milestone: Milestone | LaneFinal; isFinal: boolean; time: number }[]
}

export type ConsolidatedTimeline = {
  lanes: Lane[]
  ticks: AxisTick[]
  months: AxisMonth[]
  todayPosition?: number
  hasDated: boolean
  monthGroups: MonthGroup[]
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function startOfWeek(date: Date) {
  const day = startOfDay(date)
  const offset = (day.getDay() + 6) % 7
  return new Date(day.getTime() - offset * DAY_MS)
}

function timeOf(value: string) {
  return parseIsoDate(value)?.getTime()
}

function assignRows(items: { position: number }[]) {
  const rowEnds: number[] = []
  return items.map((item) => {
    let row = rowEnds.findIndex((end) => item.position - end >= COLLISION_PERCENT)
    if (row === -1) {
      row = rowEnds.length
      rowEnds.push(item.position)
    } else {
      rowEnds[row] = item.position
    }
    return row
  })
}

export function buildConsolidatedTimeline(projects: Project[], now = new Date()): ConsolidatedTimeline {
  const today = startOfDay(now).getTime()

  const allTimes = projects.flatMap((project) => {
    const times = project.milestones.map((m) => timeOf(m.date))
    if (project.finalMilestone) times.push(timeOf(project.finalMilestone.date))
    return times.filter((t): t is number => t !== undefined)
  })
  const hasDated = allTimes.length > 0

  const earliest = hasDated ? Math.min(...allTimes) : today
  const latest = hasDated ? Math.max(...allTimes) : today
  const start = startOfWeek(new Date(earliest - PAD_DAYS * DAY_MS)).getTime()
  const end = Math.max(latest + PAD_DAYS * DAY_MS, start + MIN_RANGE_DAYS * DAY_MS)
  const span = end - start
  const toPosition = (time: number) => ((time - start) / span) * 100

  const ticks: AxisTick[] = []
  for (let t = start; t <= end; t += 7 * DAY_MS) {
    ticks.push({ position: toPosition(t), label: String(new Date(t).getDate()) })
  }

  const months: AxisMonth[] = []
  const cursor = new Date(start)
  cursor.setDate(1)
  while (cursor.getTime() <= end) {
    const t = Math.max(cursor.getTime(), start)
    months.push({ position: toPosition(t), label: `${MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}` })
    cursor.setMonth(cursor.getMonth() + 1)
  }
  if (months.length > 1 && months[1].position - months[0].position < MONTH_LABEL_GAP_PERCENT) {
    months.shift()
  }

  const lanes: Lane[] = projects.map((project, index) => {
    const datedRaw = project.milestones
      .map((milestone) => ({ milestone, time: timeOf(milestone.date) }))
      .filter((entry): entry is { milestone: Milestone; time: number } => entry.time !== undefined)
      .sort((a, b) => a.time - b.time || a.milestone.id - b.milestone.id)
      .map(({ milestone, time }) => ({ ...milestone, time, position: toPosition(time) }))
    const rows = assignRows(datedRaw)
    const dated = datedRaw.map((item, i) => ({ ...item, row: rows[i] }))

    const unscheduled = project.milestones.filter((m) => timeOf(m.date) === undefined)
    const finalTime = project.finalMilestone ? timeOf(project.finalMilestone.date) : undefined
    const final = project.finalMilestone
      ? { ...project.finalMilestone, position: finalTime !== undefined ? toPosition(finalTime) : undefined }
      : undefined

    const pending = project.milestones.filter((m) => m.status !== 'delivered')
    const upcoming = pending
      .map((m) => ({ m, t: timeOf(m.date) }))
      .filter((e): e is { m: Milestone; t: number } => e.t !== undefined && e.t >= today)
      .sort((a, b) => a.t - b.t)[0]?.m

    return {
      project,
      index,
      dated,
      unscheduled,
      final,
      rows: Math.max(1, ...rows.map((r) => r + 1)),
      total: project.milestones.length,
      complete: project.milestones.filter((m) => m.status === 'delivered').length,
      inProgress: project.milestones.filter((m) => m.status === 'in-progress').length,
      atRisk: project.milestones.filter((m) => m.status === 'at-risk').length,
      next: upcoming ?? pending[0],
    }
  })

  const groups = new Map<string, MonthGroup>()
  for (const lane of lanes) {
    const entries: MonthGroup['items'] = lane.dated.map((m) => ({ lane, milestone: m, isFinal: false, time: m.time }))
    if (lane.final?.position !== undefined) {
      const t = timeOf(lane.final.date)
      if (t !== undefined) entries.push({ lane, milestone: lane.final, isFinal: true, time: t })
    }
    for (const entry of entries) {
      const date = new Date(entry.time)
      const key = `${date.getFullYear()}-${String(date.getMonth()).padStart(2, '0')}`
      if (!groups.has(key)) {
        groups.set(key, { key, label: `${MONTHS[date.getMonth()]} ${date.getFullYear()}`, items: [] })
      }
      groups.get(key)!.items.push(entry)
    }
  }
  const monthGroups = [...groups.values()]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((group) => ({ ...group, items: group.items.sort((a, b) => a.time - b.time) }))

  return {
    lanes,
    ticks,
    months,
    todayPosition: today >= start && today <= end ? toPosition(today) : undefined,
    hasDated,
    monthGroups,
  }
}
