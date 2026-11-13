import { MILESTONE_STATUSES, type Milestone, type MilestoneStatus } from '@/lib/milestones'

export type ProjectSnapshot = {
  createdAt: string
  todayMilestoneId: number | null
  milestones: Milestone[]
  finalMilestone: { title: string; date: string } | null
}

export type DraftState = {
  todayIndex: number | null
  milestones: { title: string; date: string; status: MilestoneStatus; dateSlipped: boolean }[]
  finalMilestone: { title: string; date: string } | null
}

const statusLabel = (status: MilestoneStatus) => MILESTONE_STATUSES.find((s) => s.value === status)?.label ?? status

const normalize = (title: string) => title.trim().toLowerCase()

export function formatSnapshotDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function describeChanges(baseline: ProjectSnapshot, draft: DraftState): string {
  const before = new Map(baseline.milestones.map((m) => [normalize(m.title), m]))
  const after = new Map(draft.milestones.map((m) => [normalize(m.title), m]))

  const completed: string[] = []
  const statusChanges: string[] = []
  const dateChanges: string[] = []
  const added: string[] = []
  const removed: string[] = []

  for (const m of draft.milestones) {
    const prev = before.get(normalize(m.title))
    if (!prev) {
      added.push(`${m.title} (${m.date}, ${statusLabel(m.status)})`)
      continue
    }
    if (prev.status !== m.status) {
      if (m.status === 'delivered') completed.push(m.title)
      else statusChanges.push(`${m.title}: ${statusLabel(prev.status)} -> ${statusLabel(m.status)}`)
    }
    if (prev.date !== m.date) {
      dateChanges.push(`${m.title}: ${prev.date} -> ${m.date}${m.dateSlipped ? ' (slipped)' : ''}`)
    } else if (m.dateSlipped && !prev.dateSlipped) {
      dateChanges.push(`${m.title}: flagged as slipped`)
    }
  }
  for (const m of baseline.milestones) {
    if (!after.has(normalize(m.title))) removed.push(m.title)
  }

  const lines: string[] = []
  const section = (heading: string, items: string[]) => {
    if (items.length === 0) return
    lines.push(`${heading}:`)
    for (const item of items) lines.push(`- ${item}`)
  }

  section('Completed', completed)
  section('Status changes', statusChanges)
  section('Date changes', dateChanges)
  section('Added', added)
  section('Removed', removed)

  const prevFinal = baseline.finalMilestone
  const nextFinal = draft.finalMilestone
  if (prevFinal?.date !== nextFinal?.date || prevFinal?.title !== nextFinal?.title) {
    if (!nextFinal) lines.push(`Final delivery: ${prevFinal?.title} removed`)
    else if (!prevFinal) lines.push(`Final delivery: ${nextFinal.title} set for ${nextFinal.date}`)
    else lines.push(`Final delivery: ${prevFinal.date} -> ${nextFinal.date}`)
  }

  const prevToday = baseline.milestones.find((m) => m.id === baseline.todayMilestoneId)?.title
  const nextToday = draft.todayIndex !== null ? draft.milestones[draft.todayIndex]?.title : undefined
  if (nextToday && normalize(nextToday) !== normalize(prevToday ?? '')) {
    lines.push(`Current focus: ${nextToday}`)
  }

  const header = `Update since ${formatSnapshotDate(baseline.createdAt)}`
  if (lines.length === 0) return `${header}: no milestone changes.`
  return [`${header}`, ...lines].join('\n')
}
