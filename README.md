# Recipe Book

Paste a recipe URL, get a clean single page. No ads, no life story, no cookie
banner. Recipes are saved as markdown files you own.

## Running it

Day to day, launch **Recipe Book** from Applications like any other app.

To work on it:

```bash
npm install
npm run dev
```

To rebuild the installable app after changes:

```bash
npm run package
```

That writes `release/Recipe Book-<version>-arm64.dmg` plus an unpacked
`release/mac-arm64/Recipe Book.app`. Install by dragging from the dmg, or:

```bash
rm -rf "/Applications/Recipe Book.app" && cp -R "release/mac-arm64/Recipe Book.app" /Applications/
```

The build is unsigned (`identity: null`), which is fine for a local install. If
macOS ever refuses to open it after the file has been through a download or
AirDrop, clear the quarantine flag:

```bash
xattr -dr com.apple.quarantine "/Applications/Recipe Book.app"
```

The packaged app and `npm run dev` share the same settings and recipe folder, so
your API key carries over between them.

## The icon

Generated procedurally by `scripts/make-icon.mjs` — no image editor or asset
pipeline needed. The `PALETTE` object at the top of that file is the only thing
to touch for a restyle; shapes are signed-distance functions, so everything
stays crisp at every size.

```bash
npm run icon    # re-renders build/icon.iconset and packs build/icon.icns
```

## How extraction works

Three rungs, tried in order. Most URLs stop at the first.

1. **JSON-LD** (`src/main/recipe/jsonld.ts`) — nearly every recipe site embeds
   `schema.org/Recipe` as JSON-LD, because Google requires it for the recipe
   rich-result card. This is a deterministic parse: no model, no cost, instant.
   Handles the shapes real sites emit — `@graph` wrappers, `HowToSection` /
   `HowToStep`, `ImageObject`, ISO 8601 durations, HTML inside description
   fields.
2. **Microdata** (`microdata.ts`) — the pre-JSON-LD markup. Only old blogs still
   use it, but it's cheap to check.
3. **Claude** (`claude.ts`) — page text goes to the API with a JSON schema, and
   a structured recipe comes back. Catches sites with no markup at all. Runs at
   `effort: low` since extraction is not a reasoning-heavy task. Requires an API
   key; recipes that come through this path are flagged in the UI as worth a
   glance.

**Paste fallback.** Paywalled (NYT Cooking) and Cloudflare-protected sites won't
serve the page. Copy the recipe text, hit *Paste text*, and it goes straight to
rung 3.

## Storage

One markdown file per recipe in the recipe folder (default
`~/Development/recipe-book/recipes`, changeable in Settings):

```markdown
---
title: "Brown Butter Chocolate Chip Cookies"
source_url: "https://..."
total_time: "1 hr 37 min"
tags: [Dessert, brown butter]
---

## Ingredients

### For the dough

- 2 sticks unsalted butter

## Instructions

1. Melt the butter...
```

The file is the source of truth — there's no database. Edit them by hand, grep
them, put them in git, sync them. `### ` inside a section is a group heading
("For the glaze") and round-trips correctly.

## The API key

Stored encrypted via Electron's `safeStorage`, which on macOS is backed by the
login Keychain. It never lands in a recipe file and is never sent to the
renderer — the UI only learns whether one exists.

## Printing and PDF

`Cmd+P` prints; **Save PDF** writes the same layout to a file. Both run through
the one print stylesheet at the bottom of `styles.css`, which drops the sidebar,
import bar, and buttons, tightens the type, keeps ingredients and steps
side-by-side, and avoids breaking mid-step. PDF export uses Electron's
`printToPDF` under print emulation, so what you get is exactly what `Cmd+P`
would produce — there's no second layout to keep in sync.

### Filling exactly one page

Recipes are scaled to use as much of a single sheet as they can — up as well as
down. A short recipe at screen size would otherwise sit in the top third of the
page.

Rather than estimating heights, `src/main/pdf.ts` uses `printToPDF` itself as
the oracle: render, count the pages in the returned bytes, adjust, repeat. A
render takes a couple hundred milliseconds and the answer is exact — no guessing
about how text reflows at a different scale.

The knob is a CSS `zoom` on `.recipe` that only applies under `@media print`.
`zoom` affects layout (unlike `transform: scale()`), so pagination respects it,
and because it's print-only the value can just be left set afterwards.

`ZOOM_LADDER` runs 0.62 → 1.75, and the search is a **binary search for the
largest rung that still fits on one page**. Fitting is monotonic — if it fits at
some zoom it fits at every smaller one — so ~5 renders settle a 19-step ladder
instead of 19. In practice the two sample recipes land at 1.46 and 1.75 and
cover ~86% of the sheet, against 91% available after margins.

If even the smallest rung overflows, it settles at `COMFORTABLE_ZOOM` (0.8) and
runs to two pages. Both the ladder and that floor are constants at the top of
`pdf.ts`.

### Print is its own theme

Print and PDF are always ink on white, whatever the app is set to on screen —
including font and text size, so a "Largest" reading preference doesn't change
how much fits on a sheet. That's the `:root` block inside `@media print`, where
every declaration needs `!important`: the theme writes live values as inline
styles on `:root`, and only `!important` in a stylesheet outranks an inline
declaration.

### Two ways a theme colour leaks into the margins

Both produce the same symptom — a coloured border around the white content area
of an exported PDF — and neither is reachable from the recipe's own styles. If
that border ever comes back, it's one of these.

**1. The colour scheme.** `theme.ts` sets `color-scheme: dark` for dark themes,
and with `printBackground` enabled Chromium paints the page canvas from it. The
print block pins `color-scheme: light !important` to stop that.

**2. The window's own background.** `BrowserWindow`'s `backgroundColor` is
composited into the PDF, and it shows through in the margin band, which sits
outside the document entirely — no stylesheet can reach it. `renderFitted()`
swaps the window to white for the duration of the render and restores the themed
colour afterwards. The renderer tells main which colour that is via
`window:setBackground` whenever the appearance changes, so the two stay in step.

With both handled, the margin band comes out with alpha 0 — genuinely blank, so
it takes no ink.

## Theming

Settings → Appearance: theme (Paper, Linen, Slate, Night, Midnight), accent
colour (seven presets or any hex), recipe font (serif/sans), and text size.

The two dark themes keep their surfaces desaturated — neutral charcoal for
Night, blue for Midnight. An earlier warm-brown dark sat close to the terracotta
accent in hue and made everything look muddy; keeping surfaces neutral lets the
accent be the only colour on screen. On dark themes the accent is also lifted
toward white before use, or it sinks into the background and reads as grey.

Everything routes through CSS custom properties. `src/renderer/src/theme.ts`
holds the theme palettes and derives the accent tints — `--accent-soft` for chip
backgrounds, `--accent-ink` for text on them — by blending toward the surface or
away from it depending on whether the theme is dark. All 28 theme × accent
combinations were checked to clear 4.5:1 contrast.

To add a theme, add an entry to `THEMES`; the union type in `shared/types.ts`
will tell you what else needs updating.

## Layout

```
src/
  main/            Node side: fetching, parsing, disk, API calls
    recipe/
      extract.ts   runs the ladder, normalizes URLs, fetches pages
      jsonld.ts    rung 1
      microdata.ts rung 2
      claude.ts    rung 3
      store.ts     markdown read/write
      html.ts      text extraction, duration formatting
    settings.ts    Keychain-backed config
    ipc.ts         the renderer's entire surface area
  preload/         contextBridge; unwraps {ok,value|error} into promises
  renderer/        React UI
  shared/types.ts  types both sides use
```

No HTTP server: Electron's main process is Node, so it fetches recipe pages
directly. CORS is a browser restriction and never enters the picture.
