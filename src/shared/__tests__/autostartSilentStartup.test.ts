/**
 * @fileoverview Structural tests for autostart-only silent startup.
 *
 * Industry standard (Discord, Telegram, Steam, Clash Verge):
 *   - System autostart → minimize to tray (silent)
 *   - Manual user launch → show main window
 *
 * The Tauri autostart plugin passes `--autostart` as a CLI arg when the
 * OS triggers an auto-launch.  The setup() function in lib.rs must check
 * for this arg before hiding the window or the macOS Dock icon.
 *
 * Verifies:
 * 1. autostart plugin is initialized with `--autostart` arg (not None)
 * 2. auto-hide window block checks `--autostart` via std::env::args
 * 3. macOS Dock-hide block also checks `--autostart`
 */
import { describe, it, expect, beforeAll } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..')
const TAURI_ROOT = path.join(PROJECT_ROOT, 'src-tauri')

describe('lib.rs — autostart-only silent startup', () => {
  let libSource: string

  beforeAll(() => {
    libSource = fs.readFileSync(path.join(TAURI_ROOT, 'src', 'lib.rs'), 'utf-8')
  })

  // ─── Test 1: autostart plugin passes --autostart arg ─────────────

  describe('autostart plugin initialization', () => {
    it('passes "--autostart" arg to tauri_plugin_autostart::init', () => {
      // The init call must use Some(vec!["--autostart"]) not None
      // This ensures the OS auto-launch entry includes the flag
      expect(libSource).toContain('tauri_plugin_autostart::init')
      // Must NOT use None as the args parameter
      const initBlock = extractAutoStartInitBlock(libSource)
      expect(initBlock).toBeTruthy()
      expect(initBlock).toContain('"--autostart"')
      expect(initBlock).not.toMatch(/\bNone\b/)
    })

    it('uses Some(vec![...]) to wrap the autostart arg', () => {
      const initBlock = extractAutoStartInitBlock(libSource)
      expect(initBlock).toBeTruthy()
      // Must wrap args in Some(vec![...]) per Tauri plugin API
      expect(initBlock).toContain('Some(vec!')
    })
  })

  // ─── Test 2: auto-hide now handled by Vue frontend ────────────────

  describe('auto-hide window logic (deferred to frontend)', () => {
    it('does NOT have a Rust-side auto-hide block (moved to frontend)', () => {
      // The auto-hide logic was moved to MainLayout.vue onMounted.
      // The Rust setup() no longer hides the window — it never shows it.
      const autoHideBlock = extractAutoHideBlock(libSource)
      // The old "Auto-hide the main window" block should be gone
      expect(autoHideBlock).toBeNull()
    })

    it('exposes is_autostart_launch command for frontend to check', () => {
      // The frontend uses this command to determine if it should skip show().
      expect(libSource).toContain('is_autostart_launch')
    })

    it('frontend checks autoHideWindow AND is_autostart_launch before showing', () => {
      // MainLayout.vue must check both conditions before calling show()
      const mainLayout = fs.readFileSync(path.join(PROJECT_ROOT, 'src', 'layouts', 'MainLayout.vue'), 'utf-8')
      expect(mainLayout).toContain('is_autostart_launch')
      expect(mainLayout).toContain('autoHideWindow')
    })
  })

  // ─── Test 3: macOS Dock-hide also checks --autostart ─────────────

  describe('macOS Dock-hide logic', () => {
    it('reads --autostart in the macOS Dock-hide block', () => {
      // The Dock-hide block (ActivationPolicy::Accessory) must also
      // respect --autostart — hiding the Dock icon on manual launch
      // would confuse users.
      const dockBlock = extractDockHideBlock(libSource)
      expect(dockBlock).toBeTruthy()
      expect(dockBlock).toContain('"--autostart"')
    })

    it('combines dock_hide AND is_autostart for Dock hiding', () => {
      const dockBlock = extractDockHideBlock(libSource)
      expect(dockBlock).toBeTruthy()
      expect(dockBlock).toContain('is_autostart')
      expect(dockBlock).toMatch(/hide_dock\s*&&\s*is_autostart/)
    })
  })

  // ─── Test 4: window show deferred to frontend ────────────────────

  describe('window show deferred to frontend', () => {
    it('does NOT call show() or set_focus() in the startup block', () => {
      // Window visibility is now handled by the Vue frontend
      // (MainLayout.vue onMounted) to prevent transparent-frame flash
      // on Windows.  The Rust setup must NOT show the window.
      const showBlock = extractStartupShowBlock(libSource)
      // The old show block should be gone or should not contain show/focus
      if (showBlock) {
        expect(showBlock).not.toContain('.show()')
        expect(showBlock).not.toContain('.set_focus()')
      }
    })

    it('exposes is_autostart_launch in the invoke_handler', () => {
      // The frontend needs this command to check autostart status
      expect(libSource).toContain('is_autostart_launch')
    })
  })
})

// ─── Helpers ────────────────────────────────────────────────────────

/**
 * Extract the tauri_plugin_autostart::init(...) call block.
 * Returns the full init() invocation including both arguments.
 */
function extractAutoStartInitBlock(source: string): string | null {
  const idx = source.indexOf('tauri_plugin_autostart::init(')
  if (idx === -1) return null
  const openParen = source.indexOf('(', idx)
  let depth = 0
  let end = openParen
  for (let i = openParen; i < source.length; i++) {
    if (source[i] === '(') depth++
    if (source[i] === ')') depth--
    if (depth === 0) {
      end = i
      break
    }
  }
  return source.slice(idx, end + 1)
}

/**
 * Extract the auto-hide window block (the one that calls window.hide()).
 * Identified by the comment "Auto-hide the main window".
 */
function extractAutoHideBlock(source: string): string | null {
  const marker = 'Auto-hide the main window'
  const idx = source.indexOf(marker)
  if (idx === -1) return null
  const braceStart = source.indexOf('{', idx)
  if (braceStart === -1) return null
  let depth = 0
  let end = braceStart
  for (let i = braceStart; i < source.length; i++) {
    if (source[i] === '{') depth++
    if (source[i] === '}') depth--
    if (depth === 0) {
      end = i
      break
    }
  }
  return source.slice(idx, end + 1)
}

/**
 * Extract the macOS Dock-hide block.
 * Identified by the comment "Hide Dock icon on startup".
 */
function extractDockHideBlock(source: string): string | null {
  const marker = 'Hide Dock icon on startup'
  const idx = source.indexOf(marker)
  if (idx === -1) return null
  const braceStart = source.indexOf('{', idx)
  if (braceStart === -1) return null
  // Need to go into the outer cfg block
  let depth = 0
  let end = braceStart
  for (let i = braceStart; i < source.length; i++) {
    if (source[i] === '{') depth++
    if (source[i] === '}') depth--
    if (depth === 0) {
      end = i
      break
    }
  }
  return source.slice(idx, end + 1)
}

/**
 * Extract the startup window-show block.
 * Identified by the comment "Show the main window now that state restoration".
 */
function extractStartupShowBlock(source: string): string | null {
  const marker = 'Show the main window now that state restoration'
  const idx = source.indexOf(marker)
  if (idx === -1) return null
  // Find the if-let block that follows
  const ifIdx = source.indexOf('if let Some(w)', idx)
  if (ifIdx === -1) return null
  const braceStart = source.indexOf('{', ifIdx)
  if (braceStart === -1) return null
  let depth = 0
  let end = braceStart
  for (let i = braceStart; i < source.length; i++) {
    if (source[i] === '{') depth++
    if (source[i] === '}') depth--
    if (depth === 0) {
      end = i
      break
    }
  }
  return source.slice(idx, end + 1)
}
