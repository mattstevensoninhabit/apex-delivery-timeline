'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowDown, ArrowUp, Download, Plus, Trash2 } from 'lucide-react'
import { saveProject, type ProjectInput } from '@/app/actions/projects'
import { Button, buttonVariants } from '@/components/ui/button'
import { MILESTONE_STATUSES, type MilestoneStatus, type Project } from '@/lib/milestones'

type DraftMilestone = ProjectInput['milestones'][number] & { key: string }

const inputClass =
  'h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

let keySeed = 0
const nextKey = () => `m-${keySeed++}`

export function ProjectEditor({ project }: { project: Project }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)

  const [tabLabel, setTabLabel] = useState(project.tabLabel)
  const [tabDescription, setTabDescription] = useState(project.tabDescription)
  const [timelineTitle, setTimelineTitle] = useState(project.timelineTitle)
  const [milestones, setMilestones] = useState<DraftMilestone[]>(() =>
    project.milestones.map((m) => ({
      key: nextKey(),
      title: m.title,
      date: m.date,
      status: m.status,
      dateSlipped: Boolean(m.dateSlipped),
    })),
  )
  const [todayKey, setTodayKey] = useState<string | null>(() => {
    const index = project.milestones.findIndex((m) => m.id === project.todayMilestoneId)
    return index >= 0 ? (milestones[index]?.key ?? null) : null
  })
  const [hasFinal, setHasFinal] = useState(Boolean(project.finalMilestone))
  const [finalTitle, setFinalTitle] = useState(project.finalMilestone?.title ?? 'MVP Release')
  const [finalDate, setFinalDate] = useState(project.finalMilestone?.date ?? 'TBC')

  function updateMilestone(key: string, patch: Partial<DraftMilestone>) {
    setMilestones((list) => list.map((m) => (m.key === key ? { ...m, ...patch } : m)))
  }

  function moveMilestone(index: number, delta: number) {
    setMilestones((list) => {
      const target = index + delta
      if (target < 0 || target >= list.length) return list
      const next = [...list]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  function removeMilestone(key: string) {
    setMilestones((list) => list.filter((m) => m.key !== key))
    if (todayKey === key) setTodayKey(null)
  }

  function addMilestone() {
    setMilestones((list) => [
      ...list,
      { key: nextKey(), title: '', date: 'TBC', status: 'not-started', dateSlipped: false },
    ])
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage(null)
    const todayIndex = milestones.findIndex((m) => m.key === todayKey)
    const input: ProjectInput = {
      tabLabel,
      tabDescription,
      timelineTitle,
      todayIndex: todayIndex >= 0 ? todayIndex : null,
      milestones: milestones.map(({ title, date, status, dateSlipped }) => ({ title, date, status, dateSlipped })),
      finalMilestone: hasFinal ? { title: finalTitle, date: finalDate } : null,
    }
    startTransition(async () => {
      const result = await saveProject(project.slug, input)
      if (result.ok) {
        setMessage({ type: 'ok', text: 'Saved. The timeline has been updated.' })
        router.refresh()
      } else {
        setMessage({ type: 'error', text: result.error })
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <section className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5 text-card-foreground">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-bold">Project details</h2>
          <div className="flex gap-2">
            <a
              href={`/api/projects/${project.slug}/export?format=csv`}
              download
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              <Download aria-hidden="true" />
              Download CSV
            </a>
            <a
              href={`/api/projects/${project.slug}/export?format=json`}
              download
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              <Download aria-hidden="true" />
              Download JSON
            </a>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Project name (tab label)">
            <input className={inputClass} value={tabLabel} onChange={(e) => setTabLabel(e.target.value)} required maxLength={80} />
          </Field>
          <Field label="Tab description">
            <input className={inputClass} value={tabDescription} onChange={(e) => setTabDescription(e.target.value)} maxLength={120} />
          </Field>
          <div className="md:col-span-2">
            <Field label="Timeline title">
              <input className={inputClass} value={timelineTitle} onChange={(e) => setTimelineTitle(e.target.value)} required maxLength={200} />
            </Field>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5 text-card-foreground">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold">Milestones</h2>
          <Button type="button" variant="outline" size="sm" onClick={addMilestone}>
            <Plus aria-hidden="true" />
            Add milestone
          </Button>
        </div>

        {milestones.length === 0 ? (
          <p className="text-sm text-muted-foreground">No milestones yet. Add one to start the timeline.</p>
        ) : (
          <ol className="flex flex-col gap-3">
            {milestones.map((m, index) => (
              <li key={m.key} className="flex flex-col gap-3 rounded-md border border-border bg-background p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold uppercase tracking-widest text-primary">Milestone {index}</span>
                  <div className="flex gap-1">
                    <Button type="button" variant="ghost" size="icon" onClick={() => moveMilestone(index, -1)} disabled={index === 0}>
                      <ArrowUp aria-hidden="true" />
                      <span className="sr-only">Move milestone {index} up</span>
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => moveMilestone(index, 1)}
                      disabled={index === milestones.length - 1}
                    >
                      <ArrowDown aria-hidden="true" />
                      <span className="sr-only">Move milestone {index} down</span>
                    </Button>
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeMilestone(m.key)}>
                      <Trash2 aria-hidden="true" />
                      <span className="sr-only">Remove milestone {index}</span>
                    </Button>
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-12">
                  <div className="md:col-span-6">
                    <Field label="Title">
                      <input
                        className={inputClass}
                        value={m.title}
                        onChange={(e) => updateMilestone(m.key, { title: e.target.value })}
                        required
                        maxLength={200}
                      />
                    </Field>
                  </div>
                  <div className="md:col-span-3">
                    <Field label="Date">
                      <input
                        className={inputClass}
                        value={m.date}
                        placeholder="e.g. 15 Nov or TBC"
                        onChange={(e) => updateMilestone(m.key, { date: e.target.value })}
                        maxLength={40}
                      />
                    </Field>
                  </div>
                  <div className="md:col-span-3">
                    <Field label="Status">
                      <select
                        className={inputClass}
                        value={m.status}
                        onChange={(e) => updateMilestone(m.key, { status: e.target.value as MilestoneStatus })}
                      >
                        {MILESTONE_STATUSES.map((s) => (
                          <option key={s.value} value={s.value}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>
                </div>
                <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      className="size-4 accent-primary"
                      checked={m.dateSlipped}
                      onChange={(e) => updateMilestone(m.key, { dateSlipped: e.target.checked })}
                    />
                    Date slipped (shown in red)
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="today"
                      className="size-4 accent-primary"
                      checked={todayKey === m.key}
                      onChange={() => setTodayKey(m.key)}
                    />
                    {"Today marker"}
                  </label>
                </div>
              </li>
            ))}
          </ol>
        )}
        {todayKey && (
          <Button type="button" variant="link" size="sm" className="self-start px-0" onClick={() => setTodayKey(null)}>
            Clear today marker
          </Button>
        )}
      </section>

      <section className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5 text-card-foreground">
        <label className="flex items-center gap-2 text-lg font-bold">
          <input type="checkbox" className="size-4 accent-primary" checked={hasFinal} onChange={(e) => setHasFinal(e.target.checked)} />
          Final delivery milestone
        </label>
        {hasFinal && (
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Title">
              <input className={inputClass} value={finalTitle} onChange={(e) => setFinalTitle(e.target.value)} required maxLength={200} />
            </Field>
            <Field label="Date">
              <input className={inputClass} value={finalDate} onChange={(e) => setFinalDate(e.target.value)} maxLength={40} />
            </Field>
          </div>
        )}
      </section>

      <div className="sticky bottom-4 flex items-center justify-end gap-4 rounded-lg border border-border bg-card p-4 text-card-foreground">
        <p
          role="status"
          className={message?.type === 'error' ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}
        >
          {message?.text}
        </p>
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </form>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-medium">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}
