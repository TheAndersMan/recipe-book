import { useMemo, useState, type JSX } from 'react'
import type { RecipeSummary } from '../../../shared/types'

interface Props {
  summaries: RecipeSummary[]
  selectedId: string | null
  onSelect: (id: string) => void
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

export default function Sidebar({
  summaries,
  selectedId,
  onSelect,
  onOpenSettings
}: Props): JSX.Element {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return summaries
    return summaries.filter((summary) =>
      [summary.title, summary.sourceName ?? '', ...summary.tags]
        .join(' ')
        .toLowerCase()
        .includes(needle)
    )
  }, [summaries, query])

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

      <ul className="sidebar__list">
        {filtered.map((summary) => (
          <li key={summary.id}>
            <button
              className={`recipe-chip${summary.id === selectedId ? ' recipe-chip--active' : ''}`}
              onClick={() => onSelect(summary.id)}
            >
              <span className="recipe-chip__title">{summary.title}</span>
              <span className="recipe-chip__meta">
                {[summary.sourceName, summary.totalTime].filter(Boolean).join(' · ')}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {summaries.length > 0 && filtered.length === 0 && (
        <p className="sidebar__empty">Nothing matches “{query}”.</p>
      )}
      {summaries.length === 0 && <p className="sidebar__empty">No recipes saved yet.</p>}
    </aside>
  )
}
