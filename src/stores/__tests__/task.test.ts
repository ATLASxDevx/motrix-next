/** @fileoverview Unit tests for TaskStore with mocked TaskApi. */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useTaskStore } from '../task'
import type { Aria2Task, Aria2Peer, TaskStatus, HistoryRecord } from '@shared/types'

// ── Mock history store (DB-primary architecture) ─────────────────────
const mockHistoryFns = {
  init: vi.fn().mockResolvedValue(undefined),
  addRecord: vi.fn().mockResolvedValue(undefined),
  getRecords: vi.fn().mockResolvedValue([] as HistoryRecord[]),
  removeRecord: vi.fn().mockResolvedValue(undefined),
  clearRecords: vi.fn().mockResolvedValue(undefined),
  removeStaleRecords: vi.fn().mockResolvedValue(undefined),
  checkIntegrity: vi.fn().mockResolvedValue('ok'),
  closeConnection: vi.fn().mockResolvedValue(undefined),
}
vi.mock('@/stores/history', () => ({
  useHistoryStore: () => mockHistoryFns,
}))

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
    fetchTaskList: vi.fn().mockResolvedValue([makeMockTask('gid1'), makeMockTask('gid2')]),
    fetchTaskItem: vi.fn().mockResolvedValue(makeMockTask('gid1')),
    fetchTaskItemWithPeers: vi.fn().mockResolvedValue({ ...makeMockTask('gid1'), peers: [] as Aria2Peer[] }),
    fetchActiveTaskList: vi.fn().mockResolvedValue([]),
    addUri: vi.fn().mockResolvedValue(['gid3']),
    addUriAtomic: vi.fn().mockResolvedValue('gid3'),
    addTorrent: vi.fn().mockResolvedValue('gid4'),
    addMetalink: vi.fn().mockResolvedValue(['gid5']),
    getOption: vi.fn().mockResolvedValue({}),
    changeOption: vi.fn().mockResolvedValue(undefined),
    getFiles: vi.fn().mockResolvedValue([]),
    removeTask: vi.fn().mockResolvedValue('gid1'),
    forcePauseTask: vi.fn().mockResolvedValue('gid1'),
    pauseTask: vi.fn().mockResolvedValue('gid1'),
    resumeTask: vi.fn().mockResolvedValue('gid1'),
    pauseAllTask: vi.fn().mockResolvedValue('OK'),
    forcePauseAllTask: vi.fn().mockResolvedValue('OK'),
    resumeAllTask: vi.fn().mockResolvedValue('OK'),
    batchResumeTask: vi.fn().mockResolvedValue([]),
    batchPauseTask: vi.fn().mockResolvedValue([]),
    batchForcePauseTask: vi.fn().mockResolvedValue([]),
    batchRemoveTask: vi.fn().mockResolvedValue([]),
    removeTaskRecord: vi.fn().mockResolvedValue('OK'),
    purgeTaskRecord: vi.fn().mockResolvedValue('OK'),
    saveSession: vi.fn().mockResolvedValue('OK'),
  }
}

describe('TaskStore', () => {
  let store: ReturnType<typeof useTaskStore>
  let mockApi: ReturnType<typeof createMockApi>

  beforeEach(() => {
    setActivePinia(createPinia())
    store = useTaskStore()
    mockApi = createMockApi()
    store.setApi(mockApi)
    // Reset history mock between tests
    Object.values(mockHistoryFns).forEach((fn) => fn.mockClear())
    mockHistoryFns.getRecords.mockResolvedValue([])
  })

  // ─── fetchList ──────────────────────────────────────────

  it('fetchList populates taskList from API', async () => {
    await store.fetchList()
    expect(store.taskList).toHaveLength(2)
    expect(store.taskList[0].gid).toBe('gid1')
    expect(mockApi.fetchTaskList).toHaveBeenCalledWith({ type: 'active' })
  })

  it('fetchList prunes selectedGidList to valid gids only', async () => {
    store.selectTasks(['gid1', 'gid_invalid'])
    await store.fetchList()
    expect(store.selectedGidList).toEqual(['gid1'])
  })

  // ─── selectTasks / selectAllTask ────────────────────────

  it('selectAllTask selects all gids in current list', async () => {
    await store.fetchList()
    store.selectAllTask()
    expect(store.selectedGidList).toEqual(['gid1', 'gid2'])
  })

  it('selectTasks sets arbitrary gid list', () => {
    store.selectTasks(['a', 'b', 'c'])
    expect(store.selectedGidList).toEqual(['a', 'b', 'c'])
  })

  // ─── addUri / addTorrent / addMetalink ──────────────────

  it('addUri calls API and refreshes list', async () => {
    await store.addUri({ uris: ['http://example.com/file.zip'], outs: [], options: {} })
    expect(mockApi.addUri).toHaveBeenCalled()
    expect(mockApi.fetchTaskList).toHaveBeenCalled()
  })

  it('addTorrent calls API, refreshes, and returns gid', async () => {
    const gid = await store.addTorrent({ torrent: 'base64data', options: {} })
    expect(mockApi.addTorrent).toHaveBeenCalledWith({ torrent: 'base64data', options: {} })
    expect(gid).toBe('gid4')
    expect(mockApi.fetchTaskList).toHaveBeenCalled()
  })

  it('addMetalink calls API and refreshes list', async () => {
    await store.addMetalink({ metalink: 'base64data', options: {} })
    expect(mockApi.addMetalink).toHaveBeenCalled()
    expect(mockApi.fetchTaskList).toHaveBeenCalled()
  })

  // ─── pauseAllTask / resumeAllTask ───────────────────────

  it('pauseAllTask calls forcePauseAllTask directly (no graceful fallback)', async () => {
    await store.pauseAllTask()
    expect(mockApi.forcePauseAllTask).toHaveBeenCalled()
    expect(mockApi.pauseAllTask).not.toHaveBeenCalled()
    expect(mockApi.saveSession).toHaveBeenCalled()
  })

  it('pauseAllTask refreshes list and saves session', async () => {
    await store.pauseAllTask()
    expect(mockApi.forcePauseAllTask).toHaveBeenCalled()
    expect(mockApi.fetchTaskList).toHaveBeenCalled()
    expect(mockApi.saveSession).toHaveBeenCalled()
  })

  it('resumeAllTask calls API, refreshes, and saves session', async () => {
    await store.resumeAllTask()
    expect(mockApi.resumeAllTask).toHaveBeenCalled()
    expect(mockApi.fetchTaskList).toHaveBeenCalled()
    expect(mockApi.saveSession).toHaveBeenCalled()
  })

  // ─── showTaskDetail / hideTaskDetail ────────────────────

  it('showTaskDetail sets visibility, gid, and current task item', () => {
    const task = makeMockTask('gid1')
    store.showTaskDetail(task)
    expect(store.taskDetailVisible).toBe(true)
    expect(store.currentTaskGid).toBe('gid1')
    expect(store.currentTaskItem?.gid).toBe('gid1')
  })

  it('hideTaskDetail resets visibility', () => {
    store.showTaskDetail(makeMockTask('gid1'))
    store.hideTaskDetail()
    expect(store.taskDetailVisible).toBe(false)
  })

  // ─── changeCurrentList ──────────────────────────────────

  it('changeCurrentList resets list and fetches new type', async () => {
    store.taskList = [makeMockTask('old')]
    await store.changeCurrentList('completed')
    expect(store.currentList).toBe('completed')
    expect(mockApi.fetchTaskList).toHaveBeenCalledWith({ type: 'completed' })
  })

  it('changeCurrentList clears selectedGidList', async () => {
    store.selectTasks(['gid1'])
    await store.changeCurrentList('waiting')
    // After reset, selectedGidList is cleared then pruned by fetchList
    expect(store.selectedGidList).toEqual([])
  })

  // ─── removeTask ─────────────────────────────────────────

  it('removeTask calls API and refreshes list', async () => {
    const task = makeMockTask('gid1')
    await store.removeTask(task)
    expect(mockApi.removeTask).toHaveBeenCalledWith({ gid: 'gid1' })
    expect(mockApi.fetchTaskList).toHaveBeenCalled()
    expect(mockApi.saveSession).toHaveBeenCalled()
  })

  it('removeTask hides detail if removing current detail task', async () => {
    const task = makeMockTask('gid1')
    store.showTaskDetail(task)
    expect(store.taskDetailVisible).toBe(true)
    await store.removeTask(task)
    expect(store.taskDetailVisible).toBe(false)
  })

  it('removeTask always refreshes list even if API throws', async () => {
    mockApi.removeTask.mockRejectedValueOnce(new Error('not found'))
    const task = makeMockTask('gid1')
    await expect(store.removeTask(task)).rejects.toThrow('not found')
    expect(mockApi.fetchTaskList).toHaveBeenCalled()
  })

  // ─── pauseTask / resumeTask ─────────────────────────────

  it('pauseTask uses forcePause for BT tasks', async () => {
    const btTask = makeMockTask('gid1', 'active', { bittorrent: { info: { name: 'test' } } })
    await store.pauseTask(btTask)
    expect(mockApi.forcePauseTask).toHaveBeenCalledWith({ gid: 'gid1' })
    expect(mockApi.pauseTask).not.toHaveBeenCalled()
  })

  it('pauseTask uses regular pause for HTTP tasks', async () => {
    const httpTask = makeMockTask('gid1')
    await store.pauseTask(httpTask)
    expect(mockApi.pauseTask).toHaveBeenCalledWith({ gid: 'gid1' })
    expect(mockApi.forcePauseTask).not.toHaveBeenCalled()
  })

  it('resumeTask calls API, refreshes, and saves session', async () => {
    const task = makeMockTask('gid1')
    await store.resumeTask(task)
    expect(mockApi.resumeTask).toHaveBeenCalledWith({ gid: 'gid1' })
    expect(mockApi.fetchTaskList).toHaveBeenCalled()
    expect(mockApi.saveSession).toHaveBeenCalled()
  })

  // ─── toggleTask ─────────────────────────────────────────

  it('toggleTask pauses active task', async () => {
    const task = makeMockTask('gid1', 'active')
    await store.toggleTask(task)
    expect(mockApi.pauseTask).toHaveBeenCalled()
  })

  it('toggleTask resumes paused task', async () => {
    const task = makeMockTask('gid1', 'paused')
    await store.toggleTask(task)
    expect(mockApi.resumeTask).toHaveBeenCalled()
  })

  it('toggleTask resumes waiting task', async () => {
    const task = makeMockTask('gid1', 'waiting')
    await store.toggleTask(task)
    expect(mockApi.resumeTask).toHaveBeenCalled()
  })

  // ─── batch operations ───────────────────────────────────

  it('batchRemoveTask calls API with gids and saves session', async () => {
    await store.batchRemoveTask(['gid1', 'gid2'])
    expect(mockApi.batchRemoveTask).toHaveBeenCalledWith({ gids: ['gid1', 'gid2'] })
    expect(mockApi.saveSession).toHaveBeenCalled()
  })

  it('batchPauseSelectedTasks does nothing when selection is empty', async () => {
    store.selectTasks([])
    await store.batchPauseSelectedTasks()
    expect(mockApi.batchPauseTask).not.toHaveBeenCalled()
  })

  it('batchPauseSelectedTasks calls API with selected gids', async () => {
    store.selectTasks(['gid1', 'gid2'])
    await store.batchPauseSelectedTasks()
    expect(mockApi.batchPauseTask).toHaveBeenCalledWith({ gids: ['gid1', 'gid2'] })
  })

  it('batchResumeSelectedTasks does nothing when selection is empty', async () => {
    store.selectTasks([])
    await store.batchResumeSelectedTasks()
    expect(mockApi.batchResumeTask).not.toHaveBeenCalled()
  })

  it('batchResumeSelectedTasks calls API with selected gids', async () => {
    store.selectTasks(['gid1', 'gid2'])
    await store.batchResumeSelectedTasks()
    expect(mockApi.batchResumeTask).toHaveBeenCalledWith({ gids: ['gid1', 'gid2'] })
  })

  // ─── updateCurrentTaskItem ──────────────────────────────

  it('updateCurrentTaskItem sets task, files, and peers', () => {
    const task = makeMockTask('gid1', 'active', {
      files: [{ index: '1', path: '/tmp/f1', length: '100', completedLength: '50', selected: 'true', uris: [] }],
    })
    ;(task as Aria2Task & { peers?: Aria2Peer[] }).peers = [
      {
        peerId: '-qB1234-',
        ip: '1.2.3.4',
        port: '6881',
        bitfield: 'ff',
        amChoking: 'false',
        peerChoking: 'false',
        downloadSpeed: '100',
        uploadSpeed: '0',
        seeder: 'false',
      },
    ]
    store.updateCurrentTaskItem(task)
    expect(store.currentTaskItem?.gid).toBe('gid1')
    expect(store.currentTaskFiles).toHaveLength(1)
  })

  it('updateCurrentTaskItem with null clears all', () => {
    store.showTaskDetail(makeMockTask('gid1'))
    store.updateCurrentTaskItem(null)
    expect(store.currentTaskItem).toBeNull()
    expect(store.currentTaskFiles).toEqual([])
    expect(store.currentTaskPeers).toEqual([])
  })

  // ─── seedingList ────────────────────────────────────────

  it('addToSeedingList adds new gid', () => {
    store.addToSeedingList('gid1')
    expect(store.seedingList).toContain('gid1')
  })

  it('addToSeedingList ignores duplicates', () => {
    store.addToSeedingList('gid1')
    store.addToSeedingList('gid1')
    expect(store.seedingList).toEqual(['gid1'])
  })

  it('removeFromSeedingList removes existing gid', () => {
    store.addToSeedingList('gid1')
    store.addToSeedingList('gid2')
    store.removeFromSeedingList('gid1')
    expect(store.seedingList).toEqual(['gid2'])
  })

  it('removeFromSeedingList ignores non-existent gid', () => {
    store.addToSeedingList('gid1')
    store.removeFromSeedingList('gid999')
    expect(store.seedingList).toEqual(['gid1'])
  })

  // ─── stopSeeding ────────────────────────────────────────

  it('stopSeeding calls forcePause then removeTask then writes DB', async () => {
    const callOrder: string[] = []
    mockApi.forcePauseTask.mockImplementation(() => {
      callOrder.push('forcePause')
      return Promise.resolve('OK')
    })
    mockApi.removeTask.mockImplementation(() => {
      callOrder.push('removeTask')
      return Promise.resolve('OK')
    })

    const task = makeMockTask('gid1', 'active', { bittorrent: { info: { name: 'seed' } }, seeder: 'true' })
    await store.stopSeeding(task)

    expect(mockApi.forcePauseTask).toHaveBeenCalledWith({ gid: 'gid1' })
    expect(mockApi.removeTask).toHaveBeenCalledWith({ gid: 'gid1' })
    expect(callOrder).toEqual(['forcePause', 'removeTask'])
    // DB persistence
    expect(mockHistoryFns.addRecord).toHaveBeenCalledWith(expect.objectContaining({ gid: 'gid1', status: 'complete' }))
  })

  it('stopSeeding does not call removeTask if forcePause fails', async () => {
    mockApi.forcePauseTask.mockRejectedValueOnce(new Error('pause failed'))

    const task = makeMockTask('gid1', 'active', { bittorrent: { info: { name: 'x' } }, seeder: 'true' })
    await expect(store.stopSeeding(task)).rejects.toThrow('pause failed')
    expect(mockApi.forcePauseTask).toHaveBeenCalledWith({ gid: 'gid1' })
    expect(mockApi.removeTask).not.toHaveBeenCalled()
    expect(mockHistoryFns.addRecord).not.toHaveBeenCalled()
  })

  // ─── stopAllSeeding ─────────────────────────────────────

  it('stopAllSeeding calls two-step stop + DB write for every seeding task', async () => {
    const seeder1 = makeMockTask('s1', 'active', { bittorrent: { info: { name: 'a' } }, seeder: 'true' })
    const seeder2 = makeMockTask('s2', 'active', { bittorrent: { info: { name: 'b' } }, seeder: 'true' })
    store.taskList = [seeder1, seeder2]
    const count = await store.stopAllSeeding()
    expect(count).toBe(2)
    expect(mockApi.forcePauseTask).toHaveBeenCalledWith({ gid: 's1' })
    expect(mockApi.forcePauseTask).toHaveBeenCalledWith({ gid: 's2' })
    expect(mockApi.removeTask).toHaveBeenCalledWith({ gid: 's1' })
    expect(mockApi.removeTask).toHaveBeenCalledWith({ gid: 's2' })
    // Both tasks persisted to DB
    expect(mockHistoryFns.addRecord).toHaveBeenCalledTimes(2)
  })

  it('stopAllSeeding skips non-seeding tasks', async () => {
    const active = makeMockTask('a1', 'active')
    const seeder = makeMockTask('s1', 'active', { bittorrent: { info: { name: 'x' } }, seeder: 'true' })
    store.taskList = [active, seeder]
    const count = await store.stopAllSeeding()
    expect(count).toBe(1)
    expect(mockApi.forcePauseTask).toHaveBeenCalledTimes(1)
    expect(mockApi.forcePauseTask).toHaveBeenCalledWith({ gid: 's1' })
    expect(mockApi.removeTask).toHaveBeenCalledTimes(1)
    expect(mockApi.removeTask).toHaveBeenCalledWith({ gid: 's1' })
  })

  it('stopAllSeeding returns 0 when no seeding tasks exist', async () => {
    store.taskList = [makeMockTask('a1', 'active')]
    const count = await store.stopAllSeeding()
    expect(count).toBe(0)
    expect(mockApi.forcePauseTask).not.toHaveBeenCalled()
    expect(mockApi.removeTask).not.toHaveBeenCalled()
  })

  it('stopAllSeeding continues even if one task fails', async () => {
    const seeder1 = makeMockTask('s1', 'active', { bittorrent: { info: { name: 'a' } }, seeder: 'true' })
    const seeder2 = makeMockTask('s2', 'active', { bittorrent: { info: { name: 'b' } }, seeder: 'true' })
    store.taskList = [seeder1, seeder2]
    mockApi.forcePauseTask.mockRejectedValueOnce(new Error('fail'))
    const count = await store.stopAllSeeding()
    expect(count).toBe(2)
    // Both tasks attempted — s1 failed at forcePause, s2 succeeded with both steps
    expect(mockApi.forcePauseTask).toHaveBeenCalledTimes(2)
  })

  // ─── removeTaskRecord ───────────────────────────────────

  it('removeTaskRecord removes completed task via DB then aria2', async () => {
    const task = makeMockTask('gid1', 'complete')
    await store.removeTaskRecord(task)
    // DB is primary — removeRecord called first
    expect(mockHistoryFns.removeRecord).toHaveBeenCalledWith('gid1')
    // aria2 best-effort cleanup
    expect(mockApi.removeTaskRecord).toHaveBeenCalledWith({ gid: 'gid1' })
  })

  it('removeTaskRecord removes error task via DB then aria2', async () => {
    const task = makeMockTask('gid1', 'error')
    await store.removeTaskRecord(task)
    expect(mockHistoryFns.removeRecord).toHaveBeenCalledWith('gid1')
    expect(mockApi.removeTaskRecord).toHaveBeenCalledWith({ gid: 'gid1' })
  })

  it('removeTaskRecord ignores active task', async () => {
    const task = makeMockTask('gid1', 'active')
    await store.removeTaskRecord(task)
    expect(mockHistoryFns.removeRecord).not.toHaveBeenCalled()
    expect(mockApi.removeTaskRecord).not.toHaveBeenCalled()
  })

  it('removeTaskRecord hides detail if removing current detail task', async () => {
    const task = makeMockTask('gid1', 'complete')
    store.showTaskDetail(task)
    await store.removeTaskRecord(task)
    expect(store.taskDetailVisible).toBe(false)
    expect(mockHistoryFns.removeRecord).toHaveBeenCalledWith('gid1')
  })

  it('removeTaskRecord survives aria2 failure (DB-only records)', async () => {
    mockApi.removeTaskRecord.mockRejectedValueOnce(new Error('GID not found'))
    const task = makeMockTask('gid1', 'complete')
    await store.removeTaskRecord(task)
    expect(mockHistoryFns.removeRecord).toHaveBeenCalledWith('gid1')
  })

  // ─── purgeTaskRecord ────────────────────────────────────

  it('purgeTaskRecord clears DB then aria2 and refreshes list', async () => {
    await store.purgeTaskRecord()
    expect(mockHistoryFns.clearRecords).toHaveBeenCalled()
    expect(mockApi.purgeTaskRecord).toHaveBeenCalled()
  })

  it('purgeTaskRecord survives aria2 failure', async () => {
    mockApi.purgeTaskRecord.mockRejectedValueOnce(new Error('RPC fail'))
    await store.purgeTaskRecord()
    expect(mockHistoryFns.clearRecords).toHaveBeenCalled()
  })

  // ─── saveSession ────────────────────────────────────────

  it('saveSession calls API', () => {
    store.saveSession()
    expect(mockApi.saveSession).toHaveBeenCalled()
  })
  // ─── restartTask ───────────────────────────────────────

  it('restartTask submits single URI and removes old record on success', async () => {
    const task = makeMockTask('stopped1', 'error', {
      files: [
        {
          index: '1',
          path: '/tmp/file.zip',
          length: '1000',
          completedLength: '0',
          selected: 'true',
          uris: [{ uri: 'http://example.com/file.zip', status: 'used' }],
        },
      ],
    })
    mockApi.addUriAtomic.mockResolvedValue('new-gid-1')
    mockApi.getOption.mockResolvedValue({ dir: '/tmp' })
    await store.restartTask(task)

    expect(mockApi.addUriAtomic).toHaveBeenCalledTimes(1)
    expect(mockApi.addUriAtomic).toHaveBeenCalledWith({
      uris: ['http://example.com/file.zip'],
      options: { dir: '/tmp' },
    })
    expect(mockApi.removeTaskRecord).toHaveBeenCalledWith({ gid: 'stopped1' })
    expect(mockApi.fetchTaskList).toHaveBeenCalled()
  })

  it('restartTask submits each URI separately for multi-file tasks', async () => {
    const task = makeMockTask('stopped2', 'error', {
      files: [
        {
          index: '1',
          path: '/tmp/a.zip',
          length: '500',
          completedLength: '0',
          selected: 'true',
          uris: [{ uri: 'http://example.com/a.zip', status: 'used' }],
        },
        {
          index: '2',
          path: '/tmp/b.zip',
          length: '500',
          completedLength: '0',
          selected: 'true',
          uris: [{ uri: 'http://example.com/b.zip', status: 'used' }],
        },
      ],
    })
    mockApi.addUriAtomic.mockResolvedValueOnce('new-a').mockResolvedValueOnce('new-b')
    mockApi.getOption.mockResolvedValue({ dir: '/tmp' })
    await store.restartTask(task)

    expect(mockApi.addUriAtomic).toHaveBeenCalledTimes(2)
    expect(mockApi.addUriAtomic).toHaveBeenNthCalledWith(1, {
      uris: ['http://example.com/a.zip'],
      options: { dir: '/tmp' },
    })
    expect(mockApi.addUriAtomic).toHaveBeenNthCalledWith(2, {
      uris: ['http://example.com/b.zip'],
      options: { dir: '/tmp' },
    })
    expect(mockApi.removeTaskRecord).toHaveBeenCalledWith({ gid: 'stopped2' })
  })

  it('restartTask rolls back created tasks on partial failure', async () => {
    const task = makeMockTask('stopped3', 'error', {
      files: [
        {
          index: '1',
          path: '/tmp/a.zip',
          length: '500',
          completedLength: '0',
          selected: 'true',
          uris: [{ uri: 'http://example.com/a.zip', status: 'used' }],
        },
        {
          index: '2',
          path: '/tmp/b.zip',
          length: '500',
          completedLength: '0',
          selected: 'true',
          uris: [{ uri: 'http://example.com/b.zip', status: 'used' }],
        },
      ],
    })
    // First URI succeeds, second fails
    mockApi.addUriAtomic.mockResolvedValueOnce('new-a').mockRejectedValueOnce(new Error('network error'))

    await expect(store.restartTask(task)).rejects.toThrow('network error')

    // Rollback: the successfully created task should be removed
    expect(mockApi.removeTask).toHaveBeenCalledWith({ gid: 'new-a' })
    // Old record must NOT be deleted since restart failed
    expect(mockApi.removeTaskRecord).not.toHaveBeenCalled()
  })

  it('restartTask skips non-stopped tasks', async () => {
    const task = makeMockTask('active1', 'active')
    await store.restartTask(task)

    expect(mockApi.addUriAtomic).not.toHaveBeenCalled()
    expect(mockApi.removeTaskRecord).not.toHaveBeenCalled()
  })

  // ─── hasActiveTasks ─────────────────────────────────────

  describe('hasActiveTasks', () => {
    it('returns true when active tasks exist', async () => {
      mockApi.fetchTaskList.mockResolvedValueOnce([makeMockTask('a1', 'active')])
      expect(await store.hasActiveTasks()).toBe(true)
    })

    it('returns true when waiting tasks exist', async () => {
      mockApi.fetchTaskList.mockResolvedValueOnce([makeMockTask('w1', 'waiting')])
      expect(await store.hasActiveTasks()).toBe(true)
    })

    it('returns false when only paused/completed tasks exist', async () => {
      mockApi.fetchTaskList.mockResolvedValueOnce([makeMockTask('p1', 'paused'), makeMockTask('c1', 'complete')])
      expect(await store.hasActiveTasks()).toBe(false)
    })

    it('returns false when no tasks exist', async () => {
      mockApi.fetchTaskList.mockResolvedValueOnce([])
      expect(await store.hasActiveTasks()).toBe(false)
    })

    it('returns false on API error', async () => {
      mockApi.fetchTaskList.mockRejectedValueOnce(new Error('RPC fail'))
      expect(await store.hasActiveTasks()).toBe(false)
    })

    it('queries globally regardless of current tab', async () => {
      // Switch to completed tab first
      mockApi.fetchTaskList.mockResolvedValue([])
      await store.changeCurrentList('stopped')
      mockApi.fetchTaskList.mockReset()

      mockApi.fetchTaskList.mockResolvedValueOnce([makeMockTask('a1', 'active')])
      expect(await store.hasActiveTasks()).toBe(true)
      // Must query active type, not the current 'stopped' tab
      expect(mockApi.fetchTaskList).toHaveBeenCalledWith({ type: 'active' })
    })
  })

  // ─── hasPausedTasks ─────────────────────────────────────

  describe('hasPausedTasks', () => {
    it('returns true when paused tasks exist', async () => {
      mockApi.fetchTaskList.mockResolvedValueOnce([makeMockTask('p1', 'paused')])
      expect(await store.hasPausedTasks()).toBe(true)
    })

    it('returns false when only active/waiting tasks exist', async () => {
      mockApi.fetchTaskList.mockResolvedValueOnce([makeMockTask('a1', 'active'), makeMockTask('w1', 'waiting')])
      expect(await store.hasPausedTasks()).toBe(false)
    })

    it('returns false when no tasks exist', async () => {
      mockApi.fetchTaskList.mockResolvedValueOnce([])
      expect(await store.hasPausedTasks()).toBe(false)
    })

    it('returns false on API error', async () => {
      mockApi.fetchTaskList.mockRejectedValueOnce(new Error('RPC fail'))
      expect(await store.hasPausedTasks()).toBe(false)
    })

    it('queries globally regardless of current tab', async () => {
      // Switch to completed tab
      mockApi.fetchTaskList.mockResolvedValue([])
      await store.changeCurrentList('stopped')
      mockApi.fetchTaskList.mockReset()

      mockApi.fetchTaskList.mockResolvedValueOnce([makeMockTask('p1', 'paused')])
      expect(await store.hasPausedTasks()).toBe(true)
      expect(mockApi.fetchTaskList).toHaveBeenCalledWith({ type: 'active' })
    })
  })

  // ── Task lifecycle scanning (completion + error detection) ────────

  describe('task lifecycle scanning', () => {
    it('fires onTaskComplete for newly completed tasks after initial scan', async () => {
      const onComplete = vi.fn()
      store.setOnTaskComplete(onComplete)
      store.setApi(mockApi)

      // Initial scan: complete task is seen but callback NOT fired (suppressed)
      mockApi.fetchTaskList.mockImplementation(({ type }: { type: string }) =>
        type === 'stopped'
          ? Promise.resolve([makeMockTask('c1', 'complete')])
          : Promise.resolve([makeMockTask('a1', 'active')]),
      )
      await store.changeCurrentList('active')
      expect(onComplete).not.toHaveBeenCalled()

      // Second fetch: new completed task appears → callback fires
      mockApi.fetchTaskList.mockImplementation(({ type }: { type: string }) =>
        type === 'stopped'
          ? Promise.resolve([makeMockTask('c1', 'complete'), makeMockTask('c2', 'complete')])
          : Promise.resolve([makeMockTask('a1', 'active')]),
      )
      await store.fetchList()
      expect(onComplete).toHaveBeenCalledTimes(1)
      expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ gid: 'c2' }))
    })

    it('fires onTaskError for newly errored tasks after initial scan', async () => {
      const onError = vi.fn()
      store.setOnTaskError(onError)
      store.setApi(mockApi)

      // Initial scan: error task present → suppressed
      mockApi.fetchTaskList.mockImplementation(({ type }: { type: string }) =>
        type === 'stopped'
          ? Promise.resolve([makeMockTask('e1', 'error', { errorCode: '3', errorMessage: 'Not found' })])
          : Promise.resolve([]),
      )
      await store.changeCurrentList('active')
      expect(onError).not.toHaveBeenCalled()

      // Second fetch: new error task → callback fires
      mockApi.fetchTaskList.mockImplementation(({ type }: { type: string }) =>
        type === 'stopped'
          ? Promise.resolve([
              makeMockTask('e1', 'error', { errorCode: '3' }),
              makeMockTask('e2', 'error', { errorCode: '6', errorMessage: 'Network problem' }),
            ])
          : Promise.resolve([]),
      )
      await store.fetchList()
      expect(onError).toHaveBeenCalledTimes(1)
      expect(onError).toHaveBeenCalledWith(expect.objectContaining({ gid: 'e2', errorCode: '6' }))
    })

    it('fetches stopped pool for lifecycle scanning via aria2 active query', async () => {
      const onComplete = vi.fn()
      store.setOnTaskComplete(onComplete)
      store.setApi(mockApi)

      // When on the stopped tab, fetchList now reads from DB.
      // Lifecycle scanning for onComplete fires from the separate
      // _scanStoppedPool path which still calls fetchTaskList({ type: 'stopped' }).
      // Initial scan: c1 present → suppressed by initialScanDone guard
      mockApi.fetchTaskList.mockResolvedValue([makeMockTask('c1', 'complete')])
      await store.changeCurrentList('active')
      await store.fetchList()

      // c2 is new → onComplete fires
      mockApi.fetchTaskList.mockResolvedValue([makeMockTask('c1', 'complete'), makeMockTask('c2', 'complete')])
      await store.fetchList()
      expect(onComplete).toHaveBeenCalledTimes(1)
      expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ gid: 'c2' }))
    })

    it('does not re-fire callbacks for already-seen GIDs', async () => {
      const onComplete = vi.fn()
      store.setOnTaskComplete(onComplete)
      store.setApi(mockApi)

      // Initial scan
      mockApi.fetchTaskList.mockImplementation(({ type }: { type: string }) =>
        type === 'stopped' ? Promise.resolve([]) : Promise.resolve([]),
      )
      await store.changeCurrentList('active')

      // Complete task appears
      mockApi.fetchTaskList.mockImplementation(({ type }: { type: string }) =>
        type === 'stopped' ? Promise.resolve([makeMockTask('c1', 'complete')]) : Promise.resolve([]),
      )
      await store.fetchList()
      expect(onComplete).toHaveBeenCalledTimes(1)

      // Same task in next poll → no duplicate fire
      await store.fetchList()
      expect(onComplete).toHaveBeenCalledTimes(1)
    })
  })

  // ── registerTorrentSource / consumeTorrentSource ────────────────────

  describe('torrent source path tracking', () => {
    it('registers and consumes a source path by infoHash', () => {
      store.registerTorrentSource('abc123', '/downloads/movie.torrent')
      expect(store.consumeTorrentSource('abc123')).toBe('/downloads/movie.torrent')
    })

    it('consumeTorrentSource returns undefined for unknown hash', () => {
      expect(store.consumeTorrentSource('nonexistent')).toBeUndefined()
    })

    it('consumeTorrentSource deletes the entry after first consumption', () => {
      store.registerTorrentSource('abc123', '/downloads/movie.torrent')
      store.consumeTorrentSource('abc123')
      expect(store.consumeTorrentSource('abc123')).toBeUndefined()
    })

    it('overwrites previous path when same hash is registered twice', () => {
      store.registerTorrentSource('abc123', '/old/path.torrent')
      store.registerTorrentSource('abc123', '/new/path.torrent')
      expect(store.consumeTorrentSource('abc123')).toBe('/new/path.torrent')
    })

    it('tracks multiple hashes independently', () => {
      store.registerTorrentSource('hash1', '/path/a.torrent')
      store.registerTorrentSource('hash2', '/path/b.torrent')
      expect(store.consumeTorrentSource('hash1')).toBe('/path/a.torrent')
      expect(store.consumeTorrentSource('hash2')).toBe('/path/b.torrent')
    })
  })
})
