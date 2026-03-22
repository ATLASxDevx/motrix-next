/** @fileoverview Tests for tracker URL parsing and row building utilities. */
import { describe, it, expect } from 'vitest'
import { parseTrackerProtocol, buildTrackerRows } from '../useTrackerProbe'

describe('parseTrackerProtocol', () => {
  it('detects http protocol', () => {
    expect(parseTrackerProtocol('http://tracker.example.com:8080/announce')).toBe('http')
  })

  it('detects https protocol', () => {
    expect(parseTrackerProtocol('https://tracker.example.com/announce')).toBe('https')
  })

  it('detects udp protocol', () => {
    expect(parseTrackerProtocol('udp://tracker.example.com:6969')).toBe('udp')
  })

  it('detects wss protocol', () => {
    expect(parseTrackerProtocol('wss://tracker.example.com/announce')).toBe('wss')
  })

  it('returns unknown for URL without scheme', () => {
    expect(parseTrackerProtocol('tracker.example.com:6969')).toBe('unknown')
  })

  it('returns unknown for empty string', () => {
    expect(parseTrackerProtocol('')).toBe('unknown')
  })
})

describe('buildTrackerRows', () => {
  it('returns empty array for undefined input', () => {
    expect(buildTrackerRows(undefined)).toEqual([])
  })

  it('returns empty array for empty announceList', () => {
    expect(buildTrackerRows([])).toEqual([])
  })

  it('builds rows from flat announceList (single tier)', () => {
    const list = [['http://tracker1.com/announce', 'udp://tracker2.com:6969']]
    const rows = buildTrackerRows(list)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ url: 'http://tracker1.com/announce', tier: 1, protocol: 'http' })
    expect(rows[1]).toMatchObject({ url: 'udp://tracker2.com:6969', tier: 1, protocol: 'udp' })
  })

  it('assigns correct tier indices for multi-tier list', () => {
    const list = [['http://tier1.com/announce'], ['udp://tier2.com:6969'], ['https://tier3.com/announce']]
    const rows = buildTrackerRows(list)
    expect(rows).toHaveLength(3)
    expect(rows[0].tier).toBe(1)
    expect(rows[1].tier).toBe(2)
    expect(rows[2].tier).toBe(3)
  })

  it('deduplicates identical URLs across tiers', () => {
    const list = [['http://tracker.com/announce', 'udp://other.com:6969'], ['http://tracker.com/announce']]
    const rows = buildTrackerRows(list)
    expect(rows).toHaveLength(2)
    // The duplicate should not appear
    const urls = rows.map((r) => r.url)
    expect(urls).toEqual(['http://tracker.com/announce', 'udp://other.com:6969'])
  })

  it('initializes all statuses as unknown', () => {
    const list = [['http://tracker.com/announce']]
    const rows = buildTrackerRows(list)
    expect(rows[0].status).toBe('unknown')
  })
})
