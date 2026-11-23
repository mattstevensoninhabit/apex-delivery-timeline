import { boolean, customType, integer, jsonb, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core'
import type { Milestone, Project } from '@/lib/milestones'

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => 'bytea',
})

export const logos = pgTable('logos', {
  id: serial('id').primaryKey(),
  mimeType: text('mime_type').notNull(),
  data: bytea('data').notNull(),
  byteSize: integer('byte_size').notNull(),
  sha256: text('sha256').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const brands = pgTable('brands', {
  slug: text('slug').primaryKey(),
  position: integer('position').notNull().default(0),
  isDefault: boolean('is_default').notNull().default(false),
  name: text('name').notNull(),
  headerLead: text('header_lead').notNull().default(''),
  headerAccent: text('header_accent').notNull().default(''),
  logoId: integer('logo_id').references(() => logos.id, { onDelete: 'set null' }),
  logoAlt: text('logo_alt').notNull().default(''),
  colorBackground: text('color_background').notNull().default('#071a33'),
  colorSurface: text('color_surface').notNull().default('#1a3f6b'),
  colorAccent: text('color_accent').notNull().default('#87cf36'),
  colorTimelineAccent: text('color_timeline_accent').notNull().default('#0e6b9a'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const projects = pgTable('projects', {
  slug: text('slug').primaryKey(),
  position: integer('position').notNull().default(0),
  brandSlug: text('brand_slug')
    .notNull()
    .references(() => brands.slug),
  logoId: integer('logo_id').references(() => logos.id, { onDelete: 'set null' }),
  logoAlt: text('logo_alt'),
  colorAccent: text('color_accent'),
  colorTimelineAccent: text('color_timeline_accent'),
  pageTitle: text('page_title'),
  tabLabel: text('tab_label').notNull(),
  tabDescription: text('tab_description').notNull().default(''),
  timelineTitle: text('timeline_title').notNull(),
  todayMilestoneId: integer('today_milestone_id'),
  milestones: jsonb('milestones').$type<Milestone[]>().notNull().default([]),
  finalMilestone: jsonb('final_milestone').$type<NonNullable<Project['finalMilestone']>>(),
  notes: text('notes').notNull().default(''),
  executiveNote: text('executive_note').notNull().default(''),
  weeklyUpdate: text('weekly_update').notNull().default(''),
  milestonesDefining: boolean('milestones_defining').notNull().default(false),
  baselinedAt: timestamp('baselined_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const projectSnapshots = pgTable('project_snapshots', {
  id: serial('id').primaryKey(),
  projectSlug: text('project_slug')
    .notNull()
    .references(() => projects.slug, { onDelete: 'cascade' }),
  tabLabel: text('tab_label').notNull(),
  todayMilestoneId: integer('today_milestone_id'),
  milestones: jsonb('milestones').$type<Milestone[]>().notNull().default([]),
  finalMilestone: jsonb('final_milestone').$type<NonNullable<Project['finalMilestone']>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
