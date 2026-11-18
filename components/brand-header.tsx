import type { HeaderInfo } from '@/lib/branding'

export function BrandHeader({ header }: { header: HeaderInfo }) {
  return (
    <header className="flex flex-col gap-2">
      {header.logoUrl ? (
        <img src={header.logoUrl || '/placeholder.svg'} alt={header.logoAlt} className="h-10 w-auto self-start md:h-12" />
      ) : (
        <p className="text-sm font-bold uppercase tracking-widest text-muted-foreground">{header.name}</p>
      )}
      <h1 className="text-balance text-3xl font-extrabold uppercase tracking-tight text-foreground md:text-4xl">
        {header.title ? (
          header.title
        ) : (
          <>
            {header.lead} <span className="text-primary">{header.accentText}</span>
          </>
        )}
      </h1>
    </header>
  )
}
