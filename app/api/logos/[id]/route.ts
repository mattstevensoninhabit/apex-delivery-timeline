import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { logos } from '@/lib/db/schema'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const logoId = Number(id)
  if (!Number.isInteger(logoId) || logoId <= 0) return new Response('Not found', { status: 404 })

  const [logo] = await db.select().from(logos).where(eq(logos.id, logoId)).limit(1)
  if (!logo) return new Response('Not found', { status: 404 })

  const etag = `"${logo.sha256}"`
  const headers = {
    'Content-Type': logo.mimeType,
    ETag: etag,
    'Cache-Control': 'public, max-age=31536000, immutable',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    'X-Content-Type-Options': 'nosniff',
  }
  if (request.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers })

  return new Response(new Uint8Array(logo.data), { headers: { ...headers, 'Content-Length': String(logo.byteSize) } })
}
