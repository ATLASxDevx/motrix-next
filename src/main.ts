/** @fileoverview Application entry point: mounts Vue, initializes i18n, aria2 engine, and IPC listeners. */
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router'
import { i18n } from '@/composables/useLocale'
import { setI18nLocale } from '@shared/utils/i18n'
import { usePreferenceStore } from './stores/preference'
import { useTaskStore } from './stores/task'
import { useAppStore } from './stores/app'
import { useHistoryStore } from './stores/history'
import aria2Api, { initClient } from './api/aria2'
import { ENGINE_RPC_PORT, AUTO_SYNC_TRACKER_INTERVAL, DEFAULT_TRACKER_SOURCE } from '@shared/constants'
import { convertTrackerDataToLine, convertTrackerDataToComma, reduceTrackerString } from '@shared/utils/tracker'
import { logger } from '@shared/logger'
import type { AppConfig } from '@shared/types'
import App from './App.vue'
import 'virtual:uno.css'
import './styles/variables.css'

import { getCurrentWindow } from '@tauri-apps/api/window'
import { getLocale } from 'tauri-plugin-locale-api'

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)
app.use(router)
app.use(i18n)

// ── Production guard: suppress browser default context menu ─────────
// In dev mode, keep the context menu for DevTools / Inspect Element.
// Industry standard for Tauri/Electron desktop apps (Discord, Slack, VS Code).
if (import.meta.env.PROD) {
  document.addEventListener('contextmenu', (e) => e.preventDefault())
}

app.mount('#app')

// ── Global error boundary — catch all uncaught exceptions to log file ──
// Registered after mount (UI renders first) but before init block (covers
// all async code paths: deep-link, clipboard, engine, tracker sync).
window.addEventListener('error', (e) => {
  logger.error('GlobalError', e.error ?? e.message)
})
window.addEventListener('unhandledrejection', (e) => {
  logger.error('UnhandledRejection', e.reason)
})

// ── Main window initialization ──────────────────────────────────────

{
  const preferenceStore = usePreferenceStore()
  const taskStore = useTaskStore()
  const appStore = useAppStore()
  const historyStore = useHistoryStore()

  async function waitForEngine(port: number, secret: string, maxRetries = 10): Promise<boolean> {
    const { Aria2 } = await import('@shared/aria2')
    for (let i = 0; i < maxRetries; i++) {
      try {
        const probe = new Aria2({ host: '127.0.0.1', port, secret })
        await probe.open()
        await probe.call('getVersion')
        await probe.close()
        return true
      } catch (e) {
        // Exponential backoff: 100 → 200 → 400 → 800 → 1600 → 2000 → 2000 …
        const delay = Math.min(100 * 2 ** i, 2000)
        logger.debug('waitForEngine', `attempt ${i + 1}/${maxRetries} failed, retry in ${delay}ms: ${e}`)
        await new Promise((r) => setTimeout(r, delay))
      }
    }
    return false
  }

  async function autoCheckForUpdate() {
    const config = preferenceStore.config
    if (config.autoCheckUpdate === false) return

    const lastCheck = Number(config.lastCheckUpdateTime) || 0
    const intervalMs = (Number(config.autoCheckUpdateInterval) || 24) * 3_600_000
    if (Date.now() - lastCheck < intervalMs) return

    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const channel = config.updateChannel || 'stable'
      const proxy = config.proxy
      const proxyServer =
        proxy?.enable && proxy.server && (proxy.scope || []).includes('update-app') ? proxy.server : null
      const update = await invoke<{ version: string; body: string | null; date: string | null } | null>(
        'check_for_update',
        { channel, proxy: proxyServer },
      )
      if (update) {
        appStore.pendingUpdate = { version: update.version, body: update.body, date: update.date }
      }
    } catch (e) {
      logger.warn('Updater', 'auto check failed: ' + (e as Error).message)
    } finally {
      preferenceStore.updateAndSave({ lastCheckUpdateTime: Date.now() })
    }
  }

  async function autoSyncTrackerOnStartup() {
    const config = preferenceStore.config
    if (!config.autoSyncTracker) return

    const lastSync = config.lastSyncTrackerTime || 0
    if (Date.now() - lastSync < AUTO_SYNC_TRACKER_INTERVAL) return

    const sources = config.trackerSource?.length ? config.trackerSource : DEFAULT_TRACKER_SOURCE
    try {
      const results = await preferenceStore.fetchBtTracker(sources)
      const text = convertTrackerDataToLine(results)
      if (!text) return

      const comma = convertTrackerDataToComma(results)
      await preferenceStore.updateAndSave({
        btTracker: comma,
        trackerSource: sources,
        lastSyncTrackerTime: Date.now(),
      })

      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('save_system_config', { config: { 'bt-tracker': reduceTrackerString(comma) } })
      logger.info('Tracker', `Auto-synced ${results.length} tracker source(s)`)
    } catch (e) {
      logger.debug('Tracker', 'auto-sync failed: ' + (e as Error).message)
    }
  }

  // ---------------------------------------------------------------------------
  // Startup orchestration
  //
  // The chain is split into phases that run as parallel as possible so the
  // window appears almost instantly while the engine boots in the background.
  //
  //  Phase 1 (critical path)   – loadPreference → locale → window.show()
  //  Phase 2 (engine, async)   – rpcSecret → save config → start engine
  //                              → waitForEngine → initClient
  //  Phase 3 (non-critical)    – deep-link, autostart (parallel)
  //  Phase 4 (deferred)        – update check, tracker sync, FS warmup,
  //                              clipboard monitor
  // ---------------------------------------------------------------------------

  /** Start the aria2 engine, wait for readiness, and connect the RPC client.
   *  Returns `true` if the engine is usable, `false` on failure. */
  async function initEngine(port: number, secret: string, config: AppConfig): Promise<boolean> {
    try {
      const { invoke } = await import('@tauri-apps/api/core')

      // Seed system.json with the FULL set of default system config values.
      // This ensures CLI args include --split, --max-connection-per-server,
      // --user-agent, etc. even before the user opens the preference page.
      // On subsequent launches, saved values from Basic/Advanced preferences
      // already exist in system.json and will be merged (not overwritten).
      const { buildBasicSystemConfig, buildBasicForm } = await import('@/composables/useBasicPreference')
      const { buildAdvancedSystemConfig, buildAdvancedForm } = await import('@/composables/useAdvancedPreference')
      const basicSystem = buildBasicSystemConfig(buildBasicForm(config))
      const { form: advForm } = buildAdvancedForm(config)
      const advancedSystem = buildAdvancedSystemConfig(advForm)

      await invoke('save_system_config', {
        config: {
          ...basicSystem,
          ...advancedSystem,
          // Override with runtime values — secret may have been auto-generated
          'rpc-secret': secret,
          'rpc-listen-port': String(port),
        },
      })
      await invoke('start_engine_command')
    } catch (e) {
      logger.error('Engine', e)
      return false
    }

    const ready = await waitForEngine(port, secret)
    if (!ready) {
      logger.error('Engine', 'Engine did not become ready after retries')
      return false
    }

    try {
      await initClient({ port, secret })
      logger.info('Engine', `RPC client connected via WebSocket on port ${port}`)
    } catch (e) {
      logger.warn('Engine', 'WebSocket failed, using HTTP fallback: ' + (e as Error).message)
      const { setEngineReady } = await import('@/api/aria2')
      setEngineReady(true)
    }
    return true
  }

  /** Setup deep-link handler to accept URLs/files from OS. */
  async function setupDeepLinks(): Promise<void> {
    try {
      const { getCurrent, onOpenUrl } = await import('@tauri-apps/plugin-deep-link')
      const startUrls = await getCurrent()
      if (startUrls && startUrls.length > 0) {
        appStore.handleDeepLinkUrls(startUrls)
      }
      await onOpenUrl((urls) => {
        appStore.handleDeepLinkUrls(urls)
      })
    } catch (e) {
      logger.warn('DeepLink', 'setup failed: ' + (e as Error).message)
    }
  }

  /** Sync autostart state with persisted preference. */
  async function syncAutostart(config: typeof preferenceStore.config): Promise<void> {
    try {
      const { isEnabled, enable, disable } = await import('@tauri-apps/plugin-autostart')
      const currentlyEnabled = await isEnabled()
      if (config.openAtLogin && !currentlyEnabled) {
        await enable()
      } else if (!config.openAtLogin && currentlyEnabled) {
        await disable()
      }
    } catch (e) {
      logger.debug('main.autostart', e)
    }
  }

  preferenceStore.loadPreference().then(async () => {
    // ── Phase 1: critical path → window visible ASAP ──────────────────────
    let locale = preferenceStore.locale
    if (!locale) {
      try {
        const raw = (await getLocale()) || 'en-US'
        const sysLang = raw.replace('-Hans', '').replace('-Hant', '')
        const available = i18n.global.availableLocales
        if (available.includes(sysLang)) {
          locale = sysLang
        } else {
          const prefix = sysLang.split('-')[0]
          locale = available.find((l) => l === prefix || l.startsWith(prefix + '-')) || 'en-US'
        }
      } catch (e) {
        logger.debug('main.locale', e)
        locale = 'en-US'
      }
      // Update config reactively FIRST (synchronous), then persist to disk (async).
      // updateAndSave() delays config.value assignment until after file I/O,
      // which causes a race: components that mount before the save completes
      // would read stale '' locale and fall back to 'en-US'.
      preferenceStore.updatePreference({ locale })
      preferenceStore.savePreference()
    }
    if (locale && i18n.global.locale) {
      setI18nLocale(i18n, locale)
    }

    const config = preferenceStore.config

    // macOS traffic-light controls: auto-enable on first launch for macOS users.
    // The default is false (for Win/Linux). On first launch, macOS users get it
    // set to true automatically. Once persisted, user preference is respected.
    if (!config.macStyleControls) {
      try {
        const { platform } = await import('@tauri-apps/plugin-os')
        if (platform() === 'macos') {
          preferenceStore.updatePreference({ macStyleControls: true })
          preferenceStore.savePreference()
        }
      } catch (e) {
        logger.debug('main.macStyleControls', e)
      }
    }

    // ── Phase 2: engine startup (non-blocking) ────────────────────────────
    const port = config.rpcListenPort || ENGINE_RPC_PORT
    // Distinguish "never set" (undefined/null → auto-generate) from
    // "intentionally cleared" ('' → respect user choice).
    let secret = config.rpcSecret

    if (secret == null) {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
      const values = crypto.getRandomValues(new Uint8Array(16))
      secret = Array.from(values, (v) => chars[v % chars.length]).join('')
      await preferenceStore.updateAndSave({ rpcSecret: secret })
    }

    taskStore.setApi(aria2Api)

    // Engine initializes in the background — does NOT block the UI.
    // appStore.engineInitializing drives the init banner in MainLayout.
    const enginePromise = initEngine(port, secret, config)

    // ── Phase 3: non-critical IPC (parallel) ──────────────────────────────
    Promise.allSettled([setupDeepLinks(), syncAutostart(config)])

    // Start UPnP port mapping if enabled (fire-and-forget)
    if (config.enableUpnp) {
      import('@tauri-apps/api/core')
        .then(({ invoke }) =>
          invoke('start_upnp_mapping', {
            btPort: Number(config.listenPort) || 21301,
            dhtPort: Number(config.dhtListenPort) || 26701,
          }),
        )
        .catch((e) => logger.warn('UPnP', 'startup mapping failed: ' + e))
    }

    // ── Phase 2 completion: engine ready ───────────────────────────────────
    // try/finally guarantees engineInitializing always clears, even on failure.
    // engineReady distinguishes success from failure for the UI toast.
    try {
      const ok = await enginePromise
      appStore.engineReady = ok

      // Push user-configured options to aria2 global state via RPC.
      // CLI args already set these at process startup, but this is
      // defense-in-depth: ensures the runtime global state matches
      // the user's preferences even if system.json had stale keys.
      if (ok) {
        const { syncGlobalOptions } = await import('@/composables/syncGlobalOptions')
        await syncGlobalOptions(config).catch((e) => logger.warn('Engine', 'global option sync failed: ' + e))
      }
    } catch (e) {
      logger.error('Engine', 'unexpected startup error: ' + e)
      appStore.engineReady = false
    } finally {
      appStore.engineInitializing = false
    }

    // Resume all paused/waiting tasks on launch if configured
    if (config.resumeAllWhenAppLaunched) {
      taskStore.resumeAllTask().catch((e) => logger.debug('main.resumeAll', e))
    }

    // ── Phase 4: deferred non-critical tasks ───────────────────────────────
    autoCheckForUpdate()
    autoSyncTrackerOnStartup()

    // Initialize download history database, then schedule stale record cleanup
    historyStore
      .init({
        onCorrupt: () => logger.warn('HistoryDB', 'Database corrupted, rebuilding…'),
        onError: (e) => logger.warn('HistoryDB', `Load failed, rebuilding… ${e}`),
        onRebuilt: () => logger.info('HistoryDB', 'Database rebuilt successfully'),
        onRebuildFailed: (e) => logger.error('HistoryDB', `Rebuild failed: ${e}`),
      })
      .then(() => {
        // Auto-delete stale records if enabled — delayed to avoid startup contention
        if (preferenceStore.config?.autoDeleteStaleRecords) {
          const runCleanup = async () => {
            try {
              const { runStaleRecordCleanup } = await import('./composables/useStaleCleanup')
              const records = await historyStore.getRecords('complete')
              const result = await runStaleRecordCleanup(
                records.map((r) => ({
                  gid: r.gid,
                  name: r.name,
                  dir: r.dir ?? '',
                })),
                historyStore.removeStaleRecords,
              )
              if (result.removed > 0) {
                logger.info('StaleCleanup', `Removed ${result.removed}/${result.scanned} stale records`)
              }
            } catch (e) {
              logger.debug('StaleCleanup', e)
            }
          }
          // First scan 30s after startup — not urgent
          setTimeout(runCleanup, 30_000)
          // Re-scan every 30 minutes for long-running sessions
          setInterval(runCleanup, 1_800_000)
        }
      })
      .catch((e) => logger.warn('HistoryDB', 'init failed: ' + e))

    // Re-check tracker sync hourly for long-running sessions.
    // autoSyncTrackerOnStartup() internally de-duplicates via lastSyncTrackerTime.
    setInterval(autoSyncTrackerOnStartup, 3_600_000)

    // Warm up Tauri FS plugin IPC channel to eliminate cold-start delay on first
    // file operation (e.g. task deletion).
    setTimeout(() => {
      import('@tauri-apps/plugin-fs').then(({ exists }) => exists('/')).catch(() => {})
    }, 3000)

    let lastClipboardText = ''
    getCurrentWindow().onFocusChanged(async ({ payload: focused }) => {
      if (!focused) return
      if (appStore.addTaskVisible) return
      try {
        const { readText } = await import('@tauri-apps/plugin-clipboard-manager')
        const text = ((await readText()) || '').trim()
        if (!text || text === lastClipboardText) return
        const { detectResource } = await import('@shared/utils')
        if (detectResource(text)) {
          lastClipboardText = text
          const { createBatchItem } = await import('@shared/utils/batchHelpers')
          appStore.enqueueBatch([createBatchItem('uri', text)])
        }
      } catch (e) {
        logger.debug('Main.clipboardMonitor', e)
      }
    })
  })
} // end: main window initialization
