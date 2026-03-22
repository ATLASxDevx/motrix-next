/** @fileoverview Tests for locale utilities. */
import { describe, it, expect } from 'vitest'
import { isRTL, getLangDirection, calcFormLabelWidth } from '../locale'

describe('isRTL', () => {
  it('returns true for Arabic', () => {
    expect(isRTL('ar')).toBe(true)
  })
  it('returns true for Persian', () => {
    expect(isRTL('fa')).toBe(true)
  })
  it('returns true for Hebrew', () => {
    expect(isRTL('he')).toBe(true)
  })
  it('returns false for English', () => {
    expect(isRTL('en-US')).toBe(false)
  })
  it('returns false for default', () => {
    expect(isRTL()).toBe(false)
  })
})

describe('getLangDirection', () => {
  it('returns rtl for Arabic', () => {
    expect(getLangDirection('ar')).toBe('rtl')
  })
  it('returns ltr for English', () => {
    expect(getLangDirection('en-US')).toBe('ltr')
  })
})

describe('calcFormLabelWidth', () => {
  it('returns 28% for German', () => {
    expect(calcFormLabelWidth('de-DE')).toBe('28%')
  })
  it('returns 28% for German (short)', () => {
    expect(calcFormLabelWidth('de')).toBe('28%')
  })
  it('returns 25% for English', () => {
    expect(calcFormLabelWidth('en-US')).toBe('25%')
  })
  it('returns 25% for French (non-de locales)', () => {
    expect(calcFormLabelWidth('fr-FR')).toBe('25%')
  })
  it('returns 25% for Chinese', () => {
    expect(calcFormLabelWidth('zh-CN')).toBe('25%')
  })
})
