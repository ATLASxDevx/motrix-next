/** @fileoverview Tests for file rename pattern utilities. */
import { describe, it, expect } from 'vitest'
import { getRuleString, buildRule, buildOuts } from '../rename'

describe('getRuleString', () => {
  it('extracts rule from parentheses', () => {
    expect(getRuleString('file_(01+1).txt')).toBe('01+1')
  })

  it('returns null for no parentheses', () => {
    expect(getRuleString('file.txt')).toBeNull()
  })

  it('handles empty parentheses', () => {
    expect(getRuleString('file_().txt')).toBe('')
  })
})

describe('buildRule', () => {
  it('builds rule with plus operator', () => {
    const rule = buildRule('01+1')
    expect(rule.init).toBe(1)
    expect(rule.step).toBe(1)
    expect(rule.len).toBe(2)
  })

  it('builds rule with minus operator', () => {
    const rule = buildRule('10-2')
    expect(rule.init).toBe(10)
    expect(rule.step).toBe(-2)
  })

  it('defaults to step 1 when no operator', () => {
    const rule = buildRule('5')
    expect(rule.init).toBe(1)
    expect(rule.step).toBe(1)
  })
})

describe('buildOuts', () => {
  it('returns empty array for empty uris', () => {
    expect(buildOuts([], 'file.txt')).toEqual([])
  })

  it('returns the out string for single URI', () => {
    expect(buildOuts(['http://a.com/f'], 'file.txt')).toEqual(['file.txt'])
  })

  it('builds numbered output filenames', () => {
    const uris = ['http://a.com/1', 'http://a.com/2', 'http://a.com/3']
    const result = buildOuts(uris, 'file_(01+1).txt')
    expect(result).toEqual(['file_01.txt', 'file_02.txt', 'file_03.txt'])
  })

  it('returns empty for multiple URIs without rule', () => {
    const uris = ['http://a.com/1', 'http://a.com/2']
    expect(buildOuts(uris, 'file.txt')).toEqual([])
  })

  it('handles decrement rule', () => {
    const uris = ['http://a.com/1', 'http://a.com/2']
    const result = buildOuts(uris, 'file_(10-1).txt')
    expect(result).toEqual(['file_10.txt', 'file_09.txt'])
  })
})
