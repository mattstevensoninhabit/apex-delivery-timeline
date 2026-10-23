import type { Metadata } from 'next'
import { LoginForm } from '@/components/login-form'
import { safeRedirectPath } from '@/lib/site-auth'

export const metadata: Metadata = {
  title: 'Sign in — AI Pod Delivery Timelines',
  robots: { index: false, follow: false },
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>
}) {
  const { from } = await searchParams

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <section className="flex w-full max-w-sm flex-col gap-8 rounded-xl border border-border bg-card p-8 shadow-xl">
        <header className="flex flex-col gap-4">
          <img src="/anyone-home-logo.svg" alt="Anyone Home by Entrata" className="h-10 w-auto self-start" />
          <div className="flex flex-col gap-1">
            <h1 className="text-balance text-2xl font-extrabold uppercase tracking-tight text-foreground">
              AI Pod <span className="text-primary">Timelines</span>
            </h1>
            <p className="text-sm leading-relaxed text-muted-foreground">Enter the password to view delivery timelines.</p>
          </div>
        </header>
        <LoginForm from={safeRedirectPath(from)} />
      </section>
    </main>
  )
}
