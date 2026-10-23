export type MilestoneStatus = 'delivered' | 'at-risk' | 'in-progress' | 'not-started'

export type Milestone = {
  id: number
  title: string
  date: string
  status: MilestoneStatus
  dateSlipped?: boolean
}

export const timelineTitle = 'Anyone Home AI Lead Qualification — Delivery Timeline'

export const todayMilestoneId = 2

export const milestones: Milestone[] = [
  { id: 0, title: 'Project logistics', date: 'TBC', status: 'delivered' },
  { id: 1, title: 'AI model / cost analysis', date: 'TBC', status: 'in-progress' },
  { id: 2, title: 'Requirements & processing architecture', date: 'TBC', status: 'in-progress' },
  { id: 3, title: 'UX prototype completed', date: 'TBC', status: 'not-started' },
  { id: 4, title: 'Voicemail transcription & lead qualification unit test', date: 'TBC', status: 'not-started' },
  { id: 5, title: 'Final UX approved', date: 'TBC', status: 'not-started' },
  { id: 6, title: 'Email transcription & lead qualification unit test', date: 'TBC', status: 'not-started' },
  { id: 7, title: 'Phone recording transcription & lead qualification unit test', date: 'TBC', status: 'not-started' },
  { id: 8, title: 'Anyone Home lead mgmt integration', date: 'TBC', status: 'not-started' },
  { id: 9, title: 'Integration deployment & regression testing', date: 'TBC', status: 'not-started' },
]

export const finalMilestone = { id: 10, title: 'MVP Release', date: 'TBC' }
