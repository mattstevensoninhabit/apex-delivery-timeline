'use server'

import { createHash } from 'node:crypto'
import { eq, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { brands, logos, projects } from '@/lib/db/schema'
import { logoUrl } from '@/lib/brands'
import { DEFAULT_COLORS, HEX_COLOR, RESERVED_BRAND_SLUGS, type BrandColors } from '@/lib/branding'
import type { LogoRef } from '@/lib/milestones'

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string }

const MAX_LOGO_BYTES = 512 * 1024
const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$/

function clean(value: unknown, max = 120) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function revalidateAll() {
  revalidatePath('/', 'layout')
}

function validColors(input: Partial<BrandColors> | undefined): BrandColors | string {
  const colors = { ...DEFAULT_COLORS, ...input }
  for (const [key, value] of Object.entries(colors)) {
    if (typeof value !== 'string' || !HEX_COLOR.test(value)) return `Color "${key}" must be a hex value like #1a3f6b.`
  }
  return {
    background: colors.background.toLowerCase(),
    surface: colors.surface.toLowerCase(),
    accent: colors.accent.toLowerCase(),
    timelineAccent: colors.timelineAccent.toLowerCase(),
  }
}

export type BrandInput = {
  name: string
  headerLead: string
  headerAccent: string
  logoAlt: string
  colors: BrandColors
}

export async function createBrand(input: { name: string; slug: string }): Promise<Result<{ slug: string }>> {
  const name = clean(input?.name, 80)
  const slug = clean(input?.slug, 60).toLowerCase()
  if (!name) return { ok: false, error: 'Brand name is required.' }
  if (!SLUG_PATTERN.test(slug)) return { ok: false, error: 'URL slug can use lowercase letters, numbers and dashes.' }
  if (RESERVED_BRAND_SLUGS.has(slug)) return { ok: false, error: `"${slug}" is reserved. Pick another slug.` }

  const existing = await db.select({ slug: brands.slug, position: brands.position }).from(brands)
  if (existing.some((b) => b.slug === slug)) return { ok: false, error: 'A brand with that slug already exists.' }

  await db.insert(brands).values({
    slug,
    name,
    position: existing.reduce((max, b) => Math.max(max, b.position), -1) + 1,
    isDefault: existing.length === 0,
    headerLead: name,
    headerAccent: 'Delivery Timelines',
    logoAlt: name,
  })
  revalidateAll()
  return { ok: true, slug }
}

export async function saveBrand(slug: string, input: BrandInput): Promise<Result> {
  const name = clean(input?.name, 80)
  if (!name) return { ok: false, error: 'Brand name is required.' }
  const colors = validColors(input?.colors)
  if (typeof colors === 'string') return { ok: false, error: colors }

  const result = await db
    .update(brands)
    .set({
      name,
      headerLead: clean(input.headerLead, 60),
      headerAccent: clean(input.headerAccent, 60),
      logoAlt: clean(input.logoAlt, 120),
      colorBackground: colors.background,
      colorSurface: colors.surface,
      colorAccent: colors.accent,
      colorTimelineAccent: colors.timelineAccent,
      updatedAt: sql`now()`,
    })
    .where(eq(brands.slug, slug))
    .returning({ slug: brands.slug })
  if (result.length === 0) return { ok: false, error: 'Brand not found.' }
  revalidateAll()
  return { ok: true }
}

export async function setDefaultBrand(slug: string): Promise<Result> {
  const [brand] = await db.select({ slug: brands.slug }).from(brands).where(eq(brands.slug, slug)).limit(1)
  if (!brand) return { ok: false, error: 'Brand not found.' }
  await db.update(brands).set({ isDefault: sql`${brands.slug} = ${slug}` })
  revalidateAll()
  return { ok: true }
}

function sniffMime(bytes: Buffer): string | null {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png'
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp'
  }
  const head = bytes.toString('utf8', 0, Math.min(bytes.length, 2048)).replace(/^\uFEFF/, '').trimStart()
  if (/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE svg[^>]*>\s*)?<svg[\s>]/i.test(head)) return 'image/svg+xml'
  return null
}

function sanitizeSvg(source: string): string | null {
  let svg = source
    .replace(/<!DOCTYPE[\s\S]*?>/gi, '')
    .replace(/<!ENTITY[\s\S]*?>/gi, '')
    .replace(/<script[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<script[^>]*\/>/gi, '')
    .replace(/<foreignObject[\s\S]*?<\/foreignObject\s*>/gi, '')
    .replace(/<(iframe|embed|object|audio|video)[\s\S]*?(<\/\1\s*>|\/>)/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s(?:xlink:)?href\s*=\s*("|')\s*(?!#|data:image\/(?:png|jpe?g|gif|webp);)[^"']*\1/gi, '')
    .replace(/javascript:/gi, '')
  svg = svg.trim()
  return /<svg[\s>]/i.test(svg) && /<\/svg>\s*$/i.test(svg) ? svg : null
}

async function readLogo(formData: FormData): Promise<{ mime: string; data: Buffer } | string> {
  const file = formData.get('logo')
  if (!(file instanceof File) || file.size === 0) return 'Choose an image to upload.'
  if (file.size > MAX_LOGO_BYTES) return 'Logos must be 512 KB or smaller.'
  const bytes = Buffer.from(await file.arrayBuffer())
  const mime = sniffMime(bytes)
  if (!mime) return 'Upload a PNG, JPEG, WebP or SVG image.'
  if (mime !== 'image/svg+xml') return { mime, data: bytes }
  const clean = sanitizeSvg(bytes.toString('utf8'))
  return clean ? { mime, data: Buffer.from(clean, 'utf8') } : 'That SVG could not be read.'
}

async function currentLogoId(target: 'brand' | 'project', slug: string) {
  const table = target === 'brand' ? brands : projects
  const [row] = await db.select({ logoId: table.logoId }).from(table).where(eq(table.slug, slug)).limit(1)
  return row
}

export async function uploadLogo(
  target: 'brand' | 'project',
  slug: string,
  formData: FormData,
): Promise<Result<{ logo: LogoRef }>> {
  if (target !== 'brand' && target !== 'project') return { ok: false, error: 'Invalid target.' }
  const existing = await currentLogoId(target, slug)
  if (!existing) return { ok: false, error: target === 'brand' ? 'Brand not found.' : 'Project not found.' }

  const logo = await readLogo(formData)
  if (typeof logo === 'string') return { ok: false, error: logo }

  const sha256 = createHash('sha256').update(logo.data).digest('hex')
  const [inserted] = await db
    .insert(logos)
    .values({ mimeType: logo.mime, data: logo.data, byteSize: logo.data.length, sha256 })
    .returning({ id: logos.id })

  if (target === 'brand') await db.update(brands).set({ logoId: inserted.id }).where(eq(brands.slug, slug))
  else await db.update(projects).set({ logoId: inserted.id }).where(eq(projects.slug, slug))

  if (existing.logoId) await db.delete(logos).where(eq(logos.id, existing.logoId))
  revalidateAll()
  return { ok: true, logo: { id: inserted.id, url: logoUrl(inserted.id, sha256) } }
}

export async function removeLogo(target: 'brand' | 'project', slug: string): Promise<Result> {
  if (target !== 'brand' && target !== 'project') return { ok: false, error: 'Invalid target.' }
  const existing = await currentLogoId(target, slug)
  if (!existing) return { ok: false, error: 'Not found.' }
  if (target === 'brand') await db.update(brands).set({ logoId: null }).where(eq(brands.slug, slug))
  else await db.update(projects).set({ logoId: null }).where(eq(projects.slug, slug))
  if (existing.logoId) await db.delete(logos).where(eq(logos.id, existing.logoId))
  revalidateAll()
  return { ok: true }
}
