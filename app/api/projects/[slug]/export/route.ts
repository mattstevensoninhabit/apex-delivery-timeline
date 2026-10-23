import { getProject } from '@/lib/projects'
import { MILESTONE_STATUSES } from '@/lib/milestones'

const statusLabel = Object.fromEntries(MILESTONE_STATUSES.map((s) => [s.value, s.label]))

function csvCell(value: string | number) {
  const text = String(value)
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const project = await getProject(slug)
  if (!project) return new Response('Not found', { status: 404 })

  const format = new URL(request.url).searchParams.get('format') === 'csv' ? 'csv' : 'json'

  if (format === 'json') {
    return new Response(JSON.stringify(project, null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${slug}.json"`,
      },
    })
  }

  const rows: (string | number)[][] = [['Project', 'Milestone', 'Title', 'Date', 'Status', 'Date slipped', 'Today']]
  for (const m of project.milestones) {
    rows.push([
      project.tabLabel,
      m.id,
      m.title,
      m.date,
      statusLabel[m.status] ?? m.status,
      m.dateSlipped ? 'Yes' : 'No',
      project.todayMilestoneId === m.id ? 'Yes' : '',
    ])
  }
  if (project.finalMilestone) {
    const f = project.finalMilestone
    rows.push([project.tabLabel, f.id, f.title, f.date, 'Final delivery', '', ''])
  }

  const csv = rows.map((row) => row.map(csvCell).join(',')).join('\n')
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${slug}.csv"`,
    },
  })
}
