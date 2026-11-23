const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/
const US_DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/

function validDate(year: number, month: number, day: number): Date | undefined {
  const date = new Date(year, month - 1, day)
  if (Number.isNaN(date.getTime()) || date.getMonth() !== month - 1 || date.getDate() !== day) return undefined
  return date
}

/** Parses `YYYY-MM-DD`, plus legacy `M/D/YYYY` values imported from spreadsheets. */
export function parseIsoDate(value: string): Date | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  const iso = ISO_DATE.exec(trimmed)
  if (iso) return validDate(Number(iso[1]), Number(iso[2]), Number(iso[3]))
  const us = US_DATE.exec(trimmed)
  if (us) return validDate(Number(us[3]), Number(us[1]), Number(us[2]))
  return undefined
}

export function toIsoDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function formatMilestoneDate(value: string): string {
  const date = parseIsoDate(value)
  if (!date) return value || 'TBC'
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`
}
