/** @fileoverview Composable for deleting download task files and associated artifacts from disk. */
import { remove, readDir } from '@tauri-apps/plugin-fs'
import { join } from '@tauri-apps/api/path'
import { logger } from '@shared/logger'
import { getTaskName } from '@shared/utils'
import type { Aria2Task } from '@shared/types'

/**
 * Safely removes a directory only if it is empty.
 * Returns true if the directory was removed, false otherwise.
 */
async function removeIfEmpty(dirPath: string): Promise<boolean> {
  try {
    const entries = await readDir(dirPath)
    if (entries.length === 0) {
      await remove(dirPath)
      return true
    }
  } catch (e) {
    logger.debug('deleteTaskFiles.removeIfEmpty', e)
  }
  return false
}

/**
 * Deletes all files associated with a download task, including:
 * - Each file referenced by the task
 * - Companion .aria2 control files
 * - Empty parent directories (if different from task root dir)
 * - The named task directory itself (only if empty after file removal)
 *
 * Safety: directories are only removed when empty to prevent accidental
 * deletion of unrelated files in shared download directories.
 */
export async function deleteTaskFiles(task: Aria2Task): Promise<void> {
  const dir = task.dir
  const files = task.files || []
  const parentDirs = new Set<string>()

  for (const f of files) {
    if (!f.path) continue
    try {
      await remove(f.path, { recursive: true })
    } catch (e) {
      logger.debug('deleteTaskFiles.file', e)
    }
    try {
      await remove(f.path + '.aria2')
    } catch (e) {
      logger.debug('deleteTaskFiles.aria2', e)
    }
    const lastSep = Math.max(f.path.lastIndexOf('/'), f.path.lastIndexOf('\\'))
    if (lastSep > 0) {
      const parent = f.path.substring(0, lastSep)
      if (parent !== dir) parentDirs.add(parent)
    }
  }

  // Only remove parent directories if they are now empty
  for (const pd of parentDirs) {
    await removeIfEmpty(pd)
  }

  // Only remove the task directory if it exists and is now empty
  if (dir) {
    const name = getTaskName(task, { defaultName: '' })
    if (name) {
      const taskDir = await join(dir, name)
      await removeIfEmpty(taskDir)
    }
  }
}
