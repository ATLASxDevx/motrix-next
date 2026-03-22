/**
 * @fileoverview Tests for the cURL parsing utilities.
 *
 * Key behaviors under test:
 * - buildUrisFromCurl extracts URLs from curl commands
 * - buildUrisFromCurl appends query params from parsed curl
 * - buildUrisFromCurl passes non-curl URIs through unchanged
 * - buildHeadersFromCurl extracts headers, cookies, user-agent, referer
 * - buildDefaultOptionsFromCurl merges first non-null header into form defaults
 */
import { describe, it, expect, vi } from 'vitest'

// Mock the curl parser
vi.mock('@bany/curl-to-json', () => ({
  default: (input: string) => {
    // Simple mock that simulates the parser's behavior for test cases
    if (input.includes('example.com/file.zip')) {
      return { url: 'https://example.com/file.zip', params: {} }
    }
    if (input.includes('example.com/search')) {
      return { url: 'https://example.com/search', params: { q: 'test', page: '1' } }
    }
    if (input.includes('example.com/api')) {
      return {
        url: 'https://example.com/api',
        header: { Authorization: 'Bearer token123' },
        cookie: 'session=abc',
        'user-agent': 'CustomUA/1.0',
        referer: 'https://example.com/',
      }
    }
    return { url: input }
  },
}))

import { buildUrisFromCurl, buildHeadersFromCurl, buildDefaultOptionsFromCurl } from '../curl'

describe('buildUrisFromCurl', () => {
  it('extracts URL from a curl command', () => {
    const result = buildUrisFromCurl(['curl https://example.com/file.zip'])
    expect(result[0]).toBe('https://example.com/file.zip')
  })

  it('appends query params from curl command', () => {
    const result = buildUrisFromCurl(['curl https://example.com/search'])
    expect(result[0]).toBe('https://example.com/search?q=test&page=1')
  })

  it('passes non-curl URIs through unchanged', () => {
    const result = buildUrisFromCurl(['https://direct.com/dl.zip'])
    expect(result[0]).toBe('https://direct.com/dl.zip')
  })

  it('handles empty input', () => {
    expect(buildUrisFromCurl([])).toEqual([])
    expect(buildUrisFromCurl()).toEqual([])
  })
})

describe('buildHeadersFromCurl', () => {
  it('extracts headers, cookie, user-agent, and referer from curl', () => {
    const result = buildHeadersFromCurl(['curl https://example.com/api'])
    expect(result[0]).toEqual({
      Authorization: 'Bearer token123',
      cookie: 'session=abc',
      'user-agent': 'CustomUA/1.0',
      referer: 'https://example.com/',
    })
  })

  it('returns undefined for non-curl URIs', () => {
    const result = buildHeadersFromCurl(['https://plain.com/file.zip'])
    expect(result[0]).toBeUndefined()
  })

  it('handles empty input', () => {
    expect(buildHeadersFromCurl()).toEqual([])
  })
})

describe('buildDefaultOptionsFromCurl', () => {
  it('merges first non-null header into empty form options', () => {
    const form = { cookie: '', referer: '', userAgent: '', authorization: '' }
    const headers = [
      undefined,
      { cookie: 'sess=123', referer: 'https://ref.com', 'user-agent': 'UA/2', authorization: 'Basic abc' },
    ]

    const result = buildDefaultOptionsFromCurl(form, headers)
    expect(result.cookie).toBe('sess=123')
    expect(result.referer).toBe('https://ref.com')
    expect(result.userAgent).toBe('UA/2')
    expect(result.authorization).toBe('Basic abc')
  })

  it('does not overwrite existing form values', () => {
    const form = { cookie: 'existing', referer: '', userAgent: 'MyUA', authorization: '' }
    const headers = [{ cookie: 'new', 'user-agent': 'NewUA' }]

    const result = buildDefaultOptionsFromCurl(form, headers)
    expect(result.cookie).toBe('existing')
    expect(result.userAgent).toBe('MyUA')
  })

  it('returns form unchanged when no headers provided', () => {
    const form = { cookie: '', referer: '' }
    const result = buildDefaultOptionsFromCurl(form, [])
    expect(result).toEqual(form)
  })
})
