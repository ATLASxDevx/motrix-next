/**
 * @fileoverview Structural tests for the production context-menu guard.
 *
 * Tauri WebView exposes the browser's default right-click context menu
 * (Reload, Save As, Print, Inspect Element…) which is inappropriate for
 * a desktop app.  Industry standard (Tauri docs, Electron best practice,
 * Discord/Slack/VS Code) is to suppress it in production while keeping
 * it available in dev for debugging with Inspect Element.
 *
 * Verifies:
 * 1. main.ts registers a `contextmenu` event listener
 * 2. The listener calls `preventDefault()` to suppress the menu
 * 3. The suppression is guarded by `import.meta.env.PROD` so devtools
 *    remain accessible during development
 * 4. The guard is registered early (before the main window initialization)
 *    so all windows are covered
 */
import { describe, it, expect, beforeAll } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

const SRC_ROOT = path.resolve(__dirname, '../../..')

describe('main.ts — production context-menu suppression', () => {
  let mainSource: string

  beforeAll(() => {
    mainSource = fs.readFileSync(path.join(SRC_ROOT, 'src', 'main.ts'), 'utf-8')
  })

  it('registers a contextmenu event listener', () => {
    expect(mainSource).toContain("'contextmenu'")
  })

  it('calls preventDefault to suppress the default browser menu', () => {
    // The listener must call preventDefault on the event
    expect(mainSource).toContain('preventDefault()')
  })

  it('guards the suppression with import.meta.env.PROD (dev keeps menu)', () => {
    // Must be conditional — dev mode needs Inspect Element for debugging
    expect(mainSource).toContain('import.meta.env.PROD')

    // The PROD check must appear BEFORE the contextmenu listener
    const prodIdx = mainSource.indexOf('import.meta.env.PROD')
    const ctxIdx = mainSource.indexOf("'contextmenu'")
    expect(prodIdx).toBeGreaterThanOrEqual(0)
    expect(ctxIdx).toBeGreaterThanOrEqual(0)
    expect(prodIdx).toBeLessThan(ctxIdx)
  })

  it('is registered before main window initialization', () => {
    // The contextmenu guard must come before the main window init code
    // so all windows are covered.
    const ctxIdx = mainSource.indexOf("'contextmenu'")
    const mountIdx = mainSource.indexOf("app.mount('#app')")
    expect(ctxIdx).toBeGreaterThanOrEqual(0)
    expect(mountIdx).toBeGreaterThanOrEqual(0)
    expect(ctxIdx).toBeLessThan(mountIdx)
  })

  it('does NOT unconditionally suppress (no bare addEventListener without guard)', () => {
    // Ensure the preventDefault is inside a PROD conditional, not bare.
    // Extract the line containing contextmenu and verify PROD is nearby.
    const lines = mainSource.split('\n')
    const ctxLine = lines.findIndex((l) => l.includes("'contextmenu'"))
    expect(ctxLine).toBeGreaterThanOrEqual(0)

    // Within 5 lines before the contextmenu line, PROD guard must exist
    const surroundingBefore = lines.slice(Math.max(0, ctxLine - 5), ctxLine + 1).join('\n')
    expect(surroundingBefore).toContain('import.meta.env.PROD')
  })
})
