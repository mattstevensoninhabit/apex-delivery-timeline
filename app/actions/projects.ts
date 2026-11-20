'use server'

import { desc, eq, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { brands, projectSnapshots, projects } from '@/lib/db/schema'
import { HEX_COLOR } from '@/lib/branding'
import type { ProjectSnapshot } from '@/lib/change-notes'
import { parseIsoDate, toIsoDate } from '@/lib/dates'
import type { FinalMilestone, Milestone, MilestoneStatus } from '@/lib/milestones'
import { MAX_EXECUTIVE_MILESTONES } from '@/lib/schedule'

function isoDate(value: unknown): string | undefined {
  return typeof value === 'string' && parseIsoDate(value) ? value : undefined
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

export async function getChangeBaseline(
  slug: string,
): Promise<{ ok: true; snapshot: ProjectSnapshot } | { ok: false; error: string }> {
  if (typeof slug !== 'string' || !slug) return { ok: false, error: 'Project not found.' }

  const rows = await db
    .select()
    .from(projectSnapshots)
    .where(eq(projectSnapshots.projectSlug, slug))
    .orderBy(desc(projectSnapshots.createdAt))
    .limit(200)

  if (rows.length === 0) {
    return { ok: false, error: 'No earlier version yet. Save an update, then generate notes after your next update.' }
  }

  const cutoff = Date.now() - WEEK_MS
  const baseline = rows.find((row) => row.createdAt.getTime() <= cutoff) ?? rows[rows.length - 1]

  return {
    ok: true,
    snapshot: {
      createdAt: baseline.createdAt.toISOString(),
      todayMilestoneId: baseline.todayMilestoneId,
      milestones: baseline.milestones,
      finalMilestone: baseline.finalMilestone ?? null,
    },
  }
}

export type ProjectInput = {
  tabLabel: string
  tabDescription: string
  timelineTitle: string
  todayIndex: number | null
  milestones: {
    title: string
    date: string
    status: MilestoneStatus
    dateSlipped: boolean
    executive?: boolean
    baselineDate?: string
    completedDate?: string
  }[]
  finalMilestone: { title: string; date: string; baselineDate?: string; completedDate?: string } | null
  lockBaseline?: boolean
  notes: string
  executiveNote: string
  milestonesDefining: boolean
  brandSlug: string
  pageTitle: string
  logoAlt: string
  colorAccent: string | null
  colorTimelineAccent: string | null
}

function optionalColor(value: unknown): string | null | false {
  if (value === null || value === undefined || value === '') return null
  return typeof value === 'string' && HEX_COLOR.test(value) ? value.toLowerCase() : false
}

const MAX_NOTES = 2000
const MAX_EXECUTIVE_NOTE = 300

const VALID_STATUSES = new Set<string>(['delivered', 'at-risk', 'in-progress', 'not-started', 'deferred'] satisfies MilestoneStatus[])
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

  const lockBaseline = input.lockBaseline === true
  const todayIso = toIsoDate(new Date())
  const baselineFor = (date: string, existing: unknown) => (lockBaseline ? isoDate(date) : undefined) ?? isoDate(existing)

  const milestones: Milestone[] = []
  for (const [index, m] of input.milestones.entries()) {
    const title = clean(m.title)
    if (!title) return { ok: false, error: `Milestone ${index} needs a title.` }
    if (!VALID_STATUSES.has(m.status)) return { ok: false, error: `Milestone ${index} has an invalid status.` }
    const date = clean(m.date, 40) || 'TBC'
    const baselineDate = baselineFor(date, m.baselineDate)
    const completedDate = m.status === 'delivered' ? (isoDate(m.completedDate) ?? todayIso) : undefined
    milestones.push({
      id: index,
      title,
      date,
      status: m.status,
      ...(m.dateSlipped ? { dateSlipped: true } : {}),
      ...(m.executive === true ? { executive: true } : {}),
      ...(baselineDate ? { baselineDate } : {}),
      ...(completedDate ? { completedDate } : {}),
    })
  }
  if (milestones.filter((m) => m.executive).length > MAX_EXECUTIVE_MILESTONES) {
    return { ok: false, error: `Up to ${MAX_EXECUTIVE_MILESTONES} milestones can be marked as executive.` }
  }

  const finalTitle = input.finalMilestone ? clean(input.finalMilestone.title) : ''
  const finalDate = clean(input.finalMilestone?.date, 40) || 'TBC'
  const finalBaseline = baselineFor(finalDate, input.finalMilestone?.baselineDate)
  const finalCompleted = isoDate(input.finalMilestone?.completedDate)
  const finalMilestone: FinalMilestone | null = finalTitle
    ? {
        id: milestones.length,
        title: finalTitle,
        date: finalDate,
        ...(finalBaseline ? { baselineDate: finalBaseline } : {}),
        ...(finalCompleted ? { completedDate: finalCompleted } : {}),
      }
    : null

  const todayIndex =
    typeof input.todayIndex === 'number' &&
    Number.isInteger(input.todayIndex) &&
    input.todayIndex >= 0 &&
    input.todayIndex < milestones.length
      ? input.todayIndex
      : null

  const colorAccent = optionalColor(input.colorAccent)
  const colorTimelineAccent = optionalColor(input.colorTimelineAccent)
  if (colorAccent === false || colorTimelineAccent === false) {
    return { ok: false, error: 'Colors must be hex values like #0e6b9a.' }
  }

  const [previous] = await db.select().from(projects).where(eq(projects.slug, slug)).limit(1)
  if (!previous) return { ok: false, error: 'Project not found.' }

  const brandSlug = clean(input.brandSlug, 60) || previous.brandSlug
  if (brandSlug !== previous.brandSlug) {
    const [brand] = await db.select({ slug: brands.slug }).from(brands).where(eq(brands.slug, brandSlug)).limit(1)
    if (!brand) return { ok: false, error: 'Selected brand does not exist.' }
  }

  const timelineKey = (
    today: number | null,
    list: Milestone[],
    final: FinalMilestone | null,
  ) =>
    JSON.stringify([
      today,
      list.map((m) => [
        m.title,
        m.date,
        m.status,
        Boolean(m.dateSlipped),
        Boolean(m.executive),
        m.baselineDate ?? null,
        m.completedDate ?? null,
      ]),
      final ? [final.title, final.date, final.baselineDate ?? null, final.completedDate ?? null] : null,
    ])

  if (
    timelineKey(previous.todayMilestoneId, previous.milestones, previous.finalMilestone ?? null) !==
    timelineKey(todayIndex, milestones, finalMilestone)
  ) {
    await db.insert(projectSnapshots).values({
      projectSlug: slug,
      tabLabel: previous.tabLabel,
      todayMilestoneId: previous.todayMilestoneId,
      milestones: previous.milestones,
      finalMilestone: previous.finalMilestone,
    })
  }

  const result = await db
    .update(projects)
    .set({
      tabLabel,
      tabDescription: clean(input.tabDescription, 120),
      timelineTitle,
      todayMilestoneId: todayIndex,
      milestones,
      finalMilestone,
      notes: clean(input.notes, MAX_NOTES),
      executiveNote: clean(input.executiveNote, MAX_EXECUTIVE_NOTE),
      milestonesDefining: input.milestonesDefining === true,
      ...(lockBaseline ? { baselinedAt: sql`now()` } : {}),
      brandSlug,
      pageTitle: clean(input.pageTitle, 120) || null,
      logoAlt: clean(input.logoAlt, 120) || null,
      colorAccent,
      colorTimelineAccent,
      ...(brandSlug !== previous.brandSlug ? { position: sql`(select coalesce(max(position), -1) + 1 from projects where brand_slug = ${brandSlug})` } : {}),
      updatedAt: sql`now()`,
    })
    .where(eq(projects.slug, slug))
    .returning({ slug: projects.slug })

  if (result.length === 0) return { ok: false, error: 'Project not found.' }

  revalidatePath('/', 'layout')
  return { ok: true }
}

function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'project'
  )
}

export async function createProject(input: {
  name: string
  description: string
  brandSlug: string
}): Promise<{ ok: true; slug: string } | { ok: false; error: string }> {
  const tabLabel = clean(input?.name, 80)
  if (!tabLabel) return { ok: false, error: 'Project name is required.' }
  const brandSlug = clean(input?.brandSlug, 60)
  const [brand] = await db.select({ slug: brands.slug }).from(brands).where(eq(brands.slug, brandSlug)).limit(1)
  if (!brand) return { ok: false, error: 'Brand not found.' }

  const existing = await db
    .select({ slug: projects.slug, position: projects.position, brandSlug: projects.brandSlug })
    .from(projects)
  const taken = new Set(existing.map((row) => row.slug))
  const base = slugify(tabLabel)
  let slug = base
  for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`

  const position =
    existing.filter((row) => row.brandSlug === brandSlug).reduce((max, row) => Math.max(max, row.position), -1) + 1

  await db.insert(projects).values({
    slug,
    brandSlug,
    position,
    tabLabel,
    tabDescription: clean(input?.description, 120),
    timelineTitle: `${tabLabel} Delivery Timeline`.slice(0, 200),
    todayMilestoneId: null,
    milestones: [],
    finalMilestone: null,
    notes: '',
  })

  revalidatePath('/', 'layout')
  return { ok: true, slug }
}

export async function reorderProjects(
  brandSlug: string,
  slugs: string[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (typeof brandSlug !== 'string' || !Array.isArray(slugs) || slugs.some((s) => typeof s !== 'string')) {
    return { ok: false, error: 'Invalid order.' }
  }

  const existing = await db.select({ slug: projects.slug }).from(projects).where(eq(projects.brandSlug, brandSlug))
  const known = new Set(existing.map((row) => row.slug))
  if (slugs.length !== known.size || new Set(slugs).size !== slugs.length || slugs.some((s) => !known.has(s))) {
    return { ok: false, error: 'Order must include every project in this brand exactly once.' }
  }

  for (const [position, slug] of slugs.entries()) {
    await db.update(projects).set({ position }).where(eq(projects.slug, slug))
  }

  revalidatePath('/', 'layout')
  return { ok: true }
}
