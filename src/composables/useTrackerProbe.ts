/** @fileoverview Composable for probing BitTorrent tracker reachability via Rust backend. */
import { ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { logger } from '@shared/logger'

export type TrackerStatus = 'checking' | 'online' | 'offline' | 'unknown'

export interface TrackerRow {
  url: string
  tier: number
  protocol: string
  status: TrackerStatus
}

/**
 * Extracts the protocol scheme from a tracker URL.
 * Exported for unit testing.
 */
export function parseTrackerProtocol(url: string): string {
  const match = url.match(/^(\w+):\/\//)
  return match ? match[1] : 'unknown'
}

/**
 * Builds structured tracker rows from aria2's nested announceList.
 * Each inner array is a tier; URLs within the same tier share a tier index.
 * Exported for unit testing.
 */
export function buildTrackerRows(announceList: string[][] | undefined): TrackerRow[] {
  if (!announceList || announceList.length === 0) return []

  const seen = new Set<string>()
  const rows: TrackerRow[] = []

  announceList.forEach((tierUrls, tierIndex) => {
    for (const url of tierUrls) {
      if (seen.has(url)) continue
      seen.add(url)
      rows.push({
        url,
        tier: tierIndex + 1,
        protocol: parseTrackerProtocol(url),
        status: 'unknown',
      })
    }
  })

  return rows
}

/**
 * Reactive composable that manages tracker probe state.
 * Calls the Rust `probe_trackers` IPC command to bypass browser CORS.
 */
export function useTrackerProbe() {
  const statuses = ref<Record<string, TrackerStatus>>({})
  const probing = ref(false)
  /** Generation counter to discard results from cancelled probes. */
  let probeGeneration = 0

  async function probeAll(urls: string[]) {
    const gen = ++probeGeneration
    probing.value = true
    for (const url of urls) {
      statuses.value[url] = 'checking'
    }
    try {
      const result = await invoke<Record<string, string>>('probe_trackers', { urls })
      // Discard if a newer probe or cancel has occurred
      if (gen !== probeGeneration) return
      for (const [url, status] of Object.entries(result)) {
        statuses.value[url] = status as TrackerStatus
      }
    } catch (e) {
      logger.debug('TrackerProbe', e)
      if (gen !== probeGeneration) return
      for (const url of urls) {
        if (statuses.value[url] === 'checking') {
          statuses.value[url] = 'unknown'
        }
      }
    } finally {
      if (gen === probeGeneration) {
        probing.value = false
      }
    }
  }

  function cancelProbe() {
    probeGeneration++
    for (const url of Object.keys(statuses.value)) {
      if (statuses.value[url] === 'checking') {
        statuses.value[url] = 'unknown'
      }
    }
    probing.value = false
  }

  return { statuses, probing, probeAll, cancelProbe }
}
