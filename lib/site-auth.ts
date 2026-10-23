export const SITE_PASSWORD = process.env.SITE_PASSWORD || 'inhabit'
export const AUTH_COOKIE = 'ah_site_auth'
export const AUTH_MAX_AGE = 60 * 60 * 24 * 30

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

export function authToken() {
  return sha256Hex(`anyone-home-gate:${SITE_PASSWORD}`)
}

export function safeRedirectPath(value: unknown) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return '/'
  if (value.startsWith('/login')) return '/'
  return value
}
