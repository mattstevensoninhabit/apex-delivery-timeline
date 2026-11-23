export const EXPORT_IGNORE_ATTR = 'data-export-ignore'

export type CapturedImage = { dataUrl: string; width: number; height: number }

export async function renderToJpeg(target: HTMLElement, backgroundColor?: string): Promise<CapturedImage> {
  const { toJpeg } = await import('html-to-image')
  const { width, height } = target.getBoundingClientRect()
  const dataUrl = await toJpeg(target, {
    quality: 0.95,
    pixelRatio: 2,
    backgroundColor: backgroundColor ?? getComputedStyle(document.body).backgroundColor,
    cacheBust: true,
    filter: (node) => !(node instanceof HTMLElement && node.hasAttribute(EXPORT_IGNORE_ATTR)),
  })
  return { dataUrl, width, height }
}

export function triggerDownload(href: string, filename: string) {
  const link = document.createElement('a')
  link.href = href
  link.download = filename
  link.click()
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  triggerDownload(url, filename)
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
