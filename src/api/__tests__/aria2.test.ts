/**
 * @fileoverview Tests for the aria2 API layer (src/api/aria2.ts).
 *
 * Key behaviors under test:
 * - Client initialization sets engineReady=true
 * - getClient throws when not initialized
 * - All API methods delegate to the correct Aria2 RPC method
 * - fetchTaskList routes by type (active = active + waiting, default = stopped)
 * - addUri creates one call per URI with per-URI output filename override
 * - addUriAtomic creates exactly one call with all URIs as mirrors
 * - Batch operations (resume/pause/remove) use multicall
 * - Type guards are applied on getGlobalStat and fetchTaskItem
 * - closeClient resets client to null and clears state
 * - fetchPreference and savePreference use dynamic Tauri invoke
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Hoisted mocks (available inside vi.mock factories) ──────────────
const { mockCall, mockMulticall, mockOpen, mockClose, mockInvoke } = vi.hoisted(() => ({
  mockCall: vi.fn(),
  mockMulticall: vi.fn(),
  mockOpen: vi.fn().mockResolvedValue(undefined),
  mockClose: vi.fn().mockResolvedValue(undefined),
  mockInvoke: vi.fn().mockResolvedValue({}),
}))

vi.mock('@shared/aria2', () => {
  class MockAria2 {
    call = mockCall
    multicall = mockMulticall
    open = mockOpen
    close = mockClose
  }
  return { Aria2: MockAria2 }
})

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}))

import {
  initClient,
  closeClient,
  isEngineReady,
  setEngineReady,
  getClient,
  getVersion,
  getGlobalOption,
  getGlobalStat,
  changeGlobalOption,
  getOption,
  changeOption,
  getFiles,
  fetchTaskList,
  fetchTaskItem,
  fetchTaskItemWithPeers,
  fetchActiveTaskList,
  addUri,
  addUriAtomic,
  addTorrent,
  addMetalink,
  removeTask,
  pauseTask,
  resumeTask,
  forcePauseTask,
  pauseAllTask,
  forcePauseAllTask,
  resumeAllTask,
  saveSession,
  removeTaskRecord,
  purgeTaskRecord,
  batchResumeTask,
  batchPauseTask,
  batchRemoveTask,
  fetchPreference,
  savePreference,
} from '../aria2'

describe('aria2 API', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    // Reset module state by re-initializing
    setEngineReady(false)
    try {
      await closeClient()
    } catch {
      /* ignore */
    }
  })

  // ── Client Lifecycle ────────────────────────────────────────────

  describe('client lifecycle', () => {
    it('initClient creates a client and sets engineReady=true', async () => {
      expect(isEngineReady()).toBe(false)

      await initClient({ port: 6800, secret: 'mysecret' })

      expect(isEngineReady()).toBe(true)
      expect(mockOpen).toHaveBeenCalledOnce()
    })

    it('getClient throws when not initialized', async () => {
      expect(() => getClient()).toThrow('Aria2 client not initialized')
    })

    it('closeClient resets client reference', async () => {
      await initClient({ port: 6800, secret: 's' })
      await closeClient()

      // Client should be nulled — getClient must throw
      expect(() => getClient()).toThrow('Aria2 client not initialized')
    })

    it('setEngineReady explicitly controls readiness flag', () => {
      setEngineReady(true)
      expect(isEngineReady()).toBe(true)
      setEngineReady(false)
      expect(isEngineReady()).toBe(false)
    })
  })

  // ── RPC Method Delegation ───────────────────────────────────────

  describe('RPC methods', () => {
    beforeEach(async () => {
      await initClient({ port: 6800, secret: 's' })
    })

    it('getVersion calls aria2.getVersion', async () => {
      mockCall.mockResolvedValueOnce({ version: '1.37.0', enabledFeatures: ['BitTorrent'] })
      const result = await getVersion()
      expect(mockCall).toHaveBeenCalledWith('getVersion')
      expect(result.version).toBe('1.37.0')
    })

    it('getGlobalOption returns camelCase keys', async () => {
      mockCall.mockResolvedValueOnce({ 'max-concurrent-downloads': '5' })
      const result = await getGlobalOption()
      expect(result).toHaveProperty('maxConcurrentDownloads')
    })

    it('getGlobalStat validates response with type guard', async () => {
      const stat = {
        downloadSpeed: '0',
        uploadSpeed: '0',
        numActive: '0',
        numStopped: '0',
        numWaiting: '0',
        numStoppedTotal: '0',
      }
      mockCall.mockResolvedValueOnce(stat)
      const result = await getGlobalStat()
      expect(result).toEqual(stat)
    })

    it('changeGlobalOption formats options for engine', async () => {
      mockCall.mockResolvedValueOnce('OK')
      await changeGlobalOption({ maxConcurrentDownloads: 10 } as never)
      expect(mockCall).toHaveBeenCalledWith('changeGlobalOption', expect.any(Object))
    })

    it('getOption returns camelCase keys for specific GID', async () => {
      mockCall.mockResolvedValueOnce({ 'max-download-limit': '0' })
      const result = await getOption({ gid: 'abc' })
      expect(mockCall).toHaveBeenCalledWith('getOption', 'abc')
      expect(result).toHaveProperty('maxDownloadLimit')
    })

    it('changeOption formats and sends options for a specific GID', async () => {
      mockCall.mockResolvedValueOnce('OK')
      await changeOption({ gid: 'abc', options: { maxDownloadLimit: '0' } as never })
      expect(mockCall).toHaveBeenCalledWith('changeOption', 'abc', expect.any(Object))
    })

    it('getFiles calls aria2.getFiles and returns camelCase typed files', async () => {
      const rawFiles = [
        {
          index: '1',
          path: '/downloads/movie.mkv',
          length: '1500000000',
          'completed-length': '0',
          selected: 'true',
          uris: [{ uri: 'magnet:?xt=urn:btih:abc', status: 'used' }],
        },
        {
          index: '2',
          path: '/downloads/subtitle.srt',
          length: '50000',
          'completed-length': '0',
          selected: 'true',
          uris: [],
        },
      ]
      mockCall.mockResolvedValueOnce(rawFiles)
      const result = await getFiles({ gid: 'magnet-gid' })
      expect(mockCall).toHaveBeenCalledWith('getFiles', 'magnet-gid')
      expect(result).toHaveLength(2)
      expect(result[0].path).toBe('/downloads/movie.mkv')
      expect(result[0].completedLength).toBe('0')
      expect(result[1].length).toBe('50000')
    })
  })

  // ── Task Fetching ───────────────────────────────────────────────

  describe('task fetching', () => {
    beforeEach(async () => {
      await initClient({ port: 6800, secret: 's' })
    })

    it('fetchTaskList with type "active" calls tellActive + tellWaiting', async () => {
      const active = [{ gid: '1', status: 'active' }]
      const waiting = [{ gid: '2', status: 'waiting' }]
      mockCall.mockResolvedValueOnce(active).mockResolvedValueOnce(waiting)

      const result = await fetchTaskList({ type: 'active' })
      expect(result).toHaveLength(2)
      expect(result[0].gid).toBe('2')
      expect(result[1].gid).toBe('1')
    })

    it('fetchTaskList with default type calls tellStopped', async () => {
      const stopped = [{ gid: '3', status: 'complete' }]
      mockCall.mockResolvedValueOnce(stopped)

      const result = await fetchTaskList({ type: 'complete' })
      expect(result).toHaveLength(1)
    })

    it('fetchActiveTaskList calls tellActive only', async () => {
      mockCall.mockResolvedValueOnce([{ gid: '1' }])
      const result = await fetchActiveTaskList()
      expect(result).toHaveLength(1)
    })

    it('fetchTaskItem validates task with isAria2Task guard', async () => {
      const task = {
        gid: 'abc',
        status: 'active',
        totalLength: '100',
        completedLength: '50',
        uploadLength: '0',
        downloadSpeed: '0',
        uploadSpeed: '0',
        connections: '1',
        dir: '/dl',
        files: [],
      }
      mockCall.mockResolvedValueOnce(task)
      const result = await fetchTaskItem({ gid: 'abc' })
      expect(result.gid).toBe('abc')
    })

    it('fetchTaskItemWithPeers returns task merged with peers', async () => {
      const task = { gid: 'abc', status: 'active' }
      const peers = [{ peerId: 'peer1', ip: '1.2.3.4', port: '6881' }]
      mockCall.mockResolvedValueOnce(task).mockResolvedValueOnce(peers)
      const result = await fetchTaskItemWithPeers({ gid: 'abc' })
      expect(result.gid).toBe('abc')
      expect(result.peers).toHaveLength(1)
    })

    // ── GID-based stable sorting ──────────────────────────────────

    it('fetchTaskList sorts active+waiting results by GID descending (newest first)', async () => {
      // Simulate aria2 returning tasks out of order (e.g., after pause/resume)
      const active = [
        { gid: 'c', status: 'active' },
        { gid: 'a', status: 'active' },
      ]
      const waiting = [
        { gid: 'd', status: 'paused' },
        { gid: 'b', status: 'waiting' },
      ]
      mockCall.mockResolvedValueOnce(active).mockResolvedValueOnce(waiting)

      const result = await fetchTaskList({ type: 'active' })
      expect(result.map((t) => t.gid)).toEqual(['d', 'c', 'b', 'a'])
    })

    it('fetchTaskList sorts stopped results by GID descending (newest first)', async () => {
      const stopped = [
        { gid: '0000000000000003', status: 'complete' },
        { gid: '0000000000000001', status: 'error' },
        { gid: '0000000000000002', status: 'complete' },
      ]
      mockCall.mockResolvedValueOnce(stopped)

      const result = await fetchTaskList({ type: 'stopped' })
      expect(result.map((t) => t.gid)).toEqual(['0000000000000003', '0000000000000002', '0000000000000001'])
    })

    it('sorting is stable across poll cycles regardless of status changes', async () => {
      // First poll: task 'b' is active
      mockCall
        .mockResolvedValueOnce([
          { gid: 'b', status: 'active' },
          { gid: 'a', status: 'active' },
        ])
        .mockResolvedValueOnce([{ gid: 'c', status: 'waiting' }])
      const poll1 = await fetchTaskList({ type: 'active' })

      // Second poll: task 'b' moved to waiting (paused), order from aria2 changed
      mockCall.mockResolvedValueOnce([{ gid: 'a', status: 'active' }]).mockResolvedValueOnce([
        { gid: 'c', status: 'waiting' },
        { gid: 'b', status: 'paused' },
      ])
      const poll2 = await fetchTaskList({ type: 'active' })

      // GID descending order must be identical in both polls
      expect(poll1.map((t) => t.gid)).toEqual(['c', 'b', 'a'])
      expect(poll2.map((t) => t.gid)).toEqual(['c', 'b', 'a'])
    })
  })

  // ── Task Creation ───────────────────────────────────────────────

  describe('task creation', () => {
    beforeEach(async () => {
      await initClient({ port: 6800, secret: 's' })
    })

    it('addUri creates one call per URI with per-URI out option', async () => {
      mockCall.mockResolvedValue('gid1')

      const result = await addUri({
        uris: ['http://a.com/1.zip', 'http://b.com/2.zip'],
        outs: ['file1.zip', ''],
        options: {},
      })

      expect(result).toHaveLength(2)
      // First call should have out option
      const firstCallOpts = mockCall.mock.calls[0][2] as Record<string, string>
      expect(firstCallOpts.out).toBe('file1.zip')
    })

    it('addUriAtomic creates exactly one call with all URIs', async () => {
      mockCall.mockResolvedValueOnce('gid-atomic')

      const result = await addUriAtomic({
        uris: ['http://mirror1.com/f.zip', 'http://mirror2.com/f.zip'],
        options: {},
      })

      expect(result).toBe('gid-atomic')
      expect(mockCall).toHaveBeenCalledTimes(1)
      const uris = mockCall.mock.calls[0][1] as string[]
      expect(uris).toHaveLength(2)
    })

    it('addTorrent passes base64 torrent data', async () => {
      mockCall.mockResolvedValueOnce('gid-torrent')
      const result = await addTorrent({ torrent: 'base64data', options: {} })
      expect(result).toBe('gid-torrent')
      expect(mockCall).toHaveBeenCalledWith('addTorrent', 'base64data', [], expect.any(Object))
    })

    it('addMetalink passes base64 metalink data', async () => {
      mockCall.mockResolvedValueOnce(['gid-ml1'])
      const result = await addMetalink({ metalink: 'base64ml', options: {} })
      expect(result).toEqual(['gid-ml1'])
    })

    // ── force-save per-download isolation ──────────────────────────
    // aria2's SessionSerializer.cc:288 only persists FINISHED tasks when
    // the task's per-download force-save=true.  Setting it globally causes
    // completed HTTP downloads to persist in the session file, making aria2
    // re-download them on restart (infinite loop).
    //
    // Solution: inject force-save=true ONLY on BT/metalink tasks that need
    // session persistence for seeding resumption.

    it('addTorrent injects force-save=true into per-download options', async () => {
      mockCall.mockResolvedValueOnce('gid-torrent')
      await addTorrent({ torrent: 'base64data', options: {} })
      const engineOpts = mockCall.mock.calls[0][3] as Record<string, string>
      expect(engineOpts['force-save']).toBe('true')
    })

    it('addTorrent preserves caller-supplied options alongside force-save', async () => {
      mockCall.mockResolvedValueOnce('gid-torrent')
      await addTorrent({ torrent: 'data', options: { dir: '/custom', split: '4' } })
      const engineOpts = mockCall.mock.calls[0][3] as Record<string, string>
      expect(engineOpts['force-save']).toBe('true')
      expect(engineOpts.dir).toBe('/custom')
      expect(engineOpts.split).toBe('4')
    })

    it('addMetalink injects force-save=true into per-download options', async () => {
      mockCall.mockResolvedValueOnce(['gid-ml1'])
      await addMetalink({ metalink: 'base64ml', options: {} })
      const engineOpts = mockCall.mock.calls[0][2] as Record<string, string>
      expect(engineOpts['force-save']).toBe('true')
    })

    it('addUri does NOT inject force-save (HTTP downloads must not persist)', async () => {
      mockCall.mockResolvedValue('gid-http')
      await addUri({ uris: ['http://example.com/file.zip'], outs: [], options: {} })
      const engineOpts = mockCall.mock.calls[0][2] as Record<string, string>
      expect(engineOpts).not.toHaveProperty('force-save')
    })

    it('addUriAtomic does NOT inject force-save', async () => {
      mockCall.mockResolvedValueOnce('gid-atomic')
      await addUriAtomic({ uris: ['http://example.com/f.zip'], options: {} })
      const engineOpts = mockCall.mock.calls[0][2] as Record<string, string>
      expect(engineOpts).not.toHaveProperty('force-save')
    })
  })

  // ── Task Control ────────────────────────────────────────────────

  describe('task control', () => {
    beforeEach(async () => {
      await initClient({ port: 6800, secret: 's' })
      mockCall.mockResolvedValue('OK')
    })

    it('removeTask calls forceRemove', async () => {
      await removeTask({ gid: 'abc' })
      expect(mockCall).toHaveBeenCalledWith('forceRemove', 'abc')
    })

    it('pauseTask calls pause', async () => {
      await pauseTask({ gid: 'abc' })
      expect(mockCall).toHaveBeenCalledWith('pause', 'abc')
    })

    it('forcePauseTask calls forcePause', async () => {
      await forcePauseTask({ gid: 'abc' })
      expect(mockCall).toHaveBeenCalledWith('forcePause', 'abc')
    })

    it('resumeTask calls unpause', async () => {
      await resumeTask({ gid: 'abc' })
      expect(mockCall).toHaveBeenCalledWith('unpause', 'abc')
    })

    it('pauseAllTask calls pauseAll', async () => {
      await pauseAllTask()
      expect(mockCall).toHaveBeenCalledWith('pauseAll')
    })

    it('forcePauseAllTask calls forcePauseAll', async () => {
      await forcePauseAllTask()
      expect(mockCall).toHaveBeenCalledWith('forcePauseAll')
    })

    it('resumeAllTask calls unpauseAll', async () => {
      await resumeAllTask()
      expect(mockCall).toHaveBeenCalledWith('unpauseAll')
    })

    it('saveSession calls saveSession', async () => {
      await saveSession()
      expect(mockCall).toHaveBeenCalledWith('saveSession')
    })

    it('removeTaskRecord calls removeDownloadResult', async () => {
      await removeTaskRecord({ gid: 'abc' })
      expect(mockCall).toHaveBeenCalledWith('removeDownloadResult', 'abc')
    })

    it('purgeTaskRecord calls purgeDownloadResult', async () => {
      await purgeTaskRecord()
      expect(mockCall).toHaveBeenCalledWith('purgeDownloadResult')
    })
  })

  // ── Batch Operations ────────────────────────────────────────────

  describe('batch operations', () => {
    beforeEach(async () => {
      await initClient({ port: 6800, secret: 's' })
      mockMulticall.mockResolvedValue([['OK'], ['OK']])
    })

    it('batchResumeTask sends multicall with unpause for each GID', async () => {
      await batchResumeTask({ gids: ['g1', 'g2'] })
      expect(mockMulticall).toHaveBeenCalledWith([
        ['unpause', 'g1'],
        ['unpause', 'g2'],
      ])
    })

    it('batchPauseTask sends multicall with forcePause for each GID', async () => {
      await batchPauseTask({ gids: ['g1', 'g2'] })
      expect(mockMulticall).toHaveBeenCalledWith([
        ['forcePause', 'g1'],
        ['forcePause', 'g2'],
      ])
    })

    it('batchRemoveTask sends multicall with forceRemove for each GID', async () => {
      await batchRemoveTask({ gids: ['g1'] })
      expect(mockMulticall).toHaveBeenCalledWith([['forceRemove', 'g1']])
    })
  })

  // ── Tauri IPC Delegation ────────────────────────────────────────

  describe('Tauri IPC', () => {
    it('fetchPreference invokes get_app_config', async () => {
      mockInvoke.mockResolvedValueOnce({ theme: 'dark' })
      const result = await fetchPreference()
      expect(mockInvoke).toHaveBeenCalledWith('get_app_config')
      expect(result).toEqual({ theme: 'dark' })
    })

    it('savePreference invokes save_preference with config', async () => {
      await savePreference({ theme: 'light' })
      expect(mockInvoke).toHaveBeenCalledWith('save_preference', { config: { theme: 'light' } })
    })
  })
})
