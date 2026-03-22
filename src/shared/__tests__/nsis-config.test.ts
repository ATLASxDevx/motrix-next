import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

/**
 * NSIS Installer Brand Configuration Tests
 *
 * Validates that the Tauri NSIS configuration and required brand assets
 * are correctly set up for producing a branded Windows installer.
 *
 * These tests guard against regressions where NSIS branding assets
 * or configuration properties are accidentally removed or misconfigured.
 */

const TAURI_ROOT = resolve(__dirname, '..', '..', '..', 'src-tauri')
const CONFIG_PATH = resolve(TAURI_ROOT, 'tauri.conf.json')

/** All 26 app locales mapped to their NSIS language identifiers. */
const EXPECTED_NSIS_LANGUAGES = [
  'Arabic',
  'Bulgarian',
  'Catalan',
  'German',
  'Greek',
  'English',
  'Spanish',
  'Farsi',
  'French',
  'Hungarian',
  'Indonesian',
  'Italian',
  'Japanese',
  'Korean',
  'Norwegian',
  'Dutch',
  'Polish',
  'PortugueseBR',
  'Romanian',
  'Russian',
  'Thai',
  'Turkish',
  'Ukrainian',
  'Vietnamese',
  'SimpChinese',
  'TradChinese',
] as const

interface NsisConfig {
  installerIcon?: string
  headerImage?: string
  sidebarImage?: string
  installMode?: string
  displayLanguageSelector?: boolean
  languages?: string[]
  installerHooks?: string
  compression?: string
}

interface TauriConfig {
  bundle?: {
    windows?: {
      nsis?: NsisConfig
    }
  }
}

function loadTauriConfig(): TauriConfig {
  const raw = readFileSync(CONFIG_PATH, 'utf-8')
  return JSON.parse(raw) as TauriConfig
}

function getNsisConfig(): NsisConfig {
  const config = loadTauriConfig()
  const nsis = config.bundle?.windows?.nsis
  if (!nsis) {
    throw new Error('bundle.windows.nsis section missing from tauri.conf.json')
  }
  return nsis
}

describe('NSIS installer brand configuration', () => {
  describe('tauri.conf.json structure', () => {
    it('has a bundle.windows.nsis section', () => {
      const config = loadTauriConfig()
      expect(config.bundle?.windows?.nsis).toBeDefined()
    })

    it('sets installerIcon to the existing icon.ico', () => {
      const nsis = getNsisConfig()
      expect(nsis.installerIcon).toBe('icons/icon.ico')
      const icoPath = resolve(TAURI_ROOT, nsis.installerIcon!)
      expect(existsSync(icoPath)).toBe(true)
    })

    it('sets headerImage to nsis/header.bmp', () => {
      const nsis = getNsisConfig()
      expect(nsis.headerImage).toBe('nsis/header.bmp')
    })

    it('sets sidebarImage to nsis/sidebar.bmp', () => {
      const nsis = getNsisConfig()
      expect(nsis.sidebarImage).toBe('nsis/sidebar.bmp')
    })

    it('sets installMode to "currentUser" (no misleading path selector)', () => {
      const nsis = getNsisConfig()
      expect(nsis.installMode).toBe('currentUser')
    })

    it('enables the language selector dialog', () => {
      const nsis = getNsisConfig()
      expect(nsis.displayLanguageSelector).toBe(true)
    })

    it('lists all 26 app locales as NSIS languages', () => {
      const nsis = getNsisConfig()
      expect(nsis.languages).toBeDefined()
      expect(nsis.languages).toHaveLength(EXPECTED_NSIS_LANGUAGES.length)
      for (const lang of EXPECTED_NSIS_LANGUAGES) {
        expect(nsis.languages).toContain(lang)
      }
    })

    it('preserves the existing installerHooks reference', () => {
      const nsis = getNsisConfig()
      expect(nsis.installerHooks).toBe('nsis/hooks.nsh')
    })
  })

  describe('brand asset files', () => {
    it('sidebar.bmp exists at the configured path', () => {
      const nsis = getNsisConfig()
      const bmpPath = resolve(TAURI_ROOT, nsis.sidebarImage!)
      expect(existsSync(bmpPath)).toBe(true)
    })

    it('header.bmp exists at the configured path', () => {
      const nsis = getNsisConfig()
      const bmpPath = resolve(TAURI_ROOT, nsis.headerImage!)
      expect(existsSync(bmpPath)).toBe(true)
    })

    it('sidebar.bmp is a valid BMP file (magic bytes: BM)', () => {
      const nsis = getNsisConfig()
      const bmpPath = resolve(TAURI_ROOT, nsis.sidebarImage!)
      const buf = readFileSync(bmpPath)
      // BMP magic: first 2 bytes = 0x42 0x4D ("BM")
      expect(buf[0]).toBe(0x42)
      expect(buf[1]).toBe(0x4d)
    })

    it('header.bmp is a valid BMP file (magic bytes: BM)', () => {
      const nsis = getNsisConfig()
      const bmpPath = resolve(TAURI_ROOT, nsis.headerImage!)
      const buf = readFileSync(bmpPath)
      expect(buf[0]).toBe(0x42)
      expect(buf[1]).toBe(0x4d)
    })

    it('sidebar.bmp has correct dimensions (164×314)', () => {
      const nsis = getNsisConfig()
      const bmpPath = resolve(TAURI_ROOT, nsis.sidebarImage!)
      const buf = readFileSync(bmpPath)
      // BMP header: width at offset 18 (4 bytes LE), height at offset 22 (4 bytes LE)
      const width = buf.readInt32LE(18)
      const height = Math.abs(buf.readInt32LE(22)) // height can be negative (top-down)
      expect(width).toBe(164)
      expect(height).toBe(314)
    })

    it('header.bmp has correct dimensions (150×57)', () => {
      const nsis = getNsisConfig()
      const bmpPath = resolve(TAURI_ROOT, nsis.headerImage!)
      const buf = readFileSync(bmpPath)
      const width = buf.readInt32LE(18)
      const height = Math.abs(buf.readInt32LE(22))
      expect(width).toBe(150)
      expect(height).toBe(57)
    })

    it('sidebar.bmp is 24-bit (no alpha channel for NSIS compatibility)', () => {
      const nsis = getNsisConfig()
      const bmpPath = resolve(TAURI_ROOT, nsis.sidebarImage!)
      const buf = readFileSync(bmpPath)
      // Bits per pixel at offset 28 (2 bytes LE)
      const bpp = buf.readUInt16LE(28)
      expect(bpp).toBe(24)
    })

    it('header.bmp is 24-bit (no alpha channel for NSIS compatibility)', () => {
      const nsis = getNsisConfig()
      const bmpPath = resolve(TAURI_ROOT, nsis.headerImage!)
      const buf = readFileSync(bmpPath)
      const bpp = buf.readUInt16LE(28)
      expect(bpp).toBe(24)
    })

    it('installerHooks file exists', () => {
      const nsis = getNsisConfig()
      const hookPath = resolve(TAURI_ROOT, nsis.installerHooks!)
      expect(existsSync(hookPath)).toBe(true)
    })

    it('icon.ico exists and is non-empty', () => {
      const nsis = getNsisConfig()
      const icoPath = resolve(TAURI_ROOT, nsis.installerIcon!)
      expect(existsSync(icoPath)).toBe(true)
      const buf = readFileSync(icoPath)
      expect(buf.length).toBeGreaterThan(1000) // multi-resolution ICO should be large
    })
  })
})
