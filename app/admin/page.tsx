import type { Metadata } from 'next'
import Link from 'next/link'
import { AdminWorkspace } from '@/components/admin/admin-workspace'
import { getProjects } from '@/lib/projects'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Admin — Delivery Timelines',
  robots: { index: false, follow: false },
}

export default async function AdminPage() {
  const projects = await getProjects()

  return (
    <main className="mx-auto flex min-h-screen max-w-screen-xl flex-col gap-8 px-4 py-10 md:px-8">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Admin</p>
          <h1 className="text-2xl font-bold text-balance text-foreground">Manage delivery timelines</h1>
        </div>
        <Link
          href="/"
          className="text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          View timelines
        </Link>
      </header>
      <AdminWorkspace projects={projects} />
    </main>
  )
}
