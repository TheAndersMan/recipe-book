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
  night: {
    label: 'Night',
    paper: '#191715',
    card: '#232019',
    sidebar: '#141210',
    chipHover: '#2f2a23',
    ink: '#ece6dc',
    inkSoft: '#a2988a',
    line: '#38322a',
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

  root.setProperty('--accent', accent)
  // Tinted chip backgrounds: mostly the card colour, a little accent.
  root.setProperty('--accent-soft', mix(accent, theme.card, theme.dark ? 0.78 : 0.86))
  // Text sitting on those chips needs to move away from the surface, not toward it.
  root.setProperty(
    '--accent-ink',
    theme.dark ? mix(accent, '#ffffff', 0.45) : mix(accent, '#000000', 0.14)
  )

  root.setProperty('--font-recipe', FONT_STACKS[appearance.recipeFont] ?? FONT_STACKS.serif)
  root.setProperty('--text-scale', String(clampScale(appearance.textScale)))

  // Lets native widgets (scrollbars, form controls) match the theme.
  document.documentElement.style.colorScheme = theme.dark ? 'dark' : 'light'

  // Keep the native window surface in step, so resizes don't flash the wrong
  // colour. Main also needs this value to restore after printing, where the
  // window background has to be white — see pdf.ts.
  void window.api?.setWindowBackground(theme.paper)
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
