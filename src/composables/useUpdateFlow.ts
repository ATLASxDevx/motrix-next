/**
 * @fileoverview Pure functions extracted from UpdateDialog.vue for testability.
 *
 * Contains the update phase state machine logic: action button labels/types,
 * progress calculations, version direction detection, and proxy resolution.
 */
import { isDowngrade } from '@shared/utils/semver'

// ── Types ───────────────────────────────────────────────────────────

export type UpdatePhase = 'checking' | 'up-to-date' | 'available' | 'downloading' | 'ready' | 'installing' | 'error'

export interface UpdateProxyConfig {
  enable?: boolean
  server?: string
  scope?: string[]
}

// ── State Machine Pure Functions ────────────────────────────────────

/** Determines whether the action button should be disabled. */
export function isActionDisabled(phase: UpdatePhase): boolean {
  return phase === 'checking' || phase === 'up-to-date' || phase === 'installing'
}

/** Determines the action button label key based on phase and rollback status. */
export function getActionLabel(phase: UpdatePhase, _rollback: boolean): string {
  if (phase === 'error') return 'app.retry'
  if (phase === 'downloading') return 'app.cancel'
  if (phase === 'ready') return 'preferences.restart-and-install'
  if (phase === 'installing') return 'preferences.installing'
  return 'preferences.download-update'
}

/** Determines the action button Naive UI type based on phase. */
export function getActionType(phase: UpdatePhase): 'default' | 'info' | 'primary' {
  if (phase === 'downloading') return 'default'
  if (phase === 'error') return 'info'
  if (isActionDisabled(phase)) return 'default'
  return 'primary'
}

/** Determines which action to dispatch when button is clicked. */
export function getActionTarget(phase: UpdatePhase): 'download' | 'cancel' | 'install' | 'retry' | null {
  if (phase === 'available') return 'download'
  if (phase === 'downloading') return 'cancel'
  if (phase === 'ready') return 'install'
  if (phase === 'error') return 'retry'
  return null
}

// ── Version Detection ───────────────────────────────────────────────

/** Determines whether an update is a downgrade/rollback. */
export function isUpdateRollback(currentVersion: string, targetVersion: string): boolean {
  if (!currentVersion || !targetVersion) return false
  return isDowngrade(currentVersion, targetVersion)
}

// ── Progress Calculations ───────────────────────────────────────────

/** Calculates download progress percentage. */
export function calcProgressPercent(received: number, total: number): number {
  if (total <= 0) return 0
  return Math.round((received / total) * 100)
}

/** Converts bytes to megabytes string with 1 decimal. */
export function bytesToMB(bytes: number): string {
  return (bytes / 1048576).toFixed(1)
}

// ── Proxy Resolution ────────────────────────────────────────────────

/** Returns the proxy server URL if proxy is enabled for app updates. */
export function getUpdateProxy(proxyConfig: UpdateProxyConfig | undefined): string | null {
  if (!proxyConfig?.enable || !proxyConfig.server) return null
  const scope = proxyConfig.scope || []
  if (!scope.includes('update-app')) return null
  return proxyConfig.server
}

// ── Error Formatting ────────────────────────────────────────────────

/** Formats an unknown error into a display string. */
export function formatUpdateError(e: unknown): string {
  if (e instanceof Error) return e.message
  if (typeof e === 'string') return e
  return JSON.stringify(e)
}
