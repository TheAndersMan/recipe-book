import { useEffect, useState, type JSX } from 'react'
import { headingText, isHeading, type Recipe } from '../../../shared/types'

interface Props {
  recipe: Recipe
  onDelete: (id: string) => void
  onSave: (recipe: Recipe) => void
}

export default function RecipeView({ recipe, onDelete, onSave }: Props): JSX.Element {
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [notes, setNotes] = useState(recipe.notes ?? '')
  const [editingNotes, setEditingNotes] = useState(false)

  // Reset per-recipe state whenever a different recipe is opened.
  useEffect(() => {
    setChecked(new Set())
    setNotes(recipe.notes ?? '')
    setEditingNotes(false)
  }, [recipe.id, recipe.notes])

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

        {recipe.sourceUrl && (
          <p className="recipe__source">
            <a
              href={recipe.sourceUrl}
              onClick={(event) => {
                event.preventDefault()
                void window.api.openExternal(recipe.sourceUrl!)
              }}
            >
              {recipe.sourceName ?? recipe.sourceUrl}
            </a>
          </p>
        )}

        {meta.length > 0 && (
          <ul className="recipe__meta">
            {meta.map((entry) => (
              <li key={entry}>{entry}</li>
            ))}
          </ul>
        )}

        {recipe.description && <p className="recipe__description">{recipe.description}</p>}

        <div className="recipe__actions no-print">
          <button className="button" onClick={() => window.print()}>
            Print
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

      <section className="recipe__notes">
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
