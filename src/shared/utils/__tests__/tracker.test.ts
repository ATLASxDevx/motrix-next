/** @fileoverview Tests for tracker data conversion and proxy parsing utilities. */
import { describe, it, expect } from 'vitest'
import {
  convertTrackerDataToLine,
  convertTrackerDataToComma,
  reduceTrackerString,
  convertToAxiosProxy,
} from '../tracker'

// ─── convertTrackerDataToLine ───────────────────────────────

describe('convertTrackerDataToLine', () => {
  it('joins entries with \\r\\n newlines', () => {
    expect(convertTrackerDataToLine(['a', 'b', 'c'])).toBe('a\r\nb\r\nc')
  })

  it('returns empty string for empty array', () => {
    expect(convertTrackerDataToLine([])).toBe('')
  })

  it('strips empty-string entries', () => {
    expect(convertTrackerDataToLine(['a', '', 'b'])).toBe('a\r\nb')
  })

  it('strips whitespace-only entries', () => {
    expect(convertTrackerDataToLine(['a', '   ', 'b'])).toBe('a\r\nb')
  })

  it('returns single entry without separator', () => {
    expect(convertTrackerDataToLine(['tracker1'])).toBe('tracker1')
  })

  it('handles entries that themselves contain newlines', () => {
    // Input entries with embedded \r\n are split then filtered
    const result = convertTrackerDataToLine(['a\r\nb', 'c'])
    expect(result).toBe('a\r\nb\r\nc')
  })
})

// ─── convertTrackerDataToComma ──────────────────────────────

describe('convertTrackerDataToComma', () => {
  it('joins entries with commas', () => {
    expect(convertTrackerDataToComma(['a', 'b', 'c'])).toBe('a,b,c')
  })

  it('returns empty string for empty array', () => {
    expect(convertTrackerDataToComma([])).toBe('')
  })

  it('strips empty entries before joining', () => {
    expect(convertTrackerDataToComma(['a', '', 'b'])).toBe('a,b')
  })

  it('returns single entry without comma', () => {
    expect(convertTrackerDataToComma(['tracker1'])).toBe('tracker1')
  })
})

// ─── reduceTrackerString ────────────────────────────────────

describe('reduceTrackerString', () => {
  it('returns full string when under MAX_BT_TRACKER_LENGTH (6144)', () => {
    expect(reduceTrackerString('short')).toBe('short')
  })

  it('returns empty for empty string', () => {
    expect(reduceTrackerString('')).toBe('')
  })

  it('returns empty for no argument (default parameter)', () => {
    expect(reduceTrackerString()).toBe('')
  })

  it('truncates at last comma when exceeding 6144 characters', () => {
    // Build a string that exceeds 6144 chars
    const items = Array.from(
      { length: 200 },
      (_, i) => `http://tracker${String(i).padStart(3, '0')}.example.com/announce`,
    )
    const longStr = items.join(',')
    expect(longStr.length).toBeGreaterThan(6144)

    const result = reduceTrackerString(longStr)
    expect(result.length).toBeLessThanOrEqual(6144)
    // Must end at a clean boundary — no partial URL
    expect(result.endsWith(',')).toBe(false)
    const parts = result.split(',')
    parts.forEach((part) => {
      expect(part).toContain('http://')
      expect(part).toContain('/announce')
    })
  })

  it('returns full substring when no comma in prefix', () => {
    // A single very long tracker URL with no commas
    const longUrl = 'http://' + 'a'.repeat(6200) + '.com/announce'
    const result = reduceTrackerString(longUrl)
    // No comma found, returns substring(0, 6144)
    expect(result.length).toBe(6144)
  })
})

// ─── convertToAxiosProxy ────────────────────────────────────

describe('convertToAxiosProxy', () => {
  it('returns undefined for empty string', () => {
    expect(convertToAxiosProxy('')).toBeUndefined()
  })

  it('returns undefined for default parameter', () => {
    expect(convertToAxiosProxy()).toBeUndefined()
  })

  it('parses HTTP proxy without authentication', () => {
    const result = convertToAxiosProxy('http://proxy.example.com:8080')
    expect(result).toBeDefined()
    expect(result!.protocol).toBe('http')
    expect(result!.host).toBe('proxy.example.com')
    expect(result!.port).toBe(8080)
    expect(result!.auth).toBeUndefined()
  })

  it('parses proxy with username and password', () => {
    const result = convertToAxiosProxy('http://admin:secret@proxy.example.com:3128')
    expect(result).toBeDefined()
    expect(result!.host).toBe('proxy.example.com')
    expect(result!.port).toBe(3128)
    expect(result!.auth).toEqual({ username: 'admin', password: 'secret' })
  })

  it('parses SOCKS5 proxy protocol', () => {
    const result = convertToAxiosProxy('socks5://localhost:1080')
    expect(result).toBeDefined()
    expect(result!.protocol).toBe('socks5')
    expect(result!.host).toBe('localhost')
    expect(result!.port).toBe(1080)
  })

  it('defaults port to 80 when not specified', () => {
    const result = convertToAxiosProxy('http://proxy.example.com')
    expect(result).toBeDefined()
    expect(result!.port).toBe(80)
  })

  it('parses proxy with only username (no password)', () => {
    const result = convertToAxiosProxy('http://user@proxy.example.com:9090')
    expect(result).toBeDefined()
    expect(result!.auth).toBeDefined()
    expect(result!.auth!.username).toBe('user')
  })
})
