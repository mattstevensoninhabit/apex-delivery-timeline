export type MilestoneStatus = 'delivered' | 'at-risk' | 'in-progress' | 'not-started'

export const MILESTONE_STATUSES: { value: MilestoneStatus; label: string }[] = [
  { value: 'delivered', label: 'Complete' },
  { value: 'in-progress', label: 'In progress' },
  { value: 'at-risk', label: 'At risk' },
  { value: 'not-started', label: 'Planned' },
]

export type Milestone = {
  id: number
  title: string
  date: string
  status: MilestoneStatus
  dateSlipped?: boolean
}

export type Project = {
  slug: string
  tabLabel: string
  tabDescription: string
  timelineTitle: string
  todayMilestoneId?: number
  milestones: Milestone[]
  finalMilestone?: { id: number; title: string; date: string }
  notes?: string
}
