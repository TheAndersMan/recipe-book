import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import type {
  Appearance,
  ExportResult,
  ImportResult,
  Recipe,
  RecipeSummary,
  Settings,
  SortMode
} from '../shared/types'
import { renderFitted } from './pdf'
import { extractFromText, extractFromUrl } from './recipe/extract'
import { RecipeStore } from './recipe/store'
import { SettingsStore } from './settings'

/**
 * The window's surface colour, kept in step with the active theme by the
 * renderer. Held here so printing can swap it out and put it back.
 */
let windowBackground = '#ffffff'

export function registerIpc(settings: SettingsStore, store: RecipeStore): void {
  const handle = <T>(channel: string, fn: (...args: never[]) => Promise<T>): void => {
    ipcMain.handle(channel, async (_event, ...args) => {
      try {
        return { ok: true as const, value: await fn(...(args as never[])) }
      } catch (error) {
        return { ok: false as const, error: message(error) }
      }
    })
  }

  const snapshot = (): Settings => ({
    hasApiKey: Boolean(settings.apiKey),
    recipesDir: settings.recipesDir,
    model: settings.model,
    sort: settings.sort,
    appearance: settings.appearance
  })

  handle<Settings>('settings:get', async () => snapshot())

  handle<Settings>(
    'settings:set',
    async (patch: {
      apiKey?: string | null
      recipesDir?: string
      model?: string
      sort?: SortMode
      appearance?: Partial<Appearance>
    }) => {
      if (patch.apiKey !== undefined) await settings.setApiKey(patch.apiKey)
      if (patch.model !== undefined) await settings.setModel(patch.model)
      if (patch.sort !== undefined) await settings.setSort(patch.sort)
      if (patch.appearance !== undefined) await settings.setAppearance(patch.appearance)
      if (patch.recipesDir !== undefined) {
        await settings.setRecipesDir(patch.recipesDir)
        store.setDir(patch.recipesDir)
      }
      return snapshot()
    }
  )

  handle<string | null>('settings:pickDir', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: settings.recipesDir,
      message: 'Where should recipes be saved?'
    })
    if (result.canceled || !result.filePaths[0]) return null
    await settings.setRecipesDir(result.filePaths[0])
    store.setDir(result.filePaths[0])
    return result.filePaths[0]
  })

  handle<RecipeSummary[]>('recipes:list', async () => store.list())
  handle<string[]>('recipes:folders', async () => store.folders())

  handle<Recipe>('recipes:setFavorite', async (payload: { id: string; favorite: boolean }) =>
    store.setFavorite(payload.id, payload.favorite)
  )

  handle<Recipe>('recipes:setFolder', async (payload: { id: string; folder: string | null }) =>
    store.setFolder(payload.id, payload.folder)
  )
  handle<Recipe>('recipes:get', async (id: string) => store.read(id))
  handle<Recipe>('recipes:save', async (recipe: Recipe) => store.update(recipe))
  handle<void>('recipes:delete', async (id: string) => store.remove(id))

  handle<void>('recipes:reveal', async (id: string) => {
    shell.showItemInFolder(join(store.getDir(), `${id}.md`))
  })

  const activeWindow = (): BrowserWindow => {
    const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    if (!window) throw new Error('No window to render.')
    return window
  }

  /**
   * Renders whatever the window is currently showing, under print emulation —
   * so the print stylesheet does the layout and the PDF matches what Cmd+P
   * would produce. Shrunk to fit one page where that's reasonable.
   */
  handle<ExportResult | null>('recipes:exportPdf', async (payload: { title: string }) => {
    const window = activeWindow()

    const suggested = payload.title.replace(/[/\\:*?"<>|]/g, '-').trim() || 'recipe'
    const { canceled, filePath } = await dialog.showSaveDialog(window, {
      defaultPath: `${suggested}.pdf`,
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    })
    if (canceled || !filePath) return null

    const { pdf, pages } = await renderFitted(window, windowBackground)
    await fs.writeFile(filePath, pdf)
    return { path: filePath, pages }
  })

  /** Keeps the native window surface matching the theme (and print-safe). */
  handle<void>('window:setBackground', async (colour: string) => {
    if (!/^#[0-9a-f]{6}$/i.test(colour)) return
    windowBackground = colour
    activeWindow().setBackgroundColor(colour)
  })

  /**
   * Sizes the recipe for Cmd+P. The zoom lives in a CSS variable that only
   * applies under print media, so it can stay set after we're done.
   */
  handle<number>('recipes:fitPrintZoom', async () => {
    const { zoom } = await renderFitted(activeWindow(), windowBackground)
    return zoom
  })

  handle<void>('shell:openPath', async (path: string) => {
    const error = await shell.openPath(path)
    if (error) throw new Error(error)
  })

  handle<ImportResult>('import:url', async (url: string) => {
    const { recipe, method, note } = await extractFromUrl(url, {
      apiKey: settings.apiKey,
      model: settings.model
    })
    return { recipe: await store.create(recipe), method, note }
  })

  handle<ImportResult>(
    'import:text',
    async (payload: { text: string; sourceUrl?: string }) => {
      const { recipe, method, note } = await extractFromText(payload.text, {
        apiKey: settings.apiKey,
        model: settings.model,
        sourceUrl: payload.sourceUrl
      })
      return { recipe: await store.create(recipe), method, note }
    }
  )

  handle<void>('shell:open', async (url: string) => {
    if (/^https?:\/\//i.test(url)) await shell.openExternal(url)
  })
}

function message(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}
