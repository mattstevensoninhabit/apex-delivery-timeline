import type { CSSProperties } from 'react'
import type { LogoRef, Project } from './milestones'

export type BrandColors = {
  background: string
  surface: string
  accent: string
  timelineAccent: string
}

export type Brand = {
  slug: string
  position: number
  isDefault: boolean
  name: string
  headerLead: string
  headerAccent: string
  logo?: LogoRef
  logoAlt: string
  colors: BrandColors
}

export type ResolvedBranding = {
  brandSlug: string
  name: string
  lead: string
  accentText: string
  pageTitle?: string
  logo?: LogoRef
  logoAlt: string
  colors: BrandColors
}

export const DEFAULT_COLORS: BrandColors = {
  background: '#071a33',
  surface: '#1a3f6b',
  accent: '#87cf36',
  timelineAccent: '#0e6b9a',
}

export const HEX_COLOR = /^#[0-9a-f]{6}$/i
export const RESERVED_BRAND_SLUGS = new Set(['admin', 'login', 'api', '_next'])

export function resolveBranding(brand: Brand, project?: Project): ResolvedBranding {
  return {
    brandSlug: brand.slug,
    name: brand.name,
    lead: brand.headerLead,
    accentText: brand.headerAccent,
    pageTitle: project?.pageTitle || undefined,
    logo: project?.logo ?? brand.logo,
    logoAlt: (project?.logo ? project.logoAlt : brand.logoAlt) || brand.name,
    colors: {
      ...brand.colors,
      accent: project?.colorAccent || brand.colors.accent,
      timelineAccent: project?.colorTimelineAccent || brand.colors.timelineAccent,
    },
  }
}

export type HeaderInfo = {
  name: string
  logoUrl?: string
  logoAlt: string
  lead: string
  accentText: string
  title?: string
  documentTitle: string
}

export type PdfBranding = {
  name: string
  lead: string
  background: string
  accent: string
  timelineAccent: string
  logoUrl?: string
}

export function headerInfo(branding: ResolvedBranding): HeaderInfo {
  return {
    name: branding.name,
    logoUrl: branding.logo?.url,
    logoAlt: branding.logoAlt,
    lead: branding.lead,
    accentText: branding.accentText,
    title: branding.pageTitle,
    documentTitle: `${brandingTitle(branding)} — ${branding.name}`,
  }
}

export function pdfBranding(branding: ResolvedBranding): PdfBranding {
  return {
    name: branding.name,
    lead: branding.lead,
    background: branding.colors.background,
    accent: branding.colors.accent,
    timelineAccent: branding.colors.timelineAccent,
    logoUrl: branding.logo?.url,
  }
}

export function overrideStyle(brand: Brand, project: Project): CSSProperties | undefined {
  const style: Record<string, string> = {}
  if (project.colorAccent && project.colorAccent !== brand.colors.accent) {
    style['--primary'] = project.colorAccent
    style['--ring'] = project.colorAccent
    style['--primary-foreground'] = readableOn(project.colorAccent)
  }
  if (project.colorTimelineAccent) style['--brand-timeline-accent'] = project.colorTimelineAccent
  return Object.keys(style).length ? (style as CSSProperties) : undefined
}

export function brandingTitle(branding: ResolvedBranding) {
  return branding.pageTitle || [branding.lead, branding.accentText].filter(Boolean).join(' ') || branding.name
}

function luminance(hex: string) {
  const channels = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}

export function readableOn(hex: string, dark = '#09213f') {
  return HEX_COLOR.test(hex) && luminance(hex) > 0.35 ? dark : '#ffffff'
}

export function brandStyle(colors: BrandColors): CSSProperties {
  const style: Record<string, string> = {
    '--background': colors.background,
    '--card': colors.surface,
    '--popover': colors.surface,
    '--primary': colors.accent,
    '--ring': colors.accent,
    '--primary-foreground': readableOn(colors.accent, luminance(colors.background) < 0.1 ? colors.background : '#09213f'),
    '--brand-timeline-accent': colors.timelineAccent,
  }
  if (colors.surface.toLowerCase() !== DEFAULT_COLORS.surface) {
    style['--secondary'] = `color-mix(in srgb, ${colors.surface} 85%, #ffffff)`
    style['--muted'] = `color-mix(in srgb, ${colors.surface} 85%, #ffffff)`
    style['--border'] = `color-mix(in srgb, ${colors.surface} 88%, #ffffff)`
    style['--input'] = `color-mix(in srgb, ${colors.surface} 88%, #ffffff)`
    style['--accent'] = `color-mix(in srgb, ${colors.surface} 70%, ${colors.background})`
  }
  return style as CSSProperties
}
