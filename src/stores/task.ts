/** @fileoverview Pinia store for download task management: list, add, pause, resume, remove. */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { EMPTY_STRING } from '@shared/constants'
import { intersection } from '@shared/utils'
import { logger } from '@shared/logger'
import type { Aria2Task, Aria2File, Aria2Peer, Aria2EngineOptions, AddMetalinkParams, TaskApi } from '@shared/types'

import { historyRecordToTask } from '@/composables/useTaskLifecycle'
import { shouldShowFileSelection } from '@/composables/useMagnetFlow'
import { useHistoryStore } from '@/stores/history'
import { createTaskNotifier } from './taskNotifications'
import { restartTask as restartTaskImpl } from './taskRestart'
import { createTaskOperations } from './taskOperations'

export type { Aria2Task, Aria2File, Aria2Peer }

export const useTaskStore = defineStore('task', () => {
  const currentList = ref('active')
  const taskDetailVisible = ref(false)
  const currentTaskGid = ref(EMPTY_STRING)
  const enabledFetchPeers = ref(false)
  const currentTaskItem = ref<Aria2Task | null>(null)
  const currentTaskFiles = ref<Aria2File[]>([])
  const currentTaskPeers = ref<Aria2Peer[]>([])
  const seedingList = ref<string[]>([])
  const taskList = ref<Aria2Task[]>([])
  const selectedGidList = ref<string[]>([])

  let api: TaskApi

  const notifier = createTaskNotifier()
  let onTaskError: ((task: Aria2Task) => void) | null = null
  let onTaskComplete: ((task: Aria2Task) => void) | null = null
  let onBtComplete: ((task: Aria2Task) => void) | null = null

  type TaskCb = (task: Aria2Task) => void
  const setOnTaskError = (fn: TaskCb) => {
    onTaskError = fn
  }
  const setOnTaskComplete = (fn: TaskCb) => {
    onTaskComplete = fn
  }
  const setOnBtComplete = (fn: TaskCb) => {
    onBtComplete = fn
  }

  /** In-memory map: infoHash → original .torrent file path for post-download cleanup. */
  const torrentSourcePaths = new Map<string, string>()
  const registerTorrentSource = (hash: string, p: string) => torrentSourcePaths.set(hash, p)
  function consumeTorrentSource(hash: string): string | undefined {
    const p = torrentSourcePaths.get(hash)
    if (p) torrentSourcePaths.delete(hash)
    return p
  }

  function setApi(a: TaskApi) {
    api = a
    // Wire up task operations once API is available
    const ops = createTaskOperations({
      api,
      taskList,
      currentTaskGid,
      hideTaskDetail,
      fetchList,
    })
    Object.assign(taskOps, ops)
  }

  async function changeCurrentList(list: string) {
    currentList.value = list
    taskList.value = []
    selectedGidList.value = []
    await fetchList()
  }

  async function fetchList() {
    try {
      // Stopped tab is DB-primary: history.db is the single source of truth.
      // Active tab reads from aria2 (tellActive + tellWaiting).
      let data: Aria2Task[]
      if (currentList.value === 'stopped') {
        const historyStore = useHistoryStore()
        const records = await historyStore.getRecords()
        data = records.map(historyRecordToTask)
      } else {
        data = await api.fetchTaskList({ type: currentList.value })
      }

      taskList.value = data
      const gids = data.map((task: Aria2Task) => task.gid)
      selectedGidList.value = intersection(selectedGidList.value, gids)
      if (taskDetailVisible.value && currentTaskGid.value) {
        try {
          const fresh = await api.fetchTaskItemWithPeers({ gid: currentTaskGid.value })
          if (fresh) updateCurrentTaskItem(fresh)
        } catch (e) {
          logger.debug('TaskStore.fetchPeers', e)
          const fresh = data.find((t: Aria2Task) => t.gid === currentTaskGid.value)
          if (fresh) updateCurrentTaskItem(fresh)
        }
      }
      // Scan for error + completion + BT-seeding lifecycle events.
      if (onTaskError || onTaskComplete || onBtComplete) {
        const stoppedTasks = (await api.fetchTaskList({ type: 'stopped' })).slice(0, 20)
        notifier.scanTasks([...data, ...stoppedTasks], { onTaskError, onTaskComplete, onBtComplete })
      }
    } catch (e) {
      logger.warn('TaskStore.fetchList', (e as Error).message)
    }
  }

  function selectTasks(list: string[]) {
    selectedGidList.value = list
  }

  function selectAllTask() {
    selectedGidList.value = taskList.value.map((task) => task.gid)
  }

  async function fetchItem(gid: string) {
    const data = await api.fetchTaskItem({ gid })
    updateCurrentTaskItem(data)
  }

  function showTaskDetail(task: Aria2Task) {
    updateCurrentTaskItem(task)
    currentTaskGid.value = task.gid
    taskDetailVisible.value = true
  }

  async function showTaskDetailByGid(gid: string) {
    const task = await api.fetchTaskItem({ gid })
    showTaskDetail(task)
  }

  function hideTaskDetail() {
    taskDetailVisible.value = false
  }

  function updateCurrentTaskItem(task: Aria2Task | null) {
    currentTaskItem.value = task
    if (task) {
      currentTaskFiles.value = task.files
      currentTaskPeers.value = task.peers || []
    } else {
      currentTaskFiles.value = []
      currentTaskPeers.value = []
    }
  }

  async function addUri(data: { uris: string[]; outs: string[]; options: Aria2EngineOptions }) {
    await api.addUri(data)
    await fetchList()
  }

  /**
   * Adds a magnet URI as a normal download. Returns the metadata GID.
   *
   * The global `pause-metadata` setting (controlled by btAutoDownloadContent)
   * determines what happens after metadata resolves:
   * - pause-metadata=true  → follow-up download auto-pauses → poller polls
   *   followedBy, shows file selection, then unpauses
   * - pause-metadata=false → follow-up download starts immediately (no selection)
   *
   * Directly registers the GID for monitoring to avoid caller-chain breaks.
   */
  async function addMagnetUri(data: { uri: string; options: Aria2EngineOptions }): Promise<string> {
    // Magnet URIs are BT downloads — need force-save=true for session
    // persistence (seeding resumption). HTTP downloads must NOT have this.
    const magnetOptions: Aria2EngineOptions = { ...data.options, 'force-save': 'true' }
    const gids = await api.addUri({
      uris: [data.uri],
      outs: [],
      options: magnetOptions,
    })
    const gid = gids[0]

    // Only register for file selection polling when pause-metadata is enabled.
    // When btAutoDownloadContent=true (pauseMetadata=false), aria2 starts the
    // follow-up download immediately — file selection is not needed.
    const { usePreferenceStore } = await import('@/stores/preference')
    const preferenceStore = usePreferenceStore()
    if (shouldShowFileSelection(preferenceStore.config)) {
      const { useAppStore } = await import('@/stores/app')
      const appStore = useAppStore()
      appStore.pendingMagnetGids = [...appStore.pendingMagnetGids, gid]
    }

    await fetchList()
    return gid
  }

  /** Fetch a single task's full status (used for polling followedBy on magnet tasks). */
  async function fetchTaskStatus(gid: string): Promise<Aria2Task> {
    return api.fetchTaskItem({ gid })
  }

  /** Retrieves the file list for a download task. */
  async function getFiles(gid: string): Promise<Aria2File[]> {
    return api.getFiles({ gid })
  }

  async function addTorrent(data: { torrent: string; options: Aria2EngineOptions }) {
    const gid = await api.addTorrent(data)
    await fetchList()
    return gid
  }

  async function addMetalink(data: AddMetalinkParams) {
    await api.addMetalink(data)
    await fetchList()
  }

  async function getTaskOption(gid: string) {
    return api.getOption({ gid })
  }

  async function changeTaskOption(payload: { gid: string; options: Aria2EngineOptions }) {
    return api.changeOption(payload)
  }

  // Task CRUD operations are delegated to the taskOperations module.
  // The ops object is populated when setApi() is called.
  const taskOps = {} as ReturnType<typeof createTaskOperations>

  async function batchResumeSelectedTasks() {
    if (selectedGidList.value.length === 0) return
    return api.batchResumeTask({ gids: selectedGidList.value })
  }

  async function batchPauseSelectedTasks() {
    if (selectedGidList.value.length === 0) return
    return api.batchPauseTask({ gids: selectedGidList.value })
  }

  function addToSeedingList(gid: string) {
    if (seedingList.value.includes(gid)) return
    seedingList.value = [...seedingList.value, gid]
  }

  function removeFromSeedingList(gid: string) {
    const idx = seedingList.value.indexOf(gid)
    if (idx === -1) return
    seedingList.value = [...seedingList.value.slice(0, idx), ...seedingList.value.slice(idx + 1)]
  }

  async function restartTask(task: Aria2Task) {
    const historyStore = useHistoryStore()
    await restartTaskImpl(task, { ...api, fetchList, saveSession: () => api.saveSession() }, historyStore)
  }

  return {
    currentList,
    taskDetailVisible,
    currentTaskGid,
    enabledFetchPeers,
    currentTaskItem,
    currentTaskFiles,
    currentTaskPeers,
    seedingList,
    taskList,
    selectedGidList,
    setApi,
    changeCurrentList,
    fetchList,
    selectTasks,
    selectAllTask,
    fetchItem,
    showTaskDetail,
    showTaskDetailByGid,
    hideTaskDetail,
    updateCurrentTaskItem,
    addUri,
    addTorrent,
    addMetalink,
    addMagnetUri,
    getFiles,
    fetchTaskStatus,
    getTaskOption,
    changeTaskOption,
    removeTask: (task: Aria2Task) => taskOps.removeTask(task),
    pauseTask: (task: Aria2Task) => taskOps.pauseTask(task),
    resumeTask: (task: Aria2Task) => taskOps.resumeTask(task),
    pauseAllTask: () => taskOps.pauseAllTask(),
    resumeAllTask: () => taskOps.resumeAllTask(),
    toggleTask: (task: Aria2Task) => taskOps.toggleTask(task),
    addToSeedingList,
    removeFromSeedingList,
    stopSeeding: (task: Aria2Task) => taskOps.stopSeeding(task),
    stopAllSeeding: () => taskOps.stopAllSeeding(),
    removeTaskRecord: (task: Aria2Task) => taskOps.removeTaskRecord(task),
    purgeTaskRecord: () => taskOps.purgeTaskRecord(),
    saveSession: () => taskOps.saveSession(),
    batchResumeSelectedTasks,
    batchPauseSelectedTasks,
    batchRemoveTask: (gids: string[]) => taskOps.batchRemoveTask(gids),
    restartTask,
    setOnTaskError,
    setOnTaskComplete,
    setOnBtComplete,
    registerTorrentSource,
    consumeTorrentSource,
    hasActiveTasks: () => taskOps.hasActiveTasks(),
    hasPausedTasks: () => taskOps.hasPausedTasks(),
  }
})
