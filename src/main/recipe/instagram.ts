import * as cheerio from 'cheerio'
import { collapse } from './html'

/**
 * Instagram reels and posts.
 *
 * The page itself is a JavaScript shell — fetched with a browser user agent it
 * carries no meta tags at all, which is why a normal extraction finds nothing.
 * Fetched as a crawler it returns the OpenGraph tags that power link previews,
 * and `og:description` holds the entire caption. For a recipe reel that caption
 * is usually the recipe, quantities and all.
 *
 * This is undocumented behaviour rather than an API, so it can change. Nothing
 * here logs in or defeats a paywall: it asks for the same preview data any
 * chat app requests when you paste a link, and private accounts stay private.
 */

/** Instagram serves the preview tags to link-preview crawlers, not browsers. */
const CRAWLER_USER_AGENT = 'facebookexternalhit/1.1'

export interface InstagramPost {
  /** The caption, with Instagram's engagement preamble removed. */
  caption: string
  /** Poster's display name, e.g. "Caitlyn Sullivan". */
  author?: string
  imageUrl?: string
  /** Non-Instagram links found in the caption, in order of appearance. */
  links: string[]
}

export function isInstagramUrl(url: string): boolean {
  try {
    const { hostname, pathname } = new URL(url)
    if (!/(^|\.)instagram\.com$/i.test(hostname)) return false
    // Handles /reel/ID, /p/ID, /tv/ID, and the /username/reel/ID form.
    return /\/(reel|reels|p|tv)\/[^/]+/i.test(pathname)
  } catch {
    return false
  }
}

export async function fetchInstagramPost(url: string): Promise<InstagramPost> {
  let response: Response
  try {
    response = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(25_000),
      headers: {
        'User-Agent': CRAWLER_USER_AGENT,
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    })
  } catch (error) {
    const reason = error instanceof Error && error.name === 'TimeoutError' ? 'timed out' : 'failed'
    throw new Error(`Fetching that Instagram post ${reason}. Paste the caption text instead.`)
  }

  if (!response.ok) throw new Error(`Instagram returned ${response.status} for that post.`)

  const $ = cheerio.load(await response.text())
  const meta = (property: string): string | undefined =>
    $(`meta[property="${property}"]`).attr('content')?.trim() || undefined

  const description = meta('og:description')
  if (!description) {
    throw new Error(
      'Instagram returned no caption for that post — it may be private, deleted, or from an account that blocks previews. Paste the caption text instead.'
    )
  }

  const caption = stripPreamble(description)

  return {
    caption,
    author: authorFrom(meta('og:title'), description),
    imageUrl: meta('og:image'),
    links: linksIn(caption)
  }
}

/**
 * Captions arrive wrapped in engagement chrome:
 *   `44K likes, 1,505 comments - handle on August 6, 2026: "the caption". `
 * Strip it so the model sees the caption alone — the counts and date are noise
 * that only invite the model to treat them as part of the recipe.
 */
export function stripPreamble(description: string): string {
  let text = description.trim()

  const preamble = /^[\d.,KkMm]+\s+likes?,\s+[\d.,KkMm]+\s+comments?\s+-\s+[^:]{1,120}:\s*/
  text = text.replace(preamble, '')

  // What remains is normally the caption in double quotes, then a stray period.
  const quoted = /^"([\s\S]*)"\s*\.?\s*$/.exec(text)
  if (quoted) text = quoted[1]

  return text.trim()
}

/**
 * Display name, preferred over the handle — "Caitlyn Sullivan" reads better in
 * a recipe list than "cookingwithcaitlynskitchen". Falls back to the handle.
 */
function authorFrom(title: string | undefined, description: string): string | undefined {
  const named = title && /^(.+?)\s+on Instagram\s*:/.exec(title)
  if (named) {
    const name = collapse(named[1])
    if (name) return name
  }
  const handle = /-\s+([A-Za-z0-9._]+)\s+on\s+\w+\s+\d/.exec(description)
  return handle ? handle[1] : undefined
}

/**
 * Creators who don't put the recipe in the caption often link it instead
 * ("Recipe: https://..."), which the normal extractor can then read properly.
 */
export function linksIn(caption: string): string[] {
  const found = caption.match(/https?:\/\/[^\s"'<>)\]]+/gi) ?? []
  const cleaned = found
    .map((link) => link.replace(/[.,;:]+$/, ''))
    .filter((link) => {
      try {
        return !/(^|\.)(instagram\.com|instagr\.am)$/i.test(new URL(link).hostname)
      } catch {
        return false
      }
    })
  return [...new Set(cleaned)]
}
