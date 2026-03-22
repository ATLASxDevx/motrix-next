/**
 * @fileoverview Task lifecycle notification scanner.
 *
 * Encapsulates the duplicate-detection logic for task error/completion
 * events. Extracted from TaskStore.fetchList to reduce store file size
 * and isolate this pure-logic concern for independent unit testing.
 *
 * Usage:
 *   const notifier = createTaskNotifier()
 *   // Inside fetchList polling loop:
 *   notifier.scanTasks(tasksToScan, { onTaskError, onTaskComplete, onBtComplete })
 */
import { TASK_STATUS } from '@shared/constants'
import { checkTaskIsSeeder } from '@shared/utils'
import type { Aria2Task } from '@shared/types'

interface ScanCallbacks {
  onTaskError?: ((task: Aria2Task) => void) | null
  onTaskComplete?: ((task: Aria2Task) => void) | null
  /** Fires when a BT task first enters seeding state (download phase complete). */
  onBtComplete?: ((task: Aria2Task) => void) | null
}

export interface TaskNotifier {
  /** Scan a batch of tasks for new errors/completions and fire callbacks. */
  scanTasks: (tasks: Aria2Task[], callbacks: ScanCallbacks) => void
  /** Clear all seen GIDs and reset the initial scan flag. */
  reset: () => void
}

/**
 * Creates an isolated notification scanner with its own deduplication state.
 *
 * The scanner suppresses callbacks during the first (initial) scan to avoid
 * ghost notifications for tasks that were already in a terminal state before
 * the app started monitoring.
 */
export function createTaskNotifier(): TaskNotifier {
  const notifiedErrorGids = new Set<string>()
  const notifiedCompleteGids = new Set<string>()
  const notifiedBtCompleteGids = new Set<string>()
  let initialScanDone = false

  function scanTasks(tasks: Aria2Task[], callbacks: ScanCallbacks): void {
    const { onTaskError, onTaskComplete, onBtComplete } = callbacks

    // Detect newly errored tasks
    if (onTaskError) {
      for (const task of tasks) {
        if (
          task.status === TASK_STATUS.ERROR &&
          task.errorCode &&
          task.errorCode !== '0' &&
          !notifiedErrorGids.has(task.gid)
        ) {
          notifiedErrorGids.add(task.gid)
          if (initialScanDone) {
            onTaskError(task)
          }
        }
      }
    }

    // Detect newly completed tasks (HTTP/FTP downloads)
    if (onTaskComplete) {
      for (const task of tasks) {
        if (task.status === 'complete' && !notifiedCompleteGids.has(task.gid)) {
          notifiedCompleteGids.add(task.gid)
          if (initialScanDone) {
            onTaskComplete(task)
          }
        }
      }
    }

    // Detect BT tasks entering seeding state (download phase complete)
    if (onBtComplete) {
      for (const task of tasks) {
        if (checkTaskIsSeeder(task) && !notifiedBtCompleteGids.has(task.gid)) {
          notifiedBtCompleteGids.add(task.gid)
          if (initialScanDone) {
            onBtComplete(task)
          }
        }
      }
    }

    // Mark initial scan as done AFTER all callbacks — unconditionally.
    initialScanDone = true
  }

  function reset(): void {
    notifiedErrorGids.clear()
    notifiedCompleteGids.clear()
    notifiedBtCompleteGids.clear()
    initialScanDone = false
  }

  return { scanTasks, reset }
}
