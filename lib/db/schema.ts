import { integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import type { Milestone, Project } from '@/lib/milestones'

export const projects = pgTable('projects', {
  slug: text('slug').primaryKey(),
  position: integer('position').notNull().default(0),
  tabLabel: text('tab_label').notNull(),
  tabDescription: text('tab_description').notNull().default(''),
  timelineTitle: text('timeline_title').notNull(),
  todayMilestoneId: integer('today_milestone_id'),
  milestones: jsonb('milestones').$type<Milestone[]>().notNull().default([]),
  finalMilestone: jsonb('final_milestone').$type<NonNullable<Project['finalMilestone']>>(),
  notes: text('notes').notNull().default(''),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
