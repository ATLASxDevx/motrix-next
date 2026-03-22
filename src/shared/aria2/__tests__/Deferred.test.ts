/**
 * @fileoverview Tests for the Deferred promise utility.
 *
 * Tests real resolve/reject/timeout behavior with fake timers.
 * No mocks — this is a pure promise+timer class.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Deferred } from '../lib/Deferred'

describe('Deferred', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('resolves with value when resolve() is called', async () => {
    const d = new Deferred(0) // no timeout
    d.resolve('hello' as never)

    const result = await d.promise
    expect(result).toBe('hello')
    expect(d.settled).toBe(true)
  })

  it('rejects with reason when reject() is called', async () => {
    const d = new Deferred(0)
    d.reject(new Error('fail'))

    await expect(d.promise).rejects.toThrow('fail')
    expect(d.settled).toBe(true)
  })

  it('times out after the specified duration', async () => {
    const onTimeout = vi.fn()
    const d = new Deferred(5000, onTimeout)

    // Advance past timeout
    vi.advanceTimersByTime(5001)

    await expect(d.promise).rejects.toThrow('RPC request timed out')
    expect(onTimeout).toHaveBeenCalledOnce()
    expect(d.settled).toBe(true)
  })

  it('does not timeout if resolved before deadline', async () => {
    const onTimeout = vi.fn()
    const d = new Deferred(5000, onTimeout)

    d.resolve('fast' as never)
    vi.advanceTimersByTime(6000)

    const result = await d.promise
    expect(result).toBe('fast')
    expect(onTimeout).not.toHaveBeenCalled()
  })

  it('ignores second resolve after being settled', async () => {
    const d = new Deferred(0)
    d.resolve('first' as never)
    d.resolve('second' as never) // should be ignored

    const result = await d.promise
    expect(result).toBe('first')
  })

  it('ignores reject after being settled by resolve', async () => {
    const d = new Deferred(0)
    d.resolve('ok' as never)
    d.reject(new Error('late'))

    const result = await d.promise
    expect(result).toBe('ok')
  })

  it('ignores resolve after being settled by reject', async () => {
    const d = new Deferred(0)
    d.reject(new Error('first'))
    d.resolve('late' as never)

    await expect(d.promise).rejects.toThrow('first')
  })

  it('calls onTimeout callback when timeout fires', async () => {
    const onTimeout = vi.fn()
    const d = new Deferred(1000, onTimeout)

    vi.advanceTimersByTime(1001)

    await expect(d.promise).rejects.toThrow('RPC request timed out')
    expect(onTimeout).toHaveBeenCalledOnce()
  })
})
