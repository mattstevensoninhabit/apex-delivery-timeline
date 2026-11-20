import { parseIsoDate } from './dates'
import { isOpenMilestone, type FinalMilestone, type Milestone, type Project } from './milestones'

const DAY_MS = 24 * 60 * 60 * 1000

export const MAX_EXECUTIVE_MILESTONES = 5

export type DeliveryStatus =
  | { kind: 'not-baselined' }
  | { kind: 'tbc' }
  | { kind: 'on-schedule' }
  | { kind: 'ahead'; days: number }
  | { kind: 'behind'; days: number }

export function daysBetween(from: string | undefined, to: string | undefined): number | undefined {
  const a = from ? parseIsoDate(from) : undefined
  const b = to ? parseIsoDate(to) : undefined
  if (!a || !b) return undefined
  return Math.round((b.getTime() - a.getTime()) / DAY_MS)
}

export function forecastDate(m: Pick<Milestone, 'date' | 'completedDate'>) {
  return m.completedDate && parseIsoDate(m.completedDate) ? m.completedDate : m.date
}

export function milestoneVariance(m: Pick<Milestone, 'date' | 'completedDate' | 'baselineDate'>) {
  return daysBetween(m.baselineDate, forecastDate(m))
}

export function isSlipped(m: Milestone) {
  if (!isOpenMilestone(m.status)) return false
  if (m.baselineDate) return (milestoneVariance(m) ?? 0) > 0
  return Boolean(m.dateSlipped)
}

export function deliveryStatus(project: Project): DeliveryStatus {
  const final = project.finalMilestone
  if (!final || !parseIsoDate(forecastDate(final))) {
    return project.baselinedAt ? { kind: 'tbc' } : { kind: 'not-baselined' }
  }
  if (!project.baselinedAt || !final.baselineDate) return { kind: 'not-baselined' }
  const days = milestoneVariance(final)
  if (days === undefined) return { kind: 'not-baselined' }
  if (days === 0) return { kind: 'on-schedule' }
  return days > 0 ? { kind: 'behind', days } : { kind: 'ahead', days: -days }
}

export function milestoneSlipCount(project: Project) {
  return project.milestones.filter(isSlipped).length
}

export function nextOpenMilestone(project: Project, today: number): Milestone | undefined {
  const pending = project.milestones.filter((m) => isOpenMilestone(m.status))
  const upcoming = pending
    .map((m) => ({ m, t: parseIsoDate(m.date)?.getTime() }))
    .filter((e): e is { m: Milestone; t: number } => e.t !== undefined && e.t >= today)
    .sort((a, b) => a.t - b.t)[0]?.m
  return upcoming ?? pending[0]
}

export function executiveMilestones(project: Project, today: number, cap = MAX_EXECUTIVE_MILESTONES): Milestone[] {
  const flagged = project.milestones.filter((m) => m.executive)
  if (flagged.length === 0) return project.milestones.filter((m) => m.status !== 'deferred')

  const chosen = new Set(flagged.slice(0, cap).map((m) => m.id))
  const next = nextOpenMilestone(project, today)
  if (next) chosen.add(next.id)
  return project.milestones.filter((m) => chosen.has(m.id))
}

export function finalVariance(final: FinalMilestone | undefined) {
  return final ? milestoneVariance(final) : undefined
}
