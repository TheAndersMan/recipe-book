import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import yaml from 'js-yaml'
import { headingText, isHeading, type Recipe, type RecipeSummary } from '../../shared/types'

/**
 * Recipes live as markdown files with YAML frontmatter — greppable, printable,
 * editable in any editor, and they outlive this app. The file on disk is the
 * source of truth; there is no database.
 */

interface Frontmatter {
  title?: string
  source_url?: string
  source_name?: string
  image_url?: string
  yield?: string
  prep_time?: string
  cook_time?: string
  total_time?: string
  tags?: string[]
  saved_at?: string
  extracted_by?: string
}

export class RecipeStore {
  constructor(private dir: string) {}

  setDir(dir: string): void {
    this.dir = dir
  }

  getDir(): string {
    return this.dir
  }

  private async ensureDir(): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true })
  }

  private pathFor(id: string): string {
    if (!/^[a-z0-9-]+$/.test(id)) throw new Error(`Invalid recipe id: ${id}`)
    return join(this.dir, `${id}.md`)
  }

  async list(): Promise<RecipeSummary[]> {
    await this.ensureDir()
    const entries = await fs.readdir(this.dir)
    const summaries: RecipeSummary[] = []

    for (const entry of entries) {
      if (!entry.endsWith('.md')) continue
      try {
        const recipe = await this.read(entry.replace(/\.md$/, ''))
        summaries.push({
          id: recipe.id,
          title: recipe.title,
          sourceName: recipe.sourceName,
          totalTime: recipe.totalTime,
          tags: recipe.tags,
          savedAt: recipe.savedAt
        })
      } catch {
        // A hand-edited file that no longer parses shouldn't break the list.
      }
    }

    return summaries.sort((a, b) => b.savedAt.localeCompare(a.savedAt))
  }

  async read(id: string): Promise<Recipe> {
    const raw = await fs.readFile(this.pathFor(id), 'utf8')
    return parseMarkdown(raw, id)
  }

  /** Saves under a fresh, non-colliding id derived from the title. */
  async create(recipe: Omit<Recipe, 'id'>): Promise<Recipe> {
    await this.ensureDir()
    const id = await this.uniqueId(slugify(recipe.title))
    const full: Recipe = { ...recipe, id }
    await fs.writeFile(this.pathFor(id), toMarkdown(full), 'utf8')
    return full
  }

  /** Overwrites in place, keeping the existing id. */
  async update(recipe: Recipe): Promise<Recipe> {
    await this.ensureDir()
    await fs.writeFile(this.pathFor(recipe.id), toMarkdown(recipe), 'utf8')
    return recipe
  }

  async remove(id: string): Promise<void> {
    await fs.rm(this.pathFor(id), { force: true })
  }

  private async uniqueId(base: string): Promise<string> {
    let candidate = base
    let n = 2
    while (await exists(join(this.dir, `${candidate}.md`))) {
      candidate = `${base}-${n++}`
    }
    return candidate
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await fs.access(path)
    return true
  } catch {
    return false
  }
}

export function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '')
  return slug || 'recipe'
}

export function toMarkdown(recipe: Recipe): string {
  const frontmatter: Frontmatter = {
    title: recipe.title,
    source_url: recipe.sourceUrl,
    source_name: recipe.sourceName,
    image_url: recipe.imageUrl,
    yield: recipe.yield,
    prep_time: recipe.prepTime,
    cook_time: recipe.cookTime,
    total_time: recipe.totalTime,
    tags: recipe.tags.length ? recipe.tags : undefined,
    saved_at: recipe.savedAt,
    extracted_by: recipe.extractedBy
  }

  for (const key of Object.keys(frontmatter) as (keyof Frontmatter)[]) {
    if (frontmatter[key] === undefined) delete frontmatter[key]
  }

  const head = yaml.dump(frontmatter, { lineWidth: 0, quotingType: '"' }).trimEnd()
  const body: string[] = [`---\n${head}\n---`, '']

  if (recipe.description) body.push(recipe.description, '')

  body.push('## Ingredients', '')
  body.push(...listBlock(recipe.ingredients, 'bullet'))
  body.push('')

  body.push('## Instructions', '')
  body.push(...listBlock(recipe.instructions, 'ordered'))

  if (recipe.notes) body.push('', '## Notes', '', recipe.notes)

  return `${body.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`
}

function listBlock(entries: string[], style: 'bullet' | 'ordered'): string[] {
  const out: string[] = []
  let n = 1

  for (const entry of entries) {
    const flat = entry.replace(/\s*\n\s*/g, ' ').trim()
    if (!flat) continue

    if (isHeading(flat)) {
      if (out.length) out.push('')
      out.push(`### ${headingText(flat)}`, '')
      n = 1
      continue
    }

    out.push(style === 'ordered' ? `${n++}. ${flat}` : `- ${flat}`)
  }

  return out
}

export function parseMarkdown(raw: string, id: string): Recipe {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw)
  const frontmatter: Frontmatter = match ? ((yaml.load(match[1]) as Frontmatter) ?? {}) : {}
  const body = match ? match[2] : raw

  const sections = splitSections(body)

  return {
    id,
    title: frontmatter.title?.trim() || id,
    description: sections.intro || undefined,
    ingredients: parseList(sections.Ingredients ?? ''),
    instructions: parseList(sections.Instructions ?? ''),
    prepTime: frontmatter.prep_time,
    cookTime: frontmatter.cook_time,
    totalTime: frontmatter.total_time,
    yield: frontmatter.yield,
    sourceUrl: frontmatter.source_url,
    sourceName: frontmatter.source_name,
    imageUrl: frontmatter.image_url,
    notes: sections.Notes || undefined,
    tags: Array.isArray(frontmatter.tags) ? frontmatter.tags.map(String) : [],
    savedAt: frontmatter.saved_at ?? new Date(0).toISOString(),
    extractedBy: (frontmatter.extracted_by as Recipe['extractedBy']) ?? 'manual'
  }
}

/** Splits the body on `## ` headings; text before the first one is the intro. */
function splitSections(body: string): Record<string, string> {
  const sections: Record<string, string> = {}
  let current = 'intro'
  let buffer: string[] = []

  const flush = (): void => {
    sections[current] = buffer.join('\n').trim()
    buffer = []
  }

  for (const line of body.split(/\r?\n/)) {
    const heading = /^##\s+(.+?)\s*$/.exec(line)
    if (heading) {
      flush()
      current = heading[1]
      continue
    }
    buffer.push(line)
  }
  flush()

  return sections
}

function parseList(section: string): string[] {
  const out: string[] = []

  for (const line of section.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) continue

    const heading = /^###\s+(.+)$/.exec(trimmed)
    if (heading) {
      out.push(`# ${heading[1].trim()}`)
      continue
    }

    out.push(trimmed.replace(/^(?:\d+[.)]|[-*])\s+/, ''))
  }

  return out
}
