import type { WebContents } from 'electron'

/**
 * Fitting a recipe onto one page.
 *
 * Rather than estimating heights, this uses printToPDF itself as the oracle:
 * render, count pages, shrink, repeat. A render is a few tens of milliseconds,
 * so walking the ladder is cheap and the answer is exact — no guessing about
 * how text reflows at a different scale.
 *
 * The knob is a CSS `zoom` on the recipe, applied only under `@media print`.
 * Unlike `transform: scale()`, `zoom` affects layout, so pagination respects
 * it. It also means the value can be left set — it has no effect on screen.
 */

export const PDF_OPTIONS = {
  printBackground: true,
  pageSize: 'Letter',
  margins: { top: 0.5, bottom: 0.5, left: 0.55, right: 0.55 }
} as const

/** Tried in order until the recipe fits on one page. */
const ZOOM_STEPS = [1, 0.95, 0.9, 0.85, 0.8, 0.75, 0.7, 0.66, 0.62]

/**
 * Where we give up and let it run to two pages. Below this the type gets too
 * small to cook from, and a genuinely long recipe is better off spilling over.
 */
const COMFORTABLE_ZOOM = 0.82

export interface FittedRender {
  pdf: Buffer
  zoom: number
  pages: number
}

export async function renderFitted(contents: WebContents): Promise<FittedRender> {
  for (const zoom of ZOOM_STEPS) {
    await setPrintZoom(contents, zoom)
    const pdf = await contents.printToPDF(PDF_OPTIONS)
    if (countPages(pdf) <= 1) return { pdf, zoom, pages: 1 }
  }

  await setPrintZoom(contents, COMFORTABLE_ZOOM)
  const pdf = await contents.printToPDF(PDF_OPTIONS)
  return { pdf, zoom: COMFORTABLE_ZOOM, pages: countPages(pdf) }
}

export async function setPrintZoom(contents: WebContents, zoom: number): Promise<void> {
  await contents.executeJavaScript(
    `document.documentElement.style.setProperty('--print-zoom', '${zoom}'); true`
  )
}

/**
 * Page count straight from the PDF bytes. The page tree in Chromium's output
 * is written uncompressed, so the /Type /Pages node's /Count is readable; the
 * per-page objects are the fallback if that ever stops being true.
 */
export function countPages(pdf: Buffer): number {
  const text = pdf.toString('latin1')

  const pageObjects = text.match(/\/Type\s*\/Page(?![\s\w]*s)/g)
  if (pageObjects && pageObjects.length > 0) return pageObjects.length

  const counts = [...text.matchAll(/\/Count\s+(\d+)/g)].map((match) => Number(match[1]))
  return counts.length ? Math.max(...counts) : 1
}
