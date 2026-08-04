import { useMemo, useState, type JSX } from 'react'
import { SORT_LABELS, type RecipeSummary, type SortMode } from '../../../shared/types'
import { groupSummaries, sortSummaries } from '../sorting'

interface Props {
  summaries: RecipeSummary[]
  selectedId: string | null
  sort: SortMode
  onSelect: (id: string) => void
  onSort: (sort: SortMode) => void
  onToggleFavorite: (id: string, favorite: boolean) => void
  onOpenSettings: () => void
}

/** Sliders glyph — reads as settings and stays crisp, unlike the ⚙ character. */
function SettingsIcon(): JSX.Element {
  return (
    <svg width="17" height="17" viewBox="0 0 16 16" aria-hidden="true">
      <g stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none">
        <line x1="2.25" y1="5" x2="13.75" y2="5" />
        <line x1="2.25" y1="11" x2="13.75" y2="11" />
      </g>
      <circle cx="6" cy="5" r="2.1" fill="currentColor" />
      <circle cx="10.4" cy="11" r="2.1" fill="currentColor" />
    </svg>
  )
}

function StarIcon({ filled }: { filled: boolean }): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M8 1.6l1.85 3.9 4.15.6-3 3 .71 4.3L8 11.4 4.29 13.4 5 9.1 2 6.1l4.15-.6z"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export default function Sidebar({
  summaries,
  selectedId,
  sort,
  onSelect,
  onSort,
  onToggleFavorite,
  onOpenSettings
}: Props): JSX.Element {
  const [query, setQuery] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const matching = needle
      ? summaries.filter((summary) =>
          [summary.title, summary.sourceName ?? '', summary.folder ?? '', ...summary.tags]
            .join(' ')
            .toLowerCase()
            .includes(needle)
        )
      : summaries
    return groupSummaries(sortSummaries(matching, sort))
  }, [summaries, query, sort])

  const toggleGroup = (key: string): void =>
    setCollapsed((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const matched = groups.reduce((count, group) => count + group.items.length, 0)

  return (
    <aside className="sidebar no-print">
      <div className="sidebar__head">
        <span className="sidebar__title">Recipes</span>
        <button
          className="icon-button"
          onClick={onOpenSettings}
          title="Settings"
          aria-label="Settings"
        >
          <SettingsIcon />
        </button>
      </div>

      <input
        className="sidebar__search"
        type="search"
        placeholder="Search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />

      <select
        className="sidebar__sort"
        value={sort}
        aria-label="Sort recipes"
        onChange={(event) => onSort(event.target.value as SortMode)}
      >
        {(Object.keys(SORT_LABELS) as SortMode[]).map((mode) => (
          <option key={mode} value={mode}>
            {SORT_LABELS[mode]}
          </option>
        ))}
      </select>

      {groups.map((group) => {
        const isCollapsed = collapsed.has(group.key)
        return (
          <section className="group" key={group.key}>
            <button
              className={`group__head${isCollapsed ? ' group__head--collapsed' : ''}`}
              onClick={() => toggleGroup(group.key)}
            >
              <span className="group__caret" aria-hidden="true">
                ›
              </span>
              <span className="group__label">{group.label}</span>
              <span className="group__count">{group.items.length}</span>
            </button>

            {!isCollapsed && (
              <ul className="sidebar__list">
                {group.items.map((summary) => (
                  <li
                    key={summary.id}
                    className={`recipe-chip${summary.id === selectedId ? ' recipe-chip--active' : ''}`}
                  >
                    <button className="recipe-chip__main" onClick={() => onSelect(summary.id)}>
                      <span className="recipe-chip__title">{summary.title}</span>
                      <span className="recipe-chip__meta">
                        {[summary.sourceName, summary.totalTime].filter(Boolean).join(' · ')}
                      </span>
                    </button>
                    <button
                      className={`recipe-chip__star${summary.favorite ? ' recipe-chip__star--on' : ''}`}
                      title={summary.favorite ? 'Remove from favorites' : 'Add to favorites'}
                      aria-label={summary.favorite ? 'Remove from favorites' : 'Add to favorites'}
                      onClick={() => onToggleFavorite(summary.id, !summary.favorite)}
                    >
                      <StarIcon filled={summary.favorite} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )
      })}

      {summaries.length > 0 && matched === 0 && (
        <p className="sidebar__empty">Nothing matches “{query}”.</p>
      )}
      {summaries.length === 0 && <p className="sidebar__empty">No recipes saved yet.</p>}
    </aside>
  )
}
