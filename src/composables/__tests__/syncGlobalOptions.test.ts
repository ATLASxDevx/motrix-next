/**
 * @fileoverview Tests for syncGlobalOptions — the one-shot sync that pushes
 * user-configured system options to the running aria2 engine via changeGlobalOption.
 *
 * Test strategy:
 * - Mock changeGlobalOption to capture what keys are sent to aria2.
 * - Use real buildBasicSystemConfig / buildAdvancedSystemConfig to verify
 *   the key set is complete and correct (no mocking of the pure functions).
 * - Verify restart-only keys (ports, secret) are filtered out.
 * - Verify empty config does not error.
 * - Verify error in changeGlobalOption is propagated (caller decides to catch).
 *
 * HONESTY NOTE: This test file was written BEFORE syncGlobalOptions.ts exists.
 * All tests must FAIL on first run (RED phase).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mock aria2 API ──────────────────────────────────────────────────
const mockChangeGlobalOption = vi.fn().mockResolvedValue(undefined)
vi.mock('@/api/aria2', () => ({
  changeGlobalOption: (...args: unknown[]) => mockChangeGlobalOption(...args),
}))

// ── Mock logger (suppress output) ───────────────────────────────────
vi.mock('@shared/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

import { DEFAULT_APP_CONFIG } from '@shared/constants'
import type { AppConfig } from '@shared/types'
import { needRestartKeys } from '@shared/configKeys'

// Import will fail in RED phase — that's expected and correct.
// The test runner will report "Cannot find module" which counts as failure.
import { syncGlobalOptions } from '../syncGlobalOptions'

describe('syncGlobalOptions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls changeGlobalOption with split and max-connection-per-server from config', async () => {
    const config = { ...DEFAULT_APP_CONFIG } as AppConfig

    await syncGlobalOptions(config)

    expect(mockChangeGlobalOption).toHaveBeenCalledTimes(1)
    const calledWith = mockChangeGlobalOption.mock.calls[0][0] as Record<string, string>

    // These are the critical keys that caused the RPC bug
    expect(calledWith).toHaveProperty('split')
    expect(calledWith).toHaveProperty('max-connection-per-server')
    expect(calledWith['split']).toBe(String(DEFAULT_APP_CONFIG.maxConnectionPerServer))
    expect(calledWith['max-connection-per-server']).toBe(String(DEFAULT_APP_CONFIG.maxConnectionPerServer))
  })

  it('includes user-agent from config', async () => {
    const config = {
      ...DEFAULT_APP_CONFIG,
      userAgent: 'Mozilla/5.0 Custom',
    } as AppConfig

    await syncGlobalOptions(config)

    const calledWith = mockChangeGlobalOption.mock.calls[0][0] as Record<string, string>
    expect(calledWith['user-agent']).toBe('Mozilla/5.0 Custom')
  })

  it('includes max-concurrent-downloads from config', async () => {
    const config = {
      ...DEFAULT_APP_CONFIG,
      maxConcurrentDownloads: 10,
    } as AppConfig

    await syncGlobalOptions(config)

    const calledWith = mockChangeGlobalOption.mock.calls[0][0] as Record<string, string>
    expect(calledWith['max-concurrent-downloads']).toBe('10')
  })

  it('includes seed-ratio and seed-time from config', async () => {
    const config = {
      ...DEFAULT_APP_CONFIG,
      seedRatio: 3,
      seedTime: 1440,
    } as AppConfig

    await syncGlobalOptions(config)

    const calledWith = mockChangeGlobalOption.mock.calls[0][0] as Record<string, string>
    expect(calledWith['seed-ratio']).toBe('3')
    expect(calledWith['seed-time']).toBe('1440')
  })

  it('filters out all restart-only keys (ports, secret)', async () => {
    const config = {
      ...DEFAULT_APP_CONFIG,
      rpcListenPort: 16800,
      rpcSecret: 'my-secret',
      listenPort: 21301,
      dhtListenPort: 26701,
    } as AppConfig

    await syncGlobalOptions(config)

    const calledWith = mockChangeGlobalOption.mock.calls[0][0] as Record<string, string>

    // None of the restart-only keys should be present
    for (const key of needRestartKeys) {
      expect(calledWith).not.toHaveProperty(key)
    }
  })

  it('filters out log-level (requires app relaunch, not engine restart)', async () => {
    const config = {
      ...DEFAULT_APP_CONFIG,
      logLevel: 'info',
    } as AppConfig

    await syncGlobalOptions(config)

    const calledWith = mockChangeGlobalOption.mock.calls[0][0] as Record<string, string>
    expect(calledWith).not.toHaveProperty('log-level')
  })

  it('propagates changeGlobalOption errors to caller', async () => {
    const config = { ...DEFAULT_APP_CONFIG } as AppConfig
    mockChangeGlobalOption.mockRejectedValueOnce(new Error('RPC connection refused'))

    await expect(syncGlobalOptions(config)).rejects.toThrow('RPC connection refused')
  })

  it('syncs custom split value, not just defaults', async () => {
    const config = {
      ...DEFAULT_APP_CONFIG,
      maxConnectionPerServer: 32,
      split: 32,
    } as AppConfig

    await syncGlobalOptions(config)

    const calledWith = mockChangeGlobalOption.mock.calls[0][0] as Record<string, string>
    expect(calledWith['split']).toBe('32')
    expect(calledWith['max-connection-per-server']).toBe('32')
  })

  it('includes download directory from config', async () => {
    const config = {
      ...DEFAULT_APP_CONFIG,
      dir: '/custom/download/path',
    } as AppConfig

    await syncGlobalOptions(config)

    const calledWith = mockChangeGlobalOption.mock.calls[0][0] as Record<string, string>
    expect(calledWith['dir']).toBe('/custom/download/path')
  })

  it('includes bt-force-encryption from config', async () => {
    const config = {
      ...DEFAULT_APP_CONFIG,
      btForceEncryption: true,
    } as AppConfig

    await syncGlobalOptions(config)

    const calledWith = mockChangeGlobalOption.mock.calls[0][0] as Record<string, string>
    expect(calledWith['bt-force-encryption']).toBe('true')
  })

  it('sends at least 10 keys to cover comprehensive system config', async () => {
    const config = { ...DEFAULT_APP_CONFIG } as AppConfig

    await syncGlobalOptions(config)

    const calledWith = mockChangeGlobalOption.mock.calls[0][0] as Record<string, string>
    // Both basic and advanced system configs combined should have many keys
    expect(Object.keys(calledWith).length).toBeGreaterThanOrEqual(10)
  })
})
