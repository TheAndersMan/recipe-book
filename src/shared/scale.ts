/**
 * Scaling a recipe up or down.
 *
 * Purely a display transform — the stored recipe is always the original, so
 * halving a recipe and closing it loses nothing.
 *
 * The whole problem is telling a quantity from a number that merely looks like
 * one. "1 cup water ((105 degrees F))", "bake at 375 degrees", "4-5 minutes"
 * and "1 1/2 inches of oil" all contain numbers that must survive untouched,
 * so scaling only ever applies to a number that is either the leading quantity
 * of an ingredient or immediately followed by a unit of measure. Time,
 * temperature and length are deliberately not units.
 */

const UNICODE_FRACTIONS: Record<string, number> = {
  '¼': 1 / 4, '½': 1 / 2, '¾': 3 / 4, '⅐': 1 / 7, '⅑': 1 / 9, '⅒': 1 / 10,
  '⅓': 1 / 3, '⅔': 2 / 3, '⅕': 1 / 5, '⅖': 2 / 5, '⅗': 3 / 5, '⅘': 4 / 5,
  '⅙': 1 / 6, '⅚': 5 / 6, '⅛': 1 / 8, '⅜': 3 / 8, '⅝': 5 / 8, '⅞': 7 / 8
}

const FRACTION_CHARS = Object.keys(UNICODE_FRACTIONS).join('')

/** Volume, weight and countable packaging only — never time, heat or length. */
const UNITS =
  /^(?:cups?|tbsps?|tablespoons?|tsps?|teaspoons?|oz|ounces?|lbs?|pounds?|kgs?|kilograms?|grams?|g|mls?|milli(?:liters?|litres?)|liters?|litres?|l|quarts?|qts?|pints?|pts?|gallons?|sticks?|cloves?|cans?|jars?|packages?|pkgs?)$/i

/** A parenthetical marked "each" restates a per-item size, so it must not scale. */
const PER_ITEM = /\b(?:each|per|apiece)\b/i

/**
 * Units worth pluralising. Abbreviations are excluded on purpose — stripping a
 * trailing "s" from "tsp" gives "tp". Ingredient nouns are left alone too: "2
 * eggs" halved reads oddly as "1 eggs", but guessing plurals for arbitrary
 * nouns goes wrong far more often than it goes right.
 */
const PLURALISABLE =
  /^(?:cups?|tablespoons?|teaspoons?|pounds?|ounces?|cloves?|sticks?|cans?|jars?|packages?|quarts?|pints?|gallons?|liters?|litres?|grams?|kilograms?)$/i

/** Matches a unit word to the new amount: 1 teaspoon, 2 teaspoons. */
function agreeWord(word: string, value: number): string {
  if (!PLURALISABLE.test(word)) return word
  const singular = word.replace(/s$/i, '')
  // Recipes write "½ cup" and "1 cup", not "½ cups" — anything at or below one
  // takes the singular.
  return value <= 1.005 ? singular : `${singular}s`
}

/** Same, applied to whatever follows a quantity that has just been scaled. */
function agreeTail(tail: string, value: number): string {
  const following = /^(\s*)([A-Za-z]+)/.exec(tail)
  if (!following) return tail
  return following[1] + agreeWord(following[2], value) + tail.slice(following[0].length)
}

interface Quantity {
  value: number
  end: number
}

/** Reads a quantity starting exactly at `at`, or returns null. */
export function readQuantity(text: string, at: number): Quantity | null {
  const pattern = new RegExp(
    `(\\d+)\\s+(\\d+)\\/(\\d+)` +                 // 1 1/2
      `|(\\d+)\\s*([${FRACTION_CHARS}])` +        // 1½
      `|(\\d+)\\/(\\d+)` +                        // 1/2
      `|([${FRACTION_CHARS}])` +                  // ½
      `|(\\d+(?:[.,]\\d+)?)`,                     // 2 or 2.5
    'y'
  )
  pattern.lastIndex = at
  const m = pattern.exec(text)
  if (!m) return null

  let value: number
  if (m[1] !== undefined) value = Number(m[1]) + Number(m[2]) / Number(m[3])
  else if (m[4] !== undefined) value = Number(m[4]) + UNICODE_FRACTIONS[m[5]]
  else if (m[6] !== undefined) value = Number(m[6]) / Number(m[7])
  else if (m[8] !== undefined) value = UNICODE_FRACTIONS[m[8]]
  else value = Number(m[9].replace(',', '.'))

  if (!Number.isFinite(value)) return null
  return { value, end: at + m[0].length }
}

const NICE_FRACTIONS: [number, string][] = [
  [1 / 8, '⅛'], [1 / 4, '¼'], [1 / 3, '⅓'], [3 / 8, '⅜'], [1 / 2, '½'],
  [5 / 8, '⅝'], [2 / 3, '⅔'], [3 / 4, '¾'], [7 / 8, '⅞']
]

/** Renders a scaled amount the way a recipe would write it: 0.5 -> ½, 1.5 -> 1½. */
export function formatQuantity(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0'

  const whole = Math.floor(value + 1e-9)
  const remainder = value - whole
  if (remainder < 0.005) return String(whole)

  for (const [fraction, glyph] of NICE_FRACTIONS) {
    if (Math.abs(remainder - fraction) < 0.02) return whole ? `${whole}${glyph}` : glyph
  }

  return String(Math.round(value * 100) / 100)
}

/** Scales every number that is directly followed by a unit of measure. */
function scaleUnitQuantities(text: string, factor: number): string {
  let out = ''
  let i = 0

  while (i < text.length) {
    const quantity = readQuantity(text, i)
    if (quantity) {
      const following = /^(\s*)([A-Za-z]+)/.exec(text.slice(quantity.end))
      if (following && UNITS.test(following[2])) {
        const value = quantity.value * factor
        out += formatQuantity(value) + following[1] + agreeWord(following[2], value)
        i = quantity.end + following[0].length
        continue
      }
    }
    out += text[i]
    i += 1
  }

  return out
}

/**
 * Ingredients: the leading quantity (including a range like "3 to 4 cloves"),
 * plus any parenthetical that restates the amount — "1/2 cup (2.5 oz) flour" —
 * but not one that gives a per-item size, "2 (10 oz each) chicken breasts".
 */
export function scaleIngredient(line: string, factor: number): string {
  if (factor === 1) return line

  let text = line
  const leading = readQuantity(text, 0)

  if (leading) {
    const separator = /^\s*(?:-|–|—|to)\s*/.exec(text.slice(leading.end))
    const second = separator ? readQuantity(text, leading.end + separator[0].length) : null

    if (second) {
      const value = second.value * factor
      text =
        formatQuantity(leading.value * factor) +
        separator![0] +
        formatQuantity(value) +
        agreeTail(text.slice(second.end), value)
    } else {
      const value = leading.value * factor
      text = formatQuantity(value) + agreeTail(text.slice(leading.end), value)
    }
  }

  return text.replace(/\(([^()]*)\)/g, (whole, inner: string) =>
    PER_ITEM.test(inner) ? whole : `(${scaleUnitQuantities(inner, factor)})`
  )
}

/** Instructions: only amounts that carry a unit, so times and temperatures survive. */
export function scaleInstruction(line: string, factor: number): string {
  return factor === 1 ? line : scaleUnitQuantities(line, factor)
}

/** Yields are short and hold no temperatures, so every number in them scales. */
export function scaleYield(text: string | undefined, factor: number): string | undefined {
  if (!text || factor === 1) return text

  let out = ''
  let i = 0
  while (i < text.length) {
    const quantity = readQuantity(text, i)
    if (quantity) {
      out += formatQuantity(quantity.value * factor)
      i = quantity.end
      continue
    }
    out += text[i]
    i += 1
  }
  return out
}

/** Whether there is anything for scaling to act on. */
export function hasScalableQuantity(ingredients: string[]): boolean {
  return ingredients.some((line) => !line.trimStart().startsWith('#') && readQuantity(line, 0))
}

/** Shown as a label, e.g. 0.5 -> "½×". */
export function formatFactor(factor: number): string {
  return `${formatQuantity(factor)}×`
}
