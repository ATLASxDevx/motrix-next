/** @fileoverview Unit tests for timing constants. */
import { describe, it, expect } from 'vitest'
import {
  TASK_POLLING_INTERVAL,
  STAT_BASE_INTERVAL,
  STAT_PER_TASK_INTERVAL,
  STAT_MIN_INTERVAL,
  STAT_MAX_INTERVAL,
  ADD_TASK_LOADING_DELAY,
  FILE_OP_TIMEOUT,
  ENGINE_RETRY_INTERVAL,
  ENGINE_MAX_RETRIES,
} from '@shared/timing'

describe('timing constants', () => {
  it('TASK_POLLING_INTERVAL is a positive number', () => {
    expect(TASK_POLLING_INTERVAL).toBeGreaterThan(0)
  })

  it('STAT_MIN_INTERVAL is less than STAT_MAX_INTERVAL', () => {
    expect(STAT_MIN_INTERVAL).toBeLessThan(STAT_MAX_INTERVAL)
  })

  it('STAT_BASE_INTERVAL is between min and max', () => {
    expect(STAT_BASE_INTERVAL).toBeGreaterThanOrEqual(STAT_MIN_INTERVAL)
    expect(STAT_BASE_INTERVAL).toBeLessThanOrEqual(STAT_MAX_INTERVAL)
  })

  it('ENGINE_MAX_RETRIES is a positive integer', () => {
    expect(ENGINE_MAX_RETRIES).toBeGreaterThan(0)
    expect(Number.isInteger(ENGINE_MAX_RETRIES)).toBe(true)
  })

  it('all constants are numbers', () => {
    const constants = [
      TASK_POLLING_INTERVAL,
      STAT_BASE_INTERVAL,
      STAT_PER_TASK_INTERVAL,
      STAT_MIN_INTERVAL,
      STAT_MAX_INTERVAL,
      ADD_TASK_LOADING_DELAY,
      FILE_OP_TIMEOUT,
      ENGINE_RETRY_INTERVAL,
      ENGINE_MAX_RETRIES,
    ]
    constants.forEach((c) => expect(typeof c).toBe('number'))
  })
})
