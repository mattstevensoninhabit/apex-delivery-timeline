import type { jsPDF } from 'jspdf'
import { buildConsolidatedTimeline } from './consolidated'
import { formatMilestoneDate, parseIsoDate } from './dates'
import { MILESTONE_STATUSES, type Milestone, type MilestoneStatus, type Project } from './milestones'

type Rgb = [number, number, number]

const NAVY: Rgb = [7, 25, 48]
const BLUE: Rgb = [11, 111, 164]
const GREEN: Rgb = [122, 193, 67]
const AMBER: Rgb = [214, 137, 16]
const MUTED: Rgb = [95, 108, 125]
const RULE: Rgb = [214, 224, 234]
const ROW_TINT: Rgb = [242, 247, 251]
const TODAY_RED: Rgb = [214, 48, 49]

const TIMELINE_ROW = 22

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
}

function dateText(value: string) {
  const formatted = formatMilestoneDate(value)
  return formatted || 'TBC'
}

function nextMilestone(project: Project, today: number): Milestone | undefined {
  const pending = project.milestones.filter((m) => m.status !== 'delivered')
  const upcoming = pending
    .map((m) => ({ m, t: parseIsoDate(m.date)?.getTime() }))
    .filter((e): e is { m: Milestone; t: number } => e.t !== undefined && e.t >= today)
    .sort((a, b) => a.t - b.t)[0]?.m
  return upcoming ?? pending[0]
}

function overallHealth(project: Project): { label: string; color: Rgb } {
  if (project.milestones.length === 0) return { label: 'Not yet planned', color: MUTED }
  if (project.milestones.some((m) => m.status === 'at-risk' || (m.dateSlipped && m.status !== 'delivered'))) {
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

  header(title: string, subtitle: string) {
    this.color(NAVY, 'fill')
    this.pdf.rect(0, 0, this.width, 96, 'F')
    this.color(GREEN, 'fill')
    this.pdf.rect(0, 96, this.width, 4, 'F')

    this.pdf.setFont('helvetica', 'bold')
    this.pdf.setFontSize(9)
    this.color(GREEN, 'text')
    this.pdf.text('ANYONE HOME  |  AI POD', PAGE_MARGIN, 38, { charSpace: 1.2 })

    this.pdf.setFontSize(20)
    this.pdf.setTextColor(255, 255, 255)
    this.pdf.text(title.toUpperCase(), PAGE_MARGIN, 62)

    this.pdf.setFont('helvetica', 'normal')
    this.pdf.setFontSize(10)
    this.pdf.setTextColor(200, 214, 230)
    this.pdf.text(subtitle, PAGE_MARGIN, 80)

    this.y = 132
  }

  sectionTitle(text: string, eyebrow?: string) {
    this.ensure(56)
    if (eyebrow) {
      this.pdf.setFont('helvetica', 'bold')
      this.pdf.setFontSize(8)
      this.color(BLUE, 'text')
      this.pdf.text(eyebrow.toUpperCase(), PAGE_MARGIN, this.y, { charSpace: 1.2 })
      this.y += 16
    }
    this.pdf.setFont('helvetica', 'bold')
    this.pdf.setFontSize(15)
    this.color(NAVY, 'text')
    this.pdf.text(text, PAGE_MARGIN, this.y)
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
        slipped: Boolean(m.dateSlipped),
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
      const lines = this.pdf.splitTextToSize(row.title, titleWidth) as string[]
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

  private drawDot(x: number, y: number, milestone: Milestone, fill: Rgb) {
    if (milestone.dateSlipped && milestone.status !== 'delivered') {
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
      ...(['delivered', 'in-progress', 'not-started', 'at-risk'] as MilestoneStatus[]).map((status) => ({
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
    this.pdf.text(this.pdf.splitTextToSize(text, this.contentWidth) as string[], PAGE_MARGIN, this.y)
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
    const lines = this.pdf.splitTextToSize(text, this.contentWidth) as string[]
    for (const line of lines) {
      this.ensure(14)
      this.pdf.text(line, PAGE_MARGIN, this.y)
      this.y += 13
    }
    this.y += 10
  }

  overviewTable(projects: Project[], today: number) {
    const cols = [PAGE_MARGIN + 8, PAGE_MARGIN + 160, PAGE_MARGIN + 250, PAGE_MARGIN + 350]
    this.ensure(40)
    this.color(NAVY, 'fill')
    this.pdf.rect(PAGE_MARGIN, this.y, this.contentWidth, 20, 'F')
    this.pdf.setFont('helvetica', 'bold')
    this.pdf.setFontSize(7.5)
    this.pdf.setTextColor(255, 255, 255)
    ;['PROJECT', 'PROGRESS', 'HEALTH', 'NEXT MILESTONE'].forEach((label, i) =>
      this.pdf.text(label, cols[i], this.y + 13, { charSpace: 0.8 }),
    )
    this.y += 20

    projects.forEach((project, i) => {
      const total = project.milestones.length
      const complete = project.milestones.filter((m) => m.status === 'delivered').length
      const health = overallHealth(project)
      const next = nextMilestone(project, today)
      const nextText = next ? `${next.title} (${dateText(next.date)})` : 'Not yet defined'
      this.pdf.setFontSize(9.5)
      const nextLines = this.pdf.splitTextToSize(nextText, this.width - PAGE_MARGIN - cols[3] - 8) as string[]
      const nameLines = this.pdf.splitTextToSize(project.tabLabel, cols[1] - cols[0] - 10) as string[]
      const rowHeight = Math.max(24, Math.max(nextLines.length, nameLines.length) * 12 + 12)
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
      this.color(NAVY, 'text')
      this.pdf.text(nextLines, cols[3], textY)
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
      .filter((m) => m.status !== 'delivered' && (m.status === 'at-risk' || m.dateSlipped))
      .map(
        (m) =>
          `Milestone ${m.id}: ${m.title} - ${m.status === 'at-risk' ? 'at risk' : 'date moved'} (${dateText(m.date)})`,
      ),
    AMBER,
  )

  writer.bulletList(
    'Recently completed',
    project.milestones.filter((m) => m.status === 'delivered').map((m) => `Milestone ${m.id}: ${m.title}`),
    GREEN,
  )

  writer.milestoneTable(project)
}

export async function downloadExecutiveSummary(projects: Project[], fileName: string, title?: string) {
  const { jsPDF } = await import('jspdf')
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
  )

  if (isPortfolio) {
    writer.sectionTitle('Portfolio overview', 'At a glance')
    writer.overviewTable(projects, today)
    writer.sectionTitle('Portfolio timeline', 'Schedule')
    writer.timeline(projects, { showLaneLabels: true })
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
