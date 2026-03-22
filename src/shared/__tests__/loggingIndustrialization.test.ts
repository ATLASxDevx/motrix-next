/**
 * @fileoverview TDD structural tests for logging system industrialization.
 *
 * Tests verify source-level contracts for 6 improvements:
 *   P0.1 — RotationStrategy::KeepOne (not KeepAll)
 *   P0.2 — No raw console.error/log/info/debug leaks in composables
 *   P0.3 — max_file_size ≥ 10MB
 *   P0.4 — Enriched system-info.json in diagnostic export
 *   P0.5 — config.json snapshot embedded in diagnostic ZIP
 *   P1.1 — Custom log format with ISO 8601 + source tags
 *
 * These are structural (source-reading) tests — the only viable approach
 * since Tauri plugins cannot be instantiated in a Vitest environment.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

const SRC_ROOT = path.resolve(__dirname, '../../..')
const TAURI_SRC = path.join(SRC_ROOT, 'src-tauri', 'src')

// ── Helpers ──────────────────────────────────────────────────────────

/** Reads a Rust source file and returns the content from a given function start. */
function readRustFn(filePath: string, fnName: string): string {
  const source = fs.readFileSync(filePath, 'utf-8')
  const idx = source.indexOf(`fn ${fnName}`)
  if (idx === -1) throw new Error(`Function '${fnName}' not found in ${filePath}`)
  return source.slice(idx)
}

// =====================================================================
// P0.1 — Rotation strategy: KeepAll → KeepOne
// =====================================================================

describe('P0.1: Log rotation uses KeepOne strategy', () => {
  let libSource: string

  beforeAll(() => {
    libSource = fs.readFileSync(path.join(TAURI_SRC, 'lib.rs'), 'utf-8')
  })

  it('uses RotationStrategy::KeepOne (not KeepAll) to prevent unbounded disk growth', () => {
    // KeepAll has a documented macOS bug (only keeps last 2 files) and
    // causes unbounded disk growth on all platforms.
    expect(libSource).toContain('RotationStrategy::KeepOne')
    expect(libSource).not.toContain('RotationStrategy::KeepAll')
  })
})

// =====================================================================
// P0.2 — No console.error leaks in composables
// =====================================================================

describe('P0.2: No raw console leaks in composables', () => {
  const composablesDir = path.join(SRC_ROOT, 'src', 'composables')

  it('useAppEvents.ts uses logger.error instead of console.error', () => {
    const source = fs.readFileSync(path.join(composablesDir, 'useAppEvents.ts'), 'utf-8')
    // No raw console.error calls — all errors must go through the centralized logger
    expect(source).not.toContain('console.error')
    expect(source).not.toContain('console.log')
  })

  it('useAppEvents.ts imports the centralized logger', () => {
    const source = fs.readFileSync(path.join(composablesDir, 'useAppEvents.ts'), 'utf-8')
    expect(source).toContain("from '@shared/logger'")
  })
})

// =====================================================================
// P0.3 — max_file_size ≥ 10MB
// =====================================================================

describe('P0.3: Log file max size is at least 10MB', () => {
  let libSource: string

  beforeAll(() => {
    libSource = fs.readFileSync(path.join(TAURI_SRC, 'lib.rs'), 'utf-8')
  })

  it('sets max_file_size to at least 10_000_000 bytes (10 MB)', () => {
    // Extract the numeric argument from .max_file_size(N)
    const match = libSource.match(/\.max_file_size\((\d[\d_]*)\)/)
    expect(match).toBeTruthy()
    const sizeBytes = parseInt(match![1].replace(/_/g, ''), 10)
    expect(sizeBytes).toBeGreaterThanOrEqual(10_000_000)
  })
})

// =====================================================================
// P0.4 — Enriched system-info.json in diagnostic export
// =====================================================================

describe('P0.4: Diagnostic export includes enriched system info', () => {
  let exportFnSource: string

  beforeAll(() => {
    exportFnSource = readRustFn(path.join(TAURI_SRC, 'commands', 'fs.rs'), 'export_diagnostic_logs')
  })

  // Existing fields (must not regress)
  it('includes OS name (std::env::consts::OS)', () => {
    expect(exportFnSource).toContain('consts::OS')
  })

  it('includes CPU architecture (std::env::consts::ARCH)', () => {
    expect(exportFnSource).toContain('consts::ARCH')
  })

  it('includes app version from package_info', () => {
    expect(exportFnSource).toContain('app_version')
  })

  it('includes export timestamp', () => {
    expect(exportFnSource).toContain('exported_at')
  })

  // New enriched fields
  it('includes OS version for platform-specific debugging', () => {
    expect(exportFnSource).toContain('os_version')
  })

  it('includes system locale for i18n debugging', () => {
    expect(exportFnSource).toContain('locale')
  })

  it('includes user-configured log level', () => {
    expect(exportFnSource).toContain('log_level')
  })

  it('includes engine PID for process debugging', () => {
    expect(exportFnSource).toContain('engine_pid')
  })

  it('includes WebKit DMABuf renderer status for Linux GPU debugging', () => {
    expect(exportFnSource).toContain('WEBKIT_DISABLE_DMABUF_RENDERER')
  })
})

// =====================================================================
// P0.5 — config.json snapshot in diagnostic ZIP
// =====================================================================

describe('P0.5: Diagnostic ZIP includes config.json snapshot', () => {
  let exportFnSource: string

  beforeAll(() => {
    exportFnSource = readRustFn(path.join(TAURI_SRC, 'commands', 'fs.rs'), 'export_diagnostic_logs')
  })

  it('reads the config.json from app data directory', () => {
    expect(exportFnSource).toContain('config.json')
  })

  it('accesses app_data_dir to locate the config file', () => {
    expect(exportFnSource).toContain('app_data_dir')
  })

  it('adds config.json as a file entry in the ZIP archive', () => {
    // Must use start_file to add config.json to the ZIP
    // The function already uses start_file for system-info.json and log files,
    // so config.json must also be added this way
    const configSection = exportFnSource.slice(exportFnSource.indexOf('config.json'))
    expect(configSection).toContain('start_file')
  })
})

// =====================================================================
// P1.1 — Custom log format with ISO 8601 + source tags
// =====================================================================

describe('P1.1: Custom log format with source origin tags', () => {
  let libSource: string

  beforeAll(() => {
    libSource = fs.readFileSync(path.join(TAURI_SRC, 'lib.rs'), 'utf-8')
  })

  it('uses a custom .format() on the log Builder (not default format)', () => {
    // The Builder chain must include .format() to override the default
    // fern format with our ISO 8601 + source tag format
    const pluginBlock = libSource.slice(
      libSource.indexOf('tauri_plugin_log::Builder::new()'),
      libSource.indexOf('.build(),'),
    )
    expect(pluginBlock).toContain('.format(')
  })

  it('distinguishes webview (JS) logs from Rust logs using WEBVIEW_TARGET', () => {
    // Must use the official WEBVIEW_TARGET constant to detect JS-origin logs
    expect(libSource).toContain('WEBVIEW_TARGET')
  })

  it('includes ISO 8601 timestamp formatting with milliseconds', () => {
    // The format string must include millisecond precision for correlation
    expect(libSource).toContain('%.3f')
  })

  it('includes source origin tag (rust vs webview) in log output', () => {
    // The format must tag each line with its origin for debugging
    expect(libSource).toContain('"webview"')
    expect(libSource).toContain('"rust"')
  })
})
