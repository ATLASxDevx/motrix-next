/**
 * @fileoverview Structural tests for window-show-from-frontend behavior.
 *
 * Tauri official + industry standard (Clash Verge Rev, etc.):
 *   - Window starts with `visible: false` in tauri.conf.json
 *   - Frontend calls `show()` + `setFocus()` after mount (content ready)
 *   - This prevents transparent window flash on Windows (WebView2 init)
 *
 * Verifies:
 * 1. Rust setup() does NOT call w.show() or w.set_focus() on the main window
 * 2. Rust exposes `is_autostart_launch` command for frontend to check
 * 3. Vue MainLayout.vue onMounted calls window show + focus
 * 4. Vue gates show behind autostart silent check
 */
import { describe, it, expect, beforeAll } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..', '..')
const TAURI_ROOT = path.resolve(PROJECT_ROOT, 'src-tauri')
const MAIN_LAYOUT = path.join(PROJECT_ROOT, 'src', 'layouts', 'MainLayout.vue')
const APP_RS = path.join(TAURI_ROOT, 'src', 'commands', 'fs.rs')
const LIB_RS = path.join(TAURI_ROOT, 'src', 'lib.rs')

// ═══════════════════════════════════════════════════════════════════
// Group 1: lib.rs — startup block must NOT show/focus the window
// ═══════════════════════════════════════════════════════════════════

describe('lib.rs — window show deferred to frontend', () => {
  let source: string

  beforeAll(() => {
    source = fs.readFileSync(LIB_RS, 'utf-8')
  })

  it('does NOT call w.show() in the startup block', () => {
    // The startup block (state restoration comment area) must not
    // show the window — that is now the frontend's responsibility.
    // The window starts hidden via tauri.conf.json visible:false and
    // remains hidden until Vue mounts and calls show().
    const setupBlock = extractSetupBlock(source)
    expect(setupBlock).toBeTruthy()

    // The show/set_focus that was previously in the "Show the main window
    // now that state restoration is complete" block must be gone.
    // Note: single-instance handler still has show+focus (line ~40) — that's fine.
    const stateRestorationIdx = setupBlock!.indexOf('state restoration')
    if (stateRestorationIdx >= 0) {
      // If the comment still exists, the block below it must not call show()
      const afterRestoration = setupBlock!.slice(stateRestorationIdx)
      const autoHideIdx = afterRestoration.indexOf('Auto-hide')
      const relevantBlock = autoHideIdx >= 0 ? afterRestoration.slice(0, autoHideIdx) : afterRestoration.slice(0, 200)
      expect(relevantBlock).not.toContain('w.show()')
      expect(relevantBlock).not.toContain('w.set_focus()')
    }
  })

  it('does NOT show-then-hide dance for autostart', () => {
    // The old pattern was: show() → check autostart → hide().
    // The new pattern: window stays hidden, frontend decides.
    // The auto-hide block should not need to call w.hide() because
    // the window never gets shown from Rust setup().
    const stateRestorationIdx = source.indexOf('state restoration')
    if (stateRestorationIdx >= 0) {
      const afterRestoration = source.slice(stateRestorationIdx, stateRestorationIdx + 500)
      // Should not have both show() AND hide() in this section
      const hasShow = afterRestoration.includes('w.show()')
      const hasHide = afterRestoration.includes('w.hide()')
      expect(hasShow && hasHide, 'should not show-then-hide from Rust').toBe(false)
    }
  })
})

// ═══════════════════════════════════════════════════════════════════
// Group 2: Rust is_autostart_launch command
// ═══════════════════════════════════════════════════════════════════

describe('commands/fs.rs — is_autostart_launch command', () => {
  let source: string

  beforeAll(() => {
    source = fs.readFileSync(APP_RS, 'utf-8')
  })

  it('defines is_autostart_launch as a tauri command', () => {
    expect(source).toContain('is_autostart_launch')
    // Must return a bool
    expect(source).toMatch(/fn is_autostart_launch.*bool/)
  })

  it('checks for --autostart in command line args', () => {
    const fnBody = extractFunctionBody(source, 'is_autostart_launch')
    expect(fnBody).toBeTruthy()
    expect(fnBody).toContain('--autostart')
  })
})

// ═══════════════════════════════════════════════════════════════════
// Group 3: lib.rs registers is_autostart_launch in invoke_handler
// ═══════════════════════════════════════════════════════════════════

describe('lib.rs — is_autostart_launch registered', () => {
  let source: string

  beforeAll(() => {
    source = fs.readFileSync(LIB_RS, 'utf-8')
  })

  it('includes is_autostart_launch in the invoke_handler', () => {
    expect(source).toContain('is_autostart_launch')
  })
})

// ═══════════════════════════════════════════════════════════════════
// Group 4: MainLayout.vue — show window from frontend
// ═══════════════════════════════════════════════════════════════════

describe('MainLayout.vue — show window from frontend on mount', () => {
  let source: string

  beforeAll(() => {
    source = fs.readFileSync(MAIN_LAYOUT, 'utf-8')
  })

  it('calls getCurrentWindow().show() in onMounted', () => {
    // The window show must happen from the frontend, not Rust,
    // to avoid transparent window flash on Windows.
    const mountedBody = extractOnMountedBody(source)
    expect(mountedBody).toBeTruthy()
    expect(mountedBody).toContain('.show()')
  })

  it('calls setFocus() after show()', () => {
    const mountedBody = extractOnMountedBody(source)
    expect(mountedBody).toBeTruthy()
    expect(mountedBody).toContain('.setFocus()')
    // show must come before setFocus
    const showIdx = mountedBody!.indexOf('.show()')
    const focusIdx = mountedBody!.indexOf('.setFocus()')
    expect(showIdx).toBeLessThan(focusIdx)
  })

  it('checks is_autostart_launch before showing', () => {
    // The show logic must be gated: skip show if autostart + autoHideWindow
    const mountedBody = extractOnMountedBody(source)
    expect(mountedBody).toBeTruthy()
    expect(mountedBody).toContain('is_autostart_launch')
  })

  it('checks autoHideWindow preference before showing', () => {
    const mountedBody = extractOnMountedBody(source)
    expect(mountedBody).toBeTruthy()
    expect(mountedBody).toContain('autoHideWindow')
  })

  it('show + focus happens BEFORE appReady transition', () => {
    // The window must be visible before the CSS opacity transition
    // starts, otherwise the animation plays invisibly.
    const mountedBody = extractOnMountedBody(source)
    expect(mountedBody).toBeTruthy()
    const showIdx = mountedBody!.indexOf('.show()')
    const readyIdx = mountedBody!.indexOf('appReady')
    expect(showIdx).toBeGreaterThanOrEqual(0)
    expect(readyIdx).toBeGreaterThanOrEqual(0)
    expect(showIdx).toBeLessThan(readyIdx)
  })
})

// ─── Helpers ────────────────────────────────────────────────────────

function extractFunctionBody(source: string, fnName: string): string | null {
  const idx = source.indexOf(fnName)
  if (idx === -1) return null
  const braceStart = source.indexOf('{', idx)
  if (braceStart === -1) return null
  let depth = 0
  for (let i = braceStart; i < source.length; i++) {
    if (source[i] === '{') depth++
    else if (source[i] === '}') depth--
    if (depth === 0) return source.slice(braceStart, i + 1)
  }
  return null
}

function extractSetupBlock(source: string): string | null {
  // After the run() refactor, setup logic lives in a standalone fn setup_app
  // instead of an inline .setup(|app| { ... }) closure.
  const marker = 'fn setup_app'
  const idx = source.indexOf(marker)
  if (idx === -1) return null
  const braceStart = source.indexOf('{', idx)
  if (braceStart === -1) return null
  let depth = 0
  for (let i = braceStart; i < source.length; i++) {
    if (source[i] === '{') depth++
    else if (source[i] === '}') depth--
    if (depth === 0) return source.slice(braceStart, i + 1)
  }
  return null
}

function extractOnMountedBody(source: string): string | null {
  const marker = 'onMounted(async'
  const idx = source.indexOf(marker)
  if (idx === -1) return null
  const braceStart = source.indexOf('{', idx)
  if (braceStart === -1) return null
  let depth = 0
  for (let i = braceStart; i < source.length; i++) {
    if (source[i] === '{') depth++
    else if (source[i] === '}') depth--
    if (depth === 0) return source.slice(braceStart, i + 1)
  }
  return null
}
