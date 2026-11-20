import type { jsPDF } from 'jspdf'
import type { PdfBranding } from './branding'
import { buildAxis, buildConsolidatedTimeline } from './consolidated'
import {
  deliveryStatus,
  executiveMilestones,
  forecastDate,
  isSlipped,
  milestoneVariance,
  nextOpenMilestone,
  type DeliveryStatus,
} from './schedule'
import { formatMilestoneDate, parseIsoDate } from './dates'
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

const TIMELINE_ROW = 22
const ROADMAP_ROW = 38

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

  roadmap(projects: Project[], today: number) {
    const rows = projects.map((project) => {
      const next = nextOpenMilestone(project, today)
      const exec = executiveMilestones(project, today)
        .map((m) => ({ m, t: timeOf(forecastDate(m)) }))
        .filter((e): e is { m: Milestone; t: number } => e.t !== undefined)
      const dated = project.milestones.map((m) => timeOf(forecastDate(m))).filter(isNumber)
      const delivered = project.milestones
        .filter((m) => m.status === 'delivered')
        .map((m) => timeOf(forecastDate(m)))
        .filter(isNumber)
      const final = project.finalMilestone
      const forecastT = final ? timeOf(forecastDate(final)) : undefined
      const baselineT = final?.baselineDate && project.baselinedAt ? timeOf(final.baselineDate) : undefined
      const startT = dated.length ? Math.min(...dated) : forecastT
      const endT = forecastT ?? (dated.length ? Math.max(...dated) : undefined)
      const tbc =
        project.milestones.filter((m) => timeOf(m.date) === undefined).length + (final && forecastT === undefined ? 1 : 0)
      return {
        project,
        next,
        exec,
        startT,
        endT,
        forecastT,
        baselineT,
        progressT: delivered.length ? Math.max(...delivered) : undefined,
        tbc,
        delivery: deliveryStatus(project),
      }
    })

    const axis = buildAxis(
      rows.flatMap((r) => [r.startT, r.endT, r.baselineT, ...r.exec.map((e) => e.t)]).filter(isNumber),
      new Date(today),
    )
    if (!axis.hasDated) {
      this.note('Dates to be confirmed - no milestones have been scheduled yet.')
      return
    }

    const gutter = 110
    const chipW = 76
    const chartX = PAGE_MARGIN + gutter + 10
    const chartRight = PAGE_MARGIN + this.contentWidth - chipW - 14
    const chartW = chartRight - chartX
    const chipX = PAGE_MARGIN + this.contentWidth - chipW - 4
    const xAt = (time: number) => chartX + (axis.toPosition(time) / 100) * chartW

    const tagSpace = axis.todayPosition !== undefined ? 16 : 0
    const axisHeight = 30
    const rowsHeight = rows.length * ROADMAP_ROW
    this.ensure(tagSpace + axisHeight + Math.min(rowsHeight, ROADMAP_ROW * 3) + 40)

    const axisTop = this.y + tagSpace
    const rowsTop = axisTop + axisHeight
    const rowsBottom = rowsTop + rowsHeight

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

    const tickX = axis.ticks.map((tick) => chartX + (tick.position / 100) * chartW)
    const labelEvery = Math.max(1, Math.ceil(16 / (tickX.length > 1 ? tickX[1] - tickX[0] : chartW)))
    this.pdf.setFont('helvetica', 'normal')
    this.pdf.setFontSize(7)
    axis.ticks.forEach((tick, i) => {
      if (i % labelEvery === 0) this.pdf.text(tick.label, tickX[i] + 2, axisTop + 22)
    })

    rows.forEach((_, i) => {
      if (i % 2 === 0) {
        this.color(ROW_TINT, 'fill')
        this.pdf.rect(PAGE_MARGIN, rowsTop + i * ROADMAP_ROW, this.contentWidth, ROADMAP_ROW, 'F')
      }
    })
    this.color(RULE, 'draw')
    this.pdf.setLineWidth(0.5)
    tickX.forEach((x) => this.pdf.line(x, axisTop + 13, x, rowsBottom))
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
      const barY = top + 9
      const cy = barY + 3

      this.pdf.setFont('helvetica', 'bold')
      this.pdf.setFontSize(8.5)
      this.color(NAVY, 'text')
      const nameLines = this.wrap(row.project.tabLabel, gutter - 8, 2)
      this.pdf.text(nameLines, PAGE_MARGIN + 8, top + ROADMAP_ROW / 2 - (nameLines.length * 10) / 2 + 7)

      if (row.startT !== undefined && row.endT !== undefined) {
        const x0 = xAt(row.startT)
        const x1 = Math.max(x0 + 6, xAt(row.endT))
        this.color(BAR_TINT, 'fill')
        this.pdf.roundedRect(x0, barY, x1 - x0, 6, 3, 3, 'F')
        if (row.progressT !== undefined) {
          const px = Math.min(x1, Math.max(x0 + 6, xAt(row.progressT)))
          this.color(BLUE, 'fill')
          this.pdf.roundedRect(x0, barY, px - x0, 6, 3, 3, 'F')
        }
      } else {
        this.pdf.setFont('helvetica', 'italic')
        this.pdf.setFontSize(8)
        this.color(MUTED, 'text')
        this.pdf.text('Dates TBC', chartX, cy + 2.5)
      }

      for (const { m, t } of row.exec) {
        if (m.id === row.next?.id) continue
        this.drawRoadmapTick(xAt(t), cy, m.status === 'delivered' ? 'done' : isSlipped(m) ? 'moved' : 'open')
      }
      const nextT = row.next ? timeOf(forecastDate(row.next)) : undefined
      if (nextT !== undefined) this.drawRoadmapTick(xAt(nextT), cy, 'next')

      if (row.forecastT !== undefined) {
        const xf = xAt(row.forecastT)
        if (row.baselineT !== undefined && row.baselineT !== row.forecastT) {
          const xb = xAt(row.baselineT)
          this.color(NAVY, 'draw')
          this.pdf.setLineWidth(0.75)
          this.pdf.setLineDashPattern([2, 1.5], 0)
          this.pdf.line(Math.min(xb, xf), cy, Math.max(xb, xf), cy)
          this.pdf.setLineDashPattern([], 0)
          this.drawRoadmapDiamond(xb, cy, 4.5, false)
        }
        this.drawRoadmapDiamond(xf, cy, 5, true)
      }

      this.roadmapLabel(row.next, nextT !== undefined ? xAt(nextT) : chartX, top + 28, chartX, chartRight, row.tbc)
      this.deliveryChip(row.delivery, row.project, chipX, top + 5, chipW)
    })

    this.y = rowsBottom + 16
    this.drawRoadmapLegend(axis.todayPosition !== undefined, rows.some((r) => r.baselineT !== undefined))
    this.y += 24
  }

  private roadmapLabel(next: Milestone | undefined, anchor: number, y: number, left: number, right: number, tbc: number) {
    this.pdf.setFontSize(7.5)
    if (!next) {
      this.pdf.setFont('helvetica', 'normal')
      this.color(MUTED, 'text')
      this.pdf.text(tbc > 0 ? `All dated milestones complete  +${tbc} TBC` : 'All milestones complete', left, y)
      return
    }
    const variance = next.baselineDate ? (milestoneVariance(next) ?? 0) : 0
    const chip = variance > 0 ? `+${variance}d` : ''
    this.pdf.setFont('helvetica', 'bold')
    const chipW = chip ? this.measure(chip) + 8 : 0
    const tbcText = tbc > 0 ? `+${tbc} TBC` : ''
    const tbcW = tbcText ? this.measure(tbcText) + 8 : 0
    const prefix = 'Next: '
    const prefixW = this.measure(prefix)
    this.pdf.setFont('helvetica', 'normal')
    const maxBody = Math.max(40, right - left - prefixW - chipW - tbcW - 6)
    const body = this.truncate(`${next.title} - ${shortDate(forecastDate(next))}`, Math.min(maxBody, (right - left) * 0.75))
    const total = prefixW + this.measure(body) + (chip ? chipW + 4 : 0)
    let x = Math.max(left, Math.min(anchor - 6, right - total - tbcW))

    this.pdf.setFont('helvetica', 'bold')
    this.color(BLUE, 'text')
    this.pdf.text(prefix, x, y)
    x += prefixW
    this.pdf.setFont('helvetica', 'normal')
    this.color(NAVY, 'text')
    this.pdf.text(body, x, y)
    x += this.measure(body) + 4
    if (chip) {
      this.color(AMBER, 'fill')
      this.pdf.roundedRect(x, y - 7.5, chipW, 10, 2, 2, 'F')
      this.pdf.setFont('helvetica', 'bold')
      this.pdf.setTextColor(255, 255, 255)
      this.pdf.text(chip, x + 4, y)
      x += chipW + 4
    }
    if (tbcText) {
      this.pdf.setFont('helvetica', 'bold')
      this.color(MUTED, 'text')
      this.pdf.text(tbcText, right, y, { align: 'right' })
    }
  }

  private deliveryChip(status: DeliveryStatus, project: Project, x: number, y: number, width: number) {
    const chip =
      status.kind === 'on-schedule'
        ? { label: 'On schedule', color: GREEN, solid: true }
        : status.kind === 'ahead'
          ? { label: `Ahead ${status.days}d`, color: GREEN, solid: true }
          : status.kind === 'behind'
            ? { label: `Behind ${status.days}d`, color: status.days > 14 ? TODAY_RED : AMBER, solid: true }
            : status.kind === 'tbc'
              ? { label: 'Date TBC', color: MUTED, solid: false }
              : { label: 'Not baselined', color: MUTED, solid: false }

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

    const final = project.finalMilestone
    if (!final || !parseIsoDate(forecastDate(final))) return
    this.pdf.setFont('helvetica', 'normal')
    this.pdf.setFontSize(7)
    this.color(MUTED, 'text')
    const text = final.completedDate ? `Delivered ${shortDate(final.completedDate)}` : formatMilestoneDate(final.date)
    this.pdf.text(this.truncate(text, width), x + width / 2, y + 23, { align: 'center' })
  }

  private drawRoadmapTick(x: number, y: number, kind: 'done' | 'open' | 'moved' | 'next') {
    this.pdf.setLineWidth(kind === 'next' ? 1.5 : 1)
    if (kind === 'done') {
      this.color(NAVY, 'fill')
      this.pdf.setDrawColor(255, 255, 255)
      this.pdf.circle(x, y, 2.8, 'FD')
      return
    }
    this.pdf.setFillColor(255, 255, 255)
    this.color(kind === 'moved' ? AMBER : BLUE, 'draw')
    this.pdf.circle(x, y, kind === 'next' ? 4 : 2.8, 'FD')
    if (kind === 'next') {
      this.color(BLUE, 'fill')
      this.pdf.circle(x, y, 1.6, 'F')
    }
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

  private drawRoadmapLegend(showToday: boolean, showBaseline: boolean) {
    const bar = (fill: Rgb) => (x: number, y: number) => {
      this.color(fill, 'fill')
      this.pdf.roundedRect(x, y - 3, 14, 6, 3, 3, 'F')
    }
    const items: { label: string; width: number; draw: (x: number, y: number) => void }[] = [
      { label: 'Completed', width: 14, draw: bar(BLUE) },
      { label: 'Remaining', width: 14, draw: bar(BAR_TINT) },
      { label: 'Milestone', width: 6, draw: (x, y) => this.drawRoadmapTick(x + 3, y, 'open') },
      { label: 'Next', width: 8, draw: (x, y) => this.drawRoadmapTick(x + 4, y, 'next') },
      { label: 'Date moved', width: 6, draw: (x, y) => this.drawRoadmapTick(x + 3, y, 'moved') },
      ...(showBaseline
        ? [{ label: 'Baseline', width: 9, draw: (x: number, y: number) => this.drawRoadmapDiamond(x + 4.5, y, 4.5, false) }]
        : []),
      { label: 'Forecast delivery', width: 10, draw: (x, y) => this.drawRoadmapDiamond(x + 5, y, 5, true) },
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
    this.pdf.setFont('helvetica', 'normal')
    this.pdf.setFontSize(7.5)
    for (const item of items) {
      const itemWidth = item.width + 5 + this.measure(item.label)
      if (x + itemWidth > PAGE_MARGIN + this.contentWidth) {
        x = PAGE_MARGIN
        this.y += 14
      }
      item.draw(x, this.y)
      this.pdf.setFont('helvetica', 'normal')
      this.pdf.setFontSize(7.5)
      this.color(MUTED, 'text')
      this.pdf.text(item.label, x + item.width + 5, this.y + 2.6)
      x += itemWidth + 14
    }
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

  if (showTimeline) writer.timeline([project], { showLaneLabels: false })

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
    writer.sectionTitle('Delivery roadmap', 'Schedule')
    writer.roadmap(projects, today)
    writer.space(16)
    projects.forEach((project, i) =>
      writeProject(writer, project, today, { eyebrow: `Project ${i + 1}`, showTimeline: false }),
    )
  } else {
    writeProject(writer, projects[0], today, { showTimeline: true })
  }

  writer.footers(generatedOn)
  pdf.save(`${fileName}.pdf`)
}
