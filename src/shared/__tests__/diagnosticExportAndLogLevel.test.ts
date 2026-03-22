/**
 * @fileoverview Structural TDD tests for Gap 3 (diagnostic log export) and Gap 4 (log level config).
 *
 * Gap 3: Users must be able to export diagnostic logs via a single button
 *   - Rust: `export_diagnostic_logs` command in fs.rs
 *   - Rust: command registered in invoke_handler in lib.rs
 *   - Frontend: export button in Advanced.vue developer section
 *   - i18n: 'export-diagnostic-logs' key in all 26 locales
 *
 * Gap 4: Log level is restart-required and uses standard Rust level names
 *   - `log-level` in needRestartKeys (configKeys.ts)
 *   - LOG_LEVELS constant uses valid Rust log::LevelFilter names
 *   - lib.rs reads log-level from user store to set initial level
 */
import { describe, it, expect, beforeAll } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

const SRC_ROOT = path.resolve(__dirname, '../../..')
const TAURI_ROOT = path.join(SRC_ROOT, 'src-tauri')
const LOCALES_DIR = path.join(SRC_ROOT, 'src', 'shared', 'locales')

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

// ─── Gap 3: Diagnostic Log Export ─────────────────────────────────────

describe('Gap 3: Diagnostic log export', () => {
  let appRsSource: string
  let libRsSource: string
  let advancedVueSource: string

  beforeAll(() => {
    appRsSource = fs.readFileSync(path.join(TAURI_ROOT, 'src', 'commands', 'fs.rs'), 'utf-8')
    libRsSource = fs.readFileSync(path.join(TAURI_ROOT, 'src', 'lib.rs'), 'utf-8')
    advancedVueSource = fs.readFileSync(path.join(SRC_ROOT, 'src', 'components', 'preference', 'Advanced.vue'), 'utf-8')
  })

  describe('Rust command', () => {
    it('fs.rs defines an export_diagnostic_logs command', () => {
      expect(appRsSource).toContain('fn export_diagnostic_logs')
    })

    it('the command is async (I/O bound operation)', () => {
      expect(appRsSource).toContain('async fn export_diagnostic_logs')
    })

    it('the command returns a Result type (not raw String)', () => {
      // Must follow AppError pattern per AGENTS.md
      const fnBlock = appRsSource.slice(appRsSource.indexOf('fn export_diagnostic_logs'))
      expect(fnBlock).toContain('Result<')
    })

    it('the command accesses the app log directory', () => {
      const fnBlock = appRsSource.slice(appRsSource.indexOf('fn export_diagnostic_logs'))
      expect(fnBlock).toContain('app_log_dir')
    })

    it('embeds a system-info.json file into the ZIP archive', () => {
      const fnBlock = appRsSource.slice(appRsSource.indexOf('fn export_diagnostic_logs'))
      expect(fnBlock).toContain('system-info.json')
    })

    it('collects OS name via std::env::consts::OS', () => {
      const fnBlock = appRsSource.slice(appRsSource.indexOf('fn export_diagnostic_logs'))
      expect(fnBlock).toContain('consts::OS')
    })

    it('collects CPU architecture via std::env::consts::ARCH', () => {
      const fnBlock = appRsSource.slice(appRsSource.indexOf('fn export_diagnostic_logs'))
      expect(fnBlock).toContain('consts::ARCH')
    })

    it('collects app version from package_info', () => {
      const fnBlock = appRsSource.slice(appRsSource.indexOf('fn export_diagnostic_logs'))
      expect(fnBlock).toContain('package_info')
    })
  })

  describe('command registration', () => {
    it('export_diagnostic_logs is registered in the invoke_handler', () => {
      expect(libRsSource).toContain('export_diagnostic_logs')
    })
  })

  describe('frontend UI', () => {
    it('Advanced.vue has an export diagnostic logs button', () => {
      expect(advancedVueSource).toContain('export-diagnostic-logs')
    })

    it('the button invokes the export_diagnostic_logs command', () => {
      // The invoke call was extracted from Advanced.vue to useAdvancedActions composable
      const composableSource = fs.readFileSync(
        path.join(SRC_ROOT, 'src', 'composables', 'useAdvancedActions.ts'),
        'utf-8',
      )
      expect(composableSource).toContain('export_diagnostic_logs')
    })
  })

  describe('i18n — export-diagnostic-logs key in all 26 locales', () => {
    for (const locale of ALL_LOCALES) {
      it(`${locale}/preferences.js has 'export-diagnostic-logs' key`, () => {
        const content = fs.readFileSync(path.join(LOCALES_DIR, locale, 'preferences.js'), 'utf-8')
        expect(content).toContain("'export-diagnostic-logs'")
      })
    }
  })
})

// ─── Gap 4: Log Level Config ──────────────────────────────────────────

describe('Gap 4: Log level configuration', () => {
  let configKeysSource: string
  let constantsSource: string
  let libRsSource: string

  beforeAll(() => {
    configKeysSource = fs.readFileSync(path.join(SRC_ROOT, 'src', 'shared', 'configKeys.ts'), 'utf-8')
    constantsSource = fs.readFileSync(path.join(SRC_ROOT, 'src', 'shared', 'constants.ts'), 'utf-8')
    libRsSource = fs.readFileSync(path.join(TAURI_ROOT, 'src', 'lib.rs'), 'utf-8')
  })

  describe('configKeys.ts', () => {
    it('log-level is NOT in needRestartKeys (needs app relaunch, not engine restart)', () => {
      // log-level requires app relaunch (tauri-plugin-log is process-level),
      // NOT engine restart. Handled separately in afterSave.
      const match = configKeysSource.match(/needRestartKeys\s*=\s*\[([^\]]+)\]/)
      expect(match).toBeTruthy()
      expect(match![1]).not.toContain("'log-level'")
    })
  })

  describe('LOG_LEVELS constant', () => {
    it('uses valid Rust log::LevelFilter names (not legacy verbose/silly)', () => {
      // These are Winston/Electron legacy names that don't map to Rust
      expect(constantsSource).not.toContain("'verbose'")
      expect(constantsSource).not.toContain("'silly'")
    })

    it('includes all standard log levels', () => {
      expect(constantsSource).toContain("'error'")
      expect(constantsSource).toContain("'warn'")
      expect(constantsSource).toContain("'info'")
      expect(constantsSource).toContain("'debug'")
    })
  })

  describe('lib.rs — reads log-level from store', () => {
    it('references user store (user.json) to read log-level', () => {
      expect(libRsSource).toContain('log-level')
    })

    it('maps the stored level string to log::LevelFilter', () => {
      expect(libRsSource).toContain('LevelFilter')
    })
  })

  describe('i18n — log-level key in all 26 locales', () => {
    for (const locale of ALL_LOCALES) {
      it(`${locale}/preferences.js has 'log-level' key`, () => {
        const content = fs.readFileSync(path.join(LOCALES_DIR, locale, 'preferences.js'), 'utf-8')
        expect(content).toContain("'log-level'")
      })
    }
  })
})
