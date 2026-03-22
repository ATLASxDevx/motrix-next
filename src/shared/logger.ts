/** @fileoverview Centralized logging utility bridging to tauri-plugin-log for persistent file output. */
import { error as tauriError, warn as tauriWarn, info as tauriInfo, debug as tauriDebug } from '@tauri-apps/plugin-log'

/** Formats a context-prefixed log message suitable for both console and file output. */
function formatMessage(context: string, message: string): string {
  return `[${context}] ${message}`
}

/**
 * Centralized logger providing structured, level-gated output.
 *
 * Each log level bridges to the Rust-side `tauri-plugin-log` for persistent file storage
 * with automatic rotation. Console output policy:
 * - **error / warn**: mirror to `console.error` / `console.warn` for DevTools visibility
 * - **info / debug**: silent in console — only written to the Rust log file
 *
 * The `.catch(() => {})` on every tauri call prevents IPC failures from propagating
 * into business logic (e.g., during app teardown or before plugin initialisation).
 */
export const logger = {
  /** Logs an error with full Error object serialization to both console and log file. */
  error(context: string, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error)
    const formatted = formatMessage(context, message)
    console.error(formatted)
    tauriError(formatted).catch(() => {})
    if (error instanceof Error && error.stack) {
      const stackFormatted = formatMessage(context, error.stack)
      tauriError(stackFormatted).catch(() => {})
    }
  },

  /** Logs a warning for degradable failures to both console and log file. */
  warn(context: string, message: string): void {
    const formatted = formatMessage(context, message)
    console.warn(formatted)
    tauriWarn(formatted).catch(() => {})
  },

  /** Logs informational messages for significant operations (log file only, no console). */
  info(context: string, message: string): void {
    const formatted = formatMessage(context, message)
    tauriInfo(formatted).catch(() => {})
  },

  /** Logs debug data (log file only, no console). Suppressed in production by Rust-side level filter. */
  debug(context: string, data?: unknown): void {
    let message = ''
    if (data instanceof Error) {
      message = data.stack ?? data.message
    } else if (typeof data === 'string') {
      message = data
    } else if (data !== undefined) {
      message = JSON.stringify(data)
    }
    const formatted = formatMessage(context, message)
    tauriDebug(formatted).catch(() => {})
  },
}
