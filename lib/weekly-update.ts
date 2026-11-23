import { formatMilestoneDate } from './dates'
import type { ExecutiveProject } from './executive-view'

export type UpdateLine = { text: string; level: 0 | 1 | 2; gapBefore: boolean }

const BULLET = /^(\s*)[-*•]\s+(.*)$/

/** Plain text → paragraphs (level 0), bullets (`- `, level 1) and sub-bullets (indented `- `, level 2). */
export function parseWeeklyUpdate(text: string): UpdateLine[] {
  const lines: UpdateLine[] = []
  let gap = false
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    if (!raw.trim()) {
      gap = lines.length > 0
      continue
    }
    const bullet = BULLET.exec(raw)
    if (bullet) {
      const level = bullet[1].replace(/\t/g, '  ').length >= 2 ? 2 : 1
      lines.push({ text: bullet[2].trim(), level, gapBefore: gap })
    } else {
      lines.push({ text: raw.trim(), level: 0, gapBefore: gap })
    }
    gap = false
  }
  return lines
}

function days(n: number) {
  return `${n} day${n === 1 ? '' : 's'}`
}

/** Auto-generated summary used when a project has no weekly update written. */
export function fallbackWeeklyUpdate(summary: ExecutiveProject): UpdateLine[] {
  const lines: UpdateLine[] = []
  const push = (text: string, level: 0 | 1 | 2 = 1, gapBefore = true) => lines.push({ text, level, gapBefore })

  if (summary.total === 0) {
    push('Milestones are being defined. Key dates will follow once the plan is drafted.', 0, false)
    if (summary.project.executiveNote) push(summary.project.executiveNote)
    return lines
  }

  const pct = Math.round((summary.complete / summary.total) * 100)
  push(`Overall completion is at ${pct}% done (${summary.complete} of ${summary.total} key milestones)`, 0, false)

  const final = summary.milestones.find((m) => m.isFinal)
  const goLive = final?.forecast ? formatMilestoneDate(final.forecast) : 'TBC'
  const delivery =
    summary.delivery.kind === 'behind'
      ? `Delivery is ${days(summary.delivery.days)} behind plan, go-live ${goLive}`
      : summary.delivery.kind === 'ahead'
        ? `Delivery is ${days(summary.delivery.days)} ahead of plan, go-live ${goLive}`
        : summary.delivery.kind === 'on-schedule'
          ? `Delivery is on plan for go-live ${goLive}`
          : `Plan is being defined, go-live ${goLive}`
  push(delivery)

  const done = summary.milestones.filter((m) => m.status === 'delivered').slice(-4)
  if (done.length) {
    push('Recently completed:')
    for (const m of done) push(`${m.title}${m.forecast ? ` (${formatMilestoneDate(m.forecast)})` : ''}`, 2, false)
  }

  if (summary.next) {
    const drift =
      summary.next.drift.kind === 'behind'
        ? `, ${days(summary.next.drift.days)} behind plan`
        : summary.next.drift.kind === 'ahead'
          ? `, ${days(summary.next.drift.days)} ahead of plan`
          : ''
    push(
      `Next up: ${summary.next.title}${summary.next.forecast ? ` on ${formatMilestoneDate(summary.next.forecast)}` : ''}${drift}`,
    )
  }

  if (summary.project.executiveNote) push(summary.project.executiveNote)
  return lines
}
