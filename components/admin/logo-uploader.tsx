'use client'

import { useId, useRef, useState, useTransition, type ChangeEvent } from 'react'
import { useRouter } from 'next/navigation'
import { ImageIcon, Trash2, Upload } from 'lucide-react'
import { removeLogo, uploadLogo } from '@/app/actions/brands'
import { Button } from '@/components/ui/button'
import type { LogoRef } from '@/lib/milestones'

const MAX_BYTES = 1_000_000

export function LogoUploader({
  target,
  slug,
  logo,
  label,
  hint,
  fallbackUrl,
}: {
  target: 'brand' | 'project'
  slug: string
  logo?: LogoRef
  label: string
  hint: string
  fallbackUrl?: string
}) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const hintId = useId()
  const [current, setCurrent] = useState(logo)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const preview = current?.url ?? fallbackUrl

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (file.size > MAX_BYTES) {
      setError('Logo must be 1 MB or smaller.')
      return
    }
    setError(null)
    const formData = new FormData()
    formData.append('logo', file)
    startTransition(async () => {
      const result = await uploadLogo(target, slug, formData)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setCurrent(result.logo)
      router.refresh()
    })
  }

  function handleRemove() {
    setError(null)
    startTransition(async () => {
      const result = await removeLogo(target, slug)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setCurrent(undefined)
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex h-16 w-40 shrink-0 items-center justify-center rounded-md border border-dashed border-input bg-background p-2">
          {preview ? (
            <img src={preview || '/placeholder.svg'} alt="Current logo" className="max-h-full max-w-full object-contain" />
          ) : (
            <ImageIcon aria-hidden="true" className="size-5 text-muted-foreground" />
          )}
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={pending}>
              <Upload aria-hidden="true" />
              {pending ? 'Working…' : current ? 'Replace logo' : 'Upload logo'}
            </Button>
            {current ? (
              <Button type="button" variant="ghost" size="sm" onClick={handleRemove} disabled={pending}>
                <Trash2 aria-hidden="true" />
                Remove
              </Button>
            ) : null}
          </div>
          <p id={hintId} className="text-xs text-muted-foreground">
            {hint}
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/svg+xml,image/png,image/jpeg,image/webp"
          className="sr-only"
          tabIndex={-1}
          aria-label={label}
          aria-describedby={hintId}
          onChange={handleFile}
        />
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}
