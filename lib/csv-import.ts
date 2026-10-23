import { MILESTONE_STATUSES, type MilestoneStatus } from '@/lib/milestones'

export type ImportedTimeline = {
  milestones: { title: string; date: string; status: MilestoneStatus; dateSlipped: boolean }[]
  todayIndex: number | null
  finalMilestone: { title: string; date: string } | null
}

const REQUIRED_HEADERS = ['title', 'date', 'status'] as const
const MAX_ROWS = 50

export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false
  const input = text.replace(/^\uFEFF/, '')

  for (let i = 0; i < input.length; i++) {
    const char = input[i]
    if (inQuotes) {
      if (char === '"' && input[i + 1] === '"') {
        cell += '"'
        i++
      } else if (char === '"') {
        inQuotes = false
      } else {
        cell += char
      }
    } else if (char === '"') {
      inQuotes = true
    } else if (char === ',') {
      row.push(cell)
      cell = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && input[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else {
      cell += char
    }
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}

function toStatus(raw: string): MilestoneStatus | null {
  const normalized = raw.trim().toLowerCase()
  const match = MILESTONE_STATUSES.find(
    (s) => s.value === normalized || s.label.toLowerCase() === normalized,
  )
  return match?.value ?? null
}

const isYes = (raw: string | undefined) => ['yes', 'y', 'true', '1', 'x'].includes((raw ?? '').trim().toLowerCase())

export function importTimelineCsv(text: string): { ok: true; data: ImportedTimeline } | { ok: false; error: string } {
  const rows = parseCsv(text)
  if (rows.length < 2) return { ok: false, error: 'The CSV has no milestone rows.' }

  const headers = rows[0].map((h) => h.trim().toLowerCase())
  const col = (name: string) => headers.indexOf(name)
  const missing = REQUIRED_HEADERS.filter((h) => col(h) === -1)
  if (missing.length > 0) {
    return { ok: false, error: `Missing column(s): ${missing.join(', ')}. Use the downloaded CSV as a template.` }
  }

  const titleCol = col('title')
  const dateCol = col('date')
  const statusCol = col('status')
  const slippedCol = col('date slipped')
  const todayCol = col('today')

  const body = rows.slice(1)
  if (body.length > MAX_ROWS + 1) return { ok: false, error: `Up to ${MAX_ROWS} milestones are allowed.` }

  const milestones: ImportedTimeline['milestones'] = []
  let todayIndex: number | null = null
  let finalMilestone: ImportedTimeline['finalMilestone'] = null

  for (const [i, row] of body.entries()) {
    const line = i + 2
    const title = (row[titleCol] ?? '').trim()
    const date = (row[dateCol] ?? '').trim() || 'TBC'
    const statusRaw = (row[statusCol] ?? '').trim()

    if (!title) return { ok: false, error: `Row ${line}: title is required.` }

    if (statusRaw.toLowerCase() === 'final delivery') {
      finalMilestone = { title, date }
      continue
    }

    const status = toStatus(statusRaw)
    if (!status) {
      const allowed = MILESTONE_STATUSES.map((s) => s.label).join(', ')
      return { ok: false, error: `Row ${line}: unknown status "${statusRaw}". Use one of: ${allowed}, Final delivery.` }
    }

    if (todayCol !== -1 && isYes(row[todayCol])) todayIndex = milestones.length
    milestones.push({ title, date, status, dateSlipped: slippedCol !== -1 && isYes(row[slippedCol]) })
  }

  return { ok: true, data: { milestones, todayIndex, finalMilestone } }
}
