/**
 * @fileoverview Unit tests for the extracted restartTask function.
 *
 * restartTask is a pure async operation that:
 *   1. Validates the task is in a stopped state (error/complete/removed).
 *   2. Extracts URIs from the task.
 *   3. Preserves original per-task options (filtering non-portable keys).
 *   4. Submits each URI as a new download via addUriAtomic.
 *   5. Rolls back on partial failure (removes successfully created tasks).
 *   6. Only removes the old record after ALL new downloads succeed.
 *   7. Refreshes the task list and saves session on success.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { restartTask } from '../taskRestart'
import type { Aria2Task, TaskStatus } from '@shared/types'

const makeMockTask = (gid: string, status: TaskStatus = 'active', extra: Partial<Aria2Task> = {}): Aria2Task => ({
  gid,
  status,
  totalLength: '1000',
  completedLength: '500',
  uploadLength: '0',
  downloadSpeed: '1000',
  uploadSpeed: '0',
  connections: '1',
  numSeeders: '0',
  dir: '/tmp',
  files: [],
  bittorrent: undefined,
  infoHash: undefined,
  errorCode: undefined,
  errorMessage: undefined,
  numPieces: undefined,
  pieceLength: undefined,
  followedBy: undefined,
  following: undefined,
  belongsTo: undefined,
  ...extra,
})

function createMockApi() {
  return {
    addUriAtomic: vi.fn().mockResolvedValue('new-gid'),
    getOption: vi.fn().mockResolvedValue({}),
    removeTask: vi.fn().mockResolvedValue('OK'),
    removeTaskRecord: vi.fn().mockResolvedValue('OK'),
    fetchList: vi.fn().mockResolvedValue(undefined),
    saveSession: vi.fn().mockResolvedValue('OK'),
  }
}

const mockHistoryFns = {
  removeRecord: vi.fn().mockResolvedValue(undefined),
}

describe('restartTask', () => {
  let api: ReturnType<typeof createMockApi>

  beforeEach(() => {
    api = createMockApi()
    mockHistoryFns.removeRecord.mockClear()
  })

  // ── Guard: skip non-stopped tasks ─────────────────────────

  it('skips active tasks (no API calls)', async () => {
    const task = makeMockTask('gid1', 'active')
    await restartTask(task, api, mockHistoryFns)
    expect(api.addUriAtomic).not.toHaveBeenCalled()
  })

  it('skips paused tasks (no API calls)', async () => {
    const task = makeMockTask('gid1', 'paused')
    await restartTask(task, api, mockHistoryFns)
    expect(api.addUriAtomic).not.toHaveBeenCalled()
  })

  it('skips waiting tasks (no API calls)', async () => {
    const task = makeMockTask('gid1', 'waiting')
    await restartTask(task, api, mockHistoryFns)
    expect(api.addUriAtomic).not.toHaveBeenCalled()
  })

  // ── Allowed states ────────────────────────────────────────

  it('processes error tasks', async () => {
    const task = makeMockTask('gid1', 'error', {
      files: [
        {
          index: '1',
          path: '/f.zip',
          length: '100',
          completedLength: '0',
          selected: 'true',
          uris: [{ uri: 'http://x.com/f.zip', status: 'used' }],
        },
      ],
    })
    await restartTask(task, api, mockHistoryFns)
    expect(api.addUriAtomic).toHaveBeenCalledTimes(1)
  })

  it('processes complete tasks', async () => {
    const task = makeMockTask('gid1', 'complete', {
      files: [
        {
          index: '1',
          path: '/f.zip',
          length: '100',
          completedLength: '100',
          selected: 'true',
          uris: [{ uri: 'http://x.com/f.zip', status: 'used' }],
        },
      ],
    })
    await restartTask(task, api, mockHistoryFns)
    expect(api.addUriAtomic).toHaveBeenCalledTimes(1)
  })

  it('processes removed tasks', async () => {
    const task = makeMockTask('gid1', 'removed', {
      files: [
        {
          index: '1',
          path: '/f.zip',
          length: '100',
          completedLength: '0',
          selected: 'true',
          uris: [{ uri: 'http://x.com/f.zip', status: 'used' }],
        },
      ],
    })
    await restartTask(task, api, mockHistoryFns)
    expect(api.addUriAtomic).toHaveBeenCalledTimes(1)
  })

  // ── URI extraction and options preservation ───────────────

  it('submits each file URI as a separate download', async () => {
    const task = makeMockTask('gid1', 'error', {
      files: [
        {
          index: '1',
          path: '/a.zip',
          length: '500',
          completedLength: '0',
          selected: 'true',
          uris: [{ uri: 'http://x.com/a.zip', status: 'used' }],
        },
        {
          index: '2',
          path: '/b.zip',
          length: '500',
          completedLength: '0',
          selected: 'true',
          uris: [{ uri: 'http://x.com/b.zip', status: 'used' }],
        },
      ],
    })
    api.addUriAtomic.mockResolvedValueOnce('new-a').mockResolvedValueOnce('new-b')
    api.getOption.mockResolvedValue({ dir: '/dl' })

    await restartTask(task, api, mockHistoryFns)

    expect(api.addUriAtomic).toHaveBeenCalledTimes(2)
    expect(api.addUriAtomic).toHaveBeenNthCalledWith(1, {
      uris: ['http://x.com/a.zip'],
      options: { dir: '/dl' },
    })
    expect(api.addUriAtomic).toHaveBeenNthCalledWith(2, {
      uris: ['http://x.com/b.zip'],
      options: { dir: '/dl' },
    })
  })

  it('filters non-portable keys from preserved options', async () => {
    const task = makeMockTask('gid1', 'error', {
      files: [
        {
          index: '1',
          path: '/f.zip',
          length: '100',
          completedLength: '0',
          selected: 'true',
          uris: [{ uri: 'http://x.com/f.zip', status: 'used' }],
        },
      ],
    })
    api.getOption.mockResolvedValue({
      dir: '/dl',
      'max-download-limit': '1M',
      followTorrent: 'true',
      followMetalink: 'true',
      pauseMetadata: 'true',
      gid: 'old-gid',
      header: 'X-Custom: value',
    })

    await restartTask(task, api, mockHistoryFns)

    expect(api.addUriAtomic).toHaveBeenCalledWith({
      uris: ['http://x.com/f.zip'],
      options: { dir: '/dl', 'max-download-limit': '1M', header: 'X-Custom: value' },
    })
  })

  it('falls back to task.dir when getOption fails', async () => {
    const task = makeMockTask('gid1', 'error', {
      dir: '/fallback-dir',
      files: [
        {
          index: '1',
          path: '/f.zip',
          length: '100',
          completedLength: '0',
          selected: 'true',
          uris: [{ uri: 'http://x.com/f.zip', status: 'used' }],
        },
      ],
    })
    api.getOption.mockRejectedValue(new Error('RPC fail'))

    await restartTask(task, api, mockHistoryFns)

    expect(api.addUriAtomic).toHaveBeenCalledWith({
      uris: ['http://x.com/f.zip'],
      options: { dir: '/fallback-dir' },
    })
  })

  // ── Cleanup after success ─────────────────────────────────

  it('removes old record from both aria2 and history DB after success', async () => {
    const task = makeMockTask('old-gid', 'error', {
      files: [
        {
          index: '1',
          path: '/f.zip',
          length: '100',
          completedLength: '0',
          selected: 'true',
          uris: [{ uri: 'http://x.com/f.zip', status: 'used' }],
        },
      ],
    })

    await restartTask(task, api, mockHistoryFns)

    expect(api.removeTaskRecord).toHaveBeenCalledWith({ gid: 'old-gid' })
    expect(mockHistoryFns.removeRecord).toHaveBeenCalledWith('old-gid')
    expect(api.fetchList).toHaveBeenCalled()
    expect(api.saveSession).toHaveBeenCalled()
  })

  // ── Rollback on partial failure ───────────────────────────

  it('rolls back created tasks when a subsequent addUriAtomic fails', async () => {
    const task = makeMockTask('gid1', 'error', {
      files: [
        {
          index: '1',
          path: '/a.zip',
          length: '500',
          completedLength: '0',
          selected: 'true',
          uris: [{ uri: 'http://x.com/a.zip', status: 'used' }],
        },
        {
          index: '2',
          path: '/b.zip',
          length: '500',
          completedLength: '0',
          selected: 'true',
          uris: [{ uri: 'http://x.com/b.zip', status: 'used' }],
        },
      ],
    })
    api.addUriAtomic.mockResolvedValueOnce('new-a').mockRejectedValueOnce(new Error('fail'))

    await expect(restartTask(task, api, mockHistoryFns)).rejects.toThrow('fail')

    // Rollback: remove the successfully created task
    expect(api.removeTask).toHaveBeenCalledWith({ gid: 'new-a' })
    // Must NOT remove old record on failure
    expect(api.removeTaskRecord).not.toHaveBeenCalled()
    expect(mockHistoryFns.removeRecord).not.toHaveBeenCalled()
  })

  // ── No URIs ───────────────────────────────────────────────

  it('throws when no URIs can be extracted', async () => {
    const task = makeMockTask('gid1', 'error', { files: [] })

    await expect(restartTask(task, api, mockHistoryFns)).rejects.toThrow('no download URIs')
  })
})
