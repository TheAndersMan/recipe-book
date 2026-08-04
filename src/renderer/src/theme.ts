import type { Appearance, ThemeName } from '../../shared/types'

/**
 * Themes set base surfaces and ink; the accent is chosen separately and every
 * tint derived from it. Applied as CSS custom properties on :root, so the
 * stylesheet stays declarative and print can override with !important.
 */

interface Palette {
  paper: string
  card: string
  sidebar: string
  chipHover: string
  ink: string
  inkSoft: string
  line: string
  dark: boolean
}

export const THEMES: Record<ThemeName, Palette & { label: string }> = {
  paper: {
    label: 'Paper',
    paper: '#fbf9f6',
    card: '#ffffff',
    sidebar: '#f6f2ec',
    chipHover: '#ece4d9',
    ink: '#23201c',
    inkSoft: '#6b635a',
    line: '#e5ded4',
    dark: false
  },
  linen: {
    label: 'Linen',
    paper: '#f2ece1',
    card: '#fbf7ef',
    sidebar: '#e9e1d3',
    chipHover: '#ddd2c0',
    ink: '#2e2820',
    inkSoft: '#71685a',
    line: '#dbd0be',
    dark: false
  },
  slate: {
    label: 'Slate',
    paper: '#f4f5f7',
    card: '#ffffff',
    sidebar: '#eaecf0',
    chipHover: '#dde0e6',
    ink: '#1e2229',
    inkSoft: '#646c7a',
    line: '#dde0e6',
    dark: false
  },
  /*
   * The darks are deliberately neutral-to-cool. An earlier warm-brown dark
   * muddied everything: the surfaces sat close to the terracotta accent in hue,
   * so nothing stood out. Keeping the surfaces desaturated lets the accent read
   * as the only colour on screen.
   */
  night: {
    label: 'Night',
    paper: '#111113',
    card: '#1a1a1d',
    sidebar: '#0c0c0e',
    chipHover: '#26262b',
    ink: '#f2f2f5',
    inkSoft: '#a3a3ad',
    line: '#2d2d33',
    dark: true
  },
  midnight: {
    label: 'Midnight',
    paper: '#0a1120',
    card: '#111c31',
    sidebar: '#060b16',
    chipHover: '#1c2b45',
    ink: '#e7eefb',
    inkSoft: '#8da3c4',
    line: '#22344f',
    dark: true
  }
}

export const ACCENT_SWATCHES = [
  '#9a4f2b',
  '#8a5a2b',
  '#4f6b45',
  '#3f6382',
  '#6a4a7c',
  '#a33a4e',
  '#4a4a4a'
]

const FONT_STACKS = {
  serif: `'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif`,
  sans: `-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', sans-serif`
}

export function applyAppearance(appearance: Appearance): void {
  const theme = THEMES[appearance.theme] ?? THEMES.paper
  const accent = normalizeHex(appearance.accent) ?? '#9a4f2b'
  const root = document.documentElement.style

  root.setProperty('--paper', theme.paper)
  root.setProperty('--card', theme.card)
  root.setProperty('--sidebar', theme.sidebar)
  root.setProperty('--chip-hover', theme.chipHover)
  root.setProperty('--ink', theme.ink)
  root.setProperty('--ink-soft', theme.inkSoft)
  root.setProperty('--line', theme.line)

  // On dark surfaces the accent has to be lifted well clear of the background,
  // or small accent-coloured text (source links, group headings) sits barely
  // above the readable threshold.
  const accentOnSurface = theme.dark ? mix(accent, '#ffffff', 0.36) : accent
  root.setProperty('--accent', accentOnSurface)

  // Tinted chip backgrounds: mostly the card colour, a little accent.
  const accentSoft = mix(accent, theme.card, theme.dark ? 0.68 : 0.86)
  root.setProperty('--accent-soft', accentSoft)

  // Text on those chips — step numbers, time pills. Plain white on a dark
  // theme; on light themes white would vanish, so darken the accent instead.
  root.setProperty('--accent-ink', theme.dark ? '#ffffff' : mix(accent, '#000000', 0.14))

  /*
   * Label for the disabled primary button. Off-white rather than the full
   * white used on live chips — enough to read clearly, soft enough to say the
   * button isn't ready. Light themes keep a dark label; off-white would vanish
   * on a near-white chip.
   */
  root.setProperty('--on-accent-soft', theme.dark ? '#e8e1da' : bestForegroundOn(accentSoft))

  /*
   * Filled-button background. Saturation is pushed up so the primary action
   * reads as the strongest thing on screen, then darkened if needed until
   * white text on it clears 4.5:1 — that keeps the label white for any accent
   * the user picks, including a pale custom hex.
   */
  root.setProperty('--accent-strong', strongAccent(accent))

  // Destructive actions. The light-mode red is unreadable on a dark card
  // (2.5:1); dark themes get a bright saturated red instead.
  root.setProperty('--danger', theme.dark ? DANGER_DARK : DANGER)

  root.setProperty('--font-recipe', FONT_STACKS[appearance.recipeFont] ?? FONT_STACKS.serif)
  root.setProperty('--text-scale', String(clampScale(appearance.textScale)))

  // Lets native widgets (scrollbars, form controls) match the theme.
  document.documentElement.style.colorScheme = theme.dark ? 'dark' : 'light'

  // Keep the native window surface in step, so resizes don't flash the wrong
  // colour. Main also needs this value to restore after printing, where the
  // window background has to be white — see pdf.ts.
  void window.api?.setWindowBackground(theme.paper)
}

/** Destructive-action red: deep on light surfaces, bright on dark ones. */
const DANGER = '#a33224'
const DANGER_DARK = '#ff4136'

function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}

function contrastRatio(a: string, b: string): number {
  const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x)
  return (lighter + 0.05) / (darker + 0.05)
}

/** Whichever of white / near-black is more readable on the given colour. */
function bestForegroundOn(background: string): string {
  const dark = '#17120f'
  return contrastRatio('#ffffff', background) >= contrastRatio(dark, background) ? '#ffffff' : dark
}

/**
 * A punchier version of the accent for filled buttons: more saturated, then
 * darkened only as far as it takes for white text to stay legible on it.
 */
function strongAccent(accent: string): string {
  const [h, s, l] = toHsl(accent)
  let colour = fromHsl(h, Math.min(1, s * 1.3), l)

  // Bounded loop — each step is a fixed 6% toward black, so it terminates.
  for (let i = 0; i < 12 && contrastRatio('#ffffff', colour) < 4.5; i++) {
    colour = mix(colour, '#000000', 0.06)
  }
  return colour
}

function toHsl(hex: string): [number, number, number] {
  const [r, g, b] = parseHex(hex).map((c) => c / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const lightness = (max + min) / 2
  const delta = max - min

  if (delta === 0) return [0, 0, lightness]

  const saturation = delta / (1 - Math.abs(2 * lightness - 1))
  let hue: number
  if (max === r) hue = ((g - b) / delta) % 6
  else if (max === g) hue = (b - r) / delta + 2
  else hue = (r - g) / delta + 4

  return [((hue * 60) + 360) % 360, saturation, lightness]
}

function fromHsl(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2

  const [r, g, b] =
    h < 60 ? [c, x, 0]
    : h < 120 ? [x, c, 0]
    : h < 180 ? [0, c, x]
    : h < 240 ? [0, x, c]
    : h < 300 ? [x, 0, c]
    : [c, 0, x]

  return `#${[r, g, b]
    .map((channel) => Math.round((channel + m) * 255).toString(16).padStart(2, '0'))
    .join('')}`
}

function clampScale(value: number): number {
  if (!Number.isFinite(value)) return 1
  return Math.min(Math.max(value, 0.85), 1.4)
}

export function normalizeHex(value: string): string | null {
  const raw = value.trim().replace(/^#/, '')
  const full =
    raw.length === 3
      ? raw
          .split('')
          .map((c) => c + c)
          .join('')
      : raw
  return /^[0-9a-f]{6}$/i.test(full) ? `#${full.toLowerCase()}` : null
}

/** Blend `colour` toward `toward` by `amount` (1 = fully `toward`). */
function mix(colour: string, toward: string, amount: number): string {
  const a = parseHex(colour)
  const b = parseHex(toward)
  const out = a.map((channel, i) => Math.round(channel + (b[i] - channel) * amount))
  return `#${out.map((c) => c.toString(16).padStart(2, '0')).join('')}`
}

function parseHex(value: string): [number, number, number] {
  const hex = normalizeHex(value) ?? '#000000'
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16)
  ]
}
