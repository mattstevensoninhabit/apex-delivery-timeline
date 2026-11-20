import type { jsPDF } from 'jspdf'
import type { PdfBranding } from './branding'
import { buildAxis, buildConsolidatedTimeline } from './consolidated'
import {
  deliveryStatus,
  forecastDate,
  isSlipped,
  milestoneVariance,
  nextOpenMilestone,
  type DeliveryStatus,
} from './schedule'
import { formatMilestoneDate, parseIsoDate } from './dates'
import { buildExecutiveProject, type ExecutiveProject, type KeyStatus } from './executive-view'
import { MILESTONE_STATUSES, isOpenMilestone, type Milestone, type MilestoneStatus, type Project } from './milestones'

type Rgb = [number, number, number]
type LoadedLogo = { dataUrl: string; width: number; height: number }

function hexToRgb(hex: string | undefined): Rgb | null {
  if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return null
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb
}

async function loadLogo(url: string): Promise<LoadedLogo | null> {
  try {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.src = url
    await image.decode()
    const scale = 4
    const width = image.naturalWidth || 300
    const height = image.naturalHeight || 80
    const canvas = document.createElement('canvas')
    canvas.width = width * scale
    canvas.height = height * scale
    const context = canvas.getContext('2d')
    if (!context) return null
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    return { dataUrl: canvas.toDataURL('image/png'), width, height }
  } catch (error) {
    console.error('Could not load logo for PDF', error)
    return null
  }
}

const NAVY: Rgb = [7, 25, 48]
const BLUE: Rgb = [11, 111, 164]
const GREEN: Rgb = [122, 193, 67]
const AMBER: Rgb = [214, 137, 16]
const MUTED: Rgb = [95, 108, 125]
const RULE: Rgb = [214, 224, 234]
const ROW_TINT: Rgb = [242, 247, 251]
const TODAY_RED: Rgb = [214, 48, 49]
const DEFERRED_GRAY: Rgb = [176, 186, 198]

const BAR_TINT: Rgb = [200, 222, 238]
const DONE_TINT: Rgb = [214, 236, 199]
const HALO: Rgb = [196, 224, 242]

const TIMELINE_ROW = 22
const ROADMAP_ROW = 60

type Axis = ReturnType<typeof buildAxis>
type RoadmapRow = {
  project: Project
  next: Milestone | undefined
  points: { m: Milestone; t: number }[]
  startT: number | undefined
  endT: number | undefined
  forecastT: number | undefined
  baselineT: number | undefined
  progressT: number | undefined
  tbc: number
  delivery: DeliveryStatus
}

const isNumber = (value: number | undefined): value is number => value !== undefined
const timeOf = (value: string) => parseIsoDate(value)?.getTime()
const shortDate = (value: string) => formatMilestoneDate(value).replace(/ \d{4}$/, '')

const PAGE_MARGIN = 48
const FOOTER_SPACE = 40

const STATUS_LABEL = Object.fromEntries(MILESTONE_STATUSES.map((s) => [s.value, s.label])) as Record<
  MilestoneStatus,
  string
>

const STATUS_COLOR: Record<MilestoneStatus, Rgb> = {
  delivered: GREEN,
  'in-progress': BLUE,
  'at-risk': AMBER,
  'not-started': MUTED,
  deferred: DEFERRED_GRAY,
}

// jsPDF's built-in Helvetica only encodes WinAnsi; anything outside it garbles the whole line.
const PDF_REPLACEMENTS: [RegExp, string][] = [
  [/[\u2192\u27A1\u21D2]/g, '->'],
  [/[\u2190\u21D0]/g, '<-'],
  [/[\u2018\u2019\u201B\u2032]/g, "'"],
  [/[\u201C\u201D\u201F\u2033]/g, '"'],
  [/[\u2013\u2014\u2212]/g, '-'],
  [/\u2026/g, '...'],
  [/[\u2022\u25CF\u25AA]/g, '-'],
  [/[\u00A0\u2007\u202F]/g, ' '],
  [/\t/g, '  '],
]

function toPdfText(value: string) {
  let text = value.normalize('NFC')
  for (const [pattern, replacement] of PDF_REPLACEMENTS) text = text.replace(pattern, replacement)
  return text.replace(/[^\n\x20-\x7E\u00A1-\u00FF]/g, '')
}

function dateText(value: string) {
  const formatted = formatMilestoneDate(value)
  return formatted || 'TBC'
}

const STATION_LABEL: Record<KeyStatus, string> = {
  delivered: 'Complete',
  'in-progress': 'In progress',
  'at-risk': 'At risk',
  'not-started': 'Planned',
  deferred: 'Deferred',
  final: 'Go-live',
}

function deliveryPill(summary: ExecutiveProject): { label: string; color: Rgb; outline?: boolean } {
  const { delivery, project } = summary
  const days = (n: number) => `${n} day${n === 1 ? '' : 's'}`
  if (project.milestonesDefining || project.milestones.length === 0) return { label: 'Being defined', color: MUTED }
  switch (delivery.kind) {
    case 'behind':
      return { label: `${days(delivery.days)} behind`, color: TODAY_RED }
    case 'ahead':
      return { label: `${days(delivery.days)} ahead`, color: GREEN }
    case 'on-schedule':
      return { label: 'On plan', color: BLUE }
    case 'tbc':
      return { label: 'Go-live TBC', color: MUTED }
    default:
      return { label: 'Plan not locked', color: MUTED, outline: true }
  }
}

function nextMilestone(project: Project, today: number): Milestone | undefined {
  const pending = project.milestones.filter((m) => isOpenMilestone(m.status))
  const upcoming = pending
    .map((m) => ({ m, t: parseIsoDate(m.date)?.getTime() }))
    .filter((e): e is { m: Milestone; t: number } => e.t !== undefined && e.t >= today)
    .sort((a, b) => a.t - b.t)[0]?.m
  return upcoming ?? pending[0]
}

function overallHealth(project: Project): { label: string; color: Rgb } {
  if (project.milestonesDefining) return { label: 'Being defined', color: BLUE }
  if (project.milestones.length === 0) return { label: 'Not yet planned', color: MUTED }
  if (project.milestones.some((m) => m.status === 'at-risk' || isSlipped(m))) {
    return { label: 'Needs attention', color: AMBER }
  }
  return { label: 'On track', color: GREEN }
}

class SummaryWriter {
  private y = PAGE_MARGIN
  private readonly width: number
  private readonly height: number

  constructor(private readonly pdf: jsPDF) {
    this.width = pdf.internal.pageSize.getWidth()
    this.height = pdf.internal.pageSize.getHeight()
  }

  get contentWidth() {
    return this.width - PAGE_MARGIN * 2
  }

  private color(rgb: Rgb, kind: 'text' | 'fill' | 'draw') {
    if (kind === 'text') this.pdf.setTextColor(...rgb)
    else if (kind === 'fill') this.pdf.setFillColor(...rgb)
    else this.pdf.setDrawColor(...rgb)
  }

  space(amount: number) {
    this.y += amount
  }

  ensure(space: number) {
    if (this.y + space > this.height - FOOTER_SPACE) {
      this.pdf.addPage()
      this.y = PAGE_MARGIN
    }
  }

  private measure(text: string, charSpace = 0) {
    return this.pdf.getTextWidth(text) + charSpace * text.length
  }

  private truncate(text: string, maxWidth: number, charSpace = 0) {
    const clean = toPdfText(text)
    if (this.measure(clean, charSpace) <= maxWidth) return clean
    let end = clean.length
    while (end > 0 && this.measure(`${clean.slice(0, end).trimEnd()}...`, charSpace) > maxWidth) end--
    return `${clean.slice(0, end).trimEnd()}...`
  }

  private wrap(text: string, maxWidth: number, maxLines: number) {
    const lines = this.pdf.splitTextToSize(toPdfText(text), maxWidth) as string[]
    if (lines.length <= maxLines) return lines
    const kept = lines.slice(0, maxLines)
    kept[maxLines - 1] = this.truncate(lines.slice(maxLines - 1).join(' '), maxWidth)
    return kept
  }

  header(title: string, subtitle: string, branding?: PdfBranding, logo?: LoadedLogo | null) {
    const fill = hexToRgb(branding?.background) ?? NAVY
    const accent = hexToRgb(branding?.accent) ?? GREEN

    let logoWidth = 0
    let logoHeight = 0
    if (logo) {
      logoWidth = Math.min(160, (logo.width / logo.height) * 28)
      logoHeight = (logoWidth / logo.width) * logo.height
    }
    const textWidth = this.contentWidth - (logoWidth ? logoWidth + 24 : 0)

    this.pdf.setFont('helvetica', 'bold')
    let titleSize = 20
    this.pdf.setFontSize(titleSize)
    let titleLines = this.pdf.splitTextToSize(toPdfText(title.toUpperCase()), textWidth) as string[]
    if (titleLines.length > 2) {
      titleSize = 16
      this.pdf.setFontSize(titleSize)
    }
    titleLines = this.wrap(title.toUpperCase(), textWidth, 2)
    const titleLeading = titleSize * 1.15
    const extra = (titleLines.length - 1) * titleLeading
    const headerHeight = 96 + extra

    this.color(fill, 'fill')
    this.pdf.rect(0, 0, this.width, headerHeight, 'F')
    this.color(accent, 'fill')
    this.pdf.rect(0, headerHeight, this.width, 4, 'F')

    if (logo) {
      this.pdf.addImage(logo.dataUrl, 'PNG', this.width - PAGE_MARGIN - logoWidth, 24, logoWidth, logoHeight)
    }

    const eyebrowParts = branding ? [branding.name, branding.lead] : ['Anyone Home', 'AI Pod']
    const eyebrow = eyebrowParts
      .filter((part): part is string => Boolean(part?.trim()))
      .filter((part, i, all) => all.findIndex((p) => p.trim().toLowerCase() === part.trim().toLowerCase()) === i)
      .join('  |  ')
    this.pdf.setFontSize(9)
    this.color(accent, 'text')
    this.pdf.text(this.truncate(eyebrow.toUpperCase(), textWidth, 1.2), PAGE_MARGIN, 38, { charSpace: 1.2 })

    this.pdf.setFontSize(titleSize)
    this.pdf.setTextColor(255, 255, 255)
    this.pdf.text(titleLines, PAGE_MARGIN, 62, { lineHeightFactor: 1.15 })

    this.pdf.setFont('helvetica', 'normal')
    this.pdf.setFontSize(10)
    this.pdf.setTextColor(200, 214, 230)
    this.pdf.text(this.truncate(subtitle, this.contentWidth), PAGE_MARGIN, 80 + extra)

    this.y = 132 + extra
  }

  sectionTitle(text: string, eyebrow?: string) {
    this.ensure(56)
    if (eyebrow) {
      this.pdf.setFont('helvetica', 'bold')
      this.pdf.setFontSize(8)
      this.color(BLUE, 'text')
      this.pdf.text(this.truncate(eyebrow.toUpperCase(), this.contentWidth, 1.2), PAGE_MARGIN, this.y, {
        charSpace: 1.2,
      })
      this.y += 16
    }
    this.pdf.setFont('helvetica', 'bold')
    this.pdf.setFontSize(15)
    this.color(NAVY, 'text')
    this.pdf.text(this.truncate(text, this.contentWidth), PAGE_MARGIN, this.y)
    this.y += 10
    this.color(RULE, 'draw')
    this.pdf.setLineWidth(0.75)
    this.pdf.line(PAGE_MARGIN, this.y, this.width - PAGE_MARGIN, this.y)
    this.y += 20
  }

  progress(project: Project) {
    const total = project.milestones.length
    const complete = project.milestones.filter((m) => m.status === 'delivered').length
    const ratio = total === 0 ? 0 : complete / total
    const health = overallHealth(project)

    this.ensure(70)
    this.pdf.setFont('helvetica', 'bold')
    this.pdf.setFontSize(26)
    this.color(NAVY, 'text')
    this.pdf.text(`${Math.round(ratio * 100)}%`, PAGE_MARGIN, this.y + 18)

    this.pdf.setFont('helvetica', 'normal')
    this.pdf.setFontSize(10)
    this.color(MUTED, 'text')
    this.pdf.text(`${complete} of ${total} milestones complete`, PAGE_MARGIN + 78, this.y + 8)

    this.color(health.color, 'fill')
    this.pdf.circle(PAGE_MARGIN + 82, this.y + 19, 3.5, 'F')
    this.pdf.setFont('helvetica', 'bold')
    this.color(health.color, 'text')
    this.pdf.text(health.label, PAGE_MARGIN + 91, this.y + 22)

    const barY = this.y + 34
    this.color(RULE, 'fill')
    this.pdf.roundedRect(PAGE_MARGIN, barY, this.contentWidth, 8, 4, 4, 'F')
    if (ratio > 0) {
      this.color(GREEN, 'fill')
      this.pdf.roundedRect(PAGE_MARGIN, barY, Math.max(8, this.contentWidth * ratio), 8, 4, 4, 'F')
    }
    this.y = barY + 26
  }

  statRow(stats: { label: string; value: string }[]) {
    const cell = this.contentWidth / stats.length
    this.pdf.setFont('helvetica', 'bold')
    this.pdf.setFontSize(10)
    const wrapped = stats.map((stat) => this.pdf.splitTextToSize(stat.value, cell - 12) as string[])
    const maxLines = Math.max(...wrapped.map((lines) => lines.length))
    this.ensure(maxLines * 12 + 34)
    stats.forEach((stat, i) => {
      const x = PAGE_MARGIN + i * cell
      this.pdf.setFont('helvetica', 'bold')
      this.pdf.setFontSize(7.5)
      this.color(MUTED, 'text')
      this.pdf.text(stat.label.toUpperCase(), x, this.y, { charSpace: 0.8 })
      this.pdf.setFontSize(10)
      this.color(NAVY, 'text')
      this.pdf.text(wrapped[i], x, this.y + 15)
    })
    this.y += maxLines * 12 + 30
  }

  bulletList(heading: string, items: string[], accent: Rgb) {
    if (items.length === 0) return
    this.ensure(30)
    this.pdf.setFont('helvetica', 'bold')
    this.pdf.setFontSize(9)
    this.color(accent, 'text')
    this.pdf.text(heading.toUpperCase(), PAGE_MARGIN, this.y, { charSpace: 0.8 })
    this.y += 14

    this.pdf.setFont('helvetica', 'normal')
    this.pdf.setFontSize(10)
    for (const item of items) {
      const lines = this.pdf.splitTextToSize(item, this.contentWidth - 14) as string[]
      this.ensure(lines.length * 13 + 4)
      this.color(accent, 'fill')
      this.pdf.circle(PAGE_MARGIN + 3, this.y - 3.5, 2, 'F')
      this.color(NAVY, 'text')
      this.pdf.text(lines, PAGE_MARGIN + 12, this.y)
      this.y += lines.length * 13 + 3
    }
    this.y += 10
  }

  milestoneTable(project: Project) {
    const rows: { id: string; title: string; date: string; status: string; color: Rgb; slipped: boolean }[] =
      project.milestones.map((m) => ({
        id: String(m.id),
        title: m.title,
        date: dateText(m.date),
        status: STATUS_LABEL[m.status],
        color: STATUS_COLOR[m.status],
        slipped: m.baselineDate ? (milestoneVariance(m) ?? 0) > 0 : Boolean(m.dateSlipped),
      }))
    if (project.finalMilestone) {
      rows.push({
        id: String(project.finalMilestone.id),
        title: project.finalMilestone.title,
        date: dateText(project.finalMilestone.date),
        status: 'Final delivery',
        color: NAVY,
        slipped: false,
      })
    }
    if (rows.length === 0) return

    const cols = { id: PAGE_MARGIN + 8, title: PAGE_MARGIN + 36, date: PAGE_MARGIN + 340, status: PAGE_MARGIN + 420 }
    const titleWidth = cols.date - cols.title - 12

    const drawHead = () => {
      this.color(NAVY, 'fill')
      this.pdf.rect(PAGE_MARGIN, this.y, this.contentWidth, 20, 'F')
      this.pdf.setFont('helvetica', 'bold')
      this.pdf.setFontSize(7.5)
      this.pdf.setTextColor(255, 255, 255)
      const textY = this.y + 13
      this.pdf.text('#', cols.id, textY)
      this.pdf.text('MILESTONE', cols.title, textY, { charSpace: 0.8 })
      this.pdf.text('DATE', cols.date, textY, { charSpace: 0.8 })
      this.pdf.text('STATUS', cols.status, textY, { charSpace: 0.8 })
      this.y += 20
    }

    this.ensure(48)
    drawHead()

    this.pdf.setFontSize(9.5)
    rows.forEach((row, i) => {
      this.pdf.setFont('helvetica', 'normal')
      const lines = this.pdf.splitTextToSize(toPdfText(row.title), titleWidth) as string[]
      const rowHeight = Math.max(22, lines.length * 12 + 10)
      if (this.y + rowHeight > this.height - FOOTER_SPACE) {
        this.pdf.addPage()
        this.y = PAGE_MARGIN
        drawHead()
        this.pdf.setFontSize(9.5)
      }
      if (i % 2 === 1) {
        this.color(ROW_TINT, 'fill')
        this.pdf.rect(PAGE_MARGIN, this.y, this.contentWidth, rowHeight, 'F')
      }
      const textY = this.y + 14
      this.pdf.setFont('helvetica', 'bold')
      this.color(MUTED, 'text')
      this.pdf.text(row.id, cols.id, textY)
      this.pdf.setFont('helvetica', 'normal')
      this.color(NAVY, 'text')
      this.pdf.text(lines, cols.title, textY)
      this.color(row.slipped ? AMBER : NAVY, 'text')
      this.pdf.text(row.slipped ? `${row.date} *` : row.date, cols.date, textY)
      this.color(row.color, 'fill')
      this.pdf.circle(cols.status + 3, textY - 3.2, 3, 'F')
      this.pdf.setFont('helvetica', 'bold')
      this.color(row.color, 'text')
      this.pdf.text(row.status, cols.status + 11, textY)
      this.y += rowHeight
    })

    this.color(RULE, 'draw')
    this.pdf.line(PAGE_MARGIN, this.y, this.width - PAGE_MARGIN, this.y)
    this.y += 12
    if (rows.some((r) => r.slipped)) {
      this.pdf.setFont('helvetica', 'normal')
      this.pdf.setFontSize(8)
      this.color(MUTED, 'text')
      this.pdf.text('* Date has moved from the original plan.', PAGE_MARGIN, this.y)
      this.y += 12
    }
    this.y += 18
  }

  timeline(projects: Project[], { showLaneLabels }: { showLaneLabels: boolean }) {
    const timeline = buildConsolidatedTimeline(projects)
    if (!timeline.hasDated) {
      this.note('Dates to be confirmed - no milestones have been scheduled yet.')
      return
    }

    const gutter = showLaneLabels ? 110 : 0
    const tbcSpace = timeline.lanes.some((lane) => lane.unscheduled.length > 0) ? 44 : 8
    const chartX = PAGE_MARGIN + gutter + 10
    const chartW = this.contentWidth - gutter - 10 - tbcSpace
    const xAt = (position: number) => chartX + (position / 100) * chartW

    const layouts = timeline.lanes.map((lane) => {
      const finalX = lane.final?.position !== undefined ? xAt(lane.final.position) : undefined
      const finalCollides =
        finalX !== undefined && lane.dated.some((m) => m.row === 0 && Math.abs(xAt(m.position) - finalX) < 20)
      const finalRow = finalCollides ? lane.rows : 0
      const rows = Math.max(lane.rows, finalRow + 1)
      return { lane, finalX, finalRow, height: rows * TIMELINE_ROW + 14 }
    })

    const tagSpace = timeline.todayPosition !== undefined ? 16 : 0
    const axisHeight = 30
    const legendHeight = 30
    const lanesHeight = layouts.reduce((sum, l) => sum + l.height, 0)
    this.ensure(tagSpace + axisHeight + lanesHeight + legendHeight)

    const axisTop = this.y + tagSpace
    const lanesTop = axisTop + axisHeight
    const lanesBottom = lanesTop + lanesHeight

    this.pdf.setFont('helvetica', 'bold')
    this.pdf.setFontSize(7.5)
    this.color(NAVY, 'text')
    for (const month of timeline.months) {
      this.pdf.text(month.label.toUpperCase(), xAt(month.position) + 2, axisTop + 9, { charSpace: 0.8 })
    }

    const tickSpacing = timeline.ticks.length > 1 ? xAt(timeline.ticks[1].position) - xAt(timeline.ticks[0].position) : chartW
    const labelEvery = Math.max(1, Math.ceil(16 / tickSpacing))
    this.pdf.setFont('helvetica', 'normal')
    this.pdf.setFontSize(7)
    timeline.ticks.forEach((tick, i) => {
      if (i % labelEvery === 0) {
        this.color(MUTED, 'text')
        this.pdf.text(tick.label, xAt(tick.position) + 2, axisTop + 22)
      }
    })

    let laneY = lanesTop
    layouts.forEach((layout, i) => {
      if (i % 2 === 0) {
        this.color(ROW_TINT, 'fill')
        this.pdf.rect(PAGE_MARGIN, laneY, this.contentWidth, layout.height, 'F')
      }
      if (showLaneLabels) {
        this.pdf.setFont('helvetica', 'bold')
        this.pdf.setFontSize(8.5)
        this.color(NAVY, 'text')
        const lines = (this.pdf.splitTextToSize(layout.lane.project.tabLabel, gutter - 8) as string[]).slice(0, 2)
        const textTop = laneY + layout.height / 2 - (lines.length * 10) / 2 + 7
        this.pdf.text(lines, PAGE_MARGIN + 8, textTop)
      }
      laneY += layout.height
    })

    this.color(RULE, 'draw')
    this.pdf.setLineWidth(0.5)
    timeline.ticks.forEach((tick) => {
      const x = xAt(tick.position)
      this.pdf.line(x, axisTop + 13, x, lanesBottom)
    })
    this.pdf.line(PAGE_MARGIN, lanesTop, PAGE_MARGIN + this.contentWidth, lanesTop)
    this.pdf.line(PAGE_MARGIN, lanesBottom, PAGE_MARGIN + this.contentWidth, lanesBottom)

    if (timeline.todayPosition !== undefined) {
      const x = xAt(timeline.todayPosition)
      this.color(TODAY_RED, 'draw')
      this.pdf.setLineWidth(1)
      this.pdf.setLineDashPattern([3, 2], 0)
      this.pdf.line(x, axisTop - 2, x, lanesBottom)
      this.pdf.setLineDashPattern([], 0)
      this.color(TODAY_RED, 'fill')
      this.pdf.roundedRect(x - 15, this.y, 30, 11, 2, 2, 'F')
      this.pdf.setFont('helvetica', 'bold')
      this.pdf.setFontSize(6)
      this.pdf.setTextColor(255, 255, 255)
      this.pdf.text('TODAY', x, this.y + 7.8, { align: 'center', charSpace: 0.4 })
    }

    laneY = lanesTop
    for (const layout of layouts) {
      const rowCenter = (row: number) => laneY + 7 + row * TIMELINE_ROW + TIMELINE_ROW / 2
      for (const milestone of layout.lane.dated) {
        this.drawDot(xAt(milestone.position), rowCenter(milestone.row), milestone, STATUS_COLOR[milestone.status])
      }
      if (layout.finalX !== undefined && layout.lane.final) {
        this.drawDiamond(layout.finalX, rowCenter(layout.finalRow), String(layout.lane.final.id))
      }
      if (layout.lane.unscheduled.length > 0) {
        this.pdf.setFont('helvetica', 'bold')
        this.pdf.setFontSize(7.5)
        this.color(MUTED, 'text')
        this.pdf.text(`+${layout.lane.unscheduled.length} TBC`, PAGE_MARGIN + this.contentWidth - 6, rowCenter(0) + 2.5, {
          align: 'right',
        })
      }
      laneY += layout.height
    }

    this.y = lanesBottom + 16
    this.drawLegend(timeline.todayPosition !== undefined)
    this.y += legendHeight - 2
  }

  private centeredText(text: string, x: number, y: number, charSpace = 0) {
    const clean = toPdfText(text)
    this.pdf.text(clean, x - this.measure(clean, charSpace) / 2 + charSpace / 2, y, { charSpace })
  }

  private drawStationIcon(x: number, y: number, status: KeyStatus, r = 11) {
    this.pdf.setLineDashPattern([], 0)
    this.pdf.setLineWidth(r > 7 ? 1.6 : 1.1)
    const white: Rgb = [255, 255, 255]
    switch (status) {
      case 'delivered': {
        this.color(BLUE, 'fill')
        this.color(BLUE, 'draw')
        this.pdf.circle(x, y, r, 'FD')
        this.color(white, 'draw')
        this.pdf.setLineWidth(r * 0.17)
        this.pdf.lines(
          [
            [r * 0.28, r * 0.28],
            [r * 0.5, -r * 0.6],
          ],
          x - r * 0.4,
          y,
        )
        break
      }
      case 'in-progress': {
        this.pdf.setFillColor(255, 255, 255)
        this.color(BLUE, 'draw')
        this.pdf.circle(x, y, r, 'FD')
        this.pdf.setLineWidth(r * 0.1)
        this.pdf.circle(x, y, r * 0.5, 'S')
        this.pdf.line(x, y, x, y - r * 0.3)
        this.pdf.line(x, y, x + r * 0.22, y + r * 0.12)
        break
      }
      case 'at-risk': {
        this.color(AMBER, 'fill')
        this.color(AMBER, 'draw')
        this.pdf.circle(x, y, r, 'FD')
        this.pdf.setFont('helvetica', 'bold')
        this.pdf.setFontSize(r * 1.2)
        this.pdf.setTextColor(255, 255, 255)
        this.centeredText('!', x, y + r * 0.42)
        break
      }
      case 'deferred': {
        this.pdf.setFillColor(255, 255, 255)
        this.color(MUTED, 'draw')
        this.pdf.setLineDashPattern([2, 1.5], 0)
        this.pdf.circle(x, y, r, 'FD')
        this.pdf.setLineDashPattern([], 0)
        break
      }
      case 'final': {
        this.color(NAVY, 'fill')
        this.color(NAVY, 'draw')
        this.pdf.circle(x, y, r, 'FD')
        this.color(white, 'draw')
        this.color(white, 'fill')
        this.pdf.setLineWidth(r * 0.12)
        const poleX = x - r * 0.3
        this.pdf.line(poleX, y - r * 0.45, poleX, y + r * 0.5)
        this.pdf.triangle(poleX, y - r * 0.45, poleX + r * 0.65, y - r * 0.2, poleX, y + r * 0.05, 'F')
        break
      }
      default: {
        this.pdf.setFillColor(255, 255, 255)
        this.color(RULE, 'draw')
        this.pdf.circle(x, y, r, 'FD')
      }
    }
  }

  private drawTodayTag(x: number, y: number) {
    this.color(TODAY_RED, 'fill')
    this.pdf.roundedRect(x - 15, y, 30, 11, 2, 2, 'F')
    this.pdf.setFont('helvetica', 'bold')
    this.pdf.setFontSize(6)
    this.pdf.setTextColor(255, 255, 255)
    this.pdf.text('TODAY', x, y + 7.8, { align: 'center', charSpace: 0.4 })
  }

  stations(summary: ExecutiveProject, { heading = false }: { heading?: boolean } = {}) {
    const { milestones, todayIndex } = summary
    const n = milestones.length
    const headingH = heading ? 34 : 0
    if (n === 0 || !milestones.some((m) => m.forecast)) {
      if (heading) {
        this.ensure(headingH + 24)
        this.stationHeading(summary)
        this.y += headingH
      }
      this.note(n === 0 ? 'Milestones being defined.' : 'Dates to be confirmed.')
      return
    }

    const colW = this.contentWidth / n
    this.pdf.setFont('helvetica', 'bold')
    this.pdf.setFontSize(8.5)
    const columns = milestones.map((m) => {
      const titleLines = this.wrap(m.isFinal ? m.title.toUpperCase() : m.title, colW - 8, 2)
      const showPlan = Boolean(m.baseline && m.baseline !== m.forecast)
      const showDrift = m.drift.kind !== 'unlocked'
      const textH = titleLines.length * 10 + 11 + (showPlan ? 10 : 0) + (showDrift ? 11 : 0)
      return { m, titleLines, showPlan, showDrift, textH }
    })
    const maxText = Math.max(...columns.map((c) => c.textH))

    const tagSpace = 14
    const labelH = 14
    const iconH = 24
    const total = headingH + tagSpace + labelH + iconH + 12 + maxText + 12
    this.ensure(total)

    if (heading) this.stationHeading(summary)
    const stripTop = this.y + headingH
    const labelY = stripTop + tagSpace + 8
    const trackY = labelY + 6 + iconH / 2
    const textTop = trackY + iconH / 2 + 12
    const bottom = textTop + maxText

    columns.forEach(({ m }, i) => {
      const cx = PAGE_MARGIN + colW * i + colW / 2
      const left = PAGE_MARGIN + colW * i
      const right = left + colW
      this.color(m.status === 'delivered' ? BLUE : RULE, 'fill')
      const segStart = i === 0 ? cx : left
      const segEnd = i === n - 1 ? cx : right
      if (segEnd > segStart) this.pdf.rect(segStart, trackY - 2, segEnd - segStart, 4, 'F')
    })

    if (todayIndex >= 0 && todayIndex <= n) {
      const x = PAGE_MARGIN + colW * todayIndex
      this.color(TODAY_RED, 'draw')
      this.pdf.setLineWidth(1)
      this.pdf.line(x, stripTop + 11, x, bottom - 4)
      const tagX = Math.min(Math.max(x, PAGE_MARGIN + 15), PAGE_MARGIN + this.contentWidth - 15)
      this.drawTodayTag(tagX, stripTop)
    }

    columns.forEach(({ m, titleLines, showPlan, showDrift }, i) => {
      const cx = PAGE_MARGIN + colW * i + colW / 2

      this.pdf.setFont('helvetica', 'bold')
      this.pdf.setFontSize(7)
      this.color(m.status === 'delivered' ? BLUE : m.status === 'at-risk' ? AMBER : MUTED, 'text')
      this.centeredText(STATION_LABEL[m.status].toUpperCase(), cx, labelY, 1)

      this.drawStationIcon(cx, trackY, m.status)

      let ty = textTop
      this.pdf.setFont('helvetica', 'bold')
      this.pdf.setFontSize(8.5)
      this.color(NAVY, 'text')
      for (const line of titleLines) {
        this.centeredText(line, cx, ty)
        ty += 10
      }

      this.pdf.setFont('helvetica', 'normal')
      this.pdf.setFontSize(8)
      this.color(MUTED, 'text')
      this.centeredText(m.forecast ? formatMilestoneDate(m.forecast) : 'TBC', cx, ty + 1)
      ty += 11

      if (showPlan && m.baseline) {
        this.pdf.setFontSize(7)
        const planText = toPdfText(`Plan ${formatMilestoneDate(m.baseline)}`)
        const w = this.measure(planText)
        this.centeredText(planText, cx, ty + 1)
        this.color(MUTED, 'draw')
        this.pdf.setLineWidth(0.5)
        this.pdf.line(cx - w / 2, ty - 1.5, cx + w / 2, ty - 1.5)
        ty += 10
      }

      if (showDrift) {
        this.pdf.setFont('helvetica', 'bold')
        this.pdf.setFontSize(7)
        const drift = m.drift
        const text =
          drift.kind === 'ahead' ? `${drift.days}d ahead` : drift.kind === 'behind' ? `${drift.days}d behind` : 'On plan'
        this.color(drift.kind === 'ahead' ? GREEN : drift.kind === 'behind' ? TODAY_RED : BLUE, 'text')
        this.centeredText(text.toUpperCase(), cx, ty + 2, 0.4)
      }
    })

    this.y = bottom + 12
  }

  private stationHeading(summary: ExecutiveProject) {
    const top = this.y
    const { label, color, outline } = deliveryPill(summary)
    const final = summary.milestones.find((m) => m.isFinal)
    const goLive = toPdfText(`Go-live ${final?.forecast ? formatMilestoneDate(final.forecast) : 'TBC'}`)

    this.pdf.setFont('helvetica', 'normal')
    this.pdf.setFontSize(8.5)
    const goLiveW = this.measure(goLive)
    const rightEdge = PAGE_MARGIN + this.contentWidth
    this.color(MUTED, 'text')
    this.pdf.text(goLive, rightEdge - goLiveW, top + 12)

    this.pdf.setFont('helvetica', 'bold')
    this.pdf.setFontSize(7)
    const pillText = toPdfText(label.toUpperCase())
    const pillW = this.measure(pillText, 0.6) + 14
    const pillX = rightEdge - goLiveW - 10 - pillW
    if (outline) {
      this.color(color, 'draw')
      this.pdf.setLineWidth(0.75)
      this.pdf.setLineDashPattern([2, 1.5], 0)
      this.pdf.roundedRect(pillX, top + 3, pillW, 13, 6.5, 6.5, 'S')
      this.pdf.setLineDashPattern([], 0)
      this.color(color, 'text')
    } else {
      this.color(color, 'fill')
      this.pdf.roundedRect(pillX, top + 3, pillW, 13, 6.5, 6.5, 'F')
      this.pdf.setTextColor(255, 255, 255)
    }
    this.pdf.text(pillText, pillX + 7, top + 12, { charSpace: 0.6 })

    this.pdf.setFont('helvetica', 'bold')
    this.pdf.setFontSize(11)
    this.color(NAVY, 'text')
    this.pdf.text(this.truncate(summary.project.tabLabel, pillX - PAGE_MARGIN - 12), PAGE_MARGIN, top + 13)

    this.color(RULE, 'draw')
    this.pdf.setLineWidth(0.5)
    this.pdf.line(PAGE_MARGIN, top + 24, rightEdge, top + 24)
  }

  stationLegend(locked: boolean) {
    this.ensure(40)
    const items: { status?: KeyStatus; label: string }[] = [
      { status: 'delivered', label: 'Complete' },
      { status: 'in-progress', label: 'In progress' },
      { status: 'at-risk', label: 'At risk' },
      { status: 'not-started', label: 'Planned' },
      { status: 'final', label: 'Go-live' },
      { label: 'Today' },
    ]
    this.color(RULE, 'draw')
    this.pdf.setLineWidth(0.5)
    this.pdf.line(PAGE_MARGIN, this.y, PAGE_MARGIN + this.contentWidth, this.y)
    const rowY = this.y + 14
    let x = PAGE_MARGIN
    for (const item of items) {
      if (item.status) {
        this.drawStationIcon(x + 5, rowY, item.status, 5)
      } else {
        this.color(TODAY_RED, 'fill')
        this.pdf.rect(x + 4, rowY - 6, 1.5, 12, 'F')
      }
      this.pdf.setFont('helvetica', 'normal')
      this.pdf.setFontSize(8)
      this.color(MUTED, 'text')
      this.pdf.text(item.label, x + 14, rowY + 2.8)
      x += 14 + this.measure(item.label) + 16
    }
    this.pdf.setFontSize(7.5)
    this.pdf.text(
      toPdfText(
        locked
          ? 'Plan locked. Struck-through dates show the locked plan; chips show how far each milestone has moved.'
          : 'Plan not locked yet. Ahead / behind tracking starts once the plan is locked in Admin.',
      ),
      PAGE_MARGIN,
      rowY + 18,
    )
    this.y = rowY + 34
  }

  roadmap(projects: Project[], today: number) {
    const rows: RoadmapRow[] = projects.map((project) => {
      const points = project.milestones
        .map((m) => ({ m, t: timeOf(forecastDate(m)) }))
        .filter((e): e is { m: Milestone; t: number } => e.t !== undefined)
        .sort((a, b) => a.t - b.t)
      const dated = points.map((p) => p.t)
      const delivered = points.filter((p) => p.m.status === 'delivered').map((p) => p.t)
      const final = project.finalMilestone
      const forecastT = final ? timeOf(forecastDate(final)) : undefined
      const baselineT = final?.baselineDate && project.baselinedAt ? timeOf(final.baselineDate) : undefined
      const tbc =
        project.milestones.filter((m) => timeOf(m.date) === undefined).length + (final && forecastT === undefined ? 1 : 0)
      return {
        project,
        next: nextOpenMilestone(project, today),
        points,
        startT: dated.length ? Math.min(...dated) : forecastT,
        endT: forecastT ?? (dated.length ? Math.max(...dated) : undefined),
        forecastT,
        baselineT,
        progressT: delivered.length ? Math.max(...delivered) : undefined,
        tbc,
        delivery: deliveryStatus(project),
      }
    })

    const axis = buildAxis(
      rows.flatMap((r) => [r.startT, r.endT, r.baselineT]).filter(isNumber),
      new Date(today),
    )
    if (!axis.hasDated) {
      this.note('Dates to be confirmed - no milestones have been scheduled yet.')
      return
    }

    const tagSpace = axis.todayPosition !== undefined ? 16 : 0
    const axisHeight = 16
    let start = 0
    while (start < rows.length) {
      const room = this.height - FOOTER_SPACE - this.y - tagSpace - axisHeight
      const count = Math.floor(room / ROADMAP_ROW)
      const minimum = start === 0 ? Math.min(rows.length, 2) : 1
      if (count < minimum && this.y > PAGE_MARGIN) {
        this.pdf.addPage()
        this.y = PAGE_MARGIN
        continue
      }
      const chunk = rows.slice(start, start + Math.max(1, count))
      this.drawRoadmapChunk(chunk, axis, tagSpace, axisHeight)
      start += chunk.length
      if (start < rows.length) {
        this.pdf.addPage()
        this.y = PAGE_MARGIN
      }
    }

    this.ensure(48)
    this.y += 18
    this.drawRoadmapLegend(axis.todayPosition !== undefined, rows.some((r) => r.baselineT !== undefined))
    this.y += 24
  }

  private drawRoadmapChunk(rows: RoadmapRow[], axis: Axis, tagSpace: number, axisHeight: number) {
    const gutter = 110
    const chipW = 76
    const chartX = PAGE_MARGIN + gutter + 10
    const chartRight = PAGE_MARGIN + this.contentWidth - chipW - 14
    const chartW = chartRight - chartX
    const chipX = PAGE_MARGIN + this.contentWidth - chipW - 4
    const xAt = (time: number) => chartX + (axis.toPosition(time) / 100) * chartW

    const axisTop = this.y + tagSpace
    const rowsTop = axisTop + axisHeight
    const rowsBottom = rowsTop + rows.length * ROADMAP_ROW

    this.pdf.setFont('helvetica', 'bold')
    this.pdf.setFontSize(7.5)
    this.color(NAVY, 'text')
    for (const month of axis.months) {
      this.pdf.text(month.label.toUpperCase(), chartX + (month.position / 100) * chartW + 2, axisTop + 9, {
        charSpace: 0.8,
      })
    }
    this.color(MUTED, 'text')
    this.pdf.text('DELIVERY', chipX + chipW / 2, axisTop + 9, { align: 'center', charSpace: 0.8 })

    rows.forEach((_, i) => {
      if (i % 2 === 0) {
        this.color(ROW_TINT, 'fill')
        this.pdf.rect(PAGE_MARGIN, rowsTop + i * ROADMAP_ROW, this.contentWidth, ROADMAP_ROW, 'F')
      }
    })
    this.color(RULE, 'draw')
    this.pdf.setLineWidth(0.5)
    for (const tick of axis.ticks) {
      const x = chartX + (tick.position / 100) * chartW
      this.pdf.line(x, axisTop + 12, x, rowsBottom)
    }
    this.pdf.line(PAGE_MARGIN, rowsTop, PAGE_MARGIN + this.contentWidth, rowsTop)
    this.pdf.line(PAGE_MARGIN, rowsBottom, PAGE_MARGIN + this.contentWidth, rowsBottom)

    if (axis.todayPosition !== undefined) {
      const x = chartX + (axis.todayPosition / 100) * chartW
      this.color(TODAY_RED, 'draw')
      this.pdf.setLineWidth(1)
      this.pdf.setLineDashPattern([3, 2], 0)
      this.pdf.line(x, axisTop - 2, x, rowsBottom)
      this.pdf.setLineDashPattern([], 0)
      this.color(TODAY_RED, 'fill')
      this.pdf.roundedRect(x - 15, this.y, 30, 11, 2, 2, 'F')
      this.pdf.setFont('helvetica', 'bold')
      this.pdf.setFontSize(6)
      this.pdf.setTextColor(255, 255, 255)
      this.pdf.text('TODAY', x, this.y + 7.8, { align: 'center', charSpace: 0.4 })
    }

    rows.forEach((row, i) => {
      const top = rowsTop + i * ROADMAP_ROW
      const cy = top + 25

      if (row.startT !== undefined && row.endT !== undefined) {
        const x0 = xAt(row.startT)
        const x1 = Math.max(x0 + 6, xAt(row.endT))
        this.color(BAR_TINT, 'fill')
        this.pdf.roundedRect(x0, cy - 2, x1 - x0, 4, 2, 2, 'F')
        if (row.progressT !== undefined) {
          const px = Math.min(x1, Math.max(x0 + 4, xAt(row.progressT)))
          this.color(DONE_TINT, 'fill')
          this.pdf.roundedRect(x0, cy - 2, px - x0, 4, 2, 2, 'F')
        }
      } else {
        this.pdf.setFont('helvetica', 'italic')
        this.pdf.setFontSize(8)
        this.color(MUTED, 'text')
        this.pdf.text('Dates TBC', chartX, cy + 2.5)
      }

      if (row.forecastT !== undefined && row.baselineT !== undefined && row.baselineT !== row.forecastT) {
        const xf = xAt(row.forecastT)
        const xb = xAt(row.baselineT)
        this.color(NAVY, 'draw')
        this.pdf.setLineWidth(0.75)
        this.pdf.setLineDashPattern([2, 1.5], 0)
        this.pdf.line(Math.min(xb, xf), cy, Math.max(xb, xf), cy)
        this.pdf.setLineDashPattern([], 0)
        this.drawRoadmapDiamond(xb, cy, 4.5, false)
      }

      const nextId = row.next?.id
      for (const { m, t } of row.points) {
        if (m.id === nextId) continue
        this.drawStatusMarker(xAt(t), cy, m.status, { moved: isSlipped(m) })
      }
      const nextPoint = row.points.find((p) => p.m.id === nextId)
      if (nextPoint) this.drawStatusMarker(xAt(nextPoint.t), cy, nextPoint.m.status, { next: true, moved: isSlipped(nextPoint.m) })
      if (row.forecastT !== undefined) this.drawRoadmapDiamond(xAt(row.forecastT), cy, 5, true)

      const hidden = this.drawRoadmapLabels(row, xAt, cy, chartX - 6, chartRight)

      this.pdf.setFont('helvetica', 'bold')
      this.pdf.setFontSize(8.5)
      this.color(NAVY, 'text')
      const nameLines = this.wrap(row.project.tabLabel, gutter - 8, 2)
      const nameY = cy + 3 - (nameLines.length - 1) * 5
      this.pdf.text(nameLines, PAGE_MARGIN + 8, nameY)
      if (hidden > 0) {
        this.pdf.setFont('helvetica', 'normal')
        this.pdf.setFontSize(7)
        this.color(MUTED, 'text')
        this.pdf.text(`+${hidden} more milestone${hidden === 1 ? '' : 's'}`, PAGE_MARGIN + 8, nameY + nameLines.length * 10 + 1)
      }

      this.deliveryChip(row.delivery, row.project, chipX, cy - 12, chipW, row.tbc)
    })

    this.y = rowsBottom
  }

  private drawRoadmapLabels(row: RoadmapRow, xAt: (t: number) => number, cy: number, left: number, right: number) {
    type Label = {
      x: number
      prefix: string
      title: string
      chip: string
      date: string
      color: Rgb
      bold: boolean
      priority: boolean
      width: number
    }
    const titleMax = 70
    const build = (input: Omit<Label, 'width' | 'title'> & { title: string }): Label => {
      this.pdf.setFontSize(7)
      this.pdf.setFont('helvetica', 'bold')
      const prefixW = input.prefix ? this.measure(input.prefix) : 0
      this.pdf.setFontSize(6)
      const chipW = input.chip ? this.measure(input.chip) + 6 : 0
      this.pdf.setFontSize(7)
      this.pdf.setFont('helvetica', input.bold ? 'bold' : 'normal')
      const title = this.truncate(input.title, titleMax)
      const lineW = prefixW + this.measure(title) + (chipW ? chipW + 3 : 0)
      this.pdf.setFont('helvetica', 'normal')
      this.pdf.setFontSize(6.5)
      const width = Math.max(lineW, this.measure(input.date))
      return { ...input, title, width }
    }

    const labels: Label[] = row.points.map(({ m, t }) => {
      const isNext = m.id === row.next?.id
      const slipped = isSlipped(m)
      const warn = m.status === 'at-risk' || slipped
      const variance = slipped && m.baselineDate ? (milestoneVariance(m) ?? 0) : 0
      return build({
        x: xAt(t),
        prefix: isNext ? 'NEXT ' : '',
        title: m.title,
        chip: variance > 0 ? `+${variance}d` : '',
        date: shortDate(forecastDate(m)),
        color: warn ? AMBER : m.status === 'delivered' || m.status === 'deferred' ? MUTED : NAVY,
        bold: warn || isNext,
        priority: isNext || warn,
      })
    })
    const final = row.project.finalMilestone
    if (final && row.forecastT !== undefined) {
      labels.push(
        build({
          x: xAt(row.forecastT),
          prefix: '',
          title: final.title,
          chip: '',
          date: final.completedDate ? `Delivered ${shortDate(final.completedDate)}` : shortDate(forecastDate(final)),
          color: NAVY,
          bold: true,
          priority: true,
        }),
      )
    }

    const lanes: [number, number][][] = [[], []]
    const fits = (lane: number, l: number, r: number) => lanes[lane].every(([a, b]) => r + 5 <= a || l >= b + 5)
    const ordered = [...labels.filter((l) => l.priority), ...labels.filter((l) => !l.priority)]
    let hidden = 0

    for (const label of ordered) {
      const l = Math.max(left, Math.min(label.x - label.width / 2, right - label.width))
      const r = l + label.width
      let lane = fits(0, l, r) ? 0 : fits(1, l, r) ? 1 : -1
      if (lane === -1) {
        if (!label.priority) {
          hidden++
          continue
        }
        lane = 0
      }
      lanes[lane].push([l, r])

      const titleY = lane === 0 ? cy + 15 : cy - 18
      const dateY = titleY + 7
      let x = l
      this.pdf.setFontSize(7)
      if (label.prefix) {
        this.pdf.setFont('helvetica', 'bold')
        this.color(BLUE, 'text')
        this.pdf.text(label.prefix, x, titleY)
        x += this.measure(label.prefix)
      }
      this.pdf.setFont('helvetica', label.bold ? 'bold' : 'normal')
      this.color(label.color, 'text')
      this.pdf.text(label.title, x, titleY)
      x += this.measure(label.title) + 3
      if (label.chip) {
        this.pdf.setFont('helvetica', 'bold')
        this.pdf.setFontSize(6)
        const chipW = this.measure(label.chip) + 6
        this.color(AMBER, 'fill')
        this.pdf.roundedRect(x, titleY - 6, chipW, 8, 2, 2, 'F')
        this.pdf.setTextColor(255, 255, 255)
        this.pdf.text(label.chip, x + 3, titleY)
      }
      this.pdf.setFont('helvetica', 'normal')
      this.pdf.setFontSize(6.5)
      this.color(MUTED, 'text')
      this.pdf.text(label.date, l, dateY)
    }
    return hidden
  }

  private drawStatusMarker(
    x: number,
    y: number,
    status: MilestoneStatus,
    { next = false, moved = false }: { next?: boolean; moved?: boolean } = {},
  ) {
    const r = next ? 4.8 : 3.4
    if (next) {
      this.color(HALO, 'fill')
      this.pdf.circle(x, y, r + 3.2, 'F')
    }
    if (moved) {
      this.color(AMBER, 'draw')
      this.pdf.setLineWidth(1.1)
      this.pdf.circle(x, y, r + 1.8, 'S')
    }
    this.pdf.setLineWidth(0.9)

    if (status === 'delivered') {
      this.color(GREEN, 'fill')
      this.pdf.circle(x, y, r, 'F')
      this.pdf.setDrawColor(255, 255, 255)
      this.pdf.setLineWidth(next ? 1.1 : 0.8)
      this.pdf.line(x - r * 0.45, y + r * 0.02, x - r * 0.1, y + r * 0.38)
      this.pdf.line(x - r * 0.1, y + r * 0.38, x + r * 0.5, y - r * 0.35)
    } else if (status === 'in-progress') {
      this.color(BLUE, 'fill')
      this.pdf.circle(x, y, r, 'F')
    } else if (status === 'at-risk') {
      this.color(AMBER, 'fill')
      this.pdf.circle(x, y, r, 'F')
      this.pdf.setFont('helvetica', 'bold')
      this.pdf.setFontSize(next ? 7 : 5.5)
      this.pdf.setTextColor(255, 255, 255)
      this.pdf.text('!', x, y + (next ? 2.5 : 2), { align: 'center' })
    } else if (status === 'deferred') {
      this.pdf.setFillColor(255, 255, 255)
      this.color(DEFERRED_GRAY, 'draw')
      this.pdf.setLineDashPattern([1.2, 1], 0)
      this.pdf.circle(x, y, r, 'FD')
      this.pdf.setLineDashPattern([], 0)
    } else {
      this.pdf.setFillColor(255, 255, 255)
      this.color(next ? BLUE : MUTED, 'draw')
      this.pdf.setLineWidth(next ? 1.4 : 0.9)
      this.pdf.circle(x, y, r, 'FD')
      if (next) {
        this.color(BLUE, 'fill')
        this.pdf.circle(x, y, 1.8, 'F')
      }
    }
  }

  private drawRoadmapLegend(showToday: boolean, showBaseline: boolean) {
    const marker = (status: MilestoneStatus, options: { next?: boolean; moved?: boolean } = {}) => {
      const half = options.next ? 8 : options.moved ? 5.2 : 3.4
      return {
        width: half * 2,
        draw: (x: number, y: number) => this.drawStatusMarker(x + half, y, status, options),
      }
    }
    const items: { label: string; width: number; draw: (x: number, y: number) => void }[] = [
      { label: 'Complete', ...marker('delivered') },
      { label: 'In progress', ...marker('in-progress') },
      { label: 'Planned', ...marker('not-started') },
      { label: 'At risk', ...marker('at-risk') },
      { label: 'Deferred', ...marker('deferred') },
      { label: 'Date moved', ...marker('not-started', { moved: true }) },
      { label: 'Next milestone', ...marker('in-progress', { next: true }) },
      { label: 'Forecast delivery', width: 10, draw: (x, y) => this.drawRoadmapDiamond(x + 5, y, 5, true) },
      ...(showBaseline
        ? [{ label: 'Baseline', width: 9, draw: (x: number, y: number) => this.drawRoadmapDiamond(x + 4.5, y, 4.5, false) }]
        : []),
    ]
    if (showToday) {
      items.push({
        label: 'Today',
        width: 2,
        draw: (x, y) => {
          this.color(TODAY_RED, 'draw')
          this.pdf.setLineWidth(1)
          this.pdf.setLineDashPattern([2, 1.5], 0)
          this.pdf.line(x + 1, y - 5, x + 1, y + 5)
          this.pdf.setLineDashPattern([], 0)
        },
      })
    }

    let x = PAGE_MARGIN
    for (const item of items) {
      this.pdf.setFont('helvetica', 'normal')
      this.pdf.setFontSize(7.5)
      const itemWidth = item.width + 5 + this.measure(item.label)
      if (x + itemWidth > PAGE_MARGIN + this.contentWidth) {
        x = PAGE_MARGIN
        this.y += 16
      }
      item.draw(x, this.y)
      this.pdf.setFont('helvetica', 'normal')
      this.pdf.setFontSize(7.5)
      this.color(MUTED, 'text')
      this.pdf.text(item.label, x + item.width + 5, this.y + 2.6)
      x += itemWidth + 14
    }
  }

  private deliveryChip(status: DeliveryStatus, project: Project, x: number, y: number, width: number, tbc = 0) {
    const chip =
      status.kind === 'on-schedule'
        ? { label: 'On schedule', color: GREEN, solid: true }
        : status.kind === 'ahead'
          ? { label: `Ahead ${status.days}d`, color: GREEN, solid: true }
          : status.kind === 'behind'
            ? { label: `Behind ${status.days}d`, color: status.days > 14 ? TODAY_RED : AMBER, solid: true }
            : status.kind === 'tbc'
              ? { label: 'Date TBC', color: MUTED, solid: false }
              : undefined

    const drawTbc = (ty: number) => {
      if (tbc <= 0) return
      this.pdf.setFont('helvetica', 'bold')
      this.pdf.setFontSize(6.5)
      this.color(MUTED, 'text')
      this.pdf.text(`+${tbc} TBC`, x + width / 2, ty, { align: 'center' })
    }

    if (!chip) {
      this.deliveryDate(project, x, y + 9.6, width)
      drawTbc(y + 19)
      return
    }

    if (chip.solid) {
      this.color(chip.color, 'fill')
      this.pdf.roundedRect(x, y, width, 14, 7, 7, 'F')
      this.pdf.setTextColor(255, 255, 255)
    } else {
      this.color(DEFERRED_GRAY, 'draw')
      this.pdf.setLineWidth(0.75)
      this.pdf.roundedRect(x, y, width, 14, 7, 7, 'S')
      this.color(chip.color, 'text')
    }
    this.pdf.setFont('helvetica', 'bold')
    this.pdf.setFontSize(7.5)
    this.pdf.text(chip.label, x + width / 2, y + 9.6, { align: 'center' })
    this.deliveryDate(project, x, y + 23, width)
    drawTbc(y + 32)
  }

  private deliveryDate(project: Project, x: number, y: number, width: number) {
    const final = project.finalMilestone
    if (!final || !parseIsoDate(forecastDate(final))) return
    this.pdf.setFont('helvetica', 'normal')
    this.pdf.setFontSize(7)
    this.color(MUTED, 'text')
    const text = final.completedDate ? `Delivered ${shortDate(final.completedDate)}` : formatMilestoneDate(final.date)
    this.pdf.text(this.truncate(text, width), x + width / 2, y, { align: 'center' })
  }

  private drawRoadmapDiamond(x: number, y: number, size: number, solid: boolean) {
    this.pdf.setLineWidth(1)
    this.color(NAVY, 'draw')
    if (solid) this.color(NAVY, 'fill')
    else this.pdf.setFillColor(255, 255, 255)
    this.pdf.lines(
      [
        [size, -size],
        [size, size],
        [-size, size],
        [-size, -size],
      ],
      x - size,
      y,
      [1, 1],
      'FD',
      true,
    )
  }

  private drawDot(x: number, y: number, milestone: Milestone, fill: Rgb) {
    if (isSlipped(milestone)) {
      this.color(AMBER, 'draw')
      this.pdf.setLineWidth(1.5)
      this.pdf.circle(x, y, 9.5, 'S')
    }
    this.color(fill, 'fill')
    this.pdf.circle(x, y, 7, 'F')
    this.pdf.setFont('helvetica', 'bold')
    this.pdf.setFontSize(7)
    this.pdf.setTextColor(255, 255, 255)
    this.pdf.text(String(milestone.id), x, y + 2.5, { align: 'center' })
  }

  private drawDiamond(x: number, y: number, label: string, size = 9) {
    this.color(NAVY, 'fill')
    this.pdf.triangle(x - size, y, x, y - size, x + size, y, 'F')
    this.pdf.triangle(x - size, y, x, y + size, x + size, y, 'F')
    if (!label) return
    this.pdf.setFont('helvetica', 'bold')
    this.pdf.setFontSize(6.5)
    this.pdf.setTextColor(255, 255, 255)
    this.pdf.text(label, x, y + 2.3, { align: 'center' })
  }

  private drawLegend(showToday: boolean) {
    const items: { label: string; draw: (x: number, y: number) => void }[] = [
      ...(['delivered', 'in-progress', 'not-started', 'at-risk', 'deferred'] as MilestoneStatus[]).map((status) => ({
        label: status === 'delivered' ? 'Complete' : status === 'not-started' ? 'Planned' : STATUS_LABEL[status],
        draw: (x: number, y: number) => {
          this.color(STATUS_COLOR[status], 'fill')
          this.pdf.circle(x + 4, y, 4, 'F')
        },
      })),
      {
        label: 'Date moved',
        draw: (x, y) => {
          this.color(AMBER, 'draw')
          this.pdf.setLineWidth(1.5)
          this.pdf.circle(x + 4, y, 4, 'S')
        },
      },
      { label: 'Final delivery', draw: (x, y) => this.drawDiamond(x + 4, y, '', 4.5) },
    ]
    if (showToday) {
      items.push({
        label: 'Today',
        draw: (x, y) => {
          this.color(TODAY_RED, 'draw')
          this.pdf.setLineWidth(1)
          this.pdf.setLineDashPattern([2, 1.5], 0)
          this.pdf.line(x + 4, y - 5, x + 4, y + 5)
          this.pdf.setLineDashPattern([], 0)
        },
      })
    }

    let x = PAGE_MARGIN
    const y = this.y
    this.pdf.setFontSize(8)
    for (const item of items) {
      item.draw(x, y)
      this.pdf.setFont('helvetica', 'normal')
      this.pdf.setFontSize(8)
      this.color(MUTED, 'text')
      this.pdf.text(item.label, x + 12, y + 2.8)
      x += 12 + this.pdf.getTextWidth(item.label) + 16
    }
  }

  note(text: string) {
    this.ensure(30)
    this.pdf.setFont('helvetica', 'italic')
    this.pdf.setFontSize(10)
    this.color(MUTED, 'text')
    this.pdf.text(this.pdf.splitTextToSize(toPdfText(text), this.contentWidth) as string[], PAGE_MARGIN, this.y)
    this.y += 30
  }

  notesBlock(text: string) {
    this.ensure(40)
    this.pdf.setFont('helvetica', 'bold')
    this.pdf.setFontSize(9)
    this.color(NAVY, 'text')
    this.pdf.text('NOTES', PAGE_MARGIN, this.y, { charSpace: 0.8 })
    this.y += 14
    this.pdf.setFont('helvetica', 'normal')
    this.pdf.setFontSize(10)
    this.color(MUTED, 'text')
    const lines = this.pdf.splitTextToSize(toPdfText(text), this.contentWidth) as string[]
    for (const line of lines) {
      this.ensure(14)
      this.pdf.text(line, PAGE_MARGIN, this.y)
      this.y += 13
    }
    this.y += 10
  }

  overviewTable(projects: Project[], today: number) {
    const cols = [PAGE_MARGIN + 8, PAGE_MARGIN + 112, PAGE_MARGIN + 170, PAGE_MARGIN + 254, PAGE_MARGIN + 390]
    const colEnd = (i: number) => (i + 1 < cols.length ? cols[i + 1] : this.width - PAGE_MARGIN) - 10
    this.ensure(40)
    this.color(NAVY, 'fill')
    this.pdf.rect(PAGE_MARGIN, this.y, this.contentWidth, 20, 'F')
    this.pdf.setFont('helvetica', 'bold')
    this.pdf.setFontSize(7)
    this.pdf.setTextColor(255, 255, 255)
    ;['PROJECT', 'PROGRESS', 'HEALTH', 'EXECUTIVE NOTE', 'NEXT MILESTONE'].forEach((label, i) =>
      this.pdf.text(label, cols[i], this.y + 13, { charSpace: 0.6 }),
    )
    this.y += 20

    projects.forEach((project, i) => {
      const total = project.milestones.length
      const complete = project.milestones.filter((m) => m.status === 'delivered').length
      const health = overallHealth(project)
      const next = nextMilestone(project, today)
      const nextText = next ? `${next.title} (${dateText(next.date)})` : 'Not yet defined'
      this.pdf.setFontSize(9)
      this.pdf.setFont('helvetica', 'normal')
      const noteLines = this.pdf.splitTextToSize(toPdfText(project.executiveNote || '-'), colEnd(3) - cols[3]) as string[]
      const nextLines = this.pdf.splitTextToSize(toPdfText(nextText), colEnd(4) - cols[4]) as string[]
      this.pdf.setFont('helvetica', 'bold')
      const nameLines = this.pdf.splitTextToSize(project.tabLabel, colEnd(0) - cols[0]) as string[]
      const rowHeight = Math.max(24, Math.max(nextLines.length, nameLines.length, noteLines.length) * 11.5 + 12)
      this.ensure(rowHeight)
      if (i % 2 === 1) {
        this.color(ROW_TINT, 'fill')
        this.pdf.rect(PAGE_MARGIN, this.y, this.contentWidth, rowHeight, 'F')
      }
      const textY = this.y + 15
      this.pdf.setFont('helvetica', 'bold')
      this.color(NAVY, 'text')
      this.pdf.text(nameLines, cols[0], textY)
      this.pdf.setFont('helvetica', 'normal')
      this.pdf.text(total === 0 ? '-' : `${complete}/${total} (${Math.round((complete / total) * 100)}%)`, cols[1], textY)
      this.color(health.color, 'fill')
      this.pdf.circle(cols[2] + 3, textY - 3.2, 3, 'F')
      this.pdf.setFont('helvetica', 'bold')
      this.color(health.color, 'text')
      this.pdf.text(health.label, cols[2] + 11, textY)
      this.pdf.setFont('helvetica', 'normal')
      this.color(project.executiveNote ? NAVY : MUTED, 'text')
      this.pdf.text(noteLines, cols[3], textY, { lineHeightFactor: 1.28 })
      this.color(NAVY, 'text')
      this.pdf.text(nextLines, cols[4], textY, { lineHeightFactor: 1.28 })
      this.y += rowHeight
    })
    this.color(RULE, 'draw')
    this.pdf.line(PAGE_MARGIN, this.y, this.width - PAGE_MARGIN, this.y)
    this.y += 32
  }

  footers(generatedOn: string) {
    const pages = this.pdf.getNumberOfPages()
    for (let page = 1; page <= pages; page++) {
      this.pdf.setPage(page)
      this.pdf.setFont('helvetica', 'normal')
      this.pdf.setFontSize(8)
      this.color(MUTED, 'text')
      this.pdf.text(`Generated ${generatedOn}`, PAGE_MARGIN, this.height - 22)
      this.pdf.text(`Page ${page} of ${pages}`, this.width - PAGE_MARGIN, this.height - 22, { align: 'right' })
    }
  }
}

function writeProject(
  writer: SummaryWriter,
  project: Project,
  today: number,
  { eyebrow, showTimeline }: { eyebrow?: string; showTimeline: boolean },
  ) {
  writer.ensure(180)
  writer.sectionTitle(project.tabLabel, eyebrow ?? project.tabDescription)

  if (project.milestones.length === 0) {
    writer.note('Milestones have not been defined for this project yet.')
    if (project.notes) writer.notesBlock(project.notes)
    return
  }

  writer.progress(project)

  const next = nextMilestone(project, today)
  writer.statRow([
    { label: 'In progress', value: String(project.milestones.filter((m) => m.status === 'in-progress').length) },
    { label: 'Planned', value: String(project.milestones.filter((m) => m.status === 'not-started').length) },
    { label: 'Next milestone', value: next ? `${next.title} - ${dateText(next.date)}` : 'All complete' },
    {
      label: 'Target delivery',
      value: project.finalMilestone
        ? `${project.finalMilestone.title} - ${dateText(project.finalMilestone.date)}`
        : 'TBC',
    },
  ])

  if (project.notes) writer.notesBlock(project.notes)

  if (showTimeline) {
    const summary = buildExecutiveProject(project)
    writer.stations(summary)
    writer.stationLegend(summary.locked)
  }

  writer.bulletList(
    'Current focus',
    project.milestones
      .filter((m) => m.status === 'in-progress')
      .map((m) => `Milestone ${m.id}: ${m.title} (${dateText(m.date)})`),
    BLUE,
  )

  writer.bulletList(
    'Risks & slipped dates',
    project.milestones
      .filter((m) => isOpenMilestone(m.status) && (m.status === 'at-risk' || isSlipped(m)))
      .map((m) => {
        const days = m.baselineDate ? milestoneVariance(m) : undefined
        const moved = days && days > 0 ? `moved ${days}d` : 'date moved'
        return `Milestone ${m.id}: ${m.title} - ${m.status === 'at-risk' ? 'at risk' : moved} (${dateText(m.date)})`
      }),
    AMBER,
  )

  writer.bulletList(
    'Recently completed',
    project.milestones.filter((m) => m.status === 'delivered').map((m) => `Milestone ${m.id}: ${m.title}`),
    GREEN,
  )

  writer.milestoneTable(project)
}

export async function downloadExecutiveSummary(
  projects: Project[],
  fileName: string,
  options: { title?: string; branding?: PdfBranding } = {},
) {
  const { branding } = options
  const singleTitle = projects.length === 1 ? projects[0].pageTitle : undefined
  const title = options.title ?? (singleTitle ? `${singleTitle} Executive Summary` : undefined)
  const [{ jsPDF }, logo] = await Promise.all([
    import('jspdf'),
    branding?.logoUrl ? loadLogo(branding.logoUrl) : Promise.resolve(null),
  ])
  const pdf = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'portrait' })
  const writer = new SummaryWriter(pdf)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const generatedOn = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

  const isPortfolio = projects.length > 1
  writer.header(
    title ?? (isPortfolio ? 'Portfolio Executive Summary' : `${projects[0].tabLabel} Executive Summary`),
    isPortfolio
      ? `${projects.length} projects  |  Status as of ${generatedOn}`
      : `${projects[0].tabDescription}  |  Status as of ${generatedOn}`,
    branding,
    logo,
  )

  if (isPortfolio) {
    writer.sectionTitle('Portfolio overview', 'At a glance')
    writer.overviewTable(projects, today)
    writer.sectionTitle('Key milestones', 'Schedule')
    const summaries = projects.map((project) => buildExecutiveProject(project))
    summaries.forEach((summary) => {
      writer.stations(summary, { heading: true })
      writer.space(6)
    })
    writer.stationLegend(summaries.some((s) => s.locked))
    writer.space(10)
    projects.forEach((project, i) =>
      writeProject(writer, project, today, { eyebrow: `Project ${i + 1}`, showTimeline: false }),
    )
  } else {
    writeProject(writer, projects[0], today, { showTimeline: true })
  }

  writer.footers(generatedOn)
  pdf.save(`${fileName}.pdf`)
}
