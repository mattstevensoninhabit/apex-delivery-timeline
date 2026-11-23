import 'server-only'
import { asc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { projects } from '@/lib/db/schema'
import { getLogoRefs } from '@/lib/brands'
import type { LogoRef, Project } from '@/lib/milestones'

type ProjectRow = typeof projects.$inferSelect

function toProject(row: ProjectRow, refs: Map<number, LogoRef>): Project {
  return {
    slug: row.slug,
    brandSlug: row.brandSlug,
    pageTitle: row.pageTitle || undefined,
    logo: row.logoId ? refs.get(row.logoId) : undefined,
    logoAlt: row.logoAlt || undefined,
    colorAccent: row.colorAccent || undefined,
    colorTimelineAccent: row.colorTimelineAccent || undefined,
    tabLabel: row.tabLabel,
    tabDescription: row.tabDescription,
    timelineTitle: row.timelineTitle,
    todayMilestoneId: row.todayMilestoneId ?? undefined,
    milestones: row.milestones ?? [],
    finalMilestone: row.finalMilestone ?? undefined,
    notes: row.notes || undefined,
    executiveNote: row.executiveNote || undefined,
    weeklyUpdate: row.weeklyUpdate || undefined,
    milestonesDefining: row.milestonesDefining,
    baselinedAt: row.baselinedAt?.toISOString(),
  }
}

export async function getProjects(brandSlug?: string): Promise<Project[]> {
  const query = db.select().from(projects)
  const rows = await (brandSlug ? query.where(eq(projects.brandSlug, brandSlug)) : query).orderBy(
    asc(projects.position),
  )
  const refs = await getLogoRefs(rows.map((r) => r.logoId))
  return rows.map((row) => toProject(row, refs))
}

export async function getProject(slug: string): Promise<Project | null> {
  const [row] = await db.select().from(projects).where(eq(projects.slug, slug)).limit(1)
  if (!row) return null
  return toProject(row, await getLogoRefs([row.logoId]))
}
