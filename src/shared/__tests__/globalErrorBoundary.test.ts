/**
 * @fileoverview Structural tests for global error boundary in main.ts.
 *
 * Industrial-grade desktop applications MUST catch all uncaught exceptions:
 * - `window.addEventListener('error', ...)` — synchronous runtime errors
 * - `window.addEventListener('unhandledrejection', ...)` — uncaught Promise rejections
 *
 * Without these, errors in async code paths (e.g. deep-link handlers, clipboard
 * watchers, engine init) silently disappear in production — only visible in the
 * webview DevTools console, which users never open.
 *
 * These tests verify the source code of main.ts to ensure:
 * 1. Both global error handlers exist
 * 2. They route errors through the centralized logger (not console.error)
 * 3. They are registered at the module level (not inside lazy callbacks)
 */
import { describe, it, expect, beforeAll } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

const SRC_ROOT = path.resolve(__dirname, '../../..')

describe('main.ts — global error boundary', () => {
  let mainSource: string

  beforeAll(() => {
    mainSource = fs.readFileSync(path.join(SRC_ROOT, 'src', 'main.ts'), 'utf-8')
  })

  // ─── window 'error' handler ──────────────────────────────────────

  describe('synchronous error handler (window error event)', () => {
    it('registers a window error event listener', () => {
      expect(mainSource).toContain("'error'")
      // Must be addEventListener, not window.onerror assignment
      expect(mainSource).toContain("addEventListener('error'")
    })

    it('routes errors through the centralized logger, not console', () => {
      // Extract the error handler block
      const errorIdx = mainSource.indexOf("addEventListener('error'")
      expect(errorIdx).toBeGreaterThanOrEqual(0)
      // Within 5 lines of the error listener, logger.error must be called
      const afterError = mainSource.slice(errorIdx, errorIdx + 300)
      expect(afterError).toContain('logger.error')
    })

    it('is registered at module scope (before main window init block)', () => {
      const errorIdx = mainSource.indexOf("addEventListener('error'")
      const preferenceLoadIdx = mainSource.indexOf('preferenceStore.loadPreference')
      expect(errorIdx).toBeGreaterThanOrEqual(0)
      expect(preferenceLoadIdx).toBeGreaterThanOrEqual(0)
      expect(errorIdx).toBeLessThan(preferenceLoadIdx)
    })
  })

  // ─── window 'unhandledrejection' handler ─────────────────────────

  describe('async rejection handler (window unhandledrejection event)', () => {
    it('registers a window unhandledrejection event listener', () => {
      expect(mainSource).toContain("'unhandledrejection'")
      expect(mainSource).toContain("addEventListener('unhandledrejection'")
    })

    it('routes rejections through the centralized logger, not console', () => {
      const rejIdx = mainSource.indexOf("addEventListener('unhandledrejection'")
      expect(rejIdx).toBeGreaterThanOrEqual(0)
      const afterRej = mainSource.slice(rejIdx, rejIdx + 300)
      expect(afterRej).toContain('logger.error')
    })

    it('is registered at module scope (before main window init block)', () => {
      const rejIdx = mainSource.indexOf("addEventListener('unhandledrejection'")
      const preferenceLoadIdx = mainSource.indexOf('preferenceStore.loadPreference')
      expect(rejIdx).toBeGreaterThanOrEqual(0)
      expect(preferenceLoadIdx).toBeGreaterThanOrEqual(0)
      expect(rejIdx).toBeLessThan(preferenceLoadIdx)
    })
  })

  // ─── ordering ────────────────────────────────────────────────────

  describe('handler ordering', () => {
    it('both handlers are registered after app.mount (UI renders first)', () => {
      const mountIdx = mainSource.indexOf("app.mount('#app')")
      const errorIdx = mainSource.indexOf("addEventListener('error'")
      const rejIdx = mainSource.indexOf("addEventListener('unhandledrejection'")
      expect(mountIdx).toBeGreaterThanOrEqual(0)
      expect(errorIdx).toBeGreaterThan(mountIdx)
      expect(rejIdx).toBeGreaterThan(mountIdx)
    })
  })
})
