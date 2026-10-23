'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { AUTH_COOKIE, AUTH_MAX_AGE, SITE_PASSWORD, authToken, safeRedirectPath } from '@/lib/site-auth'

export type LoginState = { error: string | null }

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const password = formData.get('password')
  if (typeof password !== 'string' || password !== SITE_PASSWORD) {
    return { error: 'Incorrect password. Try again.' }
  }

  const cookieStore = await cookies()
  cookieStore.set(AUTH_COOKIE, await authToken(), {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    path: '/',
    maxAge: AUTH_MAX_AGE,
  })

  redirect(safeRedirectPath(formData.get('from')))
}

export async function logout() {
  const cookieStore = await cookies()
  cookieStore.delete(AUTH_COOKIE)
  redirect('/login')
}
