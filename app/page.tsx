import { DeliveryTimeline } from '@/components/delivery-timeline'
import { ProjectTabs } from '@/components/project-tabs'
import { projects } from '@/lib/milestones'

export default function Page() {
  return (
    <main className="mx-auto flex min-h-screen max-w-screen-2xl flex-col justify-center gap-6 px-4 py-10 md:px-8">
      <h1 className="sr-only">Anyone Home AI program delivery timelines</h1>
      <ProjectTabs
        tabs={projects.map((project) => ({
          slug: project.slug,
          label: project.tabLabel,
          description: project.tabDescription,
          panel: <DeliveryTimeline project={project} />,
        }))}
      />
    </main>
  )
}
