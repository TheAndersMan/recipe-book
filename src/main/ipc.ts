import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import type { Appearance, ImportResult, Recipe, RecipeSummary, Settings } from '../shared/types'
import { extractFromText, extractFromUrl } from './recipe/extract'
import { RecipeStore } from './recipe/store'
import { SettingsStore } from './settings'

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
    appearance: settings.appearance
  })

  handle<Settings>('settings:get', async () => snapshot())

  handle<Settings>(
    'settings:set',
    async (patch: {
      apiKey?: string | null
      recipesDir?: string
      model?: string
      appearance?: Partial<Appearance>
    }) => {
      if (patch.apiKey !== undefined) await settings.setApiKey(patch.apiKey)
      if (patch.model !== undefined) await settings.setModel(patch.model)
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
  handle<Recipe>('recipes:get', async (id: string) => store.read(id))
  handle<Recipe>('recipes:save', async (recipe: Recipe) => store.update(recipe))
  handle<void>('recipes:delete', async (id: string) => store.remove(id))

  handle<void>('recipes:reveal', async (id: string) => {
    shell.showItemInFolder(join(store.getDir(), `${id}.md`))
  })

  /**
   * Renders whatever the window is currently showing, under print emulation —
   * so the print stylesheet does the layout work and the PDF matches what
   * Cmd+P would produce. Returns the saved path, or null if cancelled.
   */
  handle<string | null>('recipes:exportPdf', async (payload: { title: string }) => {
    const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    if (!window) throw new Error('No window to render.')

    const suggested = payload.title.replace(/[/\\:*?"<>|]/g, '-').trim() || 'recipe'
    const { canceled, filePath } = await dialog.showSaveDialog(window, {
      defaultPath: `${suggested}.pdf`,
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    })
    if (canceled || !filePath) return null

    const pdf = await window.webContents.printToPDF({
      printBackground: true,
      pageSize: 'Letter',
      margins: { top: 0.5, bottom: 0.5, left: 0.55, right: 0.55 }
    })

    await fs.writeFile(filePath, pdf)
    return filePath
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
