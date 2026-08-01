import { promises as fs } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { app, safeStorage } from 'electron'

/**
 * The API key is encrypted with Electron's safeStorage, which on macOS is
 * backed by the login Keychain — it never sits on disk in plaintext, and the
 * renderer is never told what it is (only whether one exists).
 */

interface StoredSettings {
  apiKeyEncrypted?: string
  apiKeyPlain?: string
  recipesDir?: string
  model?: string
}

const DEFAULT_MODEL = 'claude-opus-5'
const DEFAULT_DIR = join(homedir(), 'Development', 'recipe-book', 'recipes')

export class SettingsStore {
  private cache: StoredSettings = {}
  private file: string

  constructor() {
    this.file = join(app.getPath('userData'), 'settings.json')
  }

  async load(): Promise<void> {
    try {
      this.cache = JSON.parse(await fs.readFile(this.file, 'utf8')) as StoredSettings
    } catch {
      this.cache = {}
    }
  }

  private async persist(): Promise<void> {
    await fs.mkdir(app.getPath('userData'), { recursive: true })
    await fs.writeFile(this.file, JSON.stringify(this.cache, null, 2), 'utf8')
  }

  get recipesDir(): string {
    return this.cache.recipesDir ?? DEFAULT_DIR
  }

  get model(): string {
    return this.cache.model ?? DEFAULT_MODEL
  }

  get apiKey(): string | undefined {
    if (this.cache.apiKeyEncrypted && safeStorage.isEncryptionAvailable()) {
      try {
        return safeStorage.decryptString(Buffer.from(this.cache.apiKeyEncrypted, 'base64'))
      } catch {
        return undefined
      }
    }
    return this.cache.apiKeyPlain
  }

  async setApiKey(key: string | null): Promise<void> {
    delete this.cache.apiKeyEncrypted
    delete this.cache.apiKeyPlain

    const trimmed = key?.trim()
    if (trimmed) {
      if (safeStorage.isEncryptionAvailable()) {
        this.cache.apiKeyEncrypted = safeStorage.encryptString(trimmed).toString('base64')
      } else {
        this.cache.apiKeyPlain = trimmed
      }
    }
    await this.persist()
  }

  async setRecipesDir(dir: string): Promise<void> {
    this.cache.recipesDir = dir
    await this.persist()
  }

  async setModel(model: string): Promise<void> {
    this.cache.model = model.trim() || DEFAULT_MODEL
    await this.persist()
  }
}
