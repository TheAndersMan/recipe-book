import { useMemo, useState, type JSX } from 'react'
import type { RecipeSummary } from '../../../shared/types'

interface Props {
  summaries: RecipeSummary[]
  selectedId: string | null
  onSelect: (id: string) => void
  onOpenSettings: () => void
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
        <button className="icon-button" onClick={onOpenSettings} title="Settings">
          ⚙
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
