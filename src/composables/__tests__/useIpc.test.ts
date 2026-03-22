/**
 * @fileoverview Tests for the useIpc composable.
 *
 * Key behaviors under test:
 * - Each typed IPC wrapper delegates to the correct Tauri invoke command
 * - Arguments are forwarded correctly
 * - The generic `call` function passes args through to invoke
 * - The `on` function delegates to Tauri's listen and unwraps the event payload
 * - Errors from invoke propagate to the caller
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockInvoke = vi.fn()
const mockListen = vi.fn()

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}))

vi.mock('@tauri-apps/api/event', () => ({
  listen: (...args: unknown[]) => mockListen(...args),
}))

import { useIpc } from '../useIpc'

describe('useIpc', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockInvoke.mockResolvedValue(undefined)
  })

  it('startEngine invokes the correct command', async () => {
    const ipc = useIpc()
    await ipc.startEngine()
    expect(mockInvoke).toHaveBeenCalledWith('start_engine_command', undefined)
  })

  it('stopEngine invokes the correct command', async () => {
    const ipc = useIpc()
    await ipc.stopEngine()
    expect(mockInvoke).toHaveBeenCalledWith('stop_engine_command', undefined)
  })

  it('restartEngine invokes the correct command', async () => {
    const ipc = useIpc()
    await ipc.restartEngine()
    expect(mockInvoke).toHaveBeenCalledWith('restart_engine_command', undefined)
  })

  it('factoryReset invokes the correct command', async () => {
    const ipc = useIpc()
    await ipc.factoryReset()
    expect(mockInvoke).toHaveBeenCalledWith('factory_reset', undefined)
  })

  it('getAppConfig invokes and returns the result', async () => {
    const fakeConfig = { theme: 'dark', locale: 'en-US' }
    mockInvoke.mockResolvedValueOnce(fakeConfig)

    const ipc = useIpc()
    const result = await ipc.getAppConfig()

    expect(mockInvoke).toHaveBeenCalledWith('get_app_config', undefined)
    expect(result).toEqual(fakeConfig)
  })

  it('savePreference forwards config as args', async () => {
    const ipc = useIpc()
    const config = { theme: 'light' as const }

    await ipc.savePreference(config)

    expect(mockInvoke).toHaveBeenCalledWith('save_preference', { config })
  })

  it('saveSystemConfig forwards config as args', async () => {
    const ipc = useIpc()
    const config = { 'max-concurrent-downloads': '5' }

    await ipc.saveSystemConfig(config)

    expect(mockInvoke).toHaveBeenCalledWith('save_system_config', { config })
  })

  it('call passes generic command and args through to invoke', async () => {
    mockInvoke.mockResolvedValueOnce(42)

    const ipc = useIpc()
    const result = await ipc.call<number>('custom_command', { key: 'val' })

    expect(mockInvoke).toHaveBeenCalledWith('custom_command', { key: 'val' })
    expect(result).toBe(42)
  })

  it('propagates invoke errors to the caller', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('IPC fail'))

    const ipc = useIpc()
    await expect(ipc.startEngine()).rejects.toThrow('IPC fail')
  })

  it('on delegates to listen and unwraps the event payload', async () => {
    const unlisten = vi.fn()
    let capturedHandler: ((e: { payload: string }) => void) | null = null

    mockListen.mockImplementation((_event: string, handler: (e: { payload: string }) => void) => {
      capturedHandler = handler
      return Promise.resolve(unlisten)
    })

    const ipc = useIpc()
    const handler = vi.fn()

    const unlistenFn = await ipc.on<string>('test-event', handler)

    expect(mockListen).toHaveBeenCalledWith('test-event', expect.any(Function))

    // Simulate event emission
    capturedHandler!({ payload: 'hello' })
    expect(handler).toHaveBeenCalledWith('hello')

    // Unlisten returns the cleanup function
    expect(unlistenFn).toBe(unlisten)
  })

  it('getSystemConfig invokes and returns the result', async () => {
    const fakeSysConfig = { 'max-concurrent-downloads': '5', dir: '/dl' }
    mockInvoke.mockResolvedValueOnce(fakeSysConfig)

    const ipc = useIpc()
    const result = await ipc.getSystemConfig()

    expect(mockInvoke).toHaveBeenCalledWith('get_system_config', undefined)
    expect(result).toEqual(fakeSysConfig)
  })

  it('preserves error type from invoke rejection', async () => {
    const ipcError = { code: 'ENGINE_NOT_RUNNING', message: 'engine offline' }
    mockInvoke.mockRejectedValueOnce(ipcError)

    const ipc = useIpc()
    try {
      await ipc.getAppConfig()
      expect.unreachable('should have thrown')
    } catch (err) {
      // Verify the raw Tauri error object is propagated, not wrapped
      expect(err).toEqual(ipcError)
    }
  })
})
