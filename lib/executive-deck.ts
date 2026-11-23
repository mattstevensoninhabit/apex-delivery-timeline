import type PptxGenJS from 'pptxgenjs'
import type { PdfBranding } from './branding'
import type { CapturedImage } from './capture'
import { buildExecutiveProject } from './executive-view'
import type { Project } from './milestones'
import { fallbackWeeklyUpdate, parseWeeklyUpdate, type UpdateLine } from './weekly-update'

export type DeckProject = {
  project: Project
  branding?: PdfBranding
  image?: CapturedImage
}

export type DeckOptions = {
  brandName: string
  lead: string
  branding?: PdfBranding
  fileName: string
}

const SLIDE_W = 13.333
const SLIDE_H = 7.5
const FONT = 'Calibri'
const TEXT_DARK = '1F1F1F'
const MUTED = '595959'

function hex(value: string | undefined, fallback: string) {
  return (value && /^#?[0-9a-f]{6}$/i.test(value) ? value.replace('#', '') : fallback).toUpperCase()
}

function stripDataPrefix(dataUrl: string) {
  return dataUrl.replace(/^data:/, '')
}

function mix(color: string, target: string, amount: number) {
  const a = [0, 2, 4].map((i) => parseInt(color.slice(i, i + 2), 16))
  const b = [0, 2, 4].map((i) => parseInt(target.slice(i, i + 2), 16))
  return a.map((c, i) => Math.round(c + (b[i] - c) * amount).toString(16).padStart(2, '0')).join('')
}

/** pptxgenjs has no gradient fills, so the header band is a rendered PNG. */
function gradientPng(top: string, bottom: string) {
  const canvas = document.createElement('canvas')
  canvas.width = 1200
  canvas.height = 160
  const ctx = canvas.getContext('2d')
  if (!ctx) return undefined
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height)
  gradient.addColorStop(0, `#${top}`)
  gradient.addColorStop(1, `#${bottom}`)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/png')
}

async function loadLogo(url?: string): Promise<{ data: string; ratio: number } | undefined> {
  if (!url) return undefined
  try {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.src = url
    await img.decode()
    const w = img.naturalWidth || 400
    const h = img.naturalHeight || 200
    const scale = Math.min(1, 800 / w)
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(w * scale)
    canvas.height = Math.round(h * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) return undefined
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return { data: canvas.toDataURL('image/png'), ratio: canvas.width / canvas.height }
  } catch {
    return undefined
  }
}

function fitBox(ratio: number, maxW: number, maxH: number) {
  const w = Math.min(maxW, maxH * ratio)
  return { w, h: w / ratio }
}

type Theme = { background: string; band: string; bandTop: string; bandPng?: string }

function themeFor(branding?: PdfBranding): Theme {
  const band = hex(branding?.timelineAccent, '0E6B9A')
  const bandTop = mix(band, 'FFFFFF', 0.45)
  return { background: hex(branding?.background, '071A33'), band, bandTop, bandPng: gradientPng(bandTop, band) }
}

function addHeader(pptx: PptxGenJS, slide: PptxGenJS.Slide, theme: Theme, title: string, subtitle: string) {
  const box = { x: 0.4, y: 0.3, w: SLIDE_W - 0.8, h: 1.25 }
  const shadow = { type: 'outer' as const, blur: 4, offset: 2, angle: 90, color: '000000', opacity: 0.25 }
  if (theme.bandPng) {
    slide.addShape(pptx.ShapeType.rect, { ...box, fill: { color: theme.band }, line: { color: theme.band }, shadow })
    slide.addImage({ data: stripDataPrefix(theme.bandPng), ...box })
  } else {
    slide.addShape(pptx.ShapeType.rect, { ...box, fill: { color: theme.band }, line: { color: theme.band }, shadow })
  }
  slide.addText(
    [
      { text: title, options: { fontSize: 30, bold: true, breakLine: true } },
      { text: subtitle, options: { fontSize: 16, bold: true } },
    ],
    { ...box, align: 'center', valign: 'middle', color: 'FFFFFF', fontFace: FONT, margin: 4, fit: 'shrink' },
  )
}

function updateRuns(lines: UpdateLine[]): PptxGenJS.TextProps[] {
  return lines.map((line, i) => ({
    text: line.text,
    options: {
      fontSize: line.level === 2 ? 15 : 16,
      bullet: line.level === 0 ? false : { indent: 18 },
      indentLevel: line.level === 0 ? 0 : line.level - 1,
      paraSpaceBefore: i === 0 ? 0 : line.gapBefore ? 14 : 4,
      breakLine: true,
    },
  }))
}

function addCover(pptx: PptxGenJS, options: DeckOptions, theme: Theme, logo?: { data: string; ratio: number }) {
  const slide = pptx.addSlide()
  slide.background = { color: theme.background }
  if (logo) {
    const { w, h } = fitBox(logo.ratio, 4, 1.4)
    slide.addImage({ data: stripDataPrefix(logo.data), x: (SLIDE_W - w) / 2, y: 1.4, w, h })
  }
  slide.addText(
    [
      { text: options.lead || options.brandName, options: { fontSize: 40, bold: true, breakLine: true } },
      { text: 'Weekly update', options: { fontSize: 22, breakLine: true } },
      {
        text: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
        options: { fontSize: 16, color: mix(theme.background, 'FFFFFF', 0.7) },
      },
    ],
    { x: 0.8, y: 3.1, w: SLIDE_W - 1.6, h: 2.6, align: 'center', valign: 'top', color: 'FFFFFF', fontFace: FONT },
  )
}

function addDivider(
  pptx: PptxGenJS,
  item: DeckProject,
  index: number,
  total: number,
  theme: Theme,
  logo?: { data: string; ratio: number },
) {
  const slide = pptx.addSlide()
  slide.background = { color: theme.background }
  if (logo) {
    const { w, h } = fitBox(logo.ratio, 2.2, 0.8)
    slide.addImage({ data: stripDataPrefix(logo.data), x: 0.8, y: 0.6, w, h })
  }
  slide.addShape(pptx.ShapeType.rect, {
    x: 0.8,
    y: 3.0,
    w: 1.2,
    h: 0.08,
    fill: { color: hex(item.branding?.accent, '87CF36') },
    line: { color: hex(item.branding?.accent, '87CF36') },
  })
  slide.addText(
    [
      {
        text: `Project ${index + 1} of ${total}`.toUpperCase(),
        options: { fontSize: 14, bold: true, charSpacing: 3, color: mix(theme.background, 'FFFFFF', 0.7), breakLine: true },
      },
      { text: item.project.tabLabel, options: { fontSize: 44, bold: true, breakLine: true } },
      ...(item.project.tabDescription
        ? [{ text: item.project.tabDescription, options: { fontSize: 20, color: mix(theme.background, 'FFFFFF', 0.8) } }]
        : []),
    ],
    { x: 0.8, y: 3.25, w: SLIDE_W - 1.6, h: 3.2, valign: 'top', color: 'FFFFFF', fontFace: FONT, fit: 'shrink' },
  )
}

function addSummary(pptx: PptxGenJS, item: DeckProject, options: DeckOptions, theme: Theme) {
  const slide = pptx.addSlide()
  slide.background = { color: 'FFFFFF' }
  addHeader(pptx, slide, theme, item.branding?.lead || options.lead || options.brandName, item.project.tabLabel)
  const written = parseWeeklyUpdate(item.project.weeklyUpdate ?? '')
  const lines = written.length ? written : fallbackWeeklyUpdate(buildExecutiveProject(item.project))
  slide.addText(
    [
      { text: 'What happened last week', options: { fontSize: 16, bold: true, breakLine: true } },
      { text: ' ', options: { fontSize: 8, breakLine: true } },
      ...updateRuns(lines),
    ],
    { x: 1.0, y: 1.7, w: SLIDE_W - 2.0, h: SLIDE_H - 2.1, valign: 'top', color: TEXT_DARK, fontFace: FONT, fit: 'shrink' },
  )
}

function addTimeline(pptx: PptxGenJS, item: DeckProject, options: DeckOptions, theme: Theme) {
  const slide = pptx.addSlide()
  slide.background = { color: 'FFFFFF' }
  addHeader(pptx, slide, theme, item.branding?.lead || options.lead || options.brandName, `${item.project.tabLabel} — Executive view`)
  const area = { x: 0.4, y: 1.75, w: SLIDE_W - 0.8, h: SLIDE_H - 1.95 }
  if (item.image && item.project.milestones.length > 0) {
    const { w, h } = fitBox(item.image.width / item.image.height, area.w, area.h)
    slide.addImage({
      data: stripDataPrefix(item.image.dataUrl),
      x: area.x + (area.w - w) / 2,
      y: area.y + (area.h - h) / 2,
      w,
      h,
    })
  } else {
    slide.addText('Milestones being defined', {
      ...area,
      align: 'center',
      valign: 'middle',
      fontSize: 22,
      color: MUTED,
      fontFace: FONT,
    })
  }
}

export async function downloadExecutiveDeck(items: DeckProject[], options: DeckOptions) {
  const { default: Pptx } = await import('pptxgenjs')
  const pptx = new Pptx()
  pptx.layout = 'LAYOUT_WIDE'
  pptx.title = `${options.brandName} weekly update`
  pptx.company = options.brandName

  const brandTheme = themeFor(options.branding)
  const brandLogo = await loadLogo(options.branding?.logoUrl)
  addCover(pptx, options, brandTheme, brandLogo)

  for (const [index, item] of items.entries()) {
    const theme = item.branding ? themeFor(item.branding) : brandTheme
    const logo =
      item.branding?.logoUrl && item.branding.logoUrl !== options.branding?.logoUrl
        ? await loadLogo(item.branding.logoUrl)
        : brandLogo
    addDivider(pptx, item, index, items.length, theme, logo)
    addSummary(pptx, item, options, theme)
    addTimeline(pptx, item, options, theme)
  }

  await pptx.writeFile({ fileName: options.fileName })
}
