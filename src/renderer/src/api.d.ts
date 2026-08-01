import type { RecipeBookApi } from '../../preload'

declare global {
  interface Window {
    api: RecipeBookApi
  }
}

export {}
