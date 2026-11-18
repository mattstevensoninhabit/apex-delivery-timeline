import 'server-only'
import { asc, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { brands, logos } from '@/lib/db/schema'
import type { Brand } from '@/lib/branding'
import type { LogoRef } from '@/lib/milestones'

type BrandRow = typeof brands.$inferSelect

export function logoUrl(id: number, sha256: string) {
  return `/api/logos/${id}?v=${sha256.slice(0, 16)}`
}

export async function getLogoRefs(ids: (number | null | undefined)[]): Promise<Map<number, LogoRef>> {
  const unique = [...new Set(ids.filter((id): id is number => typeof id === 'number'))]
  if (unique.length === 0) return new Map()
  const rows = await db.select({ id: logos.id, sha256: logos.sha256 }).from(logos).where(inArray(logos.id, unique))
  return new Map(rows.map((row) => [row.id, { id: row.id, url: logoUrl(row.id, row.sha256) }]))
}

function toBrand(row: BrandRow, refs: Map<number, LogoRef>): Brand {
  return {
    slug: row.slug,
    position: row.position,
    isDefault: row.isDefault,
    name: row.name,
    headerLead: row.headerLead,
    headerAccent: row.headerAccent,
    logo: row.logoId ? refs.get(row.logoId) : undefined,
    logoAlt: row.logoAlt,
    colors: {
      background: row.colorBackground,
      surface: row.colorSurface,
      accent: row.colorAccent,
      timelineAccent: row.colorTimelineAccent,
    },
  }
}

export async function getBrands(): Promise<Brand[]> {
  const rows = await db.select().from(brands).orderBy(asc(brands.position), asc(brands.name))
  const refs = await getLogoRefs(rows.map((r) => r.logoId))
  return rows.map((row) => toBrand(row, refs))
}

export async function getBrand(slug: string): Promise<Brand | null> {
  const [row] = await db.select().from(brands).where(eq(brands.slug, slug)).limit(1)
  if (!row) return null
  return toBrand(row, await getLogoRefs([row.logoId]))
}

export async function getDefaultBrand(): Promise<Brand | null> {
  const all = await getBrands()
  return all.find((b) => b.isDefault) ?? all[0] ?? null
}
