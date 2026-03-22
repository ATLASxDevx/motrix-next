/**
 * @fileoverview TDD tests for 3 logging fixes:
 *   1. Default log level = 'info' (not 'warn')
 *   2. log-level NOT in needRestartKeys (needs app relaunch, not engine restart)
 *   3. Export uses save dialog (save_path parameter in Rust command)
 */
import { describe, it, expect, beforeAll } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

const SRC_ROOT = path.resolve(__dirname, '../../..')
const TAURI_ROOT = path.join(SRC_ROOT, 'src-tauri')

// ─── Fix 1: Default log level ──────────────────────────────────────

describe('Fix 1: Default log level = debug', () => {
  let constantsSource: string
  let composableSource: string

  beforeAll(() => {
    constantsSource = fs.readFileSync(path.join(SRC_ROOT, 'src', 'shared', 'constants.ts'), 'utf-8')
    composableSource = fs.readFileSync(path.join(SRC_ROOT, 'src', 'composables', 'useAdvancedPreference.ts'), 'utf-8')
  })

  it("DEFAULT_APP_CONFIG.logLevel is 'debug'", () => {
    // Extract the logLevel value from the DEFAULT_APP_CONFIG block
    const match = constantsSource.match(/logLevel:\s*'(\w+)'/)
    expect(match).toBeTruthy()
    expect(match![1]).toBe('debug')
  })

  it("buildAdvancedSystemConfig fallback is 'debug' (not 'warn')", () => {
    const systemConfigBlock = composableSource.slice(composableSource.indexOf('buildAdvancedSystemConfig'))
    // Should use 'debug' as fallback in log-level system config
    expect(systemConfigBlock).toContain("f.logLevel || 'debug'")
    expect(systemConfigBlock).not.toContain("f.logLevel || 'warn'")
  })
})

// ─── Fix 2: log-level needs app relaunch, not engine restart ───────

describe('Fix 2: log-level triggers app relaunch (not engine restart)', () => {
  let configKeysSource: string
  let advancedVueSource: string

  beforeAll(() => {
    configKeysSource = fs.readFileSync(path.join(SRC_ROOT, 'src', 'shared', 'configKeys.ts'), 'utf-8')
    advancedVueSource = fs.readFileSync(path.join(SRC_ROOT, 'src', 'components', 'preference', 'Advanced.vue'), 'utf-8')
  })

  it('log-level is NOT in needRestartKeys (engine restart is wrong for log level)', () => {
    const match = configKeysSource.match(/needRestartKeys\s*=\s*\[([^\]]+)\]/)
    expect(match).toBeTruthy()
    expect(match![1]).not.toContain("'log-level'")
  })

  it('Advanced.vue contains a relaunch call for log level changes', () => {
    expect(advancedVueSource).toContain('relaunch')
  })

  it('Advanced.vue has a restart-required i18n key for log level', () => {
    expect(advancedVueSource).toContain('restart-required')
  })
})

// ─── Fix 3: Export uses save dialog ────────────────────────────────

describe('Fix 3: Export uses save dialog (user chooses path)', () => {
  let appRsSource: string

  beforeAll(() => {
    appRsSource = fs.readFileSync(path.join(TAURI_ROOT, 'src', 'commands', 'fs.rs'), 'utf-8')
  })

  it('Advanced.vue (or its composable) imports the save dialog from @tauri-apps/plugin-dialog', () => {
    // The save dialog import was extracted from Advanced.vue to useAdvancedActions composable
    const composableSource = fs.readFileSync(
      path.join(SRC_ROOT, 'src', 'composables', 'useAdvancedActions.ts'),
      'utf-8',
    )
    expect(composableSource).toContain('@tauri-apps/plugin-dialog')
  })

  it('the Rust command accepts a save_path parameter', () => {
    const fnBlock = appRsSource.slice(appRsSource.indexOf('fn export_diagnostic_logs'))
    expect(fnBlock).toContain('save_path')
  })
})
