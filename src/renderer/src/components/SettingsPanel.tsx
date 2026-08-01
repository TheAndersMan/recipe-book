import { useState, type JSX } from 'react'
import type { Appearance, RecipeFont, Settings, ThemeName } from '../../../shared/types'
import { ACCENT_SWATCHES, normalizeHex, THEMES } from '../theme'

interface Props {
  settings: Settings
  onClose: () => void
  onChange: (patch: {
    apiKey?: string | null
    recipesDir?: string
    model?: string
    appearance?: Partial<Appearance>
  }) => Promise<void>
}

const TEXT_SIZES: { label: string; value: number }[] = [
  { label: 'Small', value: 0.9 },
  { label: 'Default', value: 1 },
  { label: 'Large', value: 1.15 },
  { label: 'Largest', value: 1.3 }
]

const FONTS: { label: string; value: RecipeFont }[] = [
  { label: 'Serif', value: 'serif' },
  { label: 'Sans', value: 'sans' }
]

export default function SettingsPanel({ settings, onClose, onChange }: Props): JSX.Element {
  const [key, setKey] = useState('')
  const [model, setModel] = useState(settings.model)
  const [saving, setSaving] = useState(false)
  const [customAccent, setCustomAccent] = useState(settings.appearance.accent)

  const appearance = settings.appearance
  const setAppearance = (patch: Partial<Appearance>): void => void onChange({ appearance: patch })

  const saveKey = async (): Promise<void> => {
    setSaving(true)
    await onChange({ apiKey: key })
    setKey('')
    setSaving(false)
  }

  return (
    <div className="modal" onClick={onClose}>
      <div className="modal__panel" onClick={(event) => event.stopPropagation()}>
        <h2>Settings</h2>

        <label className="field">
          <span className="field__label">Theme</span>
          <div className="choices">
            {(Object.keys(THEMES) as ThemeName[]).map((name) => (
              <button
                key={name}
                className={`choice${appearance.theme === name ? ' choice--active' : ''}`}
                onClick={() => setAppearance({ theme: name })}
              >
                {THEMES[name].label}
              </button>
            ))}
          </div>
          <span className="field__hint">
            Screen only — printing and PDF export are always ink on white.
          </span>
        </label>

        <label className="field">
          <span className="field__label">Accent</span>
          <div className="swatches">
            {ACCENT_SWATCHES.map((colour) => (
              <button
                key={colour}
                className={`swatch${appearance.accent === colour ? ' swatch--active' : ''}`}
                style={{ background: colour }}
                title={colour}
                aria-label={colour}
                onClick={() => {
                  setCustomAccent(colour)
                  setAppearance({ accent: colour })
                }}
              />
            ))}
            <input
              className="swatch-input"
              value={customAccent}
              spellCheck={false}
              aria-label="Custom accent hex"
              onChange={(event) => setCustomAccent(event.target.value)}
              onBlur={() => {
                const hex = normalizeHex(customAccent)
                if (hex) setAppearance({ accent: hex })
                else setCustomAccent(appearance.accent)
              }}
            />
          </div>
        </label>

        <label className="field">
          <span className="field__label">Recipe font</span>
          <div className="choices">
            {FONTS.map((font) => (
              <button
                key={font.value}
                className={`choice${appearance.recipeFont === font.value ? ' choice--active' : ''}`}
                onClick={() => setAppearance({ recipeFont: font.value })}
              >
                {font.label}
              </button>
            ))}
          </div>
        </label>

        <label className="field">
          <span className="field__label">Recipe text size</span>
          <div className="choices">
            {TEXT_SIZES.map((size) => (
              <button
                key={size.value}
                className={`choice${
                  Math.abs(appearance.textScale - size.value) < 0.01 ? ' choice--active' : ''
                }`}
                onClick={() => setAppearance({ textScale: size.value })}
              >
                {size.label}
              </button>
            ))}
          </div>
        </label>

        {/* Set once and forgotten, so it starts collapsed — unless there's no
            key yet, which is the one time it's the reason you opened this. */}
        <details className="advanced" open={!settings.hasApiKey}>
          <summary className="advanced__summary">Advanced</summary>
          <div className="advanced__body">
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

            <div className="field__row">
              <button
                className="button button--primary"
                disabled={saving || !key.trim()}
                onClick={saveKey}
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
          </div>
        </details>

        <div className="field__row field__row--footer">
          <button
            className="button"
            disabled={saving}
            onClick={async () => {
              // Don't discard a key that was typed but never explicitly saved.
              if (key.trim()) await saveKey()
              onClose()
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
