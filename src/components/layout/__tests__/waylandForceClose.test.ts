/**
 * @fileoverview Structural tests for the Wayland force-close safety net.
 *
 * On Linux/Wayland + `decorations: false`, the compositor can destroy the
 * window without emitting `CloseRequested`.  The three-layer fix ensures:
 *
 * Layer 1 — `ExitRequested { api.prevent_exit() }` keeps the process alive
 *           when the last window is destroyed (Wayland force-close).
 * Layer 2 — `get_or_create_main_window()` in tray.rs recreates the window
 *           if it was destroyed, so tray click always works.
 * Layer 3 — Diagnostic logging at Info level for all window lifecycle events
 *           enables remote diagnosis from user-submitted log files.
 *
 * Tests use source-code structural analysis (no Tauri runtime needed).
 */
import { describe, it, expect, beforeAll } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

const SRC_ROOT = path.resolve(__dirname, '../../../..')
const TAURI_ROOT = path.resolve(SRC_ROOT, 'src-tauri')

// ─── Helpers ────────────────────────────────────────────────────────

/**
 * Extracts a function/closure body from source code (brace-balanced extraction).
 * Returns the content between the opening `{` and its matching `}`.
 */
function extractBody(source: string, signature: string): string {
  const start = source.indexOf(signature)
  expect(start, `${signature} must exist in source`).toBeGreaterThanOrEqual(0)
  const braceStart = source.indexOf('{', start)
  if (braceStart === -1) return ''
  let depth = 0
  for (let i = braceStart; i < source.length; i++) {
    if (source[i] === '{') depth++
    else if (source[i] === '}') depth--
    if (depth === 0) return source.slice(braceStart, i + 1)
  }
  return ''
}

// ═══════════════════════════════════════════════════════════════════
// Layer 1: ExitRequested handler — keeps process alive on Wayland
// ═══════════════════════════════════════════════════════════════════

describe('lib.rs — ExitRequested safety net', () => {
  let source: string
  let runEventBody: string

  beforeAll(() => {
    source = fs.readFileSync(path.join(TAURI_ROOT, 'src', 'lib.rs'), 'utf-8')
    runEventBody = extractBody(source, 'fn handle_run_event')
  })

  it('handles ExitRequested in handle_run_event', () => {
    expect(runEventBody).toContain('ExitRequested')
  })

  it('checks code.is_none() to distinguish implicit vs explicit exit', () => {
    // code.is_none() = last window closed (not user calling app.exit())
    expect(runEventBody).toContain('code.is_none()')
  })

  it('reads minimizeToTrayOnClose from persistent store', () => {
    expect(runEventBody).toContain('"minimizeToTrayOnClose"')
  })

  it('calls api.prevent_exit() when minimize-to-tray is enabled', () => {
    expect(runEventBody).toContain('api.prevent_exit()')
  })

  it('prevent_exit is conditional on should_hide (does not block explicit quit)', () => {
    const preventIdx = runEventBody.indexOf('api.prevent_exit()')
    const shouldHideIdx = runEventBody.indexOf('if should_hide')
    expect(preventIdx).toBeGreaterThanOrEqual(0)
    expect(shouldHideIdx).toBeGreaterThanOrEqual(0)
    // prevent_exit must be INSIDE the should_hide block (after the check)
    expect(preventIdx).toBeGreaterThan(shouldHideIdx)
  })

  it('documents Wayland force-close in the doc comment', () => {
    const fnStart = source.indexOf('fn handle_run_event')
    const docBlock = source.slice(Math.max(0, fnStart - 1000), fnStart)
    expect(docBlock).toContain('Wayland')
    expect(docBlock).toContain('prevent_exit')
  })

  it('still handles Exit for engine + UPnP cleanup', () => {
    expect(runEventBody).toContain('RunEvent::Exit')
    expect(runEventBody).toContain('stop_engine')
    expect(runEventBody).toContain('stop_mapping')
  })

  it('still handles Reopen on macOS', () => {
    expect(runEventBody).toContain('RunEvent::Reopen')
    expect(runEventBody).toContain('ActivationPolicy::Regular')
  })

  it('Reopen uses get_or_create_main_window for window recreation', () => {
    const reopenIdx = runEventBody.indexOf('RunEvent::Reopen')
    expect(reopenIdx).toBeGreaterThanOrEqual(0)
    const afterReopen = runEventBody.slice(reopenIdx, reopenIdx + 500)
    expect(afterReopen).toContain('get_or_create_main_window')
  })
})

// ═══════════════════════════════════════════════════════════════════
// Layer 2: tray.rs — window recreation after Wayland force-close
// ═══════════════════════════════════════════════════════════════════

describe('tray.rs — get_or_create_main_window', () => {
  let source: string

  beforeAll(() => {
    source = fs.readFileSync(path.join(TAURI_ROOT, 'src', 'tray.rs'), 'utf-8')
  })

  it('defines get_or_create_main_window as a public function', () => {
    expect(source).toContain('pub fn get_or_create_main_window')
  })

  it('attempts get_webview_window first (fast path)', () => {
    const fnBody = extractBody(source, 'pub fn get_or_create_main_window')
    expect(fnBody).toContain('get_webview_window("main")')
  })

  it('uses WebviewWindowBuilder to recreate the window', () => {
    const fnBody = extractBody(source, 'pub fn get_or_create_main_window')
    expect(fnBody).toContain('WebviewWindowBuilder::new')
  })

  it('recreates with the same label "main"', () => {
    const fnBody = extractBody(source, 'pub fn get_or_create_main_window')
    // Builder is called with "main" as the label
    expect(fnBody).toContain('"main"')
    expect(fnBody).toContain('WebviewUrl::App')
  })

  it('matches tauri.conf.json window dimensions', () => {
    const fnBody = extractBody(source, 'pub fn get_or_create_main_window')
    expect(fnBody).toContain('1068.0')
    expect(fnBody).toContain('680.0')
    expect(fnBody).toContain('970.0')
    expect(fnBody).toContain('560.0')
  })

  it('sets decorations(false) to match tauri.conf.json', () => {
    const fnBody = extractBody(source, 'pub fn get_or_create_main_window')
    expect(fnBody).toContain('.decorations(false)')
  })

  it('sets transparent(true) to match tauri.conf.json', () => {
    const fnBody = extractBody(source, 'pub fn get_or_create_main_window')
    expect(fnBody).toContain('.transparent(true)')
  })

  it('creates the window initially hidden (visible=false)', () => {
    const fnBody = extractBody(source, 'pub fn get_or_create_main_window')
    expect(fnBody).toContain('.visible(false)')
  })

  it('logs an error if window recreation fails', () => {
    const fnBody = extractBody(source, 'pub fn get_or_create_main_window')
    expect(fnBody).toContain('log::error!')
    expect(fnBody).toContain('window-recreate-failed')
  })

  it('tray left-click handler uses get_or_create_main_window', () => {
    const traySetup = extractBody(source, 'pub fn setup_tray')
    expect(traySetup).toContain('get_or_create_main_window')
  })

  it('"show" menu handler uses get_or_create_main_window', () => {
    const showIdx = source.indexOf('"show" =>')
    expect(showIdx).toBeGreaterThanOrEqual(0)
    const afterShow = source.slice(showIdx, showIdx + 500)
    expect(afterShow).toContain('get_or_create_main_window')
  })

  it('does NOT use raw get_webview_window in tray handlers', () => {
    // After get_or_create_main_window definition, the tray setup should
    // only use get_or_create_main_window, not raw get_webview_window
    const setupBody = extractBody(source, 'pub fn setup_tray')
    // Count occurrences of get_webview_window in setup_tray — should be 0
    const rawCalls = (setupBody.match(/get_webview_window/g) || []).length
    expect(rawCalls, 'tray handlers should use get_or_create, not raw get_webview_window').toBe(0)
  })
})

// ═══════════════════════════════════════════════════════════════════
// Layer 3: Diagnostic logging coverage
// ═══════════════════════════════════════════════════════════════════

describe('Diagnostic logging — window lifecycle events', () => {
  let libSource: string
  let traySource: string

  beforeAll(() => {
    libSource = fs.readFileSync(path.join(TAURI_ROOT, 'src', 'lib.rs'), 'utf-8')
    traySource = fs.readFileSync(path.join(TAURI_ROOT, 'src', 'tray.rs'), 'utf-8')
  })

  describe('lib.rs — on_window_event logging', () => {
    let onWinBody: string

    beforeAll(() => {
      onWinBody = extractBody(libSource, '.on_window_event(')
    })

    it('logs CloseRequested at info level', () => {
      expect(onWinBody).toContain('log::info!')
      expect(onWinBody).toContain('window:close-requested')
    })

    it('logs close prevention at info level', () => {
      expect(onWinBody).toContain('window:close-prevented')
    })

    it('logs hide-to-tray action at info level', () => {
      expect(onWinBody).toContain('window:hide-to-tray')
    })

    it('logs show-exit-dialog action at info level', () => {
      expect(onWinBody).toContain('window:show-exit-dialog')
    })

    it('logs preference values at debug level', () => {
      expect(onWinBody).toContain('log::debug!')
      expect(onWinBody).toContain('window:prefs')
      expect(onWinBody).toContain('minimizeToTrayOnClose')
    })

    it('logs Destroyed event at info level', () => {
      expect(onWinBody).toContain('window:destroyed')
    })
  })

  describe('lib.rs — handle_run_event logging', () => {
    let runBody: string

    beforeAll(() => {
      runBody = extractBody(libSource, 'fn handle_run_event')
    })

    it('logs ExitRequested at info level', () => {
      expect(runBody).toContain('app:exit-requested')
    })

    it('logs exit prevention at info level', () => {
      expect(runBody).toContain('app:exit-prevented')
    })

    it('logs Exit cleanup at info level', () => {
      expect(runBody).toContain('app:exit')
    })

    it('logs Reopen at info level', () => {
      expect(runBody).toContain('app:reopen')
    })

    it('logs ExitRequested preference at debug level', () => {
      expect(runBody).toContain('log::debug!')
    })
  })

  describe('tray.rs — tray interaction logging', () => {
    it('logs tray left-click at info level', () => {
      expect(traySource).toContain('tray:left-click')
    })

    it('logs tray show menu action at info level', () => {
      expect(traySource).toContain('tray:menu-show')
    })

    it('logs window recreation at info level', () => {
      expect(traySource).toContain('tray:window-recreated')
    })

    it('logs window-not-found at warn level', () => {
      expect(traySource).toContain('log::warn!')
      expect(traySource).toContain('tray:window-not-found')
    })
  })
})

// ═══════════════════════════════════════════════════════════════════
// Default log level
// ═══════════════════════════════════════════════════════════════════

describe('Default log level — Debug', () => {
  let libSource: string

  beforeAll(() => {
    libSource = fs.readFileSync(path.join(TAURI_ROOT, 'src', 'lib.rs'), 'utf-8')
  })

  it('defaults to Debug when no user preference is set', () => {
    expect(libSource).toContain('unwrap_or(log::LevelFilter::Debug)')
  })

  it('doc comment explains the Debug default rationale', () => {
    const fnStart = libSource.indexOf('fn read_log_level')
    const docBlock = libSource.slice(Math.max(0, fnStart - 300), fnStart)
    expect(docBlock).toContain('Debug')
    expect(docBlock).toContain('bug report')
  })
})

// ═══════════════════════════════════════════════════════════════════
// Bug report template
// ═══════════════════════════════════════════════════════════════════

describe('bug_report.yml — log level requirement', () => {
  let template: string

  beforeAll(() => {
    template = fs.readFileSync(path.join(SRC_ROOT, '.github', 'ISSUE_TEMPLATE', 'bug_report.yml'), 'utf-8')
  })

  it('instructs users to keep the default debug log level', () => {
    expect(template).toContain('default `debug`')
  })

  it('does NOT reference info as the default anymore', () => {
    expect(template).not.toContain('default `info`')
  })
})
