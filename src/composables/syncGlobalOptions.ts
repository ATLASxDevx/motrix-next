/**
 * @fileoverview One-shot sync of user-configured options to the running aria2 engine.
 *
 * When aria2c starts, it uses either CLI arguments (from system.json) or its
 * compiled defaults.  On first launch, system.json may not contain all keys,
 * and after an engine restart the process resets to defaults.  This module
 * pushes the full set of user-configured system options to aria2's global
 * state via `changeGlobalOption` RPC, ensuring external RPC callers (browser
 * extensions, download scripts) inherit the user's configured split,
 * max-connection-per-server, user-agent, etc.
 *
 * Called once after:
 *   1. Initial engine startup  (main.ts)
 *   2. Engine restart           (useEngineRestart.ts)
 */
import { changeGlobalOption } from '@/api/aria2'
import { buildBasicSystemConfig, buildBasicForm } from '@/composables/useBasicPreference'
import { buildAdvancedSystemConfig, buildAdvancedForm } from '@/composables/useAdvancedPreference'
import { filterHotReloadableKeys } from '@shared/utils/config'
import { logger } from '@shared/logger'
import type { AppConfig } from '@shared/types'

/**
 * Pushes user-configured system options to the running aria2 engine
 * via `aria2.changeGlobalOption` RPC.
 *
 * Builds the same system config maps that the Basic and Advanced preference
 * pages produce on save, merges them, strips restart-only keys (ports,
 * secret, log-level), and sends the remainder to aria2.
 *
 * @throws Re-throws `changeGlobalOption` errors so the caller can decide
 *         whether to swallow (startup) or surface (user-triggered restart).
 */
export async function syncGlobalOptions(config: AppConfig): Promise<void> {
  // Build system config using the same pure functions the preference
  // pages use — guarantees identical key coverage.
  const basicSystem = buildBasicSystemConfig(buildBasicForm(config))
  const { form: advancedForm } = buildAdvancedForm(config)
  const advancedSystem = buildAdvancedSystemConfig(advancedForm)

  // Merge: basic keys + advanced keys.  If both emit the same key,
  // basic wins (it's closer to the user-facing value).
  const merged = { ...advancedSystem, ...basicSystem }

  // Strip keys that aria2 rejects via changeGlobalOption (ports, secret,
  // log-level) — they are set at process startup via CLI args only.
  const hotKeys = filterHotReloadableKeys(merged)

  if (Object.keys(hotKeys).length === 0) return

  await changeGlobalOption(hotKeys as Partial<AppConfig>)
  logger.info('syncGlobalOptions', `synced ${Object.keys(hotKeys).length} keys to aria2 global`)
}
