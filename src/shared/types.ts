/**
 * Shared between main and renderer. Keep this free of Node/Electron imports.
 *
 * Entries in `ingredients` and `instructions` that start with "#" are group
 * headings ("# For the glaze"), not steps. Everything downstream — rendering,
 * markdown serialization — keys off that.
 */

export type ExtractionMethod = 'json-ld' | 'microdata' | 'claude' | 'manual'

export interface Recipe {
  id: string
  title: string
  description?: string
  ingredients: string[]
  instructions: string[]
  prepTime?: string
  cookTime?: string
  totalTime?: string
  yield?: string
  sourceUrl?: string
  sourceName?: string
  imageUrl?: string
  notes?: string
  tags: string[]
  savedAt: string
  extractedBy: ExtractionMethod
}

export interface RecipeSummary {
  id: string
  title: string
  sourceName?: string
  totalTime?: string
  tags: string[]
  savedAt: string
}

export type ThemeName = 'paper' | 'linen' | 'slate' | 'night' | 'midnight'
export type RecipeFont = 'serif' | 'sans'

export interface Appearance {
  theme: ThemeName
  /** Hex, e.g. "#9a4f2b". Everything tinted derives from this. */
  accent: string
  recipeFont: RecipeFont
  /** Multiplier on recipe prose sizes. 1 is the design default. */
  textScale: number
}

export const DEFAULT_APPEARANCE: Appearance = {
  theme: 'paper',
  accent: '#9a4f2b',
  recipeFont: 'serif',
  textScale: 1
}

export interface Settings {
  hasApiKey: boolean
  recipesDir: string
  model: string
  appearance: Appearance
}

export interface ExportResult {
  path: string
  pages: number
}

export interface ImportResult {
  recipe: Recipe
  method: ExtractionMethod
  /** Set when a lower rung of the ladder was reached and it's worth saying why. */
  note?: string
}

export function isHeading(entry: string): boolean {
  return entry.trimStart().startsWith('#')
}

export function headingText(entry: string): string {
  return entry.trimStart().replace(/^#+\s*/, '')
}
