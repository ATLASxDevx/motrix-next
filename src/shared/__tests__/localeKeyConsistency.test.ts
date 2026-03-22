/**
 * @fileoverview Locale key consistency tests.
 *
 * Validates that all 26 locale directories contain the same set of
 * translation keys in their preferences.js files. Uses en-US as the
 * canonical reference. Detects missing keys (incomplete translations)
 * and extra keys (typos or stale translations).
 */
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const LOCALES_DIR = join(__dirname, '..', 'locales')

/** Extracts all single-quoted key names from a locale JS file. */
function extractKeys(filePath: string): string[] {
  const content = readFileSync(filePath, 'utf-8')
  const regex = /^\s*'([^']+)':/gm
  const keys: string[] = []
  let match: RegExpExecArray | null
  while ((match = regex.exec(content)) !== null) {
    keys.push(match[1])
  }
  return keys.sort()
}

/** All locale directories found on disk. */
const allLocales = readdirSync(LOCALES_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort()

const EXPECTED_LOCALES = [
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
]

const enUsKeys = extractKeys(join(LOCALES_DIR, 'en-US', 'preferences.js'))

describe('locale key consistency (preferences.js)', () => {
  it('contains all 26 expected locale directories', () => {
    for (const locale of EXPECTED_LOCALES) {
      expect(allLocales, `Missing locale directory: ${locale}`).toContain(locale)
    }
  })

  it.each(EXPECTED_LOCALES.filter((l) => l !== 'en-US'))('locale "%s" has no missing keys vs en-US', (locale) => {
    const localeKeys = extractKeys(join(LOCALES_DIR, locale, 'preferences.js'))
    const missing = enUsKeys.filter((k) => !localeKeys.includes(k))
    expect(missing, `${locale} is missing keys: ${missing.join(', ')}`).toEqual([])
  })

  it.each(EXPECTED_LOCALES.filter((l) => l !== 'en-US'))('locale "%s" has no extra keys vs en-US', (locale) => {
    const localeKeys = extractKeys(join(LOCALES_DIR, locale, 'preferences.js'))
    const extra = localeKeys.filter((k) => !enUsKeys.includes(k))
    expect(extra, `${locale} has extra keys: ${extra.join(', ')}`).toEqual([])
  })
})
