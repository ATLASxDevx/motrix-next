/** @fileoverview Aria2 JSON-RPC client wrapper providing typed API for task management. */
import { Aria2 } from '@shared/aria2'
import { TASK_STATUS } from '@shared/constants'
import { changeKeysToCamelCase, formatOptionsForEngine } from '@shared/utils'
import type { Aria2Task, Aria2RawGlobalStat, Aria2Peer, Aria2EngineOptions, Aria2File, AppConfig } from '@shared/types'
import { isAria2Task, isAria2GlobalStat } from '@shared/guards'
import { logger } from '@shared/logger'

let client: Aria2 | null = null
let engineReady = false

/** Returns true when the aria2 RPC connection has been established. */
export function isEngineReady(): boolean {
  return engineReady
}

/** Marks the engine as ready (used when WebSocket fails but HTTP RPC is available). */
export function setEngineReady(ready: boolean): void {
  engineReady = ready
}

/** Returns the initialized Aria2 client instance or throws if not yet initialized. */
export function getClient(): Aria2 {
  if (!client) throw new Error('Aria2 client not initialized')
  return client
}

/** Creates and opens a new Aria2 RPC client connection. */
export async function initClient(options: { port: number; secret: string }): Promise<Aria2> {
  client = new Aria2({
    host: '127.0.0.1',
    port: options.port,
    secret: options.secret,
  })
  await client.open()
  engineReady = true
  return client
}

/** Closes the active Aria2 RPC connection and resets the client.
 *  Force-closes the raw WebSocket to avoid hanging on pending connections
 *  where the library's close() waits for an onclose event that never fires. */
export async function closeClient(): Promise<void> {
  if (client) {
    const c = client
    client = null
    // Force-close the raw socket — the library's close() method uses
    // `this.on('close', resolve)` which hangs if onclose never fires.
    try {
      if (c.socket) {
        c.socket.onclose = null
        c.socket.onerror = null
        c.socket.onmessage = null
        c.socket.onopen = null
        c.socket.close()
      }
    } catch {
      // Socket may already be destroyed — safe to ignore.
    }
  }
}

/** Tears down the current connection and opens a fresh one with new credentials.
 *  Includes a connection timeout to avoid hanging on unresponsive sockets.
 *  Used when restart-required settings (port, secret) change at runtime. */
export async function reconnectClient(options: { port: number; secret: string }, timeoutMs = 3000): Promise<Aria2> {
  await closeClient()
  engineReady = false

  // Race initClient against a timeout — WebSocket open() has no built-in
  // deadline, so a just-started engine can cause it to hang indefinitely.
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`reconnect timed out after ${timeoutMs}ms`)), timeoutMs),
  )
  try {
    return await Promise.race([initClient(options), timeout])
  } catch (e) {
    // On timeout, the initClient WebSocket may still be pending — tear it down.
    await closeClient()
    throw e
  }
}

/** Retrieves aria2 engine version and list of enabled features. */
export async function getVersion(): Promise<{ version: string; enabledFeatures: string[] }> {
  return getClient().call<{ version: string; enabledFeatures: string[] }>('getVersion')
}

/** Fetches all global aria2 configuration options as camelCase keys. */
export async function getGlobalOption(): Promise<Record<string, string>> {
  const data = await getClient().call<Record<string, string>>('getGlobalOption')
  return changeKeysToCamelCase(data) as Record<string, string>
}

/** Fetches aggregated download/upload statistics from aria2. */
export async function getGlobalStat(): Promise<Aria2RawGlobalStat> {
  const data = await getClient().call<Aria2RawGlobalStat>('getGlobalStat')
  if (!isAria2GlobalStat(data)) {
    logger.warn('aria2.getGlobalStat', 'Invalid global stat response')
  }
  return data
}

/** Updates aria2 global configuration at runtime. */
export async function changeGlobalOption(options: Partial<AppConfig>): Promise<void> {
  const engineOptions = formatOptionsForEngine(options)
  await getClient().call<string>('changeGlobalOption', engineOptions)
}

/** Fetches the option set for a specific download task as camelCase keys. */
export async function getOption(params: { gid: string }): Promise<Record<string, string>> {
  const data = await getClient().call<Record<string, string>>('getOption', params.gid)
  return changeKeysToCamelCase(data) as Record<string, string>
}

/** Modifies options for a specific download task at runtime. */
export async function changeOption(params: { gid: string; options: Aria2EngineOptions }): Promise<void> {
  const engineOptions = formatOptionsForEngine(params.options)
  await getClient().call<string>('changeOption', params.gid, engineOptions)
}

/** Retrieves the file list for a download task by GID. */
export async function getFiles(params: { gid: string }): Promise<Aria2File[]> {
  const data = await getClient().call<Record<string, unknown>[]>('getFiles', params.gid)
  return data.map((f) => changeKeysToCamelCase(f)) as unknown as Aria2File[]
}

/** Retrieves the full status of a download task by GID. */
async function tellStatus(gid: string): Promise<Aria2Task> {
  return getClient().call<Aria2Task>('tellStatus', gid)
}

/** Lists all actively downloading tasks. */
async function tellActive(): Promise<Aria2Task[]> {
  return getClient().call<Aria2Task[]>('tellActive')
}

/** Lists waiting (queued) tasks from the given offset. */
async function tellWaiting(offset: number, num: number): Promise<Aria2Task[]> {
  return getClient().call<Aria2Task[]>('tellWaiting', offset, num)
}

/** Lists stopped/completed/errored tasks from the given offset. */
async function tellStopped(offset: number, num: number): Promise<Aria2Task[]> {
  return getClient().call<Aria2Task[]>('tellStopped', offset, num)
}

/** Fetches only active tasks (no waiting). */
export async function fetchActiveTaskList(): Promise<Aria2Task[]> {
  return tellActive()
}

/** Fetches task list by status type: active+waiting or stopped. */
export async function fetchTaskList(params: { type: string }): Promise<Aria2Task[]> {
  const { type } = params
  switch (type) {
    case TASK_STATUS.ACTIVE: {
      const [active, waiting] = await Promise.all([tellActive(), tellWaiting(0, 1000)])
      return [...active, ...waiting].sort((a, b) => b.gid.localeCompare(a.gid))
    }
    default:
      return (await tellStopped(0, 1000)).sort((a, b) => b.gid.localeCompare(a.gid))
  }
}

/** Fetches a single task's full status by GID. */
export async function fetchTaskItem(params: { gid: string }): Promise<Aria2Task> {
  const data = await tellStatus(params.gid)
  if (!isAria2Task(data)) {
    logger.warn('aria2.fetchTaskItem', `Invalid task response for gid ${params.gid}`)
  }
  return data
}

/** Fetches a single task's status along with its peer list (for BT tasks). */
export async function fetchTaskItemWithPeers(params: { gid: string }): Promise<Aria2Task & { peers: Aria2Peer[] }> {
  const [task, peers] = await Promise.all([
    tellStatus(params.gid),
    getClient().call<Aria2Peer[]>('getPeers', params.gid),
  ])
  return { ...task, peers }
}

/** Adds one or more URI downloads with per-URI output filename overrides. */
export async function addUri(params: {
  uris: string[]
  outs: string[]
  options: Aria2EngineOptions
}): Promise<string[]> {
  const { uris, outs, options } = params
  const engineOptions = formatOptionsForEngine(options)
  const tasks = uris.map((uri, index) => {
    const opts: Record<string, string> = { ...engineOptions }
    if (outs[index]) opts.out = outs[index]
    return getClient().call<string>('addUri', [uri], opts)
  })
  return Promise.all(tasks)
}

/**
 * Adds a single download with all URIs as mirrors (alternative sources).
 * Unlike addUri which creates one download per URI, this creates exactly one
 * download — making it safe for atomic restart operations.
 */
export async function addUriAtomic(params: { uris: string[]; options: Record<string, string> }): Promise<string> {
  const { uris, options } = params
  const engineOptions = formatOptionsForEngine(options)
  return getClient().call<string>('addUri', uris, engineOptions)
}

/** Adds a torrent download from a base64-encoded .torrent file. */
export async function addTorrent(params: { torrent: string; options: Aria2EngineOptions }): Promise<string> {
  const engineOptions = formatOptionsForEngine(params.options)
  // BT downloads need force-save=true for session persistence (seeding resumption).
  // HTTP downloads must NOT have this — see SessionSerializer.cc:288.
  engineOptions['force-save'] = 'true'
  return getClient().call<string>('addTorrent', params.torrent, [], engineOptions)
}

/** Adds a metalink download from a base64-encoded .metalink file. */
export async function addMetalink(params: { metalink: string; options: Aria2EngineOptions }): Promise<string[]> {
  const engineOptions = formatOptionsForEngine(params.options)
  // Metalink downloads may contain BT sources — persist for seeding resumption.
  engineOptions['force-save'] = 'true'
  return getClient().call<string[]>('addMetalink', params.metalink, engineOptions)
}

/** Forcefully removes a download task by GID. */
export async function removeTask(params: { gid: string }): Promise<string> {
  return getClient().call<string>('forceRemove', params.gid)
}

/** Forcefully pauses a download task by GID. */
export async function forcePauseTask(params: { gid: string }): Promise<string> {
  return getClient().call<string>('forcePause', params.gid)
}

/** Pauses a download task by GID (graceful). */
export async function pauseTask(params: { gid: string }): Promise<string> {
  return getClient().call<string>('pause', params.gid)
}

/** Resumes a paused download task by GID. */
export async function resumeTask(params: { gid: string }): Promise<string> {
  return getClient().call<string>('unpause', params.gid)
}

/** Pauses all active downloads (graceful). */
export async function pauseAllTask(): Promise<string> {
  return getClient().call<string>('pauseAll')
}

/** Forcefully pauses all active downloads. */
export async function forcePauseAllTask(): Promise<string> {
  return getClient().call<string>('forcePauseAll')
}

/** Resumes all paused downloads. */
export async function resumeAllTask(): Promise<string> {
  return getClient().call<string>('unpauseAll')
}

/** Saves the current aria2 session to disk. */
export async function saveSession(): Promise<string> {
  return getClient().call<string>('saveSession')
}

/** Removes a completed/errored task record from the download list. */
export async function removeTaskRecord(params: { gid: string }): Promise<string> {
  return getClient().call<string>('removeDownloadResult', params.gid)
}

/** Purges all completed/errored task records from the download list. */
export async function purgeTaskRecord(): Promise<string> {
  return getClient().call<string>('purgeDownloadResult')
}

/** Batch-resumes multiple tasks by GID array via multicall. */
export async function batchResumeTask(params: { gids: string[] }): Promise<unknown[][]> {
  const calls = params.gids.map((gid) => ['unpause', gid] as [string, ...unknown[]])
  return getClient().multicall<unknown[][]>(calls)
}

/** Batch-pauses multiple tasks by GID array via multicall (force). */
export async function batchPauseTask(params: { gids: string[] }): Promise<unknown[][]> {
  const calls = params.gids.map((gid) => ['forcePause', gid] as [string, ...unknown[]])
  return getClient().multicall<unknown[][]>(calls)
}

/** Alias for batchPauseTask — force-pauses multiple tasks. */
export async function batchForcePauseTask(params: { gids: string[] }): Promise<unknown[][]> {
  return batchPauseTask(params)
}

/** Batch-removes multiple tasks by GID array via multicall (force). */
export async function batchRemoveTask(params: { gids: string[] }): Promise<unknown[][]> {
  const calls = params.gids.map((gid) => ['forceRemove', gid] as [string, ...unknown[]])
  return getClient().multicall<unknown[][]>(calls)
}

/** Fetches user preferences from the Tauri persistent store. */
export async function fetchPreference(): Promise<Partial<AppConfig>> {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<Partial<AppConfig>>('get_app_config')
}

/** Saves updated user preferences to the Tauri persistent store. */
export async function savePreference(config: Partial<AppConfig>): Promise<void> {
  const { invoke } = await import('@tauri-apps/api/core')
  await invoke('save_preference', { config })
}

const api = {
  initClient,
  closeClient,
  reconnectClient,
  getVersion,
  getGlobalOption,
  getGlobalStat,
  changeGlobalOption,
  getOption,
  changeOption,
  getFiles,
  fetchActiveTaskList,
  fetchTaskList,
  fetchTaskItem,
  fetchTaskItemWithPeers,
  addUri,
  addUriAtomic,
  addTorrent,
  addMetalink,
  removeTask,
  forcePauseTask,
  pauseTask,
  resumeTask,
  pauseAllTask,
  forcePauseAllTask,
  resumeAllTask,
  saveSession,
  removeTaskRecord,
  purgeTaskRecord,
  batchResumeTask,
  batchPauseTask,
  batchForcePauseTask,
  batchRemoveTask,
  fetchPreference,
  savePreference,
}

export default api
