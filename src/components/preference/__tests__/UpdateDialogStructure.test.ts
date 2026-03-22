/**
 * @fileoverview Structural tests for UpdateDialog.vue.
 *
 * Verifies critical error-handling patterns by inspecting the component
 * source code directly. This approach avoids the need for a full Tauri
 * runtime while still enforcing code-quality invariants.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const SOURCE = readFileSync(resolve(__dirname, '../UpdateDialog.vue'), 'utf-8')

// ── handleInstallAndRelaunch error handling ─────────────────────────

describe('handleInstallAndRelaunch error handling', () => {
  /** Extract the function body for targeted assertions. */
  function extractFunctionBody(fnName: string): string {
    const start = SOURCE.indexOf(`function ${fnName}`)
    if (start === -1) throw new Error(`${fnName} not found in source`)
    // Walk forward to find the matching closing brace
    let depth = 0
    let bodyStart = -1
    for (let i = start; i < SOURCE.length; i++) {
      if (SOURCE[i] === '{') {
        if (bodyStart === -1) bodyStart = i
        depth++
      } else if (SOURCE[i] === '}') {
        depth--
        if (depth === 0) return SOURCE.slice(bodyStart, i + 1)
      }
    }
    throw new Error(`Could not find closing brace for ${fnName}`)
  }

  it('wraps apply_update invoke in a try block', () => {
    const body = extractFunctionBody('handleInstallAndRelaunch')
    expect(body).toContain('try')
    expect(body).toContain('apply_update')
  })

  it('catches errors and transitions to error phase', () => {
    const body = extractFunctionBody('handleInstallAndRelaunch')
    expect(body).toContain('catch')
    // Must set phase to 'error' on failure — otherwise dialog locks
    expect(body).toContain("phase.value = 'error'")
  })

  it('sets errorMsg before transitioning to error phase', () => {
    const body = extractFunctionBody('handleInstallAndRelaunch')
    expect(body).toContain('formatUpdateError')
    expect(body).toContain('errorMsg.value')
  })

  it('only calls relaunch inside the try block, not after it', () => {
    const body = extractFunctionBody('handleInstallAndRelaunch')
    const tryIndex = body.indexOf('try')
    const catchIndex = body.indexOf('catch')
    const relaunchIndex = body.indexOf('relaunch()')

    expect(tryIndex).toBeGreaterThanOrEqual(0)
    expect(catchIndex).toBeGreaterThan(tryIndex)
    expect(relaunchIndex).toBeGreaterThan(tryIndex)
    // relaunch MUST be inside try (before catch), not after catch
    expect(relaunchIndex).toBeLessThan(catchIndex)
  })
})

// ── startDownload already has error handling (regression guard) ──────

describe('startDownload error handling (regression)', () => {
  it('has try/catch around download_update invoke', () => {
    const start = SOURCE.indexOf('function startDownload')
    expect(start).toBeGreaterThanOrEqual(0)
    const snippet = SOURCE.slice(start, start + 1200)
    expect(snippet).toContain('try')
    expect(snippet).toContain('catch')
  })
})

// ── open function error handling (regression guard) ──────────────────

describe('open function error handling (regression)', () => {
  it('has try/catch around check_for_update invoke', () => {
    const start = SOURCE.indexOf('async function open')
    expect(start).toBeGreaterThanOrEqual(0)
    const snippet = SOURCE.slice(start, start + 900)
    expect(snippet).toContain('try')
    expect(snippet).toContain('catch')
    expect(snippet).toContain("phase.value = 'error'")
  })
})
