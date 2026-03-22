/**
 * @fileoverview Tests for the useTaskPolling composable.
 *
 * Key behaviors under test:
 * - Polling starts after mount and fetches task list from the task store
 * - Polling only fires when the engine is ready
 * - stop() clears the timer and prevents further ticks
 * - Lifecycle: automatically stops on unmount
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { defineComponent, nextTick } from 'vue'

// ── Mock aria2 engine readiness ─────────────────────────────────────
let engineReady = true
vi.mock('@/api/aria2', () => ({
  isEngineReady: () => engineReady,
}))

import { useTaskStore } from '@/stores/task'
import { useAppStore } from '@/stores/app'
import { useTaskPolling } from '../useTaskPolling'

/** Helper component to exercise the composable within a Vue lifecycle. */
function createWrapper() {
  const TestComponent = defineComponent({
    setup() {
      return useTaskPolling()
    },
    template: '<div />',
  })
  return mount(TestComponent)
}

describe('useTaskPolling', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
    engineReady = true
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts polling on mount and calls taskStore.fetchList', async () => {
    const taskStore = useTaskStore()
    taskStore.fetchList = vi.fn().mockResolvedValue(undefined)
    const appStore = useAppStore()
    appStore.interval = 1000

    const wrapper = createWrapper()
    await nextTick()

    // Advance past the first interval
    await vi.advanceTimersByTimeAsync(1000)

    expect(taskStore.fetchList).toHaveBeenCalled()
    wrapper.unmount()
  })

  it('does not call fetchList when engine is not ready', async () => {
    engineReady = false
    const taskStore = useTaskStore()
    taskStore.fetchList = vi.fn().mockResolvedValue(undefined)
    const appStore = useAppStore()
    appStore.interval = 500

    const wrapper = createWrapper()
    await nextTick()

    await vi.advanceTimersByTimeAsync(600)

    expect(taskStore.fetchList).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('stop() prevents further polling ticks', async () => {
    const taskStore = useTaskStore()
    taskStore.fetchList = vi.fn().mockResolvedValue(undefined)
    const appStore = useAppStore()
    appStore.interval = 500

    const wrapper = createWrapper()
    await nextTick()

    // Let first tick fire
    await vi.advanceTimersByTimeAsync(500)
    expect(taskStore.fetchList).toHaveBeenCalledTimes(1)

    // Stop polling
    const exposed = wrapper.vm as unknown as { stop: () => void }
    exposed.stop()

    // No more calls after stop
    await vi.advanceTimersByTimeAsync(2000)
    expect(taskStore.fetchList).toHaveBeenCalledTimes(1)

    wrapper.unmount()
  })

  it('automatically stops polling on unmount', async () => {
    const taskStore = useTaskStore()
    taskStore.fetchList = vi.fn().mockResolvedValue(undefined)
    const appStore = useAppStore()
    appStore.interval = 500

    const wrapper = createWrapper()
    await nextTick()

    await vi.advanceTimersByTimeAsync(500)
    expect(taskStore.fetchList).toHaveBeenCalledTimes(1)

    wrapper.unmount()

    // No more calls after unmount
    await vi.advanceTimersByTimeAsync(2000)
    expect(taskStore.fetchList).toHaveBeenCalledTimes(1)
  })

  it('continues polling after fetchList throws an error', async () => {
    const taskStore = useTaskStore()
    taskStore.fetchList = vi.fn().mockRejectedValue(new Error('network'))
    const appStore = useAppStore()
    appStore.interval = 500

    const wrapper = createWrapper()
    await nextTick()

    // First tick — error is caught silently
    await vi.advanceTimersByTimeAsync(500)
    expect(taskStore.fetchList).toHaveBeenCalledTimes(1)

    // Second tick — polling continues despite error
    await vi.advanceTimersByTimeAsync(500)
    expect(taskStore.fetchList).toHaveBeenCalledTimes(2)

    wrapper.unmount()
  })

  it('uses updated interval for the next tick', async () => {
    const taskStore = useTaskStore()
    taskStore.fetchList = vi.fn().mockResolvedValue(undefined)
    const appStore = useAppStore()
    appStore.interval = 500

    const wrapper = createWrapper()
    await nextTick()

    // t=500ms: first tick fires (count=1), schedules next tick at t=1000ms (interval=500 at schedule time)
    await vi.advanceTimersByTimeAsync(500)
    expect(taskStore.fetchList).toHaveBeenCalledTimes(1)

    // Change interval to 2000ms — affects next tick's setTimeout, not the one already scheduled
    appStore.interval = 2000

    // t=1000ms: second tick fires (was already scheduled with old interval=500)
    // Inside tick(), setTimeout(tick, 2000) now uses new interval → next at t=3000ms
    await vi.advanceTimersByTimeAsync(500)
    expect(taskStore.fetchList).toHaveBeenCalledTimes(2)

    // t=2500ms: should NOT fire (next tick is at t=3000ms)
    await vi.advanceTimersByTimeAsync(1500)
    expect(taskStore.fetchList).toHaveBeenCalledTimes(2)

    // t=3000ms: third tick fires with new interval
    await vi.advanceTimersByTimeAsync(500)
    expect(taskStore.fetchList).toHaveBeenCalledTimes(3)

    wrapper.unmount()
  })

  it('chains multiple ticks correctly', async () => {
    const taskStore = useTaskStore()
    taskStore.fetchList = vi.fn().mockResolvedValue(undefined)
    const appStore = useAppStore()
    appStore.interval = 200

    const wrapper = createWrapper()
    await nextTick()

    // 5 ticks (200ms each = 1000ms)
    await vi.advanceTimersByTimeAsync(1000)
    expect(taskStore.fetchList).toHaveBeenCalledTimes(5)

    wrapper.unmount()
  })

  it('starts fetching when engine becomes ready mid-polling', async () => {
    engineReady = false
    const taskStore = useTaskStore()
    taskStore.fetchList = vi.fn().mockResolvedValue(undefined)
    const appStore = useAppStore()
    appStore.interval = 500

    const wrapper = createWrapper()
    await nextTick()

    // First tick — engine not ready, no fetch
    await vi.advanceTimersByTimeAsync(500)
    expect(taskStore.fetchList).not.toHaveBeenCalled()

    // Engine becomes ready
    engineReady = true

    // Second tick — should fetch
    await vi.advanceTimersByTimeAsync(500)
    expect(taskStore.fetchList).toHaveBeenCalledTimes(1)

    wrapper.unmount()
  })
})
