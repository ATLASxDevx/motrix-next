/**
 * @fileoverview TDD structural tests for logging blind spots fix.
 *
 * Verifies that ALL critical operations have proper log statements for ops
 * monitoring. Tests read Rust and TypeScript source files to verify presence
 * of log::info!/warn!/debug! and logger.error/warn calls.
 *
 * Blind spots identified by full codebase audit:
 *   P0.1 — updater.rs: 4 commands, 0 log statements
 *   P0.2 — config/engine/fs: critical state-changing commands are silent
 *   P0.3 — UpdateDialog.vue: 3 catch blocks don't call logger
 *   P1.1 — commands/upnp.rs: 2 commands, 0 log statements
 *   P1.2 — upnp.rs module: missing lifecycle logging
 *   P1.3 — tracker/fs: path operations and probe_trackers silent
 */
import { describe, it, expect, beforeAll } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

const SRC_ROOT = path.resolve(__dirname, '../../..')
const TAURI_SRC = path.join(SRC_ROOT, 'src-tauri', 'src')

// ── Helpers ──────────────────────────────────────────────────────────

/** Reads a Rust source file and returns the block from a function start to the next `pub fn`, `#[cfg(test)]`, or EOF. */
function readRustFnBlock(filePath: string, fnName: string): string {
  const source = fs.readFileSync(filePath, 'utf-8')
  const fnStart = source.indexOf(`fn ${fnName}`)
  if (fnStart === -1) throw new Error(`Function '${fnName}' not found in ${filePath}`)
  // Find next function boundary or test module to scope the search
  const rest = source.slice(fnStart)
  const nextFn = rest.slice(1).search(/\npub (async )?fn /)
  const testMod = rest.indexOf('\n#[cfg(test)]')
  // Pick the closest boundary
  const boundaries = [nextFn === -1 ? Infinity : nextFn + 1, testMod === -1 ? Infinity : testMod]
  const end = Math.min(...boundaries)
  return end === Infinity ? rest : rest.slice(0, end)
}

/** Counts occurrences of a pattern in a string. */
function countOccurrences(source: string, pattern: string): number {
  let count = 0
  let pos = 0
  while ((pos = source.indexOf(pattern, pos)) !== -1) {
    count++
    pos += pattern.length
  }
  return count
}

// =====================================================================
// P0.1 — updater.rs: Lifecycle logging for all 4 commands
// =====================================================================

describe('P0.1: updater.rs lifecycle logging', () => {
  const updaterPath = path.join(TAURI_SRC, 'commands', 'updater.rs')

  describe('check_for_update', () => {
    let fnBody: string
    beforeAll(() => {
      fnBody = readRustFnBlock(updaterPath, 'check_for_update')
    })

    it('logs entry with channel and proxy parameters', () => {
      expect(fnBody).toContain('log::info!')
      expect(fnBody).toContain('channel')
    })

    it('logs the check result (found version or up-to-date)', () => {
      // Must have at least 2 log statements: entry + result
      const logCount = countOccurrences(fnBody, 'log::info!')
      expect(logCount).toBeGreaterThanOrEqual(2)
    })
  })

  describe('download_update', () => {
    let fnBody: string
    beforeAll(() => {
      fnBody = readRustFnBlock(updaterPath, 'download_update')
    })

    it('logs download initiation', () => {
      expect(fnBody).toContain('log::info!')
    })

    it('logs download completion with byte count', () => {
      // Must reference bytes/len in a log statement
      expect(fnBody).toMatch(/log::(info|debug)!.*bytes|log::(info|debug)!.*len/)
    })

    it('logs cancellation as a warning', () => {
      expect(fnBody).toContain('log::warn!')
    })
  })

  describe('apply_update', () => {
    let fnBody: string
    beforeAll(() => {
      fnBody = readRustFnBlock(updaterPath, 'apply_update')
    })

    it('logs apply entry with channel', () => {
      expect(fnBody).toContain('log::info!')
    })

    it('logs phase transitions (engine stop + install)', () => {
      // Must have at least 2 info logs for the 2 phases
      const logCount = countOccurrences(fnBody, 'log::info!')
      expect(logCount).toBeGreaterThanOrEqual(2)
    })
  })

  describe('cancel_update', () => {
    let fnBody: string
    beforeAll(() => {
      fnBody = readRustFnBlock(updaterPath, 'cancel_update')
    })

    it('logs the cancellation event', () => {
      expect(fnBody).toContain('log::info!')
    })
  })
})

// =====================================================================
// P0.2 — config/engine/fs: Critical state-changing commands must log
// =====================================================================

describe('P0.2: config/engine/fs critical command logging', () => {
  const configPath = path.join(TAURI_SRC, 'commands', 'config.rs')
  const enginePath = path.join(TAURI_SRC, 'commands', 'engine.rs')

  describe('factory_reset — destructive, must leave audit trail', () => {
    let fnBody: string
    beforeAll(() => {
      fnBody = readRustFnBlock(configPath, 'factory_reset')
    })

    it('logs a warning for this destructive operation', () => {
      expect(fnBody).toContain('log::warn!')
    })
  })

  describe('save_preference — config change tracking', () => {
    let fnBody: string
    beforeAll(() => {
      fnBody = readRustFnBlock(configPath, 'save_preference')
    })

    it('logs the save operation at debug level', () => {
      expect(fnBody).toContain('log::debug!')
    })
  })

  describe('save_system_config — system config change tracking', () => {
    let fnBody: string
    beforeAll(() => {
      fnBody = readRustFnBlock(configPath, 'save_system_config')
    })

    it('logs the system config save at debug level', () => {
      expect(fnBody).toContain('log::debug!')
    })
  })

  describe('start_engine_command — engine lifecycle from frontend', () => {
    let fnBody: string
    beforeAll(() => {
      fnBody = readRustFnBlock(enginePath, 'start_engine_command')
    })

    it('logs the engine start command entry', () => {
      expect(fnBody).toContain('log::info!')
    })
  })

  describe('stop_engine_command — engine lifecycle from frontend', () => {
    let fnBody: string
    beforeAll(() => {
      fnBody = readRustFnBlock(enginePath, 'stop_engine_command')
    })

    it('logs the engine stop command entry', () => {
      expect(fnBody).toContain('log::info!')
    })
  })

  describe('restart_engine_command — engine lifecycle from frontend', () => {
    let fnBody: string
    beforeAll(() => {
      fnBody = readRustFnBlock(enginePath, 'restart_engine_command')
    })

    it('logs the engine restart command entry', () => {
      expect(fnBody).toContain('log::info!')
    })
  })

  describe('clear_session_file — session data deletion', () => {
    let fnBody: string
    beforeAll(() => {
      fnBody = readRustFnBlock(configPath, 'clear_session_file')
    })

    it('logs the session file clear operation', () => {
      // Either in the command itself or in the _inner helper it calls
      const innerBody = readRustFnBlock(configPath, 'clear_session_file_inner')
      const combined = fnBody + innerBody
      expect(combined).toMatch(/log::(info|debug)!/)
    })
  })
})

// =====================================================================
// P0.3 — UpdateDialog.vue: catch blocks must call logger
// =====================================================================

describe('P0.3: UpdateDialog.vue error logging', () => {
  let source: string

  beforeAll(() => {
    source = fs.readFileSync(path.join(SRC_ROOT, 'src', 'components', 'preference', 'UpdateDialog.vue'), 'utf-8')
  })

  it('imports the logger utility', () => {
    expect(source).toContain("from '@shared/logger'")
  })

  it('open() catch block logs the error', () => {
    // Extract the open() function body
    const openFn = source.slice(source.indexOf('async function open('), source.indexOf('async function startDownload'))
    expect(openFn).toContain('logger.error')
  })

  it('startDownload() catch block logs the error', () => {
    const downloadFn = source.slice(
      source.indexOf('async function startDownload'),
      source.indexOf('function cancelDownload'),
    )
    expect(downloadFn).toContain('logger.error')
  })

  it('handleInstallAndRelaunch() catch block logs the error', () => {
    const installFn = source.slice(
      source.indexOf('async function handleInstallAndRelaunch'),
      source.indexOf('function close()'),
    )
    expect(installFn).toContain('logger.error')
  })
})

// =====================================================================
// P1.1 — commands/upnp.rs: command-level logging
// =====================================================================

describe('P1.1: commands/upnp.rs command logging', () => {
  const upnpCmdPath = path.join(TAURI_SRC, 'commands', 'upnp.rs')

  describe('start_upnp_mapping', () => {
    let fnBody: string
    beforeAll(() => {
      fnBody = readRustFnBlock(upnpCmdPath, 'start_upnp_mapping')
    })

    it('logs the start command with port parameters', () => {
      expect(fnBody).toContain('log::info!')
    })
  })

  describe('stop_upnp_mapping', () => {
    let fnBody: string
    beforeAll(() => {
      fnBody = readRustFnBlock(upnpCmdPath, 'stop_upnp_mapping')
    })

    it('logs the stop command', () => {
      expect(fnBody).toContain('log::info!')
    })
  })
})

// =====================================================================
// P1.2 — upnp.rs module: lifecycle logging
// =====================================================================

describe('P1.2: upnp.rs module lifecycle logging', () => {
  const upnpModPath = path.join(TAURI_SRC, 'upnp.rs')

  describe('start_mapping', () => {
    let fnBody: string
    beforeAll(() => {
      fnBody = readRustFnBlock(upnpModPath, 'start_mapping')
    })

    it('logs successful port mapping', () => {
      expect(fnBody).toContain('log::info!')
    })
  })

  describe('stop_mapping', () => {
    let fnBody: string
    beforeAll(() => {
      fnBody = readRustFnBlock(upnpModPath, 'stop_mapping')
    })

    it('logs the unmapping operation', () => {
      expect(fnBody).toMatch(/log::(info|debug)!/)
    })
  })
})

// =====================================================================
// P1.3 — tracker/fs: path operations and probe_trackers
// =====================================================================

describe('P1.3: tracker/fs path operation logging', () => {
  const trackerPath = path.join(TAURI_SRC, 'commands', 'tracker.rs')
  const fsPath = path.join(TAURI_SRC, 'commands', 'fs.rs')

  describe('probe_trackers — network operation', () => {
    let fnBody: string
    beforeAll(() => {
      fnBody = readRustFnBlock(trackerPath, 'probe_trackers')
    })

    it('logs tracker probe operation with count', () => {
      expect(fnBody).toContain('log::debug!')
    })
  })

  describe('open_path_normalized — file system operation', () => {
    let fnBody: string
    beforeAll(() => {
      fnBody = readRustFnBlock(fsPath, 'open_path_normalized')
    })

    it('logs the path being opened', () => {
      expect(fnBody).toContain('log::debug!')
    })
  })

  describe('trash_file — destructive file operation', () => {
    let fnBody: string
    beforeAll(() => {
      fnBody = readRustFnBlock(fsPath, 'trash_file')
    })

    it('logs the file being trashed', () => {
      expect(fnBody).toContain('log::info!')
    })
  })
})

// =====================================================================
// Round 2 — Self-audit delta fixes
// =====================================================================

describe('Delta: check_for_update up-to-date result logging', () => {
  const updaterPath = path.join(TAURI_SRC, 'commands', 'updater.rs')

  it('logs result=up-to-date when no update is available', () => {
    const fnBody = readRustFnBlock(updaterPath, 'check_for_update')
    expect(fnBody).toContain('up-to-date')
  })
})

describe('Delta: upnp.rs per-port map failure logging', () => {
  const upnpModPath = path.join(TAURI_SRC, 'upnp.rs')

  it('logs a warning when a port mapping fails', () => {
    const fnBody = readRustFnBlock(upnpModPath, 'start_mapping')
    expect(fnBody).toContain('log::warn!')
  })
})

describe('Delta: useTrackerProbe.ts catch block logging', () => {
  it('imports logger and logs IPC failures', () => {
    const source = fs.readFileSync(path.join(SRC_ROOT, 'src', 'composables', 'useTrackerProbe.ts'), 'utf-8')
    expect(source).toContain("from '@shared/logger'")
    // The probeAll catch block must call logger
    const probeAll = source.slice(source.indexOf('async function probeAll'))
    expect(probeAll).toMatch(/logger\.(debug|warn|error)/)
  })
})

describe('Delta: useTaskActions.ts pause/resume/restart catch logging', () => {
  let source: string
  beforeAll(() => {
    source = fs.readFileSync(path.join(SRC_ROOT, 'src', 'composables', 'useTaskActions.ts'), 'utf-8')
  })

  it('handlePauseTask catch calls logger', () => {
    const fn = source.slice(source.indexOf('function handlePauseTask'), source.indexOf('function handleResumeTask'))
    expect(fn).toMatch(/logger\.(warn|error)/)
  })

  it('handleResumeTask restart catch calls logger', () => {
    const fn = source.slice(source.indexOf('function handleResumeTask'), source.indexOf('function handleDeleteTask'))
    // Both restartTask and resumeTask catches should have logger
    const logCount = countOccurrences(fn, 'logger.')
    expect(logCount).toBeGreaterThanOrEqual(2)
  })
})

describe('Delta: TaskActions.vue batch operation catch logging', () => {
  let source: string
  beforeAll(() => {
    source = fs.readFileSync(path.join(SRC_ROOT, 'src', 'components', 'task', 'TaskActions.vue'), 'utf-8')
  })

  it('resumeAll catch calls logger', () => {
    const fn = source.slice(source.indexOf('function resumeAll'), source.indexOf('function pauseAll'))
    expect(fn).toMatch(/logger\.(warn|error)/)
  })

  it('pauseAll catch calls logger', () => {
    const fn = source.slice(source.indexOf('function pauseAll'), source.indexOf('function stopAllSeeding'))
    expect(fn).toMatch(/logger\.(warn|error)/)
  })

  it('stopAllSeeding catch calls logger', () => {
    const fn = source.slice(
      source.indexOf('function stopAllSeeding'),
      source.indexOf('function cleanupStopSeedingWatcher'),
    )
    expect(fn).toMatch(/logger\.(warn|error)/)
  })

  it('purgeRecord catch calls logger', () => {
    const fn = source.slice(source.indexOf('function purgeRecord'))
    expect(fn).toMatch(/logger\.(warn|error)/)
  })
})
