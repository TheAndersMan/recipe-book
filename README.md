# Recipe Book

Paste a recipe URL, get a clean single page. No ads, no life story, no cookie
banner. Recipes are saved as markdown files you own.

## Running it

```bash
npm install
npm run dev
```

To build a real `.app` in `release/`:

```bash
npm run package
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

## Printing

`Cmd+P` on any recipe. The print stylesheet drops the sidebar, import bar, and
buttons, collapses to a single column, and avoids breaking mid-step — that's the
path to a physical book later.

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
