/** @fileoverview Orchestration for stale download record cleanup.
 *
 * Connects the history store records to file existence checks,
 * removing records whose local files no longer exist.
 */
import { findStaleRecords, type StaleCheckItem } from './useDownloadCleanup'

interface CleanupResult {
  scanned: number
  removed: number
}

/** Scan records for stale files and remove them via the provided callback.
 *  Designed for dependency injection: the caller passes the remove function
 *  from the history store, keeping this function pure and testable. */
export async function runStaleRecordCleanup(
  records: StaleCheckItem[],
  removeStaleRecords: (gids: string[]) => Promise<void>,
): Promise<CleanupResult> {
  if (records.length === 0) {
    return { scanned: 0, removed: 0 }
  }

  const staleGids = await findStaleRecords(records)

  if (staleGids.length > 0) {
    await removeStaleRecords(staleGids)
  }

  return { scanned: records.length, removed: staleGids.length }
}
