import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { ConsolidatedTimeline } from '@/components/consolidated-timeline'
import { DeliveryTimeline } from '@/components/delivery-timeline'
import { ExecutivePortfolioTimeline, ExecutiveProjectTimeline } from '@/components/executive-timeline'
import { ProjectTabs } from '@/components/project-tabs'
import { brandStyle, headerInfo, overrideStyle, pdfBranding, resolveBranding, type Brand } from '@/lib/branding'
import type { Project } from '@/lib/milestones'

export function BrandPage({
  brand,
  projects,
  initialTab,
  initialView,
}: {
  brand: Brand
  projects: Project[]
  initialTab?: string
  initialView?: string
}) {
  const brandBranding = resolveBranding(brand)
  const deck = {
    brandName: brand.name,
    brandSlug: brand.slug,
    lead: brand.headerLead || brand.name,
    branding: pdfBranding(brandBranding),
    items: projects.map((project) => ({
      project,
      style: { ...brandStyle(brand.colors), ...overrideStyle(brand, project) },
      branding: pdfBranding(resolveBranding(brand, project)),
    })),
  }

  return (
    <div style={brandStyle(brand.colors)} className="min-h-screen bg-background text-foreground">
      <main className="mx-auto flex min-h-screen max-w-screen-2xl flex-col justify-center gap-6 px-4 py-10 md:px-8">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 self-start text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          All pods
        </Link>
        <ProjectTabs
          initialTab={initialTab}
          initialView={initialView}
          tabs={[
            {
              slug: 'all',
              eyebrow: 'Overview',
              label: 'All Projects',
              description: 'Consolidated timeline',
              header: headerInfo(brandBranding),
              panel: (
                <ConsolidatedTimeline
                  projects={projects}
                  lead={brand.headerLead || brand.name}
                  fileName={`${brand.slug}-consolidated-timeline`}
                  branding={pdfBranding(brandBranding)}
                />
              ),
              executivePanel: (
                <ExecutivePortfolioTimeline
                  projects={projects}
                  lead={brand.headerLead || brand.name}
                  fileName={`${brand.slug}-executive-timeline`}
                  branding={pdfBranding(brandBranding)}
                  deck={deck}
                />
              ),
            },
            ...projects.map((project, index) => {
              const branding = resolveBranding(brand, project)
              return {
                slug: project.slug,
                eyebrow: `Project ${index + 1}`,
                label: project.tabLabel,
                description: project.tabDescription,
                header: headerInfo(branding),
                style: overrideStyle(brand, project),
                panel: <DeliveryTimeline project={project} branding={pdfBranding(branding)} />,
                executivePanel: <ExecutiveProjectTimeline project={project} branding={pdfBranding(branding)} />,
              }
            }),
          ]}
        />
        <Link
          href="/admin"
          className="self-end text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Admin
        </Link>
      </main>
    </div>
  )
}
