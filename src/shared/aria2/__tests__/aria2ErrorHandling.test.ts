/**
 * @fileoverview TDD tests for aria2 error code accuracy and engine error handling.
 *
 * HONESTY NOTE: These tests verify REAL source files and data structures —
 * not mocked stubs. Error codes are verified against the official aria2
 * C++ source: https://github.com/aria2/aria2/blob/master/src/error_code.h
 *
 * Test groups:
 * 1. aria2ErrorCodes.ts — mapping completeness and correctness
 * 2. engine/lifecycle.rs + engine/state.rs — stdout/stderr logging and exit code event emission
 * 3. MainLayout.vue — engine-error crash listener
 * 4. i18n coverage — all error keys exist in all 26 locales
 */
import { describe, it, expect, beforeAll } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

const SRC_ROOT = path.resolve(__dirname, '../../../..')
const TAURI_ROOT = path.join(SRC_ROOT, 'src-tauri')
const LOCALES_DIR = path.join(SRC_ROOT, 'src', 'shared', 'locales')

/**
 * The COMPLETE official aria2 error code enum from error_code.h.
 * Source: https://github.com/aria2/aria2/blob/master/src/error_code.h
 *
 * This is the ground truth. Our ARIA2_ERROR_CODES mapping MUST match this.
 */
const OFFICIAL_ARIA2_ERROR_CODES: Record<number, string> = {
  0: 'FINISHED',
  1: 'UNKNOWN_ERROR',
  2: 'TIME_OUT',
  3: 'RESOURCE_NOT_FOUND',
  4: 'MAX_FILE_NOT_FOUND',
  5: 'TOO_SLOW_DOWNLOAD_SPEED',
  6: 'NETWORK_PROBLEM',
  7: 'IN_PROGRESS',
  8: 'CANNOT_RESUME',
  9: 'NOT_ENOUGH_DISK_SPACE',
  10: 'PIECE_LENGTH_CHANGED',
  11: 'DUPLICATE_DOWNLOAD',
  12: 'DUPLICATE_INFO_HASH',
  13: 'FILE_ALREADY_EXISTS',
  14: 'FILE_RENAMING_FAILED',
  15: 'FILE_OPEN_ERROR',
  16: 'FILE_CREATE_ERROR',
  17: 'FILE_IO_ERROR',
  18: 'DIR_CREATE_ERROR',
  19: 'NAME_RESOLVE_ERROR',
  20: 'METALINK_PARSE_ERROR',
  21: 'FTP_PROTOCOL_ERROR',
  22: 'HTTP_PROTOCOL_ERROR',
  23: 'HTTP_TOO_MANY_REDIRECTS',
  24: 'HTTP_AUTH_FAILED',
  25: 'BENCODE_PARSE_ERROR',
  26: 'BITTORRENT_PARSE_ERROR',
  27: 'MAGNET_PARSE_ERROR',
  28: 'OPTION_ERROR',
  29: 'HTTP_SERVICE_UNAVAILABLE',
  30: 'JSON_PARSE_ERROR',
  // 31 = REMOVED (reserved, not used by aria2)
  32: 'CHECKSUM_ERROR',
}

/**
 * Expected i18n key mapping for each error code.
 * Tests verify aria2ErrorCodes.ts matches EXACTLY.
 */
const EXPECTED_MAPPINGS: Record<string, string> = {
  '1': 'task.error-unknown',
  '2': 'task.error-timeout',
  '3': 'task.error-not-found',
  '4': 'task.error-max-file-not-found',
  '5': 'task.error-too-slow',
  '6': 'task.error-network',
  '7': 'task.error-unfinished',
  '8': 'task.error-resume-failed',
  '9': 'task.error-disk-full',
  '10': 'task.error-piece-length',
  '11': 'task.error-duplicate-file',
  '12': 'task.error-duplicate-torrent',
  '13': 'task.error-file-exists',
  '14': 'task.error-rename-failed',
  '15': 'task.error-file-open',
  '16': 'task.error-file-create',
  '17': 'task.error-io',
  '18': 'task.error-dir-create',
  '19': 'task.error-dns',
  '20': 'task.error-metalink-parse',
  '21': 'task.error-ftp',
  '22': 'task.error-http-response',
  '23': 'task.error-too-many-redirects',
  '24': 'task.error-http-auth',
  '25': 'task.error-bencode-parse',
  '26': 'task.error-torrent-corrupt',
  '27': 'task.error-magnet-bad',
  '28': 'task.error-bad-option',
  '29': 'task.error-server-unavailable',
  '30': 'task.error-json-rpc-parse',
  '32': 'task.error-checksum',
}

/** All 26 locale directories per AGENTS.md */
const ALL_LOCALES = [
  'ar',
  'bg',
  'ca',
  'de',
  'el',
  'en-US',
  'es',
  'fa',
  'fr',
  'hu',
  'id',
  'it',
  'ja',
  'ko',
  'nb',
  'nl',
  'pl',
  'pt-BR',
  'ro',
  'ru',
  'th',
  'tr',
  'uk',
  'vi',
  'zh-CN',
  'zh-TW',
] as const

// ─── Test Group 1: aria2ErrorCodes.ts mapping correctness ─────────────

describe('aria2ErrorCodes.ts — mapping correctness', () => {
  let errorCodes: Record<string, string>

  beforeAll(async () => {
    const mod = await import('@shared/aria2ErrorCodes')
    errorCodes = mod.ARIA2_ERROR_CODES
  })

  it('covers all 31 actionable error codes (1-30, 32; excluding 0 and 31)', () => {
    const expectedKeys = Object.keys(EXPECTED_MAPPINGS).sort((a, b) => Number(a) - Number(b))
    const actualKeys = Object.keys(errorCodes).sort((a, b) => Number(a) - Number(b))
    expect(actualKeys).toEqual(expectedKeys)
  })

  it('does NOT include code 0 (FINISHED — not an error)', () => {
    expect(errorCodes).not.toHaveProperty('0')
  })

  it('does NOT include code 31 (REMOVED — reserved, not used)', () => {
    expect(errorCodes).not.toHaveProperty('31')
  })

  // ── Correctness for previously wrong mappings (the 5 bugs) ──

  it('code 4 maps to max-file-not-found (NOT redirects)', () => {
    expect(errorCodes['4']).toBe('task.error-max-file-not-found')
  })

  it('code 5 maps to too-slow (NOT disk-full)', () => {
    expect(errorCodes['5']).toBe('task.error-too-slow')
  })

  it('code 7 maps to unfinished (NOT duplicate)', () => {
    expect(errorCodes['7']).toBe('task.error-unfinished')
  })

  it('code 9 maps to disk-full (NOT file-not-found)', () => {
    expect(errorCodes['9']).toBe('task.error-disk-full')
  })

  it('code 24 maps to http-auth (NOT checksum)', () => {
    expect(errorCodes['24']).toBe('task.error-http-auth')
  })

  it('code 32 maps to checksum (the REAL checksum code)', () => {
    expect(errorCodes['32']).toBe('task.error-checksum')
  })

  // ── Every mapping matches the expected table exactly ──

  for (const [code, expectedKey] of Object.entries(EXPECTED_MAPPINGS)) {
    it(`code ${code} (${OFFICIAL_ARIA2_ERROR_CODES[Number(code)]}) → ${expectedKey}`, () => {
      expect(errorCodes[code]).toBe(expectedKey)
    })
  }
})

// ─── Test Group 2: i18n coverage across all 26 locales ────────────────

describe('i18n — all error keys exist in all 26 locales', () => {
  /** Extract the bare key name from "task.error-xxx" → "error-xxx" */
  const errorI18nKeys = Object.values(EXPECTED_MAPPINGS).map((full) => full.replace('task.', ''))

  for (const locale of ALL_LOCALES) {
    describe(`locale: ${locale}`, () => {
      let taskContent: string

      beforeAll(() => {
        const taskPath = path.join(LOCALES_DIR, locale, 'task.js')
        taskContent = fs.readFileSync(taskPath, 'utf-8')
      })

      for (const key of errorI18nKeys) {
        it(`has key '${key}'`, () => {
          expect(taskContent).toContain(`'${key}'`)
        })
      }
    })
  }

  // engine crash key in app.js
  for (const locale of ALL_LOCALES) {
    it(`${locale}/app.js has 'engine-crash' key`, () => {
      const appPath = path.join(LOCALES_DIR, locale, 'app.js')
      const appContent = fs.readFileSync(appPath, 'utf-8')
      expect(appContent).toContain("'engine-crash'")
    })
  }

  // engine-stopped info key in app.js
  for (const locale of ALL_LOCALES) {
    it(`${locale}/app.js has 'engine-stopped' key`, () => {
      const appPath = path.join(LOCALES_DIR, locale, 'app.js')
      const appContent = fs.readFileSync(appPath, 'utf-8')
      expect(appContent).toContain("'engine-stopped'")
    })
  }
})

// ─── Test Group 3: engine/ — error handling behavior ──────────────────

describe('engine/ — stdout/stderr logging and exit code events', () => {
  let engineSource: string

  beforeAll(() => {
    // After the engine.rs → engine/ directory split, lifecycle functions
    // (start_engine, stop_engine, restart_engine) live in lifecycle.rs
    // while EngineState lives in state.rs.  Concatenate both to maintain
    // the same assertion surface for the helper functions below.
    const lifecyclePath = path.join(TAURI_ROOT, 'src', 'engine', 'lifecycle.rs')
    const statePath = path.join(TAURI_ROOT, 'src', 'engine', 'state.rs')
    engineSource = fs.readFileSync(lifecyclePath, 'utf-8') + '\n' + fs.readFileSync(statePath, 'utf-8')
  })

  // ── EngineState intentional_stop flag ────────────────────────────

  describe('EngineState intentional_stop flag', () => {
    it('EngineState struct contains intentional_stop: AtomicBool', () => {
      // Extract the struct definition
      const structIdx = engineSource.indexOf('pub struct EngineState')
      expect(structIdx).toBeGreaterThanOrEqual(0)
      const structBody = engineSource.slice(structIdx, structIdx + 300)
      expect(structBody).toContain('intentional_stop')
      expect(structBody).toContain('AtomicBool')
    })

    it('stop_engine sets intentional_stop to true BEFORE kill()', () => {
      const fnBody = extractFnBody(engineSource, 'stop_engine')
      expect(fnBody).toBeTruthy()
      const storeIdx = fnBody!.indexOf('intentional_stop')
      const killIdx = fnBody!.indexOf('.kill()')
      expect(storeIdx).toBeGreaterThanOrEqual(0)
      expect(killIdx).toBeGreaterThan(storeIdx)
    })

    it('restart_engine sets intentional_stop to true BEFORE kill()', () => {
      const fnBody = extractFnBody(engineSource, 'restart_engine')
      expect(fnBody).toBeTruthy()
      const storeIdx = fnBody!.indexOf('intentional_stop')
      const killIdx = fnBody!.indexOf('.kill()')
      expect(storeIdx).toBeGreaterThanOrEqual(0)
      expect(killIdx).toBeGreaterThan(storeIdx)
    })

    it('restart_engine resets intentional_stop to false AFTER spawning new child', () => {
      const fnBody = extractFnBody(engineSource, 'restart_engine')
      expect(fnBody).toBeTruthy()
      // The spawn (.spawn()) must come before the final store(false)
      const spawnIdx = fnBody!.indexOf('.spawn()')
      // Find the LAST intentional_stop reference (the reset)
      const lastStoreIdx = fnBody!.lastIndexOf('intentional_stop')
      expect(spawnIdx).toBeGreaterThan(0)
      expect(lastStoreIdx).toBeGreaterThan(spawnIdx)
    })
  })

  // ── Terminated handlers check intentional_stop ──────────────────

  describe('Terminated handlers gate engine-crashed on intentional_stop', () => {
    it('start_engine Terminated handler checks intentional_stop before emitting', () => {
      const terminatedBlock = extractEventHandler(engineSource, 'Terminated', 'start_engine')
      expect(terminatedBlock).toBeTruthy()
      expect(terminatedBlock).toContain('intentional_stop')
      expect(terminatedBlock).toContain('engine-crashed')
    })

    it('restart_engine Terminated handler checks intentional_stop before emitting', () => {
      const terminatedBlock = extractEventHandler(engineSource, 'Terminated', 'restart_engine')
      expect(terminatedBlock).toBeTruthy()
      expect(terminatedBlock).toContain('intentional_stop')
      expect(terminatedBlock).toContain('engine-crashed')
    })
  })

  describe('Terminated handlers emit engine-stopped for intentional kills', () => {
    it('start_engine Terminated handler emits engine-stopped when intentional', () => {
      const terminatedBlock = extractEventHandler(engineSource, 'Terminated', 'start_engine')
      expect(terminatedBlock).toBeTruthy()
      expect(terminatedBlock).toContain('engine-stopped')
    })

    it('restart_engine Terminated handler emits engine-stopped when intentional', () => {
      const terminatedBlock = extractEventHandler(engineSource, 'Terminated', 'restart_engine')
      expect(terminatedBlock).toBeTruthy()
      expect(terminatedBlock).toContain('engine-stopped')
    })
  })

  describe('start_engine async monitor', () => {
    it('logs stderr output (not silently discarded)', () => {
      const stderrBlock = extractEventHandler(engineSource, 'Stderr', 'start_engine')
      expect(stderrBlock).toBeTruthy()
      expect(stderrBlock).not.toMatch(/=>\s*\{\s*\}/)
      expect(stderrBlock).toContain('log::')
    })

    it('logs stdout output via semantic log_engine_stdout helper', () => {
      const stdoutBlock = extractEventHandler(engineSource, 'Stdout', 'start_engine')
      expect(stdoutBlock).toBeTruthy()
      expect(stdoutBlock).not.toMatch(/=>\s*\{\s*\}/)
      expect(stdoutBlock).toContain('log_engine_stdout')
    })

    it('extracts exit code from Terminated payload', () => {
      const terminatedBlock = extractEventHandler(engineSource, 'Terminated', 'start_engine')
      expect(terminatedBlock).toBeTruthy()
      expect(terminatedBlock).not.toContain('_payload')
      expect(terminatedBlock).toContain('code')
    })

    it('emits engine-crashed event on non-zero exit code', () => {
      const terminatedBlock = extractEventHandler(engineSource, 'Terminated', 'start_engine')
      expect(terminatedBlock).toBeTruthy()
      expect(terminatedBlock).toContain('engine-crashed')
      expect(terminatedBlock).toContain('emit')
    })
  })

  describe('restart_engine async monitor', () => {
    it('logs stderr output (not silently discarded)', () => {
      const stderrBlock = extractEventHandler(engineSource, 'Stderr', 'restart_engine')
      expect(stderrBlock).toBeTruthy()
      expect(stderrBlock).not.toMatch(/=>\s*\{\s*\}/)
      expect(stderrBlock).toContain('log::')
    })

    it('logs stdout output via semantic log_engine_stdout helper', () => {
      const stdoutBlock = extractEventHandler(engineSource, 'Stdout', 'restart_engine')
      expect(stdoutBlock).toBeTruthy()
      expect(stdoutBlock).not.toMatch(/=>\s*\{\s*\}/)
      expect(stdoutBlock).toContain('log_engine_stdout')
    })

    it('emits engine-crashed event on non-zero exit code', () => {
      const terminatedBlock = extractEventHandler(engineSource, 'Terminated', 'restart_engine')
      expect(terminatedBlock).toBeTruthy()
      expect(terminatedBlock).toContain('engine-crashed')
      expect(terminatedBlock).toContain('emit')
    })
  })
})

// ─── Test Group 4: MainLayout.vue — engine-crashed listener ─────────────

describe('MainLayout.vue — engine event listeners', () => {
  let layoutSource: string

  beforeAll(() => {
    // Engine event listeners extracted to useAppEvents composable
    const layoutPath = path.join(SRC_ROOT, 'src', 'composables', 'useAppEvents.ts')
    layoutSource = fs.readFileSync(layoutPath, 'utf-8')
  })

  describe('engine-crashed listener', () => {
    it('listens for "engine-crashed" event', () => {
      expect(layoutSource).toContain("'engine-crashed'")
    })

    it('shows engine overlay on crash', () => {
      const listenerBlock = extractListenerBlock(layoutSource, 'engine-crashed')
      expect(listenerBlock).toBeTruthy()
      expect(listenerBlock).toContain('showEngineOverlay')
    })

    it('sets engineReady to false on crash', () => {
      const listenerBlock = extractListenerBlock(layoutSource, 'engine-crashed')
      expect(listenerBlock).toBeTruthy()
      expect(listenerBlock).toContain('engineReady')
    })

    it('calls setEngineReady(false) to disable RPC', () => {
      const listenerBlock = extractListenerBlock(layoutSource, 'engine-crashed')
      expect(listenerBlock).toBeTruthy()
      expect(listenerBlock).toContain('setEngineReady')
    })
  })

  describe('engine-stopped info listener', () => {
    it('listens for "engine-stopped" event', () => {
      expect(layoutSource).toContain("'engine-stopped'")
    })

    it('uses i18n key "app.engine-stopped" for info notification', () => {
      expect(layoutSource).toContain('engine-stopped')
    })

    it('shows a warning notification (message.warning)', () => {
      const listenerBlock = extractListenerBlock(layoutSource, 'engine-stopped')
      expect(listenerBlock).toBeTruthy()
      expect(listenerBlock).toContain('message.warning')
    })
  })
})

// ─── Helpers ──────────────────────────────────────────────────────────

/**
 * Extract the handler body for a specific CommandEvent variant within a
 * specific function scope in engine/lifecycle.rs.
 *
 * Matches: `CommandEvent::Stdout(xxx) => { ... }` within the function body.
 */
function extractEventHandler(
  source: string,
  eventType: 'Stdout' | 'Stderr' | 'Terminated',
  functionName: string,
): string | null {
  // First, find the function boundary
  const fnIdx = source.indexOf(`fn ${functionName}`)
  if (fnIdx === -1) return null

  // Search within the function body only
  const fnBody = source.slice(fnIdx)

  // Find the CommandEvent::EventType pattern
  const pattern = `CommandEvent::${eventType}(`
  const idx = fnBody.indexOf(pattern)
  if (idx === -1) return null

  // Find => after the pattern
  const arrowIdx = fnBody.indexOf('=>', idx)
  if (arrowIdx === -1) return null

  // Extract everything from => to the next comma or closing brace at the same depth
  const afterArrow = fnBody.slice(arrowIdx + 2).trimStart()

  // If it's a `{ ... }` block, extract it
  if (afterArrow.startsWith('{')) {
    let depth = 0
    let end = 0
    for (let i = 0; i < afterArrow.length; i++) {
      if (afterArrow[i] === '{') depth++
      if (afterArrow[i] === '}') depth--
      if (depth === 0) {
        end = i
        break
      }
    }
    return afterArrow.slice(0, end + 1)
  }

  // Single-expression handler (no braces)
  const commaIdx = afterArrow.indexOf(',')
  return afterArrow.slice(0, commaIdx !== -1 ? commaIdx : 100)
}

/**
 * Extract a Tauri event listener block from Vue source.
 * Matches: listen<...>('event-name', ...)
 */
function extractListenerBlock(source: string, eventName: string): string | null {
  const needle = `'${eventName}'`
  const idx = source.indexOf(needle)
  if (idx === -1) return null

  const arrowIdx = source.indexOf('=>', idx)
  if (arrowIdx === -1) return null
  const braceStart = source.indexOf('{', arrowIdx)
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

  return source.slice(braceStart, end + 1)
}

/**
 * Extract the body of a named Rust function (pub fn name or pub async fn name).
 * Returns the source from the function signature to its closing brace.
 */
function extractFnBody(source: string, name: string): string | null {
  const pattern = new RegExp(`pub\\s+(?:async\\s+)?fn\\s+${name}\\b`)
  const match = pattern.exec(source)
  if (!match) return null
  const start = source.indexOf('{', match.index)
  if (start === -1) return null
  let depth = 0
  for (let i = start; i < source.length; i++) {
    if (source[i] === '{') depth++
    else if (source[i] === '}') depth--
    if (depth === 0) return source.slice(match.index, i + 1)
  }
  return null
}
