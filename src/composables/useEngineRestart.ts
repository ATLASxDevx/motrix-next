/**
 * @fileoverview Composable for engine restart with concurrency guard.
 *
 * Prevents multiple simultaneous engine restarts — the root cause of orphaned
 * aria2c processes.  Only ONE restart may be in-flight at any time; subsequent
 * calls return `false` immediately.
 */
import { ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { reconnectClient, setEngineReady } from '@/api/aria2'
import { useAppStore } from '@/stores/app'
import { logger } from '@shared/logger'

interface RestartOptions {
  port: number
  secret: string
}

/**
 * Creates a restart controller with a concurrency guard.
 *
 * Usage:
 * ```ts
 * const { restartEngine, isRestarting } = useEngineRestart()
 * // In template: :disabled="isRestarting"
 * const ok = await restartEngine({ port, secret })
 * if (ok === false) { /* already restarting, call was rejected * / }
 * ```
 */
export function useEngineRestart() {
  const isRestarting = ref(false)

  async function restartEngine(opts: RestartOptions): Promise<boolean> {
    // Concurrency guard — reject if already restarting
    if (isRestarting.value) {
      logger.debug('useEngineRestart', 'restart already in progress, skipping')
      return false
    }

    isRestarting.value = true
    const appStore = useAppStore()

    // Signal "restarting" to the UI
    appStore.engineReady = false
    appStore.engineInitializing = true
    setEngineReady(false)

    try {
      // Invoke the Rust command (atomic: stop → wait → cleanup → start)
      await invoke('restart_engine_command')

      // Reconnect with exponential backoff
      const maxRetries = 5
      let lastError: unknown
      for (let i = 0; i < maxRetries; i++) {
        const delay = Math.min(200 * 2 ** i, 2000)
        await new Promise((r) => setTimeout(r, delay))
        try {
          await reconnectClient({ port: opts.port, secret: opts.secret })
          appStore.engineReady = true

          // Re-sync global options — new aria2 process resets to compiled
          // defaults.  CLI args from system.json cover most keys, but this
          // is defense-in-depth against stale system.json or missed keys.
          try {
            const { usePreferenceStore } = await import('@/stores/preference')
            const prefStore = usePreferenceStore()
            const { syncGlobalOptions } = await import('@/composables/syncGlobalOptions')
            await syncGlobalOptions(prefStore.config)
          } catch (syncErr) {
            logger.debug('useEngineRestart', 'global option sync after restart failed: ' + syncErr)
          }

          return true
        } catch (e) {
          lastError = e
          logger.debug('useEngineRestart', `reconnect attempt ${i + 1}/${maxRetries} failed: ${e}`)
        }
      }

      logger.error('useEngineRestart', `all reconnect attempts failed: ${lastError}`)
      appStore.engineReady = false
      return true
    } catch (e) {
      logger.error('useEngineRestart', `restart failed: ${e}`)
      appStore.engineReady = false
      return true
    } finally {
      appStore.engineInitializing = false
      isRestarting.value = false
    }
  }

  return { restartEngine, isRestarting }
}
