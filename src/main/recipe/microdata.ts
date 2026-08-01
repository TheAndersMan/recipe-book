import type * as cheerio from 'cheerio'
import { formatDuration, splitBlob, stripHtml } from './html'
import type { RawRecipe } from './jsonld'

/**
 * schema.org microdata — the pre-JSON-LD way of marking up a recipe. Only old
 * blogs still lean on it, but it costs little to check before paying for a
 * model call.
 */
export function fromMicrodata($: cheerio.CheerioAPI): RawRecipe | undefined {
  const scope = $('[itemtype*="schema.org/Recipe" i]').first()
  if (!scope.length) return undefined

  const prop = (name: string): string[] =>
    scope
      .find(`[itemprop="${name}" i]`)
      .toArray()
      .map((el) => {
        const $el = $(el)
        const meta = $el.attr('content') ?? $el.attr('datetime')
        return stripHtml(meta ?? $el.text())
      })
      .filter(Boolean)

  const first = (name: string): string | undefined => prop(name)[0]

  /**
   * Instructions are often one blob with <br> or <li> separating the steps.
   * Read the markup rather than .text(), so splitBlob still sees the breaks.
   */
  const rawProp = (name: string): string[] =>
    scope
      .find(`[itemprop="${name}" i]`)
      .toArray()
      .map((el) => $(el).html() ?? '')
      .filter(Boolean)

  const ingredients = [...prop('recipeIngredient'), ...prop('ingredients')].flatMap(splitBlob)
  const instructions = rawProp('recipeInstructions').flatMap(splitBlob)
  if (!ingredients.length && !instructions.length) return undefined

  const image = scope.find('[itemprop="image" i]').first()

  return {
    title: first('name'),
    description: first('description'),
    ingredients,
    instructions,
    prepTime: formatDuration(first('prepTime')),
    cookTime: formatDuration(first('cookTime')),
    totalTime: formatDuration(first('totalTime')),
    yield: first('recipeYield'),
    imageUrl: image.attr('src') ?? image.attr('content'),
    author: first('author'),
    tags: [...prop('recipeCategory'), ...prop('recipeCuisine')].slice(0, 8)
  }
}
