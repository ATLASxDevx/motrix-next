/** @fileoverview TDD tests for the batch delete composable.
 *
 * Tests the pure logic for batch and single record deletion with
 * optional local file removal.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Tauri FS — remove still uses plugin-fs directly
const mockRemove = vi.fn()
vi.mock('@tauri-apps/plugin-fs', () => ({
  remove: (...args: unknown[]) => mockRemove(...args),
}))

// Mock Tauri invoke — check_path_exists now goes through invoke
const mockInvoke = vi.fn()
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}))

// Mock Tauri path — join uses OS-native separator, mock with /
vi.mock('@tauri-apps/api/path', () => ({
  join: (...parts: string[]) => Promise.resolve(parts.join('/')),
}))

const { deleteLocalFiles, buildFilePaths } = await import('../useBatchDelete')

describe('useBatchDelete', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── buildFilePaths ──────────────────────────────────────────────

  describe('buildFilePaths', () => {
    it('combines dir and name into full path', async () => {
      const paths = await buildFilePaths([
        { dir: '/downloads', name: 'video.mp4' },
        { dir: '/downloads/sub', name: 'file.zip' },
      ])
      expect(paths).toEqual(['/downloads/video.mp4', '/downloads/sub/file.zip'])
    })

    it('returns empty array for empty input', async () => {
      expect(await buildFilePaths([])).toEqual([])
    })

    it('skips entries with missing dir or name', async () => {
      const paths = await buildFilePaths([
        { dir: '/downloads', name: 'valid.zip' },
        { dir: '', name: 'no-dir.zip' },
        { dir: '/downloads', name: '' },
      ])
      expect(paths).toEqual(['/downloads/valid.zip'])
    })
  })

  // ── deleteLocalFiles ────────────────────────────────────────────

  describe('deleteLocalFiles', () => {
    it('deletes files that exist', async () => {
      mockInvoke.mockResolvedValue(true)
      mockRemove.mockResolvedValue(undefined)

      const { deleted, errors } = await deleteLocalFiles(['/downloads/a.zip', '/downloads/b.zip'])

      expect(deleted).toBe(2)
      expect(errors).toBe(0)
      expect(mockRemove).toHaveBeenCalledTimes(2)
    })

    it('skips files that do not exist', async () => {
      mockInvoke.mockResolvedValueOnce(true).mockResolvedValueOnce(false)
      mockRemove.mockResolvedValue(undefined)

      const { deleted, errors } = await deleteLocalFiles(['/downloads/a.zip', '/downloads/gone.zip'])

      expect(deleted).toBe(1)
      expect(errors).toBe(0)
      expect(mockRemove).toHaveBeenCalledTimes(1)
    })

    it('counts errors but does not throw', async () => {
      mockInvoke.mockResolvedValue(true)
      mockRemove.mockRejectedValueOnce(new Error('perm denied')).mockResolvedValueOnce(undefined)

      const { deleted, errors } = await deleteLocalFiles(['/downloads/locked.zip', '/downloads/ok.zip'])

      expect(deleted).toBe(1)
      expect(errors).toBe(1)
    })

    it('handles empty file list', async () => {
      const { deleted, errors } = await deleteLocalFiles([])
      expect(deleted).toBe(0)
      expect(errors).toBe(0)
    })
  })
})
