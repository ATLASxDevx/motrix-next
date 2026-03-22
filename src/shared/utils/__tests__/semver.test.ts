/**
 * @fileoverview Tests for the semver comparison utility.
 *
 * Key behaviors under test:
 * - compareSemver: major/minor/patch comparison
 * - Prerelease versions have lower precedence than release
 * - Prerelease segments: numeric < string, fewer segments < more
 * - Leading "v" prefix is stripped
 * - isUpgrade / isDowngrade convenience functions
 */
import { describe, it, expect } from 'vitest'
import { compareSemver, isUpgrade, isDowngrade } from '../semver'

describe('compareSemver', () => {
  it('returns 0 for identical versions', () => {
    expect(compareSemver('1.0.0', '1.0.0')).toBe(0)
    expect(compareSemver('2.3.4', '2.3.4')).toBe(0)
  })

  it('compares major versions', () => {
    expect(compareSemver('1.0.0', '2.0.0')).toBe(-1)
    expect(compareSemver('3.0.0', '2.0.0')).toBe(1)
  })

  it('compares minor versions', () => {
    expect(compareSemver('1.1.0', '1.2.0')).toBe(-1)
    expect(compareSemver('1.5.0', '1.3.0')).toBe(1)
  })

  it('compares patch versions', () => {
    expect(compareSemver('1.0.1', '1.0.2')).toBe(-1)
    expect(compareSemver('1.0.5', '1.0.3')).toBe(1)
  })

  it('strips leading "v" prefix', () => {
    expect(compareSemver('v1.0.0', '1.0.0')).toBe(0)
    expect(compareSemver('v2.0.0', 'v1.0.0')).toBe(1)
  })

  it('prerelease has lower precedence than release', () => {
    expect(compareSemver('2.1.1-beta.3', '2.1.1')).toBe(-1)
    expect(compareSemver('2.0.0', '2.0.0-rc.1')).toBe(1)
  })

  it('compares prerelease numeric segments', () => {
    expect(compareSemver('1.0.0-beta.1', '1.0.0-beta.2')).toBe(-1)
    expect(compareSemver('1.0.0-beta.10', '1.0.0-beta.3')).toBe(1)
  })

  it('compares prerelease string segments lexicographically', () => {
    expect(compareSemver('1.0.0-alpha', '1.0.0-beta')).toBe(-1)
    expect(compareSemver('1.0.0-rc', '1.0.0-beta')).toBe(1)
  })

  it('numeric prerelease segments have lower precedence than string', () => {
    expect(compareSemver('1.0.0-1', '1.0.0-alpha')).toBe(-1)
    expect(compareSemver('1.0.0-alpha', '1.0.0-1')).toBe(1)
  })

  it('fewer prerelease segments < more segments', () => {
    expect(compareSemver('1.0.0-beta', '1.0.0-beta.1')).toBe(-1)
    expect(compareSemver('1.0.0-beta.1', '1.0.0-beta')).toBe(1)
  })

  it('handles complex prerelease comparisons', () => {
    expect(compareSemver('2.0.0-beta.1', '2.0.0-beta.2')).toBe(-1)
    expect(compareSemver('2.0.0-beta.2', '2.0.0-rc.1')).toBe(-1)
    expect(compareSemver('2.0.0-rc.1', '2.0.0')).toBe(-1)
  })
})

describe('isUpgrade', () => {
  it('returns true when remote is newer', () => {
    expect(isUpgrade('1.0.0', '2.0.0')).toBe(true)
    expect(isUpgrade('1.0.0', '1.0.1')).toBe(true)
    expect(isUpgrade('1.0.0-beta', '1.0.0')).toBe(true)
  })

  it('returns false when remote is same or older', () => {
    expect(isUpgrade('2.0.0', '2.0.0')).toBe(false)
    expect(isUpgrade('2.0.0', '1.0.0')).toBe(false)
  })
})

describe('isDowngrade', () => {
  it('returns true when remote is older', () => {
    expect(isDowngrade('2.0.0', '1.0.0')).toBe(true)
    expect(isDowngrade('1.0.0', '1.0.0-beta')).toBe(true)
  })

  it('returns false when remote is same or newer', () => {
    expect(isDowngrade('1.0.0', '1.0.0')).toBe(false)
    expect(isDowngrade('1.0.0', '2.0.0')).toBe(false)
  })
})
