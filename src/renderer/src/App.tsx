import { useCallback, useEffect, useState, type JSX } from 'react'
import type { ImportResult, Recipe, RecipeSummary, Settings } from '../../shared/types'
import ImportBar from './components/ImportBar'
import RecipeView from './components/RecipeView'
import SettingsPanel from './components/SettingsPanel'
import Sidebar from './components/Sidebar'
import { applyAppearance } from './theme'

export interface Notice {
  tone: 'note' | 'error'
  text: string
  /** Optional button on the right of the banner, e.g. "Open in Preview". */
  action?: { label: string; path: string }
}

export default function App(): JSX.Element {
  const [summaries, setSummaries] = useState<RecipeSummary[]>([])
  const [selected, setSelected] = useState<Recipe | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [banner, setBanner] = useState<Notice | null>(null)

  const refresh = useCallback(async () => {
    setSummaries(await window.api.recipes.list())
  }, [])

  useEffect(() => {
    void (async () => {
      const loaded = await window.api.settings.get()
      applyAppearance(loaded.appearance)
      setSettings(loaded)
      await refresh()
      // No key and nothing saved yet — send them to settings on first run.
      if (!loaded.hasApiKey) setShowSettings(true)
    })()
  }, [refresh])

  const select = useCallback(async (id: string) => {
    setBanner(null)
    setSelected(await window.api.recipes.get(id))
  }, [])

  const onImported = useCallback(
    async (result: ImportResult) => {
      await refresh()
      setSelected(result.recipe)
      setBanner(result.note ? { tone: 'note', text: result.note } : null)
    },
    [refresh]
  )

  const onDelete = useCallback(
    async (id: string) => {
      await window.api.recipes.remove(id)
      setSelected((current) => (current?.id === id ? null : current))
      await refresh()
    },
    [refresh]
  )

  const onSave = useCallback(
    async (recipe: Recipe) => {
      const saved = await window.api.recipes.save(recipe)
      setSelected(saved)
      await refresh()
    },
    [refresh]
  )

  return (
    <div className="app">
      {/* Content fills the frameless window, so the top strip has to opt into
          being a drag handle or there's nothing to grab the window by. */}
      <div className="titlebar no-print" />

      <Sidebar
        summaries={summaries}
        selectedId={selected?.id ?? null}
        onSelect={select}
        onOpenSettings={() => setShowSettings(true)}
      />

      <main className="main">
        <div className="no-print">
          <ImportBar
            hasApiKey={settings?.hasApiKey ?? false}
            onImported={onImported}
            onError={(text) => setBanner({ tone: 'error', text })}
          />
          {banner && (
            <div className={`banner banner--${banner.tone}`}>
              <span className="banner__text">{banner.text}</span>
              {banner.action && (
                <button
                  className="banner__action"
                  onClick={() => void window.api.openPath(banner.action!.path)}
                >
                  {banner.action.label}
                </button>
              )}
              <button className="banner__close" onClick={() => setBanner(null)} aria-label="Dismiss">
                ×
              </button>
            </div>
          )}
        </div>

        {selected ? (
          <RecipeView
            recipe={selected}
            onDelete={onDelete}
            onSave={onSave}
            onNotice={(notice) => setBanner(notice)}
          />
        ) : (
          <EmptyState count={summaries.length} />
        )}
      </main>

      {showSettings && settings && (
        <SettingsPanel
          settings={settings}
          onClose={() => setShowSettings(false)}
          onChange={async (patch) => {
            const next = await window.api.settings.set(patch)
            applyAppearance(next.appearance)
            setSettings(next)
            await refresh()
          }}
        />
      )}
    </div>
  )
}

function EmptyState({ count }: { count: number }): JSX.Element {
  return (
    <div className="empty">
      <h1>Recipe Book</h1>
      <p>
        {count === 0
          ? 'Paste a recipe URL above. The recipe gets pulled out and saved as a clean page — no ads, no life story.'
          : 'Pick a recipe from the list, or paste a new URL above.'}
      </p>
    </div>
  )
}
