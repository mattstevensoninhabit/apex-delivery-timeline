import { parseIsoDate } from './dates'
import { isOpenMilestone, type Milestone, type Project } from './milestones'

export type HealthTone = 'defining' | 'unplanned' | 'attention' | 'on-track'

export function overallHealth(project: Project): { label: string; tone: HealthTone } {
  if (project.milestonesDefining) return { label: 'Being defined', tone: 'defining' }
  if (project.milestones.length === 0) return { label: 'Not yet planned', tone: 'unplanned' }
  if (project.milestones.some((m) => m.status === 'at-risk' || (m.dateSlipped && isOpenMilestone(m.status)))) {
    return { label: 'Needs attention', tone: 'attention' }
  }
  return { label: 'On track', tone: 'on-track' }
}

export function startOfToday(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
}

export function nextMilestone(project: Project, today: number): Milestone | undefined {
  const pending = project.milestones.filter((m) => isOpenMilestone(m.status))
  const upcoming = pending
    .map((m) => ({ m, t: parseIsoDate(m.date)?.getTime() }))
    .filter((e): e is { m: Milestone; t: number } => e.t !== undefined && e.t >= today)
    .sort((a, b) => a.t - b.t)[0]?.m
  return upcoming ?? pending[0]
}

export function progress(project: Project) {
  const total = project.milestones.length
  const complete = project.milestones.filter((m) => m.status === 'delivered').length
  return { total, complete, ratio: total === 0 ? 0 : complete / total }
}
