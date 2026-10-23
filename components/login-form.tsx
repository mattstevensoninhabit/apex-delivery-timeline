'use client'

import { useActionState } from 'react'
import { Lock } from 'lucide-react'
import { login, type LoginState } from '@/app/actions/auth'
import { Button } from '@/components/ui/button'

const initialState: LoginState = { error: null }

export function LoginForm({ from }: { from: string }) {
  const [state, formAction, pending] = useActionState(login, initialState)

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="from" value={from} />
      <div className="flex flex-col gap-2">
        <label htmlFor="password" className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Password
        </label>
        <div className="relative">
          <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            id="password"
            name="password"
            type="password"
            required
            autoFocus
            autoComplete="current-password"
            aria-invalid={state.error ? true : undefined}
            aria-describedby={state.error ? 'password-error' : undefined}
            className="h-11 w-full rounded-md border border-input bg-accent pl-10 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder="Enter password"
          />
        </div>
        {state.error && (
          <p id="password-error" role="alert" className="text-sm text-destructive">
            {state.error}
          </p>
        )}
      </div>
      <Button type="submit" disabled={pending} className="h-11 font-bold uppercase tracking-wider">
        {pending ? 'Checking…' : 'Enter'}
      </Button>
    </form>
  )
}
