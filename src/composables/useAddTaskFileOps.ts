/**
 * @fileoverview File resolution and file-chooser operations for AddTask dialog.
 *
 * Extracted from AddTask.vue to reduce component script size.
 * Uses dependency injection for store access and i18n to enable testability.
 */
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { readFile } from '@tauri-apps/plugin-fs'
import { logger } from '@shared/logger'
import { parseTorrentBuffer, uint8ToBase64 } from '@/composables/useTorrentParser'
import { detectKind, createBatchItem } from '@shared/utils/batchHelpers'
import bencode from 'bencode'
import type { BatchItem } from '@shared/types'

interface FileOpsDeps {
  t: (key: string) => string
  batch: { value: BatchItem[] }
  fileItems: { value: BatchItem[] }
  selectedBatchIndex: { value: number }
  setPendingBatch: (items: BatchItem[]) => void
  showWarning: (msg: string) => void
}

/**
 * Resolves a single file-based batch item: reads its bytes, converts to base64,
 * and parses torrent metadata if applicable.
 */
export async function resolveFileItem(item: BatchItem, t: (key: string) => string) {
  try {
    const bytes = await readFile(item.source)
    const uint8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
    item.payload = uint8ToBase64(uint8)

    if (item.kind === 'torrent') {
      try {
        const meta = await parseTorrentBuffer(uint8, bencode)
        if (meta) {
          item.torrentMeta = meta
          item.selectedFileIndices = meta.files.map((f) => f.idx)
        }
      } catch (e) {
        logger.debug('AddTask.parseTorrent', e)
      }
    }
  } catch (e) {
    logger.error('AddTask.resolveFileItem', e)
    item.status = 'failed'
    item.error = t('task.file-load-failed')
  }
}

/**
 * Resolves all unresolved (pending, non-URI) batch items by reading their files.
 */
export async function resolveUnresolvedItems(batch: BatchItem[], t: (key: string) => string) {
  for (const item of batch) {
    if (item.kind !== 'uri' && item.status === 'pending' && item.payload === item.source) {
      await resolveFileItem(item, t)
    }
  }
}

/**
 * Opens a native file dialog for torrent/metalink selection, deduplicates
 * against existing batch items, resolves the files, and appends to batch.
 */
export async function chooseTorrentFile(deps: FileOpsDeps) {
  const { t, batch, fileItems, selectedBatchIndex, setPendingBatch, showWarning } = deps

  try {
    const selected = await openDialog({
      multiple: true,
      filters: [{ name: 'Torrent / Metalink', extensions: ['torrent', 'metalink', 'meta4'] }],
    })
    const paths = typeof selected === 'string' ? [selected] : Array.isArray(selected) ? selected : []
    if (paths.length === 0) return

    // Deduplicate: skip files already in the batch by source path
    const existingSources = new Set(batch.value.map((i) => i.source))
    const newPaths = paths.filter((p) => !existingSources.has(p))
    if (newPaths.length === 0) {
      showWarning(t('task.duplicate-task'))
      return
    }
    if (newPaths.length < paths.length) {
      showWarning(t('task.duplicate-task'))
    }

    const items = newPaths.map((p) => createBatchItem(detectKind(p), p))
    for (const item of items) {
      await resolveFileItem(item, t)
    }
    setPendingBatch([...batch.value, ...items])
    selectedBatchIndex.value = Math.max(0, fileItems.value.length - 1)
  } catch (e) {
    logger.debug('AddTask.chooseTorrentFile', e)
  }
}
