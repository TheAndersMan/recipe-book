import * as cheerio from 'cheerio'
import type { ExtractionMethod, Recipe } from '../../shared/types'
import { fromClaude, NoRecipeFoundError } from './claude'
import { collapse, normalizeYield, pageText, siteName } from './html'
import { fromJsonLd, type RawRecipe } from './jsonld'
import { fromMicrodata } from './microdata'

/**
 * A desktop browser UA. Not evasion — plenty of sites serve a stripped or
 * empty page to an unrecognized client, and we want the same HTML a person
 * would see.
 */
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

export interface ExtractOptions {
  apiKey?: string
  model: string
}

export interface Extraction {
  recipe: Omit<Recipe, 'id'>
  method: ExtractionMethod
  note?: string
}

export async function extractFromUrl(url: string, options: ExtractOptions): Promise<Extraction> {
  const normalized = normalizeUrl(url)
  const html = await fetchPage(normalized)
  const $ = cheerio.load(html)

  const structured = fromJsonLd($)
  if (structured) {
    return { recipe: assemble(structured, $, normalized, 'json-ld'), method: 'json-ld' }
  }

  const microdata = fromMicrodata($)
  if (microdata) {
    return { recipe: assemble(microdata, $, normalized, 'microdata'), method: 'microdata' }
  }

  if (!options.apiKey) {
    throw new Error(
      'That page has no structured recipe data, so it needs the Claude fallback. Add an API key in Settings, or paste the recipe text instead.'
    )
  }

  const text = pageText($)
  if (collapse(text).length < 200) {
    throw new NoRecipeFoundError(
      'That page returned almost no text — it is probably paywalled or rendered entirely in JavaScript. Paste the recipe text instead.'
    )
  }

  const raw = await fromClaude(text, {
    apiKey: options.apiKey,
    model: options.model,
    sourceUrl: normalized
  })

  return {
    recipe: { ...assemble(raw, $, normalized, 'claude'), notes: raw.notes },
    method: 'claude',
    note: 'No structured recipe data on that page, so this one went through Claude — worth a quick read to check it.'
  }
}

export async function extractFromText(
  text: string,
  options: ExtractOptions & { sourceUrl?: string }
): Promise<Extraction> {
  if (!options.apiKey) {
    throw new Error('Pasted text is read by Claude. Add an API key in Settings first.')
  }
  if (collapse(text).length < 40) {
    throw new Error('That looks too short to be a recipe.')
  }

  const raw = await fromClaude(text, {
    apiKey: options.apiKey,
    model: options.model,
    sourceUrl: options.sourceUrl
  })

  const sourceUrl = options.sourceUrl ? normalizeUrl(options.sourceUrl) : undefined

  return {
    recipe: {
      title: raw.title?.trim() || 'Untitled recipe',
      description: raw.description,
      ingredients: raw.ingredients,
      instructions: raw.instructions,
      prepTime: raw.prepTime,
      cookTime: raw.cookTime,
      totalTime: raw.totalTime,
      yield: normalizeYield(raw.yield),
      sourceUrl,
      sourceName: sourceUrl ? hostOf(sourceUrl) : undefined,
      notes: raw.notes,
      tags: raw.tags,
      favorite: false,
      savedAt: new Date().toISOString(),
      extractedBy: 'claude'
    },
    method: 'claude'
  }
}

function assemble(
  raw: RawRecipe,
  $: cheerio.CheerioAPI,
  url: string,
  method: ExtractionMethod
): Omit<Recipe, 'id'> {
  const title =
    raw.title?.trim() ||
    collapse($('meta[property="og:title"]').attr('content') ?? '') ||
    collapse($('title').first().text()) ||
    'Untitled recipe'

  const image =
    raw.imageUrl?.trim() || $('meta[property="og:image"]').attr('content')?.trim() || undefined

  return {
    title,
    description: raw.description,
    ingredients: raw.ingredients,
    instructions: raw.instructions,
    prepTime: raw.prepTime,
    cookTime: raw.cookTime,
    totalTime: raw.totalTime,
    yield: raw.yield,
    sourceUrl: url,
    sourceName: siteName($, url) ?? hostOf(url),
    imageUrl: image && /^https?:\/\//i.test(image) ? image : undefined,
    tags: raw.tags,
    favorite: false,
    savedAt: new Date().toISOString(),
    extractedBy: method
  }
}

async function fetchPage(url: string): Promise<string> {
  let response: Response
  try {
    response = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(25_000),
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    })
  } catch (error) {
    const reason = error instanceof Error && error.name === 'TimeoutError' ? 'timed out' : 'failed'
    throw new Error(`Fetching that page ${reason}. Check the URL, or paste the recipe text instead.`)
  }

  if (!response.ok) {
    const hint =
      response.status === 403 || response.status === 401
        ? ' The site is blocking automated requests — paste the recipe text instead.'
        : ''
    throw new Error(`That page returned ${response.status}.${hint}`)
  }

  return response.text()
}

function normalizeUrl(input: string): string {
  const trimmed = input.trim()
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  let parsed: URL
  try {
    parsed = new URL(withScheme)
  } catch {
    throw new Error(`"${input}" is not a valid URL.`)
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http and https URLs are supported.')
  }
  // Strip the tracking junk that comes with a shared link.
  for (const key of [...parsed.searchParams.keys()]) {
    if (/^(utm_|fbclid|gclid|mc_|ref$|source$)/i.test(key)) parsed.searchParams.delete(key)
  }
  return parsed.toString()
}

function hostOf(url: string): string | undefined {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return undefined
  }
}
