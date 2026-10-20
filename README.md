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

### Instagram

Reels and posts take their own path, since Instagram never carries structured
data and the ladder above cannot possibly match. The recipe, when there is one,
is in the caption.

Instagram does not put the caption in the HTML it serves a browser — it is
rendered client-side behind a login wall. It *does* put the full caption in an
`og:description` meta tag for link-preview crawlers, which is how a shared link
shows a snippet in a chat app. `src/main/recipe/instagram.ts` asks for the page
as `facebookexternalhit/1.1` and reads that tag. No cookies, no session, no
headless browser.

The caption then goes to Claude like any pasted text. If there is no recipe in
it — plenty of creators say "recipe in bio" — the first link in the caption is
followed back through the normal ladder, which usually lands on the creator's
own blog post and gets a better result than the caption would have.

The source is recorded as the creator's handle (`@someone`) rather than their
display name, because the handle is what takes you back to the account.

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

The filename is the recipe's id, derived from its title. **Retitling a recipe
in the app moves the file** so the two don't drift apart — the new file is
written before the old one is removed, and a title that would collide with an
existing recipe gets a numeric suffix rather than overwriting it. Nothing else
references ids, so this is safe.

## Organizing

**Folders** are a `folder:` line in the frontmatter, not directories on disk.
That keeps recipe ids stable (they're the filename), keeps the directory flat
and greppable, and means a folder is just a value a recipe carries.

The consequence worth knowing: there is nothing to create or delete. A folder
exists because some recipe names it, and it's gone once none do. Renaming one
across recipes is a find-and-replace in your editor, and it'll be picked up on
the next read.

**Favorites** are `favorite: true`, written only when set so unstarred files
stay clean. Starred recipes are pinned to a section at the top of the sidebar
*and* still listed in their folder — starring shouldn't make a recipe vanish
from where you filed it.

**Sorting** (recently added / title / quickest first) is in the sidebar and
persists in settings. Sorting by time parses the stored human strings
("1 hr 37 min", "45") back into minutes; anything unparseable ("overnight")
sorts last rather than pretending to be zero. See `renderer/src/sorting.ts`.

## The API key

Stored encrypted via Electron's `safeStorage`, which on macOS is backed by the
login Keychain. It never lands in a recipe file and is never sent to the
renderer — the UI only learns whether one exists.

## Scaling

A row of steps under the recipe meta (half, 1x, 1.5x, double, triple) rescales
the displayed amounts. It is display-only: the stored markdown always holds the
original, so there is no state to get wrong and nothing to undo. Opening an
ingredient or instruction editor snaps back to 1x, since the editor shows what
is on disk.

The whole problem is telling a quantity from a number that merely looks like
one. `src/shared/scale.ts` scales a number only when it is the leading quantity
of an ingredient line, or is directly followed by a unit of measure. Time,
temperature and length are deliberately not units, which is what keeps these
intact:

- `1 cup warm water ((105 degrees F))` - the 105
- `Heat 1 1/2 inches of oil ... to 375 degrees` - both numbers
- `Air fry for 4-5 minutes`
- `2 (10 oz each) chicken breasts` - the per-item size, flagged by "each"

A parenthetical that restates the amount does scale (`1/2 cup (2.5 oz) flour`),
and ranges scale on both ends. Input may be `1/4`, a vulgar fraction, `1 1/2`
or a decimal; output is snapped to the nearest eighth and rendered as a proper
fraction. Units agree with the new amount (`2 teaspoons` halved is
`1 teaspoon`), with abbreviations left alone - depluralising `tsp` gives `tp`.
Ingredient nouns are not pluralised, so halving `2 eggs` reads `1 eggs`;
guessing plurals for arbitrary nouns is wrong more often than it is right.

A scaled printout carries a `Scaled 2x` badge, so a page that came off the
printer at double says so.

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
accent be the only colour on screen.

### Deriving colours for dark themes

A palette that reads well in light mode does not survive being dropped onto a
dark surface. Three values are recomputed rather than reused:

- **`--accent`** is lifted toward white on dark themes. The raw hex sinks into a
  dark background, leaving small accent-coloured text (source links, ingredient
  group headings) barely above the readable threshold.
- **`--on-accent`** is whichever of white / near-black actually contrasts with
  the accent, rather than an assumed white. A lifted accent is light enough that
  white on it falls to ~3.7:1, so the primary button flips to dark text on dark
  themes.
- **`--danger`** is lifted the same way. The light-mode red on a dark card is
  2.5:1 — effectively unreadable.

The check that matters is the worst case across all 5 themes × 7 accent presets,
not the default pairing. Every element clears 4.5:1 there; body text clears 13:1.

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

## License

MIT. See [LICENSE](LICENSE).
