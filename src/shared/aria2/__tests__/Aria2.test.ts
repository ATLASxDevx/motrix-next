/**
 * @fileoverview Tests for the Aria2 JSON-RPC client subclass.
 *
 * Tests REAL Aria2-specific behaviors:
 * - Method prefixing (aria2.xxx)
 * - Secret token injection (token:xxx)
 * - Notification unprefixing
 * - Multicall format with prefix+secret
 *
 * Uses a minimal subclass test strategy: mock the PARENT class's transport
 * but let the Aria2 class's own logic (prefix, addSecret, multicall format) run.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Aria2 } from '../lib/Aria2'

describe('Aria2', () => {
  let client: Aria2

  beforeEach(() => {
    client = new Aria2({ host: '127.0.0.1', port: 6800, secret: 'mysecret' })
  })

  describe('method prefixing', () => {
    it('prefixes user methods with "aria2."', async () => {
      // Spy on the parent's call to see what method is actually sent
      const superCall = vi
        .spyOn(Object.getPrototypeOf(Object.getPrototypeOf(client)), 'call')
        .mockResolvedValue('result')

      await client.call('getVersion')

      // The method should be prefixed to "aria2.getVersion"
      expect(superCall).toHaveBeenCalledWith(
        'aria2.getVersion',
        expect.arrayContaining([expect.stringContaining('token:')]),
      )

      superCall.mockRestore()
    })

    it('does not double-prefix methods already starting with "aria2."', async () => {
      const superCall = vi
        .spyOn(Object.getPrototypeOf(Object.getPrototypeOf(client)), 'call')
        .mockResolvedValue('result')

      await client.call('aria2.getVersion')

      expect(superCall).toHaveBeenCalledWith('aria2.getVersion', expect.any(Array))

      superCall.mockRestore()
    })

    it('does not prefix system. methods', async () => {
      const superCall = vi
        .spyOn(Object.getPrototypeOf(Object.getPrototypeOf(client)), 'call')
        .mockResolvedValue('result')

      await client.call('system.listMethods')

      expect(superCall).toHaveBeenCalledWith('system.listMethods', expect.any(Array))

      superCall.mockRestore()
    })
  })

  describe('secret injection', () => {
    it('prepends token:secret to call parameters', async () => {
      const superCall = vi
        .spyOn(Object.getPrototypeOf(Object.getPrototypeOf(client)), 'call')
        .mockResolvedValue('result')

      await client.call('getVersion')

      const params = superCall.mock.calls[0][1] as unknown[]
      expect(params[0]).toBe('token:mysecret')

      superCall.mockRestore()
    })

    it('appends user params after the secret token', async () => {
      const superCall = vi
        .spyOn(Object.getPrototypeOf(Object.getPrototypeOf(client)), 'call')
        .mockResolvedValue('result')

      await client.call('addUri', ['http://example.com/file.zip'], { dir: '/dl' })

      const params = superCall.mock.calls[0][1] as unknown[]
      expect(params[0]).toBe('token:mysecret')
      expect(params[1]).toEqual(['http://example.com/file.zip'])
      expect(params[2]).toEqual({ dir: '/dl' })

      superCall.mockRestore()
    })

    it('omits secret token when secret is empty', async () => {
      const noSecretClient = new Aria2({ secret: '' })
      const superCall = vi
        .spyOn(Object.getPrototypeOf(Object.getPrototypeOf(noSecretClient)), 'call')
        .mockResolvedValue('result')

      await noSecretClient.call('getVersion')

      const params = superCall.mock.calls[0][1] as unknown[]
      expect(params).not.toContain('token:')
      expect(params.length).toBe(0)

      superCall.mockRestore()
    })
  })

  describe('multicall', () => {
    it('formats multicall with prefixed method names and secret-injected params', async () => {
      const superCall = vi
        .spyOn(Object.getPrototypeOf(Object.getPrototypeOf(client)), 'call')
        .mockResolvedValue([[{ result: 'ok' }]])

      await client.multicall([
        ['pause', 'gid1'],
        ['unpause', 'gid2'],
      ])

      // Should call system.multicall with formatted request
      expect(superCall).toHaveBeenCalledWith('system.multicall', expect.any(Array))

      const multiArg = superCall.mock.calls[0][1] as unknown[]
      const calls = multiArg[0] as Array<{ methodName: string; params: unknown[] }>

      expect(calls[0].methodName).toBe('aria2.pause')
      expect(calls[0].params[0]).toBe('token:mysecret')
      expect(calls[0].params[1]).toBe('gid1')

      expect(calls[1].methodName).toBe('aria2.unpause')
      expect(calls[1].params[0]).toBe('token:mysecret')
      expect(calls[1].params[1]).toBe('gid2')

      superCall.mockRestore()
    })
  })

  describe('default options', () => {
    it('uses sensible defaults for host, port, and path', () => {
      const defaults = Aria2.defaultOptions
      expect(defaults.host).toBe('localhost')
      expect(defaults.path).toBe('/jsonrpc')
      expect(typeof defaults.port).toBe('number')
    })
  })

  describe('notification handling', () => {
    it('unprefixes aria2. events and emits them', () => {
      const handler = vi.fn()
      client.on('onDownloadStart', handler)

      // Simulate an incoming notification
      ;(client as unknown as { _onnotification: (n: unknown) => void })._onnotification({
        method: 'aria2.onDownloadStart',
        params: [{ gid: 'abc' }],
      })

      expect(handler).toHaveBeenCalledWith([{ gid: 'abc' }])
    })

    it('does not double-emit for non-aria2 methods (only super emits)', () => {
      const handler = vi.fn()
      client.on('listMethods', handler)
      ;(client as unknown as { _onnotification: (n: unknown) => void })._onnotification({
        method: 'listMethods',
        params: [],
      })

      // unprefix('listMethods') returns 'listMethods' (no aria2. prefix).
      // Since event === method, the Aria2's custom emit is SKIPPED,
      // but super._onnotification still emits the raw method event.
      // So handler is called exactly once (from super), not twice.
      expect(handler).toHaveBeenCalledTimes(1)
    })

    it('ignores notifications without a method', () => {
      expect(() => {
        ;(client as unknown as { _onnotification: (n: unknown) => void })._onnotification({
          params: [],
        })
      }).not.toThrow()
    })
  })

  describe('batch', () => {
    it('prefixes and injects secret for each call in a batch', async () => {
      const superBatch = vi
        .spyOn(Object.getPrototypeOf(Object.getPrototypeOf(client)), 'batch')
        .mockResolvedValue([Promise.resolve('ok')])

      await client.batch([
        ['addUri', ['http://a.com']],
        ['pause', 'gid1'],
      ])

      const calls = superBatch.mock.calls[0][0] as [string, ...unknown[]][]
      expect(calls[0][0]).toBe('aria2.addUri')
      expect(calls[0][1]).toBe('token:mysecret')
      expect(calls[1][0]).toBe('aria2.pause')
      expect(calls[1][1]).toBe('token:mysecret')

      superBatch.mockRestore()
    })
  })

  describe('listNotifications', () => {
    it('unprefixes the returned event names', async () => {
      const superCall = vi
        .spyOn(Object.getPrototypeOf(Object.getPrototypeOf(client)), 'call')
        .mockResolvedValue(['aria2.onDownloadStart', 'aria2.onDownloadComplete'])

      const result = await client.listNotifications()

      expect(result).toEqual(['onDownloadStart', 'onDownloadComplete'])
      superCall.mockRestore()
    })
  })

  describe('listMethods', () => {
    it('unprefixes the returned method names', async () => {
      const superCall = vi
        .spyOn(Object.getPrototypeOf(Object.getPrototypeOf(client)), 'call')
        .mockResolvedValue(['aria2.addUri', 'aria2.remove', 'system.listMethods'])

      const result = await client.listMethods()

      expect(result).toEqual(['addUri', 'remove', 'system.listMethods'])
      superCall.mockRestore()
    })
  })

  describe('edge cases', () => {
    it('call with only method name sends just the secret token', async () => {
      const superCall = vi.spyOn(Object.getPrototypeOf(Object.getPrototypeOf(client)), 'call').mockResolvedValue('ok')

      await client.call('getVersion')

      const params = superCall.mock.calls[0][1] as unknown[]
      expect(params).toEqual(['token:mysecret'])

      superCall.mockRestore()
    })

    it('call with multiple params preserves order after secret', async () => {
      const superCall = vi.spyOn(Object.getPrototypeOf(Object.getPrototypeOf(client)), 'call').mockResolvedValue('ok')

      await client.call('changeOption', 'gid1', { seedTime: '0' })

      const params = superCall.mock.calls[0][1] as unknown[]
      expect(params[0]).toBe('token:mysecret')
      expect(params[1]).toBe('gid1')
      expect(params[2]).toEqual({ seedTime: '0' })

      superCall.mockRestore()
    })

    it('no-secret client omits token entirely', async () => {
      const noSecretClient = new Aria2({ secret: '' })
      const superCall = vi
        .spyOn(Object.getPrototypeOf(Object.getPrototypeOf(noSecretClient)), 'call')
        .mockResolvedValue('ok')

      await noSecretClient.call('getVersion')

      const params = superCall.mock.calls[0][1] as unknown[]
      // No token should be present
      expect(params.every((p) => typeof p !== 'string' || !p.startsWith('token:'))).toBe(true)

      superCall.mockRestore()
    })
  })
})
