/**
 * @fileoverview Structural test: NSIS hooks.nsh must contain a PREINSTALL
 * hook that kills aria2c.exe before the installer copies files.
 *
 * Problem: On Windows, the NSIS updater overwrites files in-place. If
 * aria2c.exe is still running, Windows' mandatory file locking prevents
 * the installer from replacing it → update failure (the Rust backend
 * should have already stopped the engine, but this NSIS hook is a
 * defense-in-depth safety net).
 *
 * Verification strategy: Read the hooks.nsh file and assert it contains
 * the PREINSTALL macro with a taskkill command targeting aria2c.exe.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

const HOOKS_NSH = path.resolve(__dirname, '..', '..', '..', '..', 'src-tauri', 'nsis', 'hooks.nsh')

describe('NSIS PREINSTALL hook for aria2c cleanup', () => {
  let hooksSrc: string

  beforeAll(() => {
    hooksSrc = fs.readFileSync(HOOKS_NSH, 'utf-8')
  })

  it('hooks.nsh file exists', () => {
    expect(fs.existsSync(HOOKS_NSH)).toBe(true)
  })

  it('contains NSIS_HOOK_PREINSTALL macro', () => {
    expect(hooksSrc).toContain('NSIS_HOOK_PREINSTALL')
  })

  it('PREINSTALL hook kills the Tauri-renamed sidecar via taskkill', () => {
    // Extract the PREINSTALL macro body
    const preinstallStart = hooksSrc.indexOf('NSIS_HOOK_PREINSTALL')
    expect(preinstallStart).toBeGreaterThanOrEqual(0)

    // Find the matching !macroend after PREINSTALL
    const macroEnd = hooksSrc.indexOf('!macroend', preinstallStart)
    expect(macroEnd).toBeGreaterThan(preinstallStart)

    const macroBody = hooksSrc.slice(preinstallStart, macroEnd)
    expect(macroBody).toContain('taskkill')
    // Tauri renames externalBin to motrixnext-aria2c.exe at bundle time.
    // The hook must target the actual process name, not the original "aria2c".
    expect(macroBody).toContain('motrixnext-aria2c')
  })

  it('still contains POSTINSTALL hook for icon cache flush', () => {
    expect(hooksSrc).toContain('NSIS_HOOK_POSTINSTALL')
    expect(hooksSrc).toContain('ie4uinit.exe')
  })
})
