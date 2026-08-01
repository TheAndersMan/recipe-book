import * as cheerio from 'cheerio'

/** Tags that never contain recipe prose — dropped before we read page text. */
const CHROME = 'script, style, noscript, iframe, svg, nav, header, footer, aside, form, button, template'

export function stripHtml(value: string): string {
  if (!value.includes('<') && !value.includes('&')) return collapse(value)
  const $ = cheerio.load(`<div id="__x">${value}</div>`)
  return collapse($('#__x').text())
}

export function collapse(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

/**
 * Visible page text, for the Claude fallback. Ads and cookie banners survive
 * this, which is fine — the model ignores them. The point is to cut the page
 * down to something worth sending.
 */
export function pageText($: cheerio.CheerioAPI, limit = 40_000): string {
  const $body = $('body').clone()
  $body.find(CHROME).remove()

  const text = $body
    .text()
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')

  return text.length > limit ? `${text.slice(0, limit)}\n\n[truncated]` : text
}

export function siteName($: cheerio.CheerioAPI, url?: string): string | undefined {
  const meta = $('meta[property="og:site_name"]').attr('content')?.trim()
  if (meta) return meta
  if (!url) return undefined
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return undefined
  }
}

/** ISO 8601 duration ("PT1H30M") to something a human reads ("1 hr 30 min"). */
export function formatDuration(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const raw = value.trim()
  if (!raw) return undefined

  const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:\d+(?:\.\d+)?S)?)?$/.exec(raw)
  if (!match) return raw // already human-written, e.g. "about 40 minutes"

  const [, days, hours, minutes] = match
  const parts: string[] = []
  if (days) parts.push(`${days} day${days === '1' ? '' : 's'}`)
  if (hours) parts.push(`${hours} hr`)
  if (minutes) parts.push(`${minutes} min`)
  return parts.length ? parts.join(' ') : undefined
}

/** Split a blob that packed several steps into one string. */
export function splitBlob(value: string): string[] {
  const text = stripHtmlPreservingBreaks(value)
  const lines = text
    .split(/\r?\n+/)
    .map((line) => line.replace(/^\s*(?:\d+[.)]|[-*•])\s*/, '').trim())
    .filter(Boolean)
  return lines.length ? lines : []
}

function stripHtmlPreservingBreaks(value: string): string {
  if (!value.includes('<')) return value
  const withBreaks = value
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/\s*(p|li|div|h[1-6])\s*>/gi, '\n')
  const $ = cheerio.load(`<div id="__x">${withBreaks}</div>`)
  return $('#__x').text()
}
