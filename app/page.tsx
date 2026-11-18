import { PodLanding } from '@/components/pod-landing'
import { getBrands } from '@/lib/brands'
import { getProjects } from '@/lib/projects'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const [brands, projects] = await Promise.all([getBrands(), getProjects()])
  const pods = brands.map((brand) => ({
    brand,
    projects: projects.filter((p) => p.brandSlug === brand.slug),
  }))
  const shell = brands.find((b) => b.isDefault) ?? brands[0]
  return <PodLanding pods={pods} shell={shell} />
}
