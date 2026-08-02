import type * as cheerio from 'cheerio'
import { collapse, formatDuration, pickYield, splitBlob, stripHtml } from './html'

/**
 * schema.org/Recipe embedded as JSON-LD. Google requires it for the recipe
 * rich-result card, so nearly every recipe site ships it — this rung of the
 * ladder handles the large majority of URLs on its own.
 */

type Json = Record<string, unknown>

export interface RawRecipe {
  title?: string
  description?: string
  ingredients: string[]
  instructions: string[]
  prepTime?: string
  cookTime?: string
  totalTime?: string
  yield?: string
  imageUrl?: string
  author?: string
  tags: string[]
}

export function fromJsonLd($: cheerio.CheerioAPI): RawRecipe | undefined {
  const node = findRecipeNode($)
  if (!node) return undefined

  const ingredients = toStringList(node.recipeIngredient ?? node.ingredients).flatMap(splitBlob)
  const instructions = flattenInstructions(node.recipeInstructions)
  if (!ingredients.length && !instructions.length) return undefined

  return {
    title: textOf(node.name) || undefined,
    description: textOf(node.description) || undefined,
    ingredients,
    instructions,
    prepTime: formatDuration(node.prepTime),
    cookTime: formatDuration(node.cookTime),
    totalTime: formatDuration(node.totalTime),
    yield: pickYield(toStringList(node.recipeYield)),
    imageUrl: imageUrl(node.image),
    author: authorName(node.author),
    tags: tags(node)
  }
}

function findRecipeNode($: cheerio.CheerioAPI): Json | undefined {
  const found: Json[] = []

  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text().trim()
    if (!raw) return
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      // Some sites emit JSON-LD with trailing commas or stray control chars.
      try {
        parsed = JSON.parse(sanitize(raw))
      } catch {
        return
      }
    }
    collectRecipes(parsed, found)
  })

  return found[0]
}

/** Last-ditch cleanup for JSON-LD that isn't quite valid JSON. */
function sanitize(raw: string): string {
  const controls = new RegExp(`[${String.fromCharCode(0)}-${String.fromCharCode(31)}]+`, 'g')
  return raw.replace(controls, ' ').replace(/,\s*([}\]])/g, '$1')
}

function collectRecipes(node: unknown, out: Json[], depth = 0): void {
  if (!node || depth > 6) return
  if (Array.isArray(node)) {
    for (const child of node) collectRecipes(child, out, depth + 1)
    return
  }
  if (typeof node !== 'object') return

  const obj = node as Json
  if (typeList(obj['@type']).includes('recipe')) out.push(obj)

  for (const key of ['@graph', 'mainEntity', 'mainEntityOfPage', 'itemListElement']) {
    if (key in obj) collectRecipes(obj[key], out, depth + 1)
  }
}

function typeList(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : [value]
  return raw
    .filter((v): v is string => typeof v === 'string')
    .map((v) => v.split('/').pop()!.toLowerCase())
}

function textOf(value: unknown): string {
  if (typeof value === 'string') return stripHtml(value)
  if (Array.isArray(value)) return textOf(value[0])
  if (value && typeof value === 'object') {
    const obj = value as Json
    if (typeof obj.text === 'string') return stripHtml(obj.text)
    if (typeof obj.name === 'string') return stripHtml(obj.name)
  }
  return ''
}

function toStringList(value: unknown): string[] {
  if (!value) return []
  const raw = Array.isArray(value) ? value : [value]
  return raw.map(textOf).filter(Boolean)
}

function flattenInstructions(raw: unknown): string[] {
  const out: string[] = []

  const visit = (node: unknown, depth: number): void => {
    if (!node || depth > 5) return
    if (Array.isArray(node)) {
      for (const child of node) visit(child, depth + 1)
      return
    }
    if (typeof node === 'string') {
      out.push(...splitBlob(node))
      return
    }
    if (typeof node !== 'object') return

    const obj = node as Json
    if (typeList(obj['@type']).includes('howtosection')) {
      const name = textOf(obj.name)
      if (name) out.push(`# ${name}`)
      visit(obj.itemListElement ?? obj.steps, depth + 1)
      return
    }

    const text = textOf(obj)
    if (text) out.push(...splitBlob(text))
  }

  visit(raw, 0)
  return out
}

function imageUrl(value: unknown): string | undefined {
  if (!value) return undefined
  if (typeof value === 'string') return value.trim() || undefined
  if (Array.isArray(value)) return imageUrl(value[0])
  if (typeof value === 'object') {
    const obj = value as Json
    if (typeof obj.url === 'string') return obj.url.trim() || undefined
    if (Array.isArray(obj.url)) return imageUrl(obj.url[0])
  }
  return undefined
}

function authorName(value: unknown): string | undefined {
  const name = textOf(value)
  return name || undefined
}

function tags(node: Json): string[] {
  const raw = [
    ...toStringList(node.recipeCategory),
    ...toStringList(node.recipeCuisine),
    ...toStringList(node.keywords)
  ]

  const split = raw.flatMap((entry) => entry.split(',')).map(collapse).filter(Boolean)
  const seen = new Set<string>()
  return split
    .filter((tag) => {
      const key = tag.toLowerCase()
      if (seen.has(key) || tag.length > 40) return false
      seen.add(key)
      return true
    })
    .slice(0, 8)
}
