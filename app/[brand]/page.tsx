import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { BrandPage } from '@/components/brand-page'
import { getBrand } from '@/lib/brands'
import { brandingTitle, resolveBranding } from '@/lib/branding'
import { getProjects } from '@/lib/projects'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ brand: string }> }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { brand: slug } = await params
  const brand = await getBrand(slug)
  if (!brand) return { title: 'Not found' }
  return {
    title: `${brandingTitle(resolveBranding(brand))} — ${brand.name}`,
    description: `${brand.name} delivery timelines.`,
  }
}

export default async function Page({ params, searchParams }: Params & { searchParams: Promise<{ tab?: string }> }) {
  const [{ brand: slug }, { tab }] = await Promise.all([params, searchParams])
  const brand = await getBrand(slug)
  if (!brand) notFound()
  const projects = await getProjects(brand.slug)
  return <BrandPage brand={brand} projects={projects} initialTab={typeof tab === 'string' ? tab : undefined} />
}
