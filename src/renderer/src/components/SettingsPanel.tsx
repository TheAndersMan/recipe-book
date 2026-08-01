import { useState, type JSX } from 'react'
import type { Settings } from '../../../shared/types'

interface Props {
  settings: Settings
  onClose: () => void
  onChange: (patch: { apiKey?: string | null; recipesDir?: string; model?: string }) => Promise<void>
}

export default function SettingsPanel({ settings, onClose, onChange }: Props): JSX.Element {
  const [key, setKey] = useState('')
  const [model, setModel] = useState(settings.model)
  const [saving, setSaving] = useState(false)

  return (
    <div className="modal" onClick={onClose}>
      <div className="modal__panel" onClick={(event) => event.stopPropagation()}>
        <h2>Settings</h2>

        <label className="field">
          <span className="field__label">Anthropic API key</span>
          <input
            type="password"
            className="field__input"
            placeholder={settings.hasApiKey ? '•••••••• (saved)' : 'sk-ant-…'}
            value={key}
            spellCheck={false}
            onChange={(event) => setKey(event.target.value)}
          />
          <span className="field__hint">
            Only used when a page has no structured recipe data, and for pasted text. Stored
            encrypted in your login Keychain — never written to the recipe files.
          </span>
        </label>

        <div className="field__row no-print">
          <button
            className="button button--primary"
            disabled={saving || !key.trim()}
            onClick={async () => {
              setSaving(true)
              await onChange({ apiKey: key })
              setKey('')
              setSaving(false)
            }}
          >
            Save key
          </button>
          {settings.hasApiKey && (
            <button
              className="button button--danger"
              disabled={saving}
              onClick={async () => {
                setSaving(true)
                await onChange({ apiKey: null })
                setSaving(false)
              }}
            >
              Remove key
            </button>
          )}
        </div>

        <label className="field">
          <span className="field__label">Recipe folder</span>
          <div className="field__row">
            <code className="field__path">{settings.recipesDir}</code>
            <button
              className="button"
              onClick={async () => {
                const picked = await window.api.settings.pickDir()
                if (picked) await onChange({})
              }}
            >
              Change
            </button>
          </div>
          <span className="field__hint">
            One markdown file per recipe. Back it up, grep it, edit it in any editor.
          </span>
        </label>

        <label className="field">
          <span className="field__label">Model</span>
          <input
            type="text"
            className="field__input"
            value={model}
            spellCheck={false}
            onChange={(event) => setModel(event.target.value)}
            onBlur={() => {
              if (model.trim() && model !== settings.model) void onChange({ model })
            }}
          />
        </label>

        <div className="field__row">
          <button className="button" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
