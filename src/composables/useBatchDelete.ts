/** @fileoverview Composable for batch deletion of download records with optional local file removal.
 *
 * Pure utility functions for testability:
 * - buildFilePaths: construct full paths from dir + name
 * - deleteLocalFiles: attempt to remove files with error resilience
 */
import { remove } from '@tauri-apps/plugin-fs'
import { join } from '@tauri-apps/api/path'
import { invoke } from '@tauri-apps/api/core'
import { logger } from '@shared/logger'

/** Construct full file paths from directory + filename pairs (platform-safe). */
export async function buildFilePaths(items: Array<{ dir: string; name: string }>): Promise<string[]> {
  const valid = items.filter((item) => item.dir && item.name)
  return Promise.all(valid.map((item) => join(item.dir, item.name)))
}

/** Attempt to delete local files. Errors are logged, not thrown. */
export async function deleteLocalFiles(paths: string[]): Promise<{ deleted: number; errors: number }> {
  let deleted = 0
  let errors = 0

  for (const path of paths) {
    try {
      const fileExists = await invoke<boolean>('check_path_exists', { path })
      if (!fileExists) continue
      await remove(path, { recursive: true })
      deleted++
    } catch (e) {
      errors++
      logger.warn('deleteLocalFiles', `Failed to delete ${path}: ${e}`)
    }
  }

  return { deleted, errors }
}
