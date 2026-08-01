import { contextBridge, ipcRenderer } from 'electron'
import type {
  Appearance,
  ExportResult,
  ImportResult,
  Recipe,
  RecipeSummary,
  Settings
} from '../shared/types'

/**
 * Every main-process handler returns {ok, value|error}. Unwrap it here so the
 * renderer just gets a promise that resolves or throws.
 */
async function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  const result = (await ipcRenderer.invoke(channel, ...args)) as
    | { ok: true; value: T }
    | { ok: false; error: string }

  if (!result.ok) throw new Error(result.error)
  return result.value
}

const api = {
  settings: {
    get: (): Promise<Settings> => invoke('settings:get'),
    set: (patch: {
      apiKey?: string | null
      recipesDir?: string
      model?: string
      appearance?: Partial<Appearance>
    }): Promise<Settings> => invoke('settings:set', patch),
    pickDir: (): Promise<string | null> => invoke('settings:pickDir')
  },
  recipes: {
    list: (): Promise<RecipeSummary[]> => invoke('recipes:list'),
    get: (id: string): Promise<Recipe> => invoke('recipes:get', id),
    save: (recipe: Recipe): Promise<Recipe> => invoke('recipes:save', recipe),
    remove: (id: string): Promise<void> => invoke('recipes:delete', id),
    reveal: (id: string): Promise<void> => invoke('recipes:reveal', id),
    exportPdf: (title: string): Promise<ExportResult | null> =>
      invoke('recipes:exportPdf', { title }),
    fitPrintZoom: (): Promise<number> => invoke('recipes:fitPrintZoom')
  },
  importUrl: (url: string): Promise<ImportResult> => invoke('import:url', url),
  importText: (text: string, sourceUrl?: string): Promise<ImportResult> =>
    invoke('import:text', { text, sourceUrl }),
  openExternal: (url: string): Promise<void> => invoke('shell:open', url),
  openPath: (path: string): Promise<void> => invoke('shell:openPath', path),
  setWindowBackground: (colour: string): Promise<void> =>
    invoke('window:setBackground', colour)
}

export type RecipeBookApi = typeof api

contextBridge.exposeInMainWorld('api', api)
