import Anthropic from '@anthropic-ai/sdk'
import type { RawRecipe } from './jsonld'

/**
 * The bottom rung of the ladder: hand the page text to Claude and get back a
 * structured recipe. Catches sites with no markup at all, and doubles as the
 * paste-the-text path for paywalled or bot-blocked pages.
 */

const SYSTEM = `You extract recipes from web page text into structured data.

Rules:
- Copy ingredients and steps as written. Do not rewrite, reorder, convert units, or add your own.
- Drop the blog preamble, ads, comments, navigation, and "jump to recipe" chrome.
- If the page groups ingredients or steps under subheadings ("For the sauce"),
  emit that subheading as its own array entry prefixed with "# ".
- Combine a step split across sentences only when the source clearly meant one step.
- Put anything the author flagged as a tip, substitution, or storage advice in notes.
- If the text has no actual recipe in it (a paywall, an error page, a list of
  links, an article that only mentions food), set found to false and leave the
  other fields empty.`

const SCHEMA = {
  type: 'object',
  properties: {
    found: {
      type: 'boolean',
      description: 'Whether the text actually contains a recipe with ingredients and steps.'
    },
    title: { type: 'string' },
    description: { type: 'string', description: 'One or two sentences, or empty.' },
    ingredients: {
      type: 'array',
      items: { type: 'string' },
      description: 'One ingredient per entry, exactly as written. "# Name" marks a group heading.'
    },
    instructions: {
      type: 'array',
      items: { type: 'string' },
      description: 'One step per entry, unnumbered. "# Name" marks a group heading.'
    },
    prepTime: { type: 'string', description: 'e.g. "20 min". Empty if not stated.' },
    cookTime: { type: 'string' },
    totalTime: { type: 'string' },
    yield: { type: 'string', description: 'e.g. "4 servings", "24 cookies".' },
    notes: { type: 'string', description: 'Tips, substitutions, storage. Empty if none.' },
    tags: {
      type: 'array',
      items: { type: 'string' },
      description: 'Up to 6 short tags: course, cuisine, key technique.'
    }
  },
  required: ['found', 'title', 'ingredients', 'instructions', 'tags'],
  additionalProperties: false
} as const

interface Extracted {
  found: boolean
  title: string
  description?: string
  ingredients: string[]
  instructions: string[]
  prepTime?: string
  cookTime?: string
  totalTime?: string
  yield?: string
  notes?: string
  tags: string[]
}

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

export class NoRecipeFoundError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NoRecipeFoundError'
  }
}

export async function fromClaude(
  text: string,
  options: { apiKey: string; model: string; sourceUrl?: string }
): Promise<RawRecipe & { notes?: string }> {
  const client = new Anthropic({ apiKey: options.apiKey })

  const preamble = options.sourceUrl ? `Source URL: ${options.sourceUrl}\n\n` : ''

  const response = await client.messages.create({
    model: options.model,
    max_tokens: 16_000,
    system: SYSTEM,
    output_config: {
      effort: 'low',
      format: { type: 'json_schema', schema: SCHEMA }
    },
    messages: [
      {
        role: 'user',
        content: `${preamble}Extract the recipe from this page text:\n\n${text}`
      }
    ]
  })

  if (response.stop_reason === 'refusal') {
    throw new Error('Claude declined to process this page.')
  }

  const block = response.content.find((entry) => entry.type === 'text')
  if (!block || block.type !== 'text') {
    throw new Error('Claude returned no extraction. Try again, or paste the recipe text.')
  }

  let parsed: Extracted
  try {
    parsed = JSON.parse(block.text) as Extracted
  } catch {
    throw new Error('Claude returned malformed output. Try again.')
  }

  if (!parsed.found || (!parsed.ingredients?.length && !parsed.instructions?.length)) {
    throw new NoRecipeFoundError(
      'No recipe found on that page. If it is paywalled or blocked, copy the recipe text and paste it instead.'
    )
  }

  return {
    title: clean(parsed.title),
    description: clean(parsed.description),
    ingredients: (parsed.ingredients ?? []).map((s) => s.trim()).filter(Boolean),
    instructions: (parsed.instructions ?? []).map((s) => s.trim()).filter(Boolean),
    prepTime: clean(parsed.prepTime),
    cookTime: clean(parsed.cookTime),
    totalTime: clean(parsed.totalTime),
    yield: clean(parsed.yield),
    notes: clean(parsed.notes),
    tags: (parsed.tags ?? []).map((s) => s.trim()).filter(Boolean).slice(0, 8)
  }
}
