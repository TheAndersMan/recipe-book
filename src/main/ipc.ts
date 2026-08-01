import { dialog, ipcMain, shell } from 'electron'
import type { ImportResult, Recipe, RecipeSummary, Settings } from '../shared/types'
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

  handle<Settings>('settings:get', async () => ({
    hasApiKey: Boolean(settings.apiKey),
    recipesDir: settings.recipesDir,
    model: settings.model
  }))

  handle<Settings>(
    'settings:set',
    async (patch: { apiKey?: string | null; recipesDir?: string; model?: string }) => {
      if (patch.apiKey !== undefined) await settings.setApiKey(patch.apiKey)
      if (patch.model !== undefined) await settings.setModel(patch.model)
      if (patch.recipesDir !== undefined) {
        await settings.setRecipesDir(patch.recipesDir)
        store.setDir(patch.recipesDir)
      }
      return { hasApiKey: Boolean(settings.apiKey), recipesDir: settings.recipesDir, model: settings.model }
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
    shell.showItemInFolder(`${store.getDir()}/${id}.md`)
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
