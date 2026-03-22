/**
 * @fileoverview Structural tests for Rust panic hook logging.
 *
 * By default, Rust panics write to stderr and never reach the log file.
 * Industrial-grade applications MUST register a custom panic hook that routes
 * panic information through the `log` crate so that:
 * - Panics are persisted to the log file (not lost on process exit)
 * - Panics include location info (file, line, column)
 * - The hook is set BEFORE Tauri Builder so even plugin panics are caught
 *
 * These tests verify the source code of lib.rs to ensure the panic hook
 * is correctly registered.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

const SRC_ROOT = path.resolve(__dirname, '../../..')
const TAURI_ROOT = path.join(SRC_ROOT, 'src-tauri')

describe('lib.rs — panic hook for log file persistence', () => {
  let libSource: string

  beforeAll(() => {
    libSource = fs.readFileSync(path.join(TAURI_ROOT, 'src', 'lib.rs'), 'utf-8')
  })

  it('registers a custom panic hook via std::panic::set_hook', () => {
    expect(libSource).toContain('panic::set_hook')
  })

  it('routes panic information through log::error! macro', () => {
    // The panic hook must use log::error! to ensure the panic reaches
    // the tauri-plugin-log file target
    expect(libSource).toContain('log::error!')
  })

  it('registers the panic hook BEFORE Tauri Builder (catches plugin panics)', () => {
    const hookIdx = libSource.indexOf('panic::set_hook')
    const builderIdx = libSource.indexOf('tauri::Builder')
    expect(hookIdx).toBeGreaterThanOrEqual(0)
    expect(builderIdx).toBeGreaterThanOrEqual(0)
    expect(hookIdx).toBeLessThan(builderIdx)
  })

  it('the panic hook closure captures the panic info parameter', () => {
    // Extract the set_hook call and verify it takes a |info| parameter
    const hookIdx = libSource.indexOf('panic::set_hook')
    expect(hookIdx).toBeGreaterThanOrEqual(0)
    const hookSnippet = libSource.slice(hookIdx, hookIdx + 200)
    // Must have a closure parameter for PanicInfo (typically |info| or |panic_info|)
    expect(hookSnippet).toMatch(/\|[a-z_]+\|/)
  })
})
