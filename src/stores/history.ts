/** @fileoverview Pinia store for SQLite-backed download history persistence.
 *
 * Stores completed/errored download records independently from the aria2
 * session file (which only tracks active/paused tasks). Records survive
 * app restarts and upgrades.
 *
 * Database: sqlite:history.db (managed by tauri-plugin-sql with migrations).
 */
import { defineStore } from 'pinia'
import Database from '@tauri-apps/plugin-sql'
import { remove } from '@tauri-apps/plugin-fs'
import { invoke } from '@tauri-apps/api/core'
import { appDataDir } from '@tauri-apps/api/path'
import type { HistoryRecord } from '@shared/types'
import { logger } from '@shared/logger'

const DB_NAME = 'sqlite:history.db'

/** Callbacks for database health events — allows UI layer to show toasts
 *  without coupling the store to any specific UI framework. */
export interface DbHealthCallbacks {
  onCorrupt?: () => void
  onError?: (error: unknown) => void
  onRebuilt?: () => void
  onRebuildFailed?: (error: unknown) => void
}

export const useHistoryStore = defineStore('history', () => {
  let db: Awaited<ReturnType<typeof Database.load>> | null = null
  let initPromise: Promise<void> | null = null

  /** Apply SQLite PRAGMA optimizations to an open connection. */
  async function applyPragmas(conn: NonNullable<typeof db>): Promise<void> {
    await conn.execute('PRAGMA journal_mode = WAL', [])
    await conn.execute('PRAGMA synchronous = NORMAL', [])
    await conn.execute('PRAGMA busy_timeout = 5000', [])
    await conn.execute('PRAGMA foreign_keys = ON', [])
  }

  /** Delete the database files from disk (db + WAL + SHM). */
  async function deleteDbFiles(): Promise<void> {
    try {
      const dataDir = await appDataDir()
      const suffixes = ['history.db', 'history.db-wal', 'history.db-shm']
      for (const suffix of suffixes) {
        const path = `${dataDir}/${suffix}`
        if (await invoke<boolean>('check_path_exists', { path })) {
          await remove(path)
        }
      }
    } catch (e) {
      logger.warn('HistoryDB', `deleteDbFiles failed: ${e}`)
    }
  }

  /** Attempt to rebuild the database from scratch after corruption. */
  async function rebuildDatabase(callbacks?: DbHealthCallbacks): Promise<void> {
    try {
      if (db) {
        try {
          await db.close()
        } catch {
          /* already broken */
        }
        db = null
      }
      await deleteDbFiles()
      db = await Database.load(DB_NAME)
      await applyPragmas(db)
      logger.info('HistoryDB', 'Database rebuilt successfully')
      callbacks?.onRebuilt?.()
    } catch (e) {
      logger.error('HistoryDB', `Rebuild failed: ${e}`)
      db = null
      callbacks?.onRebuildFailed?.(e)
    }
  }

  /** Initialize the database connection, verify integrity, and auto-recover
   *  from corruption. Safe to call multiple times — subsequent calls are no-ops.
   *
   *  @param callbacks Optional UI notification hooks for health events. */
  async function init(callbacks?: DbHealthCallbacks): Promise<void> {
    if (db) return
    if (!initPromise) {
      initPromise = (async () => {
        try {
          db = await Database.load(DB_NAME)
          await applyPragmas(db)

          // Verify structural integrity on every cold start
          const result = await db.select<{ integrity_check: string }[]>('PRAGMA integrity_check', [])
          const status = result[0]?.integrity_check ?? 'unknown'
          if (status !== 'ok') {
            logger.warn('HistoryDB', `Integrity check failed: ${status}`)
            callbacks?.onCorrupt?.()
            await rebuildDatabase(callbacks)
          }
        } catch (e) {
          logger.warn('HistoryDB', `Init failed: ${e}`)
          callbacks?.onError?.(e)
          await rebuildDatabase(callbacks)
        }
      })()
    }
    await initPromise
  }

  /** Returns the active database connection, auto-initializing if needed. */
  async function getDb() {
    if (!db) await init()
    return db!
  }

  /** Insert or update a download record (upsert by GID). */
  async function addRecord(record: HistoryRecord): Promise<void> {
    await (
      await getDb()
    ).execute(
      `INSERT OR IGNORE INTO download_history
        (gid, name, uri, dir, total_length, status, task_type, completed_at, meta)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        record.gid,
        record.name,
        record.uri ?? null,
        record.dir ?? null,
        record.total_length ?? null,
        record.status,
        record.task_type ?? null,
        record.completed_at ?? null,
        record.meta ?? null,
      ],
    )
  }

  /** Retrieve records, optionally filtered by status. Sorted by completed_at DESC. */
  async function getRecords(status?: string): Promise<HistoryRecord[]> {
    if (status) {
      return (await getDb()).select<HistoryRecord[]>(
        'SELECT * FROM download_history WHERE status = $1 ORDER BY completed_at DESC',
        [status],
      )
    }
    return (await getDb()).select<HistoryRecord[]>('SELECT * FROM download_history ORDER BY completed_at DESC', [])
  }

  /** Remove a single record by GID. */
  async function removeRecord(gid: string): Promise<void> {
    await (await getDb()).execute('DELETE FROM download_history WHERE gid = $1', [gid])
  }

  /** Remove all records, optionally filtered by status. Full reset also VACUUMs. */
  async function clearRecords(status?: string): Promise<void> {
    if (status) {
      await (await getDb()).execute('DELETE FROM download_history WHERE status = $1', [status])
    } else {
      await (await getDb()).execute('DELETE FROM download_history', [])
      // VACUUM reclaims disk space and resets AUTOINCREMENT counter
      await (await getDb()).execute('VACUUM', [])
    }
  }

  /** Remove records whose GIDs are in the provided list (stale file cleanup). */
  async function removeStaleRecords(gids: string[]): Promise<void> {
    if (gids.length === 0) return
    const placeholders = gids.map((_, i) => `$${i + 1}`).join(', ')
    await (await getDb()).execute(`DELETE FROM download_history WHERE gid IN (${placeholders})`, gids)
  }

  /** Run PRAGMA integrity_check and return the result string. */
  async function checkIntegrity(): Promise<string> {
    const result = await (await getDb()).select<{ integrity_check: string }[]>('PRAGMA integrity_check', [])
    return result[0]?.integrity_check ?? 'unknown'
  }

  /** Close the database connection. After calling, all operations will throw. */
  async function closeConnection(): Promise<void> {
    if (db) {
      await db.close()
      db = null
    }
  }

  return {
    init,
    addRecord,
    getRecords,
    removeRecord,
    clearRecords,
    removeStaleRecords,
    checkIntegrity,
    closeConnection,
  }
})
