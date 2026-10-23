import type { jsPDF } from 'jspdf'
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

  note(text: string) {
    this.ensure(30)
    this.pdf.setFont('helvetica', 'italic')
    this.pdf.setFontSize(10)
    this.color(MUTED, 'text')
    this.pdf.text(this.pdf.splitTextToSize(text, this.contentWidth) as string[], PAGE_MARGIN, this.y)
    this.y += 30
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

function writeProject(writer: SummaryWriter, project: Project, today: number, eyebrow?: string) {
  writer.sectionTitle(project.tabLabel, eyebrow ?? project.tabDescription)

  if (project.milestones.length === 0) {
    writer.note('Milestones have not been defined for this project yet.')
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
    projects.forEach((project, i) => writeProject(writer, project, today, `Project ${i + 1}`))
  } else {
    writeProject(writer, projects[0], today)
  }

  writer.footers(generatedOn)
  pdf.save(`${fileName}.pdf`)
}
