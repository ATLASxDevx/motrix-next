/**
 * @fileoverview Unit tests for the extracted task notification scanner.
 *
 * createTaskNotifier encapsulates the duplicate-detection logic that was
 * previously inlined inside TaskStore.fetchList.  It must:
 *   1. Suppress callbacks during the initial scan (startup).
 *   2. Fire onTaskError for newly errored tasks on subsequent polls.
 *   3. Fire onTaskComplete for newly completed tasks on subsequent polls.
 *   4. Never re-fire for an already-seen GID.
 *   5. Ignore tasks with errorCode '0' (not a real error).
 */
import { describe, it, expect, vi } from 'vitest'
import { createTaskNotifier } from '../taskNotifications'
import type { Aria2Task, TaskStatus } from '@shared/types'

const makeMockTask = (gid: string, status: TaskStatus = 'active', extra: Partial<Aria2Task> = {}): Aria2Task => ({
  gid,
  status,
  totalLength: '1000',
  completedLength: '500',
  uploadLength: '0',
  downloadSpeed: '1000',
  uploadSpeed: '0',
  connections: '1',
  numSeeders: '0',
  dir: '/tmp',
  files: [],
  bittorrent: undefined,
  infoHash: undefined,
  errorCode: undefined,
  errorMessage: undefined,
  numPieces: undefined,
  pieceLength: undefined,
  followedBy: undefined,
  following: undefined,
  belongsTo: undefined,
  ...extra,
})

describe('createTaskNotifier', () => {
  // ── Construction ──────────────────────────────────────────

  it('returns an object with scanTasks and reset methods', () => {
    const notifier = createTaskNotifier()
    expect(notifier).toHaveProperty('scanTasks')
    expect(notifier).toHaveProperty('reset')
    expect(typeof notifier.scanTasks).toBe('function')
    expect(typeof notifier.reset).toBe('function')
  })

  // ── Initial scan suppression ──────────────────────────────

  it('does NOT fire callbacks during the initial (first) scan', () => {
    const onError = vi.fn()
    const onComplete = vi.fn()
    const notifier = createTaskNotifier()

    const tasks = [
      makeMockTask('e1', 'error', { errorCode: '3', errorMessage: 'Not found' }),
      makeMockTask('c1', 'complete'),
    ]
    notifier.scanTasks(tasks, { onTaskError: onError, onTaskComplete: onComplete })

    expect(onError).not.toHaveBeenCalled()
    expect(onComplete).not.toHaveBeenCalled()
  })

  // ── Error detection ───────────────────────────────────────

  it('fires onTaskError for a newly errored task on the SECOND scan', () => {
    const onError = vi.fn()
    const notifier = createTaskNotifier()

    // First scan: seed existing state
    notifier.scanTasks([], { onTaskError: onError })

    // Second scan: new error task appears
    const tasks = [makeMockTask('e1', 'error', { errorCode: '6', errorMessage: 'Network' })]
    notifier.scanTasks(tasks, { onTaskError: onError })

    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ gid: 'e1', errorCode: '6' }))
  })

  it('ignores error tasks with errorCode 0 (not a real error)', () => {
    const onError = vi.fn()
    const notifier = createTaskNotifier()

    // Initial scan
    notifier.scanTasks([], { onTaskError: onError })

    // errorCode '0' = success, not a real error
    const tasks = [makeMockTask('e1', 'error', { errorCode: '0' })]
    notifier.scanTasks(tasks, { onTaskError: onError })

    expect(onError).not.toHaveBeenCalled()
  })

  it('ignores error tasks without errorCode', () => {
    const onError = vi.fn()
    const notifier = createTaskNotifier()

    notifier.scanTasks([], { onTaskError: onError })
    const tasks = [makeMockTask('e1', 'error')]
    notifier.scanTasks(tasks, { onTaskError: onError })

    expect(onError).not.toHaveBeenCalled()
  })

  // ── Completion detection ──────────────────────────────────

  it('fires onTaskComplete for a newly completed task on the SECOND scan', () => {
    const onComplete = vi.fn()
    const notifier = createTaskNotifier()

    notifier.scanTasks([], { onTaskComplete: onComplete })

    const tasks = [makeMockTask('c1', 'complete')]
    notifier.scanTasks(tasks, { onTaskComplete: onComplete })

    expect(onComplete).toHaveBeenCalledTimes(1)
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ gid: 'c1' }))
  })

  // ── Deduplication ─────────────────────────────────────────

  it('never re-fires for an already-seen GID across multiple scans', () => {
    const onError = vi.fn()
    const onComplete = vi.fn()
    const notifier = createTaskNotifier()

    // Initial scan
    notifier.scanTasks([], { onTaskError: onError, onTaskComplete: onComplete })

    const tasks = [makeMockTask('e1', 'error', { errorCode: '3' }), makeMockTask('c1', 'complete')]

    // Second scan — fires
    notifier.scanTasks(tasks, { onTaskError: onError, onTaskComplete: onComplete })
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onComplete).toHaveBeenCalledTimes(1)

    // Third scan — same tasks, no re-fire
    notifier.scanTasks(tasks, { onTaskError: onError, onTaskComplete: onComplete })
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it('fires for new GIDs even when existing GIDs are still present', () => {
    const onComplete = vi.fn()
    const notifier = createTaskNotifier()

    notifier.scanTasks([], { onTaskComplete: onComplete })

    notifier.scanTasks([makeMockTask('c1', 'complete')], { onTaskComplete: onComplete })
    expect(onComplete).toHaveBeenCalledTimes(1)

    // c1 still there, c2 is new
    notifier.scanTasks([makeMockTask('c1', 'complete'), makeMockTask('c2', 'complete')], { onTaskComplete: onComplete })
    expect(onComplete).toHaveBeenCalledTimes(2)
    expect(onComplete).toHaveBeenLastCalledWith(expect.objectContaining({ gid: 'c2' }))
  })

  // ── Both callbacks simultaneously ─────────────────────────

  it('fires both onTaskError and onTaskComplete in the same scan', () => {
    const onError = vi.fn()
    const onComplete = vi.fn()
    const notifier = createTaskNotifier()

    notifier.scanTasks([], { onTaskError: onError, onTaskComplete: onComplete })

    const tasks = [makeMockTask('e1', 'error', { errorCode: '5' }), makeMockTask('c1', 'complete')]
    notifier.scanTasks(tasks, { onTaskError: onError, onTaskComplete: onComplete })

    expect(onError).toHaveBeenCalledTimes(1)
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  // ── Optional callbacks ────────────────────────────────────

  it('runs without error when callbacks are not provided', () => {
    const notifier = createTaskNotifier()

    notifier.scanTasks([], {})
    notifier.scanTasks([makeMockTask('c1', 'complete')], {})

    // No throw = pass
  })

  // ── Reset ─────────────────────────────────────────────────

  it('reset clears all seen GIDs and resets initial scan flag', () => {
    const onComplete = vi.fn()
    const notifier = createTaskNotifier()

    // Two scans: initial + one fire
    notifier.scanTasks([], { onTaskComplete: onComplete })
    notifier.scanTasks([makeMockTask('c1', 'complete')], { onTaskComplete: onComplete })
    expect(onComplete).toHaveBeenCalledTimes(1)

    // Reset: next scan becomes initial again → suppressed
    notifier.reset()
    notifier.scanTasks([makeMockTask('c1', 'complete')], { onTaskComplete: onComplete })
    expect(onComplete).toHaveBeenCalledTimes(1) // still 1, not 2

    // After reset initial scan, c1 fires again on next scan
    notifier.scanTasks([makeMockTask('c1', 'complete')], { onTaskComplete: onComplete })
    // c1 was re-seen in the post-reset initial scan, so it won't fire again
    expect(onComplete).toHaveBeenCalledTimes(1)

    // But a truly new GID will fire
    notifier.scanTasks([makeMockTask('c2', 'complete')], { onTaskComplete: onComplete })
    expect(onComplete).toHaveBeenCalledTimes(2)
  })
})
