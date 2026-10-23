import Link from 'next/link'
import { DeliveryTimeline } from '@/components/delivery-timeline'
import { ProjectTabs } from '@/components/project-tabs'
import { getProjects } from '@/lib/projects'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const projects = await getProjects()

  return (
    <main className="mx-auto flex min-h-screen max-w-screen-2xl flex-col justify-center gap-6 px-4 py-10 md:px-8">
      <header className="flex flex-col gap-2">
        <img src="/anyone-home-logo.svg" alt="Anyone Home by Entrata" className="h-10 w-auto self-start md:h-12" />
        <h1 className="text-balance text-3xl font-extrabold uppercase tracking-tight text-foreground md:text-4xl">
          AH AI Pod <span className="text-primary">Delivery Timelines</span>
        </h1>
      </header>
      <ProjectTabs
        tabs={projects.map((project) => ({
          slug: project.slug,
          label: project.tabLabel,
          description: project.tabDescription,
          panel: <DeliveryTimeline project={project} />,
        }))}
      />
      <Link
        href="/admin"
        className="self-end text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        Admin
      </Link>
    </main>
  )
}
