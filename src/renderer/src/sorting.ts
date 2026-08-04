import type { RecipeSummary, SortMode } from '../../shared/types'

/**
 * Total times are stored as the human strings the source used ("1 hr 37 min",
 * "about 40 minutes"), so sorting by time means reading them back. Anything
 * unparseable sorts last rather than pretending to be zero.
 */
export function minutesOf(text: string | undefined): number | null {
  if (!text) return null

  let total = 0
  let matched = false

  for (const [, amount, unit] of text.matchAll(/(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours|m|min|mins|minute|minutes|d|day|days)\b/gi)) {
    const value = Number(amount)
    const kind = unit.toLowerCase()
    matched = true
    if (kind.startsWith('d')) total += value * 1440
    else if (kind.startsWith('h')) total += value * 60
    else total += value
  }

  if (matched) return total

  // A lone number, e.g. "45" — treat as minutes.
  const bare = /^\s*(\d+(?:\.\d+)?)\s*$/.exec(text)
  return bare ? Number(bare[1]) : null
}

export function sortSummaries(items: RecipeSummary[], mode: SortMode): RecipeSummary[] {
  const byTitle = (a: RecipeSummary, b: RecipeSummary): number =>
    a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })

  const sorted = [...items]

  switch (mode) {
    case 'title':
      return sorted.sort(byTitle)

    case 'time':
      return sorted.sort((a, b) => {
        const left = minutesOf(a.totalTime)
        const right = minutesOf(b.totalTime)
        if (left === null && right === null) return byTitle(a, b)
        if (left === null) return 1
        if (right === null) return -1
        return left === right ? byTitle(a, b) : left - right
      })

    case 'recent':
    default:
      return sorted.sort((a, b) => b.savedAt.localeCompare(a.savedAt) || byTitle(a, b))
  }
}

export interface Group {
  key: string
  label: string
  items: RecipeSummary[]
}

/**
 * Favourites are pinned at the top *and* left in their folder — starring a
 * recipe shouldn't make it vanish from where you filed it.
 */
export function groupSummaries(items: RecipeSummary[]): Group[] {
  const groups: Group[] = []

  const favorites = items.filter((item) => item.favorite)
  if (favorites.length) groups.push({ key: '__favorites', label: 'Favorites', items: favorites })

  const folders = new Map<string, RecipeSummary[]>()
  const unfiled: RecipeSummary[] = []

  for (const item of items) {
    if (!item.folder) unfiled.push(item)
    else folders.set(item.folder, [...(folders.get(item.folder) ?? []), item])
  }

  for (const name of [...folders.keys()].sort((a, b) => a.localeCompare(b))) {
    groups.push({ key: `folder:${name}`, label: name, items: folders.get(name)! })
  }

  // Only call it "Unfiled" when there are folders to be unfiled from.
  if (unfiled.length) {
    groups.push({
      key: '__unfiled',
      label: folders.size ? 'Unfiled' : 'All recipes',
      items: unfiled
    })
  }

  return groups
}
