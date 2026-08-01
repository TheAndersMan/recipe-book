import { useState, type JSX } from 'react'
import type { ImportResult } from '../../../shared/types'

interface Props {
  hasApiKey: boolean
  onImported: (result: ImportResult) => void
  onError: (message: string) => void
}

export default function ImportBar({ hasApiKey, onImported, onError }: Props): JSX.Element {
  const [url, setUrl] = useState('')
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasted, setPasted] = useState('')
  const [pastedSource, setPastedSource] = useState('')
  const [busy, setBusy] = useState(false)

  async function run(work: () => Promise<ImportResult>): Promise<void> {
    setBusy(true)
    try {
      onImported(await work())
      setUrl('')
      setPasted('')
      setPastedSource('')
      setPasteOpen(false)
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="import">
      <form
        className="import__row"
        onSubmit={(event) => {
          event.preventDefault()
          if (!url.trim() || busy) return
          void run(() => window.api.importUrl(url))
        }}
      >
        <input
          className="import__url"
          type="text"
          placeholder="Paste a recipe URL"
          value={url}
          spellCheck={false}
          onChange={(event) => setUrl(event.target.value)}
          disabled={busy}
        />
        <button className="button button--primary" type="submit" disabled={busy || !url.trim()}>
          {busy ? 'Working…' : 'Save recipe'}
        </button>
        <button
          className="button"
          type="button"
          onClick={() => setPasteOpen((open) => !open)}
          disabled={busy}
        >
          {pasteOpen ? 'Cancel' : 'Paste text'}
        </button>
      </form>

      {pasteOpen && (
        <form
          className="import__paste"
          onSubmit={(event) => {
            event.preventDefault()
            if (!pasted.trim() || busy) return
            void run(() => window.api.importText(pasted, pastedSource.trim() || undefined))
          }}
        >
          <textarea
            className="import__textarea"
            placeholder="Paste the recipe text — ingredients, steps, whatever you copied."
            value={pasted}
            rows={10}
            onChange={(event) => setPasted(event.target.value)}
            disabled={busy}
          />
          <div className="import__row">
            <input
              className="import__url"
              type="text"
              placeholder="Source URL (optional)"
              value={pastedSource}
              spellCheck={false}
              onChange={(event) => setPastedSource(event.target.value)}
              disabled={busy}
            />
            <button
              className="button button--primary"
              type="submit"
              disabled={busy || !pasted.trim()}
            >
              {busy ? 'Working…' : 'Extract'}
            </button>
          </div>
          {!hasApiKey && (
            <p className="import__hint">
              Pasted text is read by Claude — add an API key in Settings first.
            </p>
          )}
        </form>
      )}
    </div>
  )
}
