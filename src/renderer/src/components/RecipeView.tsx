import { useEffect, useState, type JSX } from 'react'
import { headingText, isHeading, type Recipe } from '../../../shared/types'
import type { Notice } from '../App'
import {
  formatFactor,
  hasScalableQuantity,
  scaleIngredient,
  scaleInstruction,
  scaleYield
} from '../../../shared/scale'
import AutoTextarea from './AutoTextarea'

/** Offered scale factors. Half and double are the ones people actually want. */
const SCALE_STEPS = [0.5, 1, 1.5, 2, 3]

/** The two lists that can be edited as text. */
type ListField = 'ingredients' | 'instructions'

/**
 * At most one editor is open at a time. Opening a second would leave two sets
 * of unsaved edits on screen with no indication which Save applies to which.
 */
type EditTarget = 'title' | 'source' | 'description' | 'notes' | ListField | null

/**
 * Save / Cancel for every inline editor. Clicking away deliberately does
 * nothing: it reads as backing out, so treating it as a save loses edits the
 * other way round — an accidental change committed instead of discarded.
 */
function EditActions({
  onSave,
  onCancel,
  hint
}: {
  onSave: () => void
  onCancel: () => void
  hint?: JSX.Element
}): JSX.Element {
  return (
    <div className="edit-actions no-print">
      {/* mousedown default is what blurs the field; suppressing it means the
          click still lands on a focused editor. */}
      <button
        className="button button--primary button--small"
        onMouseDown={(event) => event.preventDefault()}
        onClick={onSave}
      >
        Save
      </button>
      <button
        className="button button--small"
        onMouseDown={(event) => event.preventDefault()}
        onClick={onCancel}
      >
        Cancel
      </button>
      {hint && <span className="edit-actions__hint">{hint}</span>}
    </div>
  )
}

/**
 * Lists are edited as plain text, one entry per line. It's the same shape as
 * the stored markdown, so deleting a whole section is selecting a few lines —
 * far quicker than per-row controls, and reordering comes free.
 */
function ListEditor({
  value,
  onChange,
  onCommit,
  onCancel,
  label
}: {
  value: string
  onChange: (value: string) => void
  onCommit: () => void
  onCancel: () => void
  label: string
}): JSX.Element {
  return (
    <div className="list-editor no-print">
      <AutoTextarea
        className="list-editor__input"
        value={value}
        ariaLabel={`${label}, one per line`}
        autoFocus
        onChange={onChange}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onCancel()
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) onCommit()
        }}
      />
      <EditActions
        onSave={onCommit}
        onCancel={onCancel}
        hint={
          <>
            One per line. Start a line with <code>#</code> for a heading.
          </>
        }
      />
    </div>
  )
}

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
  onRename: (id: string, title: string) => void
}

export default function RecipeView({
  recipe,
  folders,
  onDelete,
  onSave,
  onNotice,
  onToggleFavorite,
  onSetFolder,
  onRename
}: Props): JSX.Element {
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [busy, setBusy] = useState<'print' | 'pdf' | null>(null)
  const [folder, setFolder] = useState(recipe.folder ?? '')
  const [editing, setEditing] = useState<EditTarget>(null)
  /** Display-only: the stored recipe is always the original. */
  const [scale, setScale] = useState(1)

  // Drafts, all discarded whenever the open editor changes.
  const [notes, setNotes] = useState(recipe.notes ?? '')
  const [sourceName, setSourceName] = useState(recipe.sourceName ?? '')
  const [title, setTitle] = useState(recipe.title)
  const [description, setDescription] = useState(recipe.description ?? '')
  const [listText, setListText] = useState('')

  const fail = (error: unknown): void =>
    onNotice({ tone: 'error', text: error instanceof Error ? error.message : String(error) })

  /** Throws away every in-progress draft, back to what's on disk. */
  const resetDrafts = (): void => {
    setNotes(recipe.notes ?? '')
    setSourceName(recipe.sourceName ?? '')
    setTitle(recipe.title)
    setDescription(recipe.description ?? '')
  }

  /**
   * Switching editors discards the one that was open, matching what clicking
   * away already does — the alternative is silently saving an edit the user
   * moved on from.
   */
  const openEditor = (target: EditTarget): void => {
    resetDrafts()
    if (target === 'ingredients' || target === 'instructions') {
      // Editors always show the stored amounts, never a scaled view of them.
      setScale(1)
      // Lists are one entry per line; group headings keep the "# " they carry.
      setListText(recipe[target].join('\n'))
    }
    setEditing(target)
  }

  const closeEditor = (): void => {
    resetDrafts()
    setEditing(null)
  }

  // Reset per-recipe state whenever a different recipe is opened.
  useEffect(() => {
    setChecked(new Set())
    setFolder(recipe.folder ?? '')
    setEditing(null)
    setScale(1)
    setNotes(recipe.notes ?? '')
    setSourceName(recipe.sourceName ?? '')
    setTitle(recipe.title)
    setDescription(recipe.description ?? '')
  }, [
    recipe.id,
    recipe.notes,
    recipe.folder,
    recipe.sourceName,
    recipe.title,
    recipe.description
  ])

  const commitList = (field: ListField): void => {
    setEditing(null)
    const entries = listText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)

    // Emptying the whole list is almost always a slip, and there's no undo —
    // so treat it as a cancel rather than wiping the recipe.
    if (!entries.length) return
    if (JSON.stringify(entries) !== JSON.stringify(recipe[field])) {
      onSave({ ...recipe, [field]: entries })
    }
  }

  const commitDescription = (): void => {
    setEditing(null)
    const next = description.trim()
    if (next === (recipe.description ?? '')) return
    onSave({ ...recipe, description: next || undefined })
  }

  const commitTitle = (): void => {
    setEditing(null)
    const next = title.trim()
    // A recipe with no title would have nothing to file it under, so an empty
    // field reverts rather than saving.
    if (!next) {
      setTitle(recipe.title)
      return
    }
    if (next !== recipe.title) onRename(recipe.id, next)
  }

  const commitSource = (): void => {
    setEditing(null)
    const next = sourceName.trim()
    if (next === (recipe.sourceName ?? '')) return
    onSave({ ...recipe, sourceName: next || undefined })
  }

  const commitNotes = (): void => {
    setEditing(null)
    const next = notes.trim()
    if (next === (recipe.notes ?? '')) return
    onSave({ ...recipe, notes: next || undefined })
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
    scaleYield(recipe.yield, scale)
  ].filter(Boolean) as string[]

  const scalable = hasScalableQuantity(recipe.ingredients)

  let stepNumber = 0

  return (
    <article className="recipe">
      <header className="recipe__header">
        {editing === 'title' ? (
          <div className="editing-block">
            <input
              className="recipe__title title__input"
              value={title}
              aria-label="Recipe title"
              spellCheck={false}
              autoFocus
              onChange={(event) => setTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') commitTitle()
                if (event.key === 'Escape') closeEditor()
              }}
            />
            <EditActions onSave={commitTitle} onCancel={closeEditor} />
          </div>
        ) : (
          <div className="title__row">
            <h1 className="recipe__title">{recipe.title}</h1>
            <button
              className="title__edit no-print"
              onClick={() => openEditor('title')}
              title="Rename recipe"
              aria-label="Rename recipe"
            >
              <PencilIcon />
            </button>
          </div>
        )}

        {/* Editable whether or not the recipe came with a source name — a
            pasted recipe has none, and sites often give an unhelpful one. */}
        <p className="recipe__source">
          {editing === 'source' || !recipe.sourceName ? (
            <span className="editing-inline">
              <input
                className="source__input"
                value={sourceName}
                placeholder="Add a source"
                aria-label="Source name"
                spellCheck={false}
                autoFocus={editing === 'source'}
                // Typing into the empty-state field is what opens the editor.
                onFocus={() => editing !== 'source' && openEditor('source')}
                onChange={(event) => setSourceName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') commitSource()
                  if (event.key === 'Escape') closeEditor()
                }}
              />
              {editing === 'source' && <EditActions onSave={commitSource} onCancel={closeEditor} />}
            </span>
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
                onClick={() => openEditor('source')}
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

        {scalable && (
          <div className="scale">
            <span className="scale__label no-print">Scale</span>
            <div className="scale__steps no-print">
              {SCALE_STEPS.map((step) => (
                <button
                  key={step}
                  className={`scale__step${step === scale ? ' scale__step--active' : ''}`}
                  onClick={() => setScale(step)}
                  aria-pressed={step === scale}
                >
                  {formatFactor(step)}
                </button>
              ))}
            </div>
            {/* The only part that prints, so a scaled printout says so. */}
            {scale !== 1 && (
              <span className="scale__badge">Scaled {formatFactor(scale)}</span>
            )}
          </div>
        )}

        {editing === 'description' || !recipe.description ? (
          /* Editing, or nothing written yet. Never printed — an empty box on
             paper is worse than no description at all. */
          <div className="editing-block no-print">
            <AutoTextarea
              className="description__input"
              value={description}
              placeholder="Add a description"
              ariaLabel="Description"
              autoFocus={editing === 'description'}
              onFocus={() => editing !== 'description' && openEditor('description')}
              onChange={setDescription}
              onKeyDown={(event) => {
                // Enter breaks the line here, so Cmd/Ctrl+Enter saves instead.
                if (event.key === 'Escape') closeEditor()
                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) commitDescription()
              }}
            />
            {editing === 'description' && (
              <EditActions onSave={commitDescription} onCancel={closeEditor} />
            )}
          </div>
        ) : (
          <div className="description__row">
            <p className="recipe__description">{recipe.description}</p>
            <button
              className="description__edit no-print"
              onClick={() => openEditor('description')}
              title="Edit description"
              aria-label="Edit description"
            >
              <PencilIcon />
            </button>
          </div>
        )}

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
          <div className="section__head">
            <h2>Ingredients</h2>
            {editing !== 'ingredients' && (
              <button
                className="section__edit no-print"
                onClick={() => openEditor('ingredients')}
                title="Edit ingredients"
                aria-label="Edit ingredients"
              >
                <PencilIcon />
              </button>
            )}
          </div>

          {editing === 'ingredients' ? (
            <ListEditor
              value={listText}
              onChange={setListText}
              onCommit={() => commitList('ingredients')}
              onCancel={closeEditor}
              label="Ingredients"
            />
          ) : (
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
                    <span>{scaleIngredient(entry, scale)}</span>
                  </label>
                </li>
              )
            )}
          </ul>
          )}
        </section>

        <section className="recipe__instructions">
          <div className="section__head">
            <h2>Instructions</h2>
            {editing !== 'instructions' && (
              <button
                className="section__edit no-print"
                onClick={() => openEditor('instructions')}
                title="Edit instructions"
                aria-label="Edit instructions"
              >
                <PencilIcon />
              </button>
            )}
          </div>

          {editing === 'instructions' ? (
            <ListEditor
              value={listText}
              onChange={setListText}
              onCommit={() => commitList('instructions')}
              onCancel={closeEditor}
              label="Instructions"
            />
          ) : (
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
                  <span className="step__text">{scaleInstruction(entry, scale)}</span>
                </li>
              )
            })}
          </ol>
          )}
        </section>
      </div>

      {/* Kept on screen even when empty — that's where "Add notes" lives — but
          an empty heading is just clutter on paper. */}
      <section className={`recipe__notes${recipe.notes ? '' : ' no-print'}`}>
        <h2>Notes</h2>
        {editing === 'notes' ? (
          <div className="editing-block no-print">
            <AutoTextarea
              className="notes__editor"
              value={notes}
              ariaLabel="Notes"
              autoFocus
              onChange={setNotes}
              onKeyDown={(event) => {
                if (event.key === 'Escape') closeEditor()
                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) commitNotes()
              }}
            />
            <EditActions onSave={commitNotes} onCancel={closeEditor} />
          </div>
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
              <button className="button" onClick={() => openEditor('notes')}>
                {recipe.notes ? 'Edit notes' : 'Add notes'}
              </button>
            </div>
          </>
        )}
      </section>
    </article>
  )
}
