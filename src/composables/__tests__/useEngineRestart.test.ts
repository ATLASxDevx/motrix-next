/**
 * @fileoverview Tests for the useEngineRestart composable.
 *
 * Verifies the concurrency guard that prevents multiple simultaneous engine
 * restarts — the root cause of orphaned aria2c processes.
 *
 * HONESTY NOTE: These tests use real async concurrency to prove the guard
 * works under pressure.  No mocks of the module under test.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { nextTick } from 'vue'

// Mock Tauri invoke — returns a controllable promise
const mockInvoke = vi.fn()
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args: unknown[]) => mockInvoke(...args) }))

// Mock reconnectClient
const mockReconnect = vi.fn()
vi.mock('@/api/aria2', () => ({
  reconnectClient: (...args: unknown[]) => mockReconnect(...args),
  setEngineReady: vi.fn(),
}))

// Mock app store
const mockAppStore = { engineReady: true, engineInitializing: false }
vi.mock('@/stores/app', () => ({
  useAppStore: () => mockAppStore,
}))

import { useEngineRestart } from '@/composables/useEngineRestart'

describe('useEngineRestart', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAppStore.engineReady = true
    mockAppStore.engineInitializing = false
    // By default, invoke and reconnect succeed immediately
    mockInvoke.mockResolvedValue(undefined)
    mockReconnect.mockResolvedValue(undefined)
  })

  it('exposes isRestarting ref that starts as false', () => {
    const { isRestarting } = useEngineRestart()
    expect(isRestarting.value).toBe(false)
  })

  it('sets isRestarting to true during restart', async () => {
    // Make invoke hang so we can observe the in-progress state
    let resolveInvoke!: () => void
    mockInvoke.mockReturnValue(
      new Promise<void>((r) => {
        resolveInvoke = r
      }),
    )

    const { restartEngine, isRestarting } = useEngineRestart()
    const promise = restartEngine({ port: 16800, secret: 'test' })

    await nextTick()
    expect(isRestarting.value).toBe(true)

    resolveInvoke()
    await promise
    expect(isRestarting.value).toBe(false)
  })

  it('prevents concurrent restarts — second call returns false', async () => {
    let resolveInvoke!: () => void
    mockInvoke.mockReturnValue(
      new Promise<void>((r) => {
        resolveInvoke = r
      }),
    )

    const { restartEngine } = useEngineRestart()

    // First call starts restart
    const first = restartEngine({ port: 16800, secret: 'test' })

    await nextTick()

    // Second call while first is in-flight should be rejected
    const secondResult = await restartEngine({ port: 16800, secret: 'test' })
    expect(secondResult).toBe(false)

    // Only ONE invoke call should have been made
    expect(mockInvoke).toHaveBeenCalledTimes(1)

    resolveInvoke()
    await first
  })

  it('resets isRestarting after error (no permanent lock)', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('engine crash'))

    const { restartEngine, isRestarting } = useEngineRestart()
    await restartEngine({ port: 16800, secret: 'test' })

    // Guard must be released even after failure
    expect(isRestarting.value).toBe(false)
  })

  it('allows restart after a previous one completes', async () => {
    const { restartEngine, isRestarting } = useEngineRestart()

    // First restart succeeds
    await restartEngine({ port: 16800, secret: 'test' })
    expect(isRestarting.value).toBe(false)

    // Second restart should also be allowed
    const result = await restartEngine({ port: 16800, secret: 'test' })
    expect(result).not.toBe(false)
    expect(mockInvoke).toHaveBeenCalledTimes(2)
  })

  it('calls restart_engine_command via invoke', async () => {
    const { restartEngine } = useEngineRestart()
    await restartEngine({ port: 16800, secret: 'abc' })
    expect(mockInvoke).toHaveBeenCalledWith('restart_engine_command')
  })

  it('calls reconnectClient with correct port and secret', async () => {
    const { restartEngine } = useEngineRestart()
    await restartEngine({ port: 16800, secret: 'abc' })
    expect(mockReconnect).toHaveBeenCalledWith({ port: 16800, secret: 'abc' })
  })
})
