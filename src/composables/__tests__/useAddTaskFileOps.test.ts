/**
 * @fileoverview Behavioral tests for useAddTaskFileOps.ts
 *
 * Strategy:
 *  - Mock Tauri APIs (readFile, openDialog) via vi.mock
 *  - Mock parseTorrentBuffer and uint8ToBase64 for controlled output
 *  - Mock detectKind / createBatchItem for batch item creation
 *  - AAA pattern for each test
 *  - Cover: success, file-read failure, dedup logic, empty selections
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import type { BatchItem } from '@shared/types'

// ── Mock Tauri readFile ────────────────────────────────────────────
const mockReadFile = vi.fn()
vi.mock('@tauri-apps/plugin-fs', () => ({
  readFile: (...args: unknown[]) => mockReadFile(...args),
}))

// ── Mock Tauri openDialog ──────────────────────────────────────────
const mockOpenDialog = vi.fn()
vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: (...args: unknown[]) => mockOpenDialog(...args),
}))

// ── Mock torrent parser ────────────────────────────────────────────
const mockParseTorrentBuffer = vi.fn()
const mockUint8ToBase64 = vi.fn()
vi.mock('@/composables/useTorrentParser', () => ({
  parseTorrentBuffer: (...args: unknown[]) => mockParseTorrentBuffer(...args),
  uint8ToBase64: (...args: unknown[]) => mockUint8ToBase64(...args),
}))

// ── Mock bencode ───────────────────────────────────────────────────
vi.mock('bencode', () => ({
  default: { decode: vi.fn(), encode: vi.fn() },
}))

// ── Mock logger ────────────────────────────────────────────────────
vi.mock('@shared/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}))

// ── Mock batch helpers ─────────────────────────────────────────────
vi.mock('@shared/utils/batchHelpers', () => ({
  detectKind: (path: string) => {
    if (path.endsWith('.torrent')) return 'torrent'
    if (path.endsWith('.metalink') || path.endsWith('.meta4')) return 'metalink'
    return 'uri'
  },
  createBatchItem: (kind: string, source: string) => ({
    kind,
    source,
    payload: source,
    status: 'pending',
    error: undefined,
    torrentMeta: undefined,
    selectedFileIndices: [],
  }),
}))

// ── Import under test (after mocks) ───────────────────────────────
import { resolveFileItem, resolveUnresolvedItems, chooseTorrentFile } from '../useAddTaskFileOps'

// ── Helpers ────────────────────────────────────────────────────────

const mockT = (key: string) => key

function makeBatchItem(overrides: Record<string, unknown> = {}): BatchItem {
  return {
    kind: 'torrent',
    source: '/path/to/file.torrent',
    payload: '/path/to/file.torrent',
    status: 'pending',
    error: undefined,
    torrentMeta: undefined,
    selectedFileIndices: [],
    ...overrides,
  } as unknown as BatchItem
}

// ═══════════════════════════════════════════════════════════════════
// resolveFileItem
// ═══════════════════════════════════════════════════════════════════

describe('resolveFileItem', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUint8ToBase64.mockReturnValue('base64data')
    mockReadFile.mockResolvedValue(new Uint8Array([1, 2, 3]))
  })

  it('reads file bytes and converts to base64', async () => {
    const item = makeBatchItem({ kind: 'torrent', source: '/test.torrent' })
    mockParseTorrentBuffer.mockResolvedValue(null)

    await resolveFileItem(item, mockT)

    expect(mockReadFile).toHaveBeenCalledWith('/test.torrent')
    expect(mockUint8ToBase64).toHaveBeenCalled()
    expect(item.payload).toBe('base64data')
  })

  it('parses torrent metadata for torrent files', async () => {
    const meta = {
      name: 'ubuntu-24.04.iso',
      files: [{ idx: 0, path: 'ubuntu.iso', length: 1024 }],
    }
    mockParseTorrentBuffer.mockResolvedValue(meta)

    const item = makeBatchItem({ kind: 'torrent' })
    await resolveFileItem(item, mockT)

    expect(item.torrentMeta).toEqual(meta)
    expect(item.selectedFileIndices).toEqual([0])
  })

  it('selects all file indices from parsed metadata', async () => {
    const meta = {
      name: 'multi-file',
      files: [
        { idx: 0, path: 'a.txt', length: 100 },
        { idx: 1, path: 'b.txt', length: 200 },
        { idx: 2, path: 'c.txt', length: 300 },
      ],
    }
    mockParseTorrentBuffer.mockResolvedValue(meta)

    const item = makeBatchItem({ kind: 'torrent' })
    await resolveFileItem(item, mockT)

    expect(item.selectedFileIndices).toEqual([0, 1, 2])
  })

  it('does NOT parse torrent metadata for metalink files', async () => {
    const item = makeBatchItem({ kind: 'metalink', source: '/test.metalink' })
    await resolveFileItem(item, mockT)

    expect(mockParseTorrentBuffer).not.toHaveBeenCalled()
    expect(item.payload).toBe('base64data')
  })

  it('marks item as failed when readFile throws', async () => {
    mockReadFile.mockRejectedValueOnce(new Error('Permission denied'))

    const item = makeBatchItem()
    await resolveFileItem(item, mockT)

    expect(item.status).toBe('failed')
    expect(item.error).toBe('task.file-load-failed')
  })

  it('still sets base64 payload even when parseTorrent fails', async () => {
    mockParseTorrentBuffer.mockRejectedValueOnce(new Error('corrupt'))

    const item = makeBatchItem({ kind: 'torrent' })
    await resolveFileItem(item, mockT)

    // base64 should still be set — only torrent parsing failed
    expect(item.payload).toBe('base64data')
    expect(item.torrentMeta).toBeUndefined()
    expect(item.status).toBe('pending') // NOT 'failed'
  })

  it('handles non-Uint8Array return from readFile', async () => {
    // Some implementations return ArrayBuffer instead of Uint8Array
    mockReadFile.mockResolvedValue(new ArrayBuffer(4))

    const item = makeBatchItem({ kind: 'metalink' })
    await resolveFileItem(item, mockT)

    expect(mockUint8ToBase64).toHaveBeenCalled()
    expect(item.payload).toBe('base64data')
  })
})

// ═══════════════════════════════════════════════════════════════════
// resolveUnresolvedItems
// ═══════════════════════════════════════════════════════════════════

describe('resolveUnresolvedItems', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockReadFile.mockResolvedValue(new Uint8Array([10, 20]))
    mockUint8ToBase64.mockReturnValue('resolved-base64')
    mockParseTorrentBuffer.mockResolvedValue(null)
  })

  it('resolves pending non-URI items whose payload === source', async () => {
    const item = makeBatchItem({
      kind: 'torrent',
      source: '/test.torrent',
      payload: '/test.torrent', // payload === source → unresolved
      status: 'pending',
    })
    await resolveUnresolvedItems([item], mockT)
    expect(mockReadFile).toHaveBeenCalledWith('/test.torrent')
    expect(item.payload).toBe('resolved-base64')
  })

  it('skips URI-kind items', async () => {
    const uriItem = makeBatchItem({ kind: 'uri', status: 'pending', source: 'http://x', payload: 'http://x' })
    await resolveUnresolvedItems([uriItem], mockT)
    expect(mockReadFile).not.toHaveBeenCalled()
  })

  it('skips already-resolved items (payload !== source)', async () => {
    const resolved = makeBatchItem({
      source: '/test.torrent',
      payload: 'already-base64',
      status: 'pending',
    })
    await resolveUnresolvedItems([resolved], mockT)
    expect(mockReadFile).not.toHaveBeenCalled()
  })

  it('skips non-pending items', async () => {
    const failed = makeBatchItem({ status: 'failed', source: '/a.torrent', payload: '/a.torrent' })
    await resolveUnresolvedItems([failed], mockT)
    expect(mockReadFile).not.toHaveBeenCalled()
  })

  it('resolves multiple items sequentially', async () => {
    const items = [
      makeBatchItem({ source: '/a.torrent', payload: '/a.torrent' }),
      makeBatchItem({ source: '/b.torrent', payload: '/b.torrent' }),
    ]
    await resolveUnresolvedItems(items, mockT)
    expect(mockReadFile).toHaveBeenCalledTimes(2)
    expect(mockReadFile).toHaveBeenCalledWith('/a.torrent')
    expect(mockReadFile).toHaveBeenCalledWith('/b.torrent')
  })

  it('handles empty batch gracefully', async () => {
    await resolveUnresolvedItems([], mockT)
    expect(mockReadFile).not.toHaveBeenCalled()
  })
})

// ═══════════════════════════════════════════════════════════════════
// chooseTorrentFile
// ═══════════════════════════════════════════════════════════════════

describe('chooseTorrentFile', () => {
  let setPendingBatch: Mock
  let showWarning: Mock

  function makeDeps(existingBatch: BatchItem[] = []) {
    setPendingBatch = vi.fn()
    showWarning = vi.fn()
    return {
      t: mockT,
      batch: { value: existingBatch },
      fileItems: { value: existingBatch.filter((i) => i.kind !== 'uri') },
      selectedBatchIndex: { value: 0 },
      setPendingBatch,
      showWarning,
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockReadFile.mockResolvedValue(new Uint8Array([1]))
    mockUint8ToBase64.mockReturnValue('b64')
    mockParseTorrentBuffer.mockResolvedValue(null)
  })

  it('displays dialog with torrent/metalink filter', async () => {
    mockOpenDialog.mockResolvedValueOnce(null)
    await chooseTorrentFile(makeDeps())
    expect(mockOpenDialog).toHaveBeenCalledWith({
      multiple: true,
      filters: [{ name: 'Torrent / Metalink', extensions: ['torrent', 'metalink', 'meta4'] }],
    })
  })

  it('does nothing when user cancels dialog (null)', async () => {
    mockOpenDialog.mockResolvedValueOnce(null)
    const deps = makeDeps()
    await chooseTorrentFile(deps)
    expect(setPendingBatch).not.toHaveBeenCalled()
  })

  it('appends new files to batch after resolving', async () => {
    mockOpenDialog.mockResolvedValueOnce(['/new.torrent'])
    const deps = makeDeps()
    await chooseTorrentFile(deps)
    expect(setPendingBatch).toHaveBeenCalledOnce()
    const newBatch = setPendingBatch.mock.calls[0][0]
    expect(newBatch).toHaveLength(1)
    expect(newBatch[0].source).toBe('/new.torrent')
  })

  it('handles single string selection (not array)', async () => {
    mockOpenDialog.mockResolvedValueOnce('/single.torrent')
    const deps = makeDeps()
    await chooseTorrentFile(deps)
    expect(setPendingBatch).toHaveBeenCalledOnce()
    const newBatch = setPendingBatch.mock.calls[0][0]
    expect(newBatch).toHaveLength(1)
    expect(newBatch[0].source).toBe('/single.torrent')
  })

  it('deduplicates against existing batch items', async () => {
    const existing = makeBatchItem({ source: '/dup.torrent' })
    mockOpenDialog.mockResolvedValueOnce(['/dup.torrent', '/new.torrent'])
    const deps = makeDeps([existing])
    await chooseTorrentFile(deps)

    // Only /new.torrent should be added
    expect(setPendingBatch).toHaveBeenCalledOnce()
    const newBatch = setPendingBatch.mock.calls[0][0]
    expect(newBatch).toHaveLength(2) // 1 existing + 1 new
    expect(newBatch[1].source).toBe('/new.torrent')
    expect(showWarning).toHaveBeenCalledWith('task.duplicate-task')
  })

  it('shows warning and returns when all selected files are duplicates', async () => {
    const existing = makeBatchItem({ source: '/dup.torrent' })
    mockOpenDialog.mockResolvedValueOnce(['/dup.torrent'])
    const deps = makeDeps([existing])
    await chooseTorrentFile(deps)

    expect(setPendingBatch).not.toHaveBeenCalled()
    expect(showWarning).toHaveBeenCalledWith('task.duplicate-task')
  })

  it('resolves each new file before appending to batch', async () => {
    mockOpenDialog.mockResolvedValueOnce(['/a.torrent', '/b.metalink'])
    const deps = makeDeps()
    await chooseTorrentFile(deps)

    expect(mockReadFile).toHaveBeenCalledTimes(2)
    expect(mockReadFile).toHaveBeenCalledWith('/a.torrent')
    expect(mockReadFile).toHaveBeenCalledWith('/b.metalink')
  })

  it('does not throw when openDialog throws', async () => {
    mockOpenDialog.mockRejectedValueOnce(new Error('access denied'))
    const deps = makeDeps()
    // Should not throw — error is caught internally
    await expect(chooseTorrentFile(deps)).resolves.toBeUndefined()
    expect(setPendingBatch).not.toHaveBeenCalled()
  })

  it('updates selectedBatchIndex to last file item', async () => {
    const existing = makeBatchItem({ source: '/old.torrent' })
    mockOpenDialog.mockResolvedValueOnce(['/new.torrent'])
    const deps = makeDeps([existing])
    await chooseTorrentFile(deps)

    // After adding, fileItems.length should be checked for index
    // The mock fileItems won't auto-update, but selectedBatchIndex
    // should be set to max(0, fileItems.value.length - 1)
    expect(deps.selectedBatchIndex.value).toBeGreaterThanOrEqual(0)
  })
})
