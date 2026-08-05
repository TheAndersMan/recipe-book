import { useEffect, useState, type JSX } from 'react'
import { headingText, isHeading, type Recipe } from '../../../shared/types'
import type { Notice } from '../App'

function PencilIcon(): JSX.Element {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true" fill="none">
      <path
        d="M11.4 2.3l2.3 2.3-7.4 7.4-3 .7.7-3z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  )
}

interface Props {
  recipe: Recipe
  folders: string[]
  onDelete: (id: string) => void
  onSave: (recipe: Recipe) => void
  onNotice: (notice: Notice) => void
  onToggleFavorite: (id: string, favorite: boolean) => void
  onSetFolder: (id: string, folder: string | null) => void
}

export default function RecipeView({
  recipe,
  folders,
  onDelete,
  onSave,
  onNotice,
  onToggleFavorite,
  onSetFolder
}: Props): JSX.Element {
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [notes, setNotes] = useState(recipe.notes ?? '')
  const [editingNotes, setEditingNotes] = useState(false)
  const [busy, setBusy] = useState<'print' | 'pdf' | null>(null)
  const [folder, setFolder] = useState(recipe.folder ?? '')
  const [sourceName, setSourceName] = useState(recipe.sourceName ?? '')
  const [editingSource, setEditingSource] = useState(false)

  const fail = (error: unknown): void =>
    onNotice({ tone: 'error', text: error instanceof Error ? error.message : String(error) })

  // Reset per-recipe state whenever a different recipe is opened.
  useEffect(() => {
    setChecked(new Set())
    setNotes(recipe.notes ?? '')
    setEditingNotes(false)
    setFolder(recipe.folder ?? '')
    setSourceName(recipe.sourceName ?? '')
    setEditingSource(false)
  }, [recipe.id, recipe.notes, recipe.folder, recipe.sourceName])

  const commitSource = (): void => {
    setEditingSource(false)
    const next = sourceName.trim()
    if (next === (recipe.sourceName ?? '')) return
    onSave({ ...recipe, sourceName: next || undefined })
  }

  const commitFolder = (): void => {
    const next = folder.trim()
    if (next === (recipe.folder ?? '')) return
    onSetFolder(recipe.id, next || null)
  }

  const toggle = (index: number): void => {
    setChecked((current) => {
      const next = new Set(current)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  const meta = [
    recipe.prepTime && `Prep ${recipe.prepTime}`,
    recipe.cookTime && `Cook ${recipe.cookTime}`,
    recipe.totalTime && `Total ${recipe.totalTime}`,
    recipe.yield
  ].filter(Boolean) as string[]

  let stepNumber = 0

  return (
    <article className="recipe">
      <header className="recipe__header">
        <h1 className="recipe__title">{recipe.title}</h1>

        {/* Editable whether or not the recipe came with a source name — a
            pasted recipe has none, and sites often give an unhelpful one. */}
        <p className="recipe__source">
          {editingSource || !recipe.sourceName ? (
            <input
              className="source__input"
              value={sourceName}
              placeholder="Add a source"
              aria-label="Source name"
              spellCheck={false}
              autoFocus={editingSource}
              onChange={(event) => setSourceName(event.target.value)}
              onBlur={commitSource}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur()
                if (event.key === 'Escape') {
                  setSourceName(recipe.sourceName ?? '')
                  setEditingSource(false)
                }
              }}
            />
          ) : (
            <>
              {recipe.sourceUrl ? (
                <a
                  href={recipe.sourceUrl}
                  onClick={(event) => {
                    event.preventDefault()
                    void window.api.openExternal(recipe.sourceUrl!)
                  }}
                >
                  {recipe.sourceName}
                </a>
              ) : (
                <span className="source__name">{recipe.sourceName}</span>
              )}
              <button
                className="source__edit"
                onClick={() => setEditingSource(true)}
                title="Edit source name"
                aria-label="Edit source name"
              >
                <PencilIcon />
              </button>
            </>
          )}
        </p>

        {meta.length > 0 && (
          <ul className="recipe__meta">
            {meta.map((entry) => (
              <li key={entry}>{entry}</li>
            ))}
          </ul>
        )}

        {recipe.description && <p className="recipe__description">{recipe.description}</p>}

        <div className="recipe__filing no-print">
          <button
            className={`button button--star${recipe.favorite ? ' button--star-on' : ''}`}
            onClick={() => onToggleFavorite(recipe.id, !recipe.favorite)}
            title={recipe.favorite ? 'Remove from favorites' : 'Add to favorites'}
          >
            <span aria-hidden="true">{recipe.favorite ? '★' : '☆'}</span>
            {recipe.favorite ? 'Favorited' : 'Favorite'}
          </button>

          <label className="filing__folder">
            <span className="filing__label">Folder</span>
            <input
              className="filing__input"
              list="folder-names"
              placeholder="Unfiled"
              value={folder}
              spellCheck={false}
              onChange={(event) => setFolder(event.target.value)}
              onBlur={commitFolder}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur()
                if (event.key === 'Escape') setFolder(recipe.folder ?? '')
              }}
            />
            <datalist id="folder-names">
              {folders.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </label>
        </div>

        <div className="recipe__actions no-print">
          <button
            className="button"
            disabled={busy !== null}
            onClick={async () => {
              setBusy('print')
              try {
                // Size it to one page before handing off to the print dialog.
                await window.api.recipes.fitPrintZoom()
                window.print()
              } catch (error) {
                fail(error)
              } finally {
                setBusy(null)
              }
            }}
          >
            {busy === 'print' ? 'Preparing…' : 'Print'}
          </button>
          <button
            className="button"
            disabled={busy !== null}
            onClick={async () => {
              setBusy('pdf')
              try {
                const saved = await window.api.recipes.exportPdf(recipe.title)
                if (saved) {
                  onNotice({
                    tone: 'note',
                    text:
                      saved.pages > 1
                        ? `Saved as ${saved.pages} pages — this one is too long to fit on one.`
                        : 'Saved as a single page.',
                    action: { label: 'Open in Preview', path: saved.path }
                  })
                }
              } catch (error) {
                fail(error)
              } finally {
                setBusy(null)
              }
            }}
          >
            {busy === 'pdf' ? 'Saving…' : 'Save PDF'}
          </button>
          <button className="button" onClick={() => void window.api.recipes.reveal(recipe.id)}>
            Show file
          </button>
          <button
            className="button button--danger"
            onClick={() => {
              if (confirm(`Delete “${recipe.title}”? This removes the file from disk.`)) {
                onDelete(recipe.id)
              }
            }}
          >
            Delete
          </button>
        </div>
      </header>

      <div className="recipe__body">
        <section className="recipe__ingredients">
          <h2>Ingredients</h2>
          <ul className="ingredients">
            {recipe.ingredients.map((entry, index) =>
              isHeading(entry) ? (
                <li key={index} className="ingredients__group">
                  {headingText(entry)}
                </li>
              ) : (
                <li key={index}>
                  <label className={checked.has(index) ? 'ingredient ingredient--done' : 'ingredient'}>
                    <input
                      type="checkbox"
                      className="no-print"
                      checked={checked.has(index)}
                      onChange={() => toggle(index)}
                    />
                    <span>{entry}</span>
                  </label>
                </li>
              )
            )}
          </ul>
        </section>

        <section className="recipe__instructions">
          <h2>Instructions</h2>
          <ol className="steps">
            {recipe.instructions.map((entry, index) => {
              if (isHeading(entry)) {
                stepNumber = 0
                return (
                  <li key={index} className="steps__group">
                    {headingText(entry)}
                  </li>
                )
              }
              stepNumber += 1
              return (
                <li key={index} className="step">
                  <span className="step__number">{stepNumber}</span>
                  <span className="step__text">{entry}</span>
                </li>
              )
            })}
          </ol>
        </section>
      </div>

      {/* Kept on screen even when empty — that's where "Add notes" lives — but
          an empty heading is just clutter on paper. */}
      <section className={`recipe__notes${recipe.notes ? '' : ' no-print'}`}>
        <h2>Notes</h2>
        {editingNotes ? (
          <>
            <textarea
              className="notes__editor"
              value={notes}
              rows={6}
              onChange={(event) => setNotes(event.target.value)}
            />
            <div className="recipe__actions no-print">
              <button
                className="button button--primary"
                onClick={() => {
                  onSave({ ...recipe, notes: notes.trim() || undefined })
                  setEditingNotes(false)
                }}
              >
                Save notes
              </button>
              <button
                className="button"
                onClick={() => {
                  setNotes(recipe.notes ?? '')
                  setEditingNotes(false)
                }}
              >
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            {recipe.notes ? (
              <p className="notes__text">{recipe.notes}</p>
            ) : (
              <p className="notes__text notes__text--empty no-print">
                Nothing yet — add what you changed the last time you made this.
              </p>
            )}
            <div className="recipe__actions no-print">
              <button className="button" onClick={() => setEditingNotes(true)}>
                {recipe.notes ? 'Edit notes' : 'Add notes'}
              </button>
            </div>
          </>
        )}
      </section>
    </article>
  )
}
