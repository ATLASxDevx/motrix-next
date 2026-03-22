/**
 * @fileoverview Tests for the deleteTaskFiles function.
 *
 * Key behaviors under test:
 * - Deletes each file referenced by the task
 * - Deletes companion .aria2 control files for each task file
 * - Removes empty parent directories (but not the root download dir)
 * - Removes the named task directory if empty after file deletion
 * - Silently handles missing files without throwing
 * - Handles tasks with no files gracefully
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Aria2Task } from '@shared/types'

// ── Mock Tauri FS and Path ──────────────────────────────────────────
const mockRemove = vi.fn()
const mockReadDir = vi.fn()
const mockJoin = vi.fn()

vi.mock('@tauri-apps/plugin-fs', () => ({
  remove: (...args: unknown[]) => mockRemove(...args),
  readDir: (...args: unknown[]) => mockReadDir(...args),
}))

vi.mock('@tauri-apps/api/path', () => ({
  join: (...args: unknown[]) => mockJoin(...args),
}))

import { deleteTaskFiles } from '../useFileDelete'

function makeTask(overrides: Partial<Aria2Task> = {}): Aria2Task {
  return {
    gid: 'abc123',
    status: 'complete',
    totalLength: '1000',
    completedLength: '1000',
    uploadLength: '0',
    downloadSpeed: '0',
    uploadSpeed: '0',
    connections: '0',
    dir: '/downloads',
    files: [],
    ...overrides,
  }
}

describe('deleteTaskFiles', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRemove.mockResolvedValue(undefined)
    mockReadDir.mockResolvedValue([]) // empty dir by default
    mockJoin.mockImplementation((...parts: string[]) => parts.join('/'))
  })

  it('deletes each file and its companion .aria2 control file', async () => {
    const task = makeTask({
      files: [
        { index: '1', path: '/downloads/file1.zip', length: '500', completedLength: '500', selected: 'true', uris: [] },
        { index: '2', path: '/downloads/file2.zip', length: '500', completedLength: '500', selected: 'true', uris: [] },
      ],
    })

    await deleteTaskFiles(task)

    expect(mockRemove).toHaveBeenCalledWith('/downloads/file1.zip', { recursive: true })
    expect(mockRemove).toHaveBeenCalledWith('/downloads/file1.zip.aria2')
    expect(mockRemove).toHaveBeenCalledWith('/downloads/file2.zip', { recursive: true })
    expect(mockRemove).toHaveBeenCalledWith('/downloads/file2.zip.aria2')
  })

  it('removes empty parent directories that differ from root dir', async () => {
    const task = makeTask({
      files: [
        {
          index: '1',
          path: '/downloads/subdir/file.bin',
          length: '100',
          completedLength: '100',
          selected: 'true',
          uris: [],
        },
      ],
    })
    mockReadDir.mockResolvedValue([]) // subdir is empty

    await deleteTaskFiles(task)

    // Should attempt to remove /downloads/subdir
    expect(mockReadDir).toHaveBeenCalledWith('/downloads/subdir')
    expect(mockRemove).toHaveBeenCalledWith('/downloads/subdir')
  })

  it('does not remove non-empty parent directories', async () => {
    const task = makeTask({
      files: [
        {
          index: '1',
          path: '/downloads/subdir/file.bin',
          length: '100',
          completedLength: '100',
          selected: 'true',
          uris: [],
        },
      ],
    })
    mockReadDir.mockResolvedValue([{ name: 'other.txt' }]) // not empty

    await deleteTaskFiles(task)

    // readDir called but remove NOT called for the subdir
    const removeCalls = mockRemove.mock.calls.map((c: unknown[]) => c[0])
    expect(removeCalls).not.toContain('/downloads/subdir')
  })

  it('silently handles missing files without throwing', async () => {
    const task = makeTask({
      files: [
        { index: '1', path: '/downloads/gone.zip', length: '100', completedLength: '100', selected: 'true', uris: [] },
      ],
    })
    mockRemove.mockRejectedValue(new Error('file not found'))

    // Should not throw
    await expect(deleteTaskFiles(task)).resolves.toBeUndefined()
  })

  it('handles tasks with no files gracefully', async () => {
    const task = makeTask({ files: [] })

    await deleteTaskFiles(task)

    // No remove calls for files (only possibly the task dir)
    // The task has no bittorrent info, so getTaskName returns '' and no task dir removal
    expect(mockRemove).not.toHaveBeenCalled()
  })

  it('removes the named task directory when it exists and is empty', async () => {
    const task = makeTask({
      bittorrent: { info: { name: 'My Torrent' } },
      files: [
        {
          index: '1',
          path: '/downloads/My Torrent/video.mp4',
          length: '1000',
          completedLength: '1000',
          selected: 'true',
          uris: [],
        },
      ],
    })
    mockReadDir.mockResolvedValue([]) // empty after file deletion

    await deleteTaskFiles(task)

    // Should attempt to remove the named task dir
    expect(mockJoin).toHaveBeenCalledWith('/downloads', 'My Torrent')
    expect(mockReadDir).toHaveBeenCalledWith('/downloads/My Torrent')
  })

  it('skips files with empty path', async () => {
    const task = makeTask({
      files: [{ index: '1', path: '', length: '0', completedLength: '0', selected: 'true', uris: [] }],
    })

    await deleteTaskFiles(task)

    // Only task dir removals, no file removals since path is empty
    const removedPaths = mockRemove.mock.calls.map((c: unknown[]) => c[0])
    expect(removedPaths).not.toContain('')
  })
})
