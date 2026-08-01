import type { BrowserWindow, WebContents } from 'electron'

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

/**
 * Candidate zooms, ascending. The goal is the *largest* value that still fits
 * on one page — a short recipe should fill the sheet, not sit in the top third
 * at whatever size the screen happened to use.
 *
 * Steps widen as they climb: a 0.05 difference is very visible at 0.7 and
 * barely noticeable at 1.7.
 */
const ZOOM_LADDER = [
  0.62, 0.66, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 1, 1.05, 1.1, 1.16, 1.22, 1.3,
  1.38, 1.46, 1.55, 1.65, 1.75
]

/**
 * Used when even the smallest step overflows. Below this the type gets too
 * small to cook from, and a genuinely long recipe is better off spilling over.
 */
const COMFORTABLE_ZOOM = 0.8

export interface FittedRender {
  pdf: Buffer
  zoom: number
  pages: number
}

/**
 * The window's own backgroundColor is composited into the PDF, and it lands in
 * the margin band — outside the document, where no stylesheet can reach it. A
 * themed window therefore prints a coloured border around the content. Swapping
 * it to white for the duration leaves the margin blank, as it should be.
 *
 * `restoreBackground` is the colour to put back afterwards: the renderer keeps
 * main informed of the current theme's surface colour.
 */
export async function renderFitted(
  window: BrowserWindow,
  restoreBackground: string
): Promise<FittedRender> {
  const contents = window.webContents
  window.setBackgroundColor('#ffffff')

  const seen = new Map<number, { pdf: Buffer; pages: number }>()
  const renderAt = async (index: number): Promise<{ pdf: Buffer; pages: number }> => {
    const cached = seen.get(index)
    if (cached) return cached
    await setPrintZoom(contents, ZOOM_LADDER[index])
    const pdf = await contents.printToPDF(PDF_OPTIONS)
    const result = { pdf, pages: countPages(pdf) }
    seen.set(index, result)
    return result
  }

  try {
    /*
     * Binary search for the largest rung that still fits on one page. Fitting
     * is monotonic — if it fits at some zoom it fits at every smaller one — so
     * ~5 renders settle a 19-step ladder, against 19 for a linear walk.
     */
    let low = 0
    let high = ZOOM_LADDER.length - 1
    let best = -1

    while (low <= high) {
      const middle = (low + high) >> 1
      const { pages } = await renderAt(middle)
      if (pages <= 1) {
        best = middle
        low = middle + 1
      } else {
        high = middle - 1
      }
    }

    if (best >= 0) {
      const { pdf } = await renderAt(best)
      return { pdf, zoom: ZOOM_LADDER[best], pages: 1 }
    }

    // Too long for one page even at the smallest step.
    const fallback = ZOOM_LADDER.indexOf(COMFORTABLE_ZOOM)
    const { pdf, pages } = await renderAt(fallback)
    return { pdf, zoom: COMFORTABLE_ZOOM, pages }
  } finally {
    window.setBackgroundColor(restoreBackground)
  }
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
