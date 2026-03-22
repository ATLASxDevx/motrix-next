/**
 * @fileoverview Tests for the useAppMessage composable.
 *
 * Key behaviors under test:
 * - All four message types (success, error, warning, info) invoke Naive UI's message API
 * - Content is truncated via ellipsis when exceeding TOAST_MAX_LENGTH
 * - Duplicate messages within the dedup window are coalesced (destroy + rescheduled)
 * - Different content strings are tracked independently
 * - After the dedup timer expires, the same content can be shown again
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── Mock naive-ui's useMessage before importing the composable ──────
const destroyFn = vi.fn()
const mockMessageApi = {
  success: vi.fn(() => ({ destroy: destroyFn })),
  error: vi.fn(() => ({ destroy: destroyFn })),
  warning: vi.fn(() => ({ destroy: destroyFn })),
  info: vi.fn(() => ({ destroy: destroyFn })),
}

vi.mock('naive-ui', () => ({
  useMessage: () => mockMessageApi,
}))

import { useAppMessage } from '../useAppMessage'

describe('useAppMessage', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('delegates success/error/warning/info to the underlying message API', () => {
    const msg = useAppMessage()

    msg.success('done')
    expect(mockMessageApi.success).toHaveBeenCalledOnce()

    msg.error('fail')
    expect(mockMessageApi.error).toHaveBeenCalledOnce()

    msg.warning('caution')
    expect(mockMessageApi.warning).toHaveBeenCalledOnce()

    msg.info('note')
    expect(mockMessageApi.info).toHaveBeenCalledOnce()
  })

  it('truncates long content to TOAST_MAX_LENGTH (48 chars)', () => {
    const msg = useAppMessage()
    const longContent = 'A'.repeat(100)

    msg.info(longContent)

    const displayedContent = (mockMessageApi.info.mock.calls[0] as unknown as [string])[0]
    expect(displayedContent.length).toBeLessThanOrEqual(51) // 48 chars + "..."
    expect(displayedContent).toContain('...')
  })

  it('destroys and reschedules duplicate messages within the dedup window', () => {
    const msg = useAppMessage()

    msg.error('connection lost')
    expect(mockMessageApi.error).toHaveBeenCalledTimes(1)

    // Immediately trigger the same message again — should destroy the first
    msg.error('connection lost')
    expect(destroyFn).toHaveBeenCalledTimes(1)

    // After 80ms debounce, the replacement message is shown
    vi.advanceTimersByTime(80)
    expect(mockMessageApi.error).toHaveBeenCalledTimes(2)
  })

  it('does not interfere between different message contents', () => {
    const msg = useAppMessage()

    msg.error('error A')
    msg.error('error B')

    // Both should be shown independently — no dedup
    expect(mockMessageApi.error).toHaveBeenCalledTimes(2)
    expect(destroyFn).not.toHaveBeenCalled()
  })

  it('allows the same content again after the dedup timer expires', () => {
    const msg = useAppMessage()

    msg.info('hello')
    expect(mockMessageApi.info).toHaveBeenCalledTimes(1)

    // Advance past the MESSAGE_DURATION (3000ms) cleanup timer
    vi.advanceTimersByTime(4000)

    msg.info('hello')
    // Should not trigger dedup — shown fresh
    expect(mockMessageApi.info).toHaveBeenCalledTimes(2)
    expect(destroyFn).not.toHaveBeenCalled()
  })

  it('applies custom options (duration) from caller', () => {
    const msg = useAppMessage()

    msg.success('fast', { duration: 1000 })

    const options = (mockMessageApi.success.mock.calls[0] as unknown as [string, Record<string, unknown>])[1]
    expect(options.duration).toBe(1000)
    expect(options.closable).toBe(true)
    expect(options.keepAliveOnHover).toBe(true)
  })

  it('handles empty string content without crashing', () => {
    const msg = useAppMessage()
    expect(() => msg.info('')).not.toThrow()
    expect(mockMessageApi.info).toHaveBeenCalledOnce()
  })
})
