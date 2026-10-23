'use server'

import { eq, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { projects } from '@/lib/db/schema'
import type { Milestone, MilestoneStatus } from '@/lib/milestones'

export type ProjectInput = {
  tabLabel: string
  tabDescription: string
  timelineTitle: string
  todayIndex: number | null
  milestones: { title: string; date: string; status: MilestoneStatus; dateSlipped: boolean }[]
  finalMilestone: { title: string; date: string } | null
}

const VALID_STATUSES = new Set<string>(['delivered', 'at-risk', 'in-progress', 'not-started'] satisfies MilestoneStatus[])
const MAX_MILESTONES = 50

function clean(value: unknown, max = 200) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

export async function saveProject(
  slug: string,
  input: ProjectInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const tabLabel = clean(input.tabLabel, 80)
  const timelineTitle = clean(input.timelineTitle)
  if (!tabLabel) return { ok: false, error: 'Project name is required.' }
  if (!timelineTitle) return { ok: false, error: 'Timeline title is required.' }
  if (!Array.isArray(input.milestones) || input.milestones.length > MAX_MILESTONES) {
    return { ok: false, error: `Up to ${MAX_MILESTONES} milestones are allowed.` }
  }

  const milestones: Milestone[] = []
  for (const [index, m] of input.milestones.entries()) {
    const title = clean(m.title)
    if (!title) return { ok: false, error: `Milestone ${index} needs a title.` }
    if (!VALID_STATUSES.has(m.status)) return { ok: false, error: `Milestone ${index} has an invalid status.` }
    milestones.push({
      id: index,
      title,
      date: clean(m.date, 40) || 'TBC',
      status: m.status,
      ...(m.dateSlipped ? { dateSlipped: true } : {}),
    })
  }

  const finalTitle = input.finalMilestone ? clean(input.finalMilestone.title) : ''
  const finalMilestone = finalTitle
    ? { id: milestones.length, title: finalTitle, date: clean(input.finalMilestone?.date, 40) || 'TBC' }
    : null

  const todayIndex =
    typeof input.todayIndex === 'number' &&
    Number.isInteger(input.todayIndex) &&
    input.todayIndex >= 0 &&
    input.todayIndex < milestones.length
      ? input.todayIndex
      : null

  const result = await db
    .update(projects)
    .set({
      tabLabel,
      tabDescription: clean(input.tabDescription, 120),
      timelineTitle,
      todayMilestoneId: todayIndex,
      milestones,
      finalMilestone,
      updatedAt: sql`now()`,
    })
    .where(eq(projects.slug, slug))
    .returning({ slug: projects.slug })

  if (result.length === 0) return { ok: false, error: 'Project not found.' }

  revalidatePath('/')
  revalidatePath('/admin')
  return { ok: true }
}

export async function reorderProjects(slugs: string[]): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!Array.isArray(slugs) || slugs.some((s) => typeof s !== 'string')) {
    return { ok: false, error: 'Invalid order.' }
  }

  const existing = await db.select({ slug: projects.slug }).from(projects)
  const known = new Set(existing.map((row) => row.slug))
  if (slugs.length !== known.size || new Set(slugs).size !== slugs.length || slugs.some((s) => !known.has(s))) {
    return { ok: false, error: 'Order must include every project exactly once.' }
  }

  for (const [position, slug] of slugs.entries()) {
    await db.update(projects).set({ position }).where(eq(projects.slug, slug))
  }

  revalidatePath('/')
  revalidatePath('/admin')
  return { ok: true }
}
