import type { Metadata } from 'next'
import { LoginForm } from '@/components/login-form'
import { getDefaultBrand } from '@/lib/brands'
import { brandStyle } from '@/lib/branding'
import { safeRedirectPath } from '@/lib/site-auth'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Sign in — Delivery Timelines',
  robots: { index: false, follow: false },
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>
}) {
  const [{ from }, brand] = await Promise.all([searchParams, getDefaultBrand().catch(() => null)])

  return (
    <div style={brand ? brandStyle(brand.colors) : undefined} className="min-h-screen bg-background text-foreground">
      <main className="flex min-h-screen items-center justify-center px-4 py-10">
        <section className="flex w-full max-w-sm flex-col gap-8 rounded-xl border border-border bg-card p-8 shadow-xl">
          <header className="flex flex-col gap-4">
            {brand?.logo ? (
              <img src={brand.logo.url || '/placeholder.svg'} alt={brand.logoAlt || brand.name} className="h-10 w-auto self-start" />
            ) : null}
            <div className="flex flex-col gap-1">
              <h1 className="text-balance text-2xl font-extrabold uppercase tracking-tight text-foreground">
                Delivery <span className="text-primary">Timelines</span>
              </h1>
              <p className="text-sm leading-relaxed text-muted-foreground">Enter the password to view delivery timelines.</p>
            </div>
          </header>
          <LoginForm from={safeRedirectPath(from)} />
        </section>
      </main>
    </div>
  )
}
