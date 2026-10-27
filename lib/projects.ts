import 'server-only'
import { asc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { projects } from '@/lib/db/schema'
import type { Project } from '@/lib/milestones'

type ProjectRow = typeof projects.$inferSelect

function toProject(row: ProjectRow): Project {
  return {
    slug: row.slug,
    tabLabel: row.tabLabel,
    tabDescription: row.tabDescription,
    timelineTitle: row.timelineTitle,
    todayMilestoneId: row.todayMilestoneId ?? undefined,
    milestones: row.milestones ?? [],
    finalMilestone: row.finalMilestone ?? undefined,
    notes: row.notes || undefined,
  }
}

export async function getProjects(): Promise<Project[]> {
  const rows = await db.select().from(projects).orderBy(asc(projects.position))
  return rows.map(toProject)
}

export async function getProject(slug: string): Promise<Project | null> {
  const [row] = await db.select().from(projects).where(eq(projects.slug, slug)).limit(1)
  return row ? toProject(row) : null
}
