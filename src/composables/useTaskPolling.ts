/** @fileoverview Composable for managing periodic task list polling with lifecycle-aware start/stop. */

import { ref, onMounted, onBeforeUnmount } from 'vue'
import { isEngineReady } from '@/api/aria2'
import { useTaskStore } from '@/stores/task'
import { useAppStore } from '@/stores/app'
import { logger } from '@shared/logger'

/**
 * Manages periodic polling of the aria2 task list.
 * Automatically starts on mount and stops on unmount.
 * Re-entry safe: concurrent poll ticks are prevented.
 */
export function useTaskPolling() {
  const taskStore = useTaskStore()
  const appStore = useAppStore()
  const isPolling = ref(false)

  let timer: ReturnType<typeof setTimeout> | null = null

  function start() {
    stop()
    isPolling.value = true

    function tick() {
      if (!isPolling.value) return
      if (isEngineReady()) {
        taskStore.fetchList().catch((e: unknown) => {
          logger.warn('useTaskPolling', (e as Error).message)
        })
      }
      timer = setTimeout(tick, appStore.interval)
    }

    timer = setTimeout(tick, appStore.interval)
  }

  function stop() {
    isPolling.value = false
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }

  onMounted(start)
  onBeforeUnmount(stop)

  return { isPolling, start, stop }
}
