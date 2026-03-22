/** @fileoverview Tests for runtime type guards validating aria2 RPC responses. */
import { describe, it, expect } from 'vitest'
import { isAria2Task, isAria2GlobalStat } from '../guards'

describe('isAria2Task', () => {
  const validTask = {
    gid: '1',
    status: 'active',
    totalLength: '100',
    completedLength: '50',
    uploadLength: '0',
    downloadSpeed: '10',
    uploadSpeed: '0',
    connections: '1',
    dir: '/tmp',
    files: [],
  }

  it('returns true for a valid minimal task object', () => {
    expect(isAria2Task(validTask)).toBe(true)
  })

  it('returns true for a task with optional BT fields', () => {
    expect(isAria2Task({ ...validTask, bittorrent: { info: { name: 'test' } }, infoHash: 'abc' })).toBe(true)
  })

  it('returns false when gid is missing', () => {
    const noGid = Object.fromEntries(Object.entries(validTask).filter(([k]) => k !== 'gid'))
    expect(isAria2Task(noGid)).toBe(false)
  })

  it('returns false when status is missing', () => {
    const noStatus = Object.fromEntries(Object.entries(validTask).filter(([k]) => k !== 'status'))
    expect(isAria2Task(noStatus)).toBe(false)
  })

  it('returns false when files is not an array', () => {
    expect(isAria2Task({ ...validTask, files: 'not-array' })).toBe(false)
  })

  it('returns false for null', () => {
    expect(isAria2Task(null)).toBe(false)
  })

  it('returns false for undefined', () => {
    expect(isAria2Task(undefined)).toBe(false)
  })

  it('returns false for primitive', () => {
    expect(isAria2Task('string')).toBe(false)
    expect(isAria2Task(42)).toBe(false)
  })

  it('returns false for empty object', () => {
    expect(isAria2Task({})).toBe(false)
  })
})

describe('isAria2GlobalStat', () => {
  const validStat = {
    downloadSpeed: '100',
    uploadSpeed: '50',
    numActive: '1',
    numWaiting: '0',
    numStopped: '2',
    numStoppedTotal: '5',
  }

  it('returns true for valid stat object', () => {
    expect(isAria2GlobalStat(validStat)).toBe(true)
  })

  it('returns false when downloadSpeed is missing', () => {
    const noSpeed = Object.fromEntries(Object.entries(validStat).filter(([k]) => k !== 'downloadSpeed'))
    expect(isAria2GlobalStat(noSpeed)).toBe(false)
  })

  it('returns false for empty object', () => {
    expect(isAria2GlobalStat({})).toBe(false)
  })

  it('returns false for null', () => {
    expect(isAria2GlobalStat(null)).toBe(false)
  })

  it('returns false for number values', () => {
    expect(isAria2GlobalStat({ downloadSpeed: 100, uploadSpeed: 50 })).toBe(false)
  })
})
