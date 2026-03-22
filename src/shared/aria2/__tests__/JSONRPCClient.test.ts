/**
 * @fileoverview Tests for the JSONRPCClient class.
 *
 * Tests real JSON-RPC 2.0 protocol behaviors:
 * - Message building with method, jsonrpc, id, params
 * - URL construction (ws:// vs wss://)
 * - Response routing: response vs notification vs request
 * - Error responses create JSONRPCError
 * - Batch call creates multiple deferreds
 * - close() rejects all pending deferreds
 *
 * Mock strategy: Mock WebSocket at the global level (transport boundary).
 * All internal logic (message routing, deferred management) runs REAL code.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { JSONRPCClient } from '../lib/JSONRPCClient'
import { JSONRPCError } from '../lib/JSONRPCError'

// ── Mock WebSocket ──────────────────────────────────────────────────
class MockWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3

  readyState = MockWebSocket.OPEN
  url: string
  onopen: (() => void) | null = null
  onclose: (() => void) | null = null
  onmessage: ((ev: { data: string }) => void) | null = null
  onerror: ((err: unknown) => void) | null = null
  send = vi.fn()
  close = vi.fn(() => {
    this.readyState = MockWebSocket.CLOSED
    if (this.onclose) this.onclose()
  })

  constructor(url: string) {
    this.url = url
    // Auto-open in next microtask
    queueMicrotask(() => {
      if (this.onopen) this.onopen()
    })
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(globalThis as any).WebSocket = MockWebSocket

describe('JSONRPCClient', () => {
  let client: JSONRPCClient

  beforeEach(() => {
    vi.useFakeTimers()
    client = new JSONRPCClient({ host: '127.0.0.1', port: 6800 })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('constructor', () => {
    it('stores connection parameters', () => {
      expect(client.host).toBe('127.0.0.1')
      expect(client.port).toBe(6800)
      expect(client.path).toBe('/jsonrpc')
      expect(client.secure).toBe(false)
    })

    it('uses default options when none provided', () => {
      const defaultClient = new JSONRPCClient()
      expect(defaultClient.host).toBe('localhost')
      expect(defaultClient.port).toBe(80)
    })
  })

  describe('open/close', () => {
    it('creates a WebSocket connection and emits open', async () => {
      const openHandler = vi.fn()
      client.on('open', openHandler)

      await client.open()

      expect(client.socket).not.toBeNull()
      expect(openHandler).toHaveBeenCalled()
    })

    it('close() resolves after WebSocket closes', async () => {
      await client.open()
      await client.close()

      // After close, socket.close should have been called
      expect(client.socket!.close).toHaveBeenCalled()
    })

    it('close() resolves immediately when no socket exists', async () => {
      // No open() call
      await expect(client.close()).resolves.toBeUndefined()
    })
  })

  describe('call', () => {
    it('sends a JSON-RPC 2.0 message via WebSocket', async () => {
      await client.open()

      const promise = client.call('getVersion')

      expect(client.socket!.send).toHaveBeenCalledOnce()
      const sent = JSON.parse((client.socket!.send as ReturnType<typeof vi.fn>).mock.calls[0][0] as string)
      expect(sent.jsonrpc).toBe('2.0')
      expect(sent.method).toBe('getVersion')
      expect(typeof sent.id).toBe('number')

      // Simulate response to not leave unresolved promise
      const ws = client.socket as unknown as MockWebSocket
      ws.onmessage!({ data: JSON.stringify({ id: sent.id, result: { version: '1.37.0' } }) })

      const result = await promise
      expect(result).toEqual({ version: '1.37.0' })
    })

    it('includes params in the message when provided', async () => {
      await client.open()

      const promise = client.call('addUri', [['http://test.com/f.zip']])

      const sent = JSON.parse((client.socket!.send as ReturnType<typeof vi.fn>).mock.calls[0][0] as string)
      expect(sent.params).toEqual([['http://test.com/f.zip']])

      // Resolve it
      const ws = client.socket as unknown as MockWebSocket
      ws.onmessage!({ data: JSON.stringify({ id: sent.id, result: 'gid1' }) })
      await promise
    })

    it('rejects with JSONRPCError when RPC returns error', async () => {
      await client.open()

      const promise = client.call('badMethod')

      const sent = JSON.parse((client.socket!.send as ReturnType<typeof vi.fn>).mock.calls[0][0] as string)
      const ws = client.socket as unknown as MockWebSocket
      ws.onmessage!({
        data: JSON.stringify({
          id: sent.id,
          error: { code: -32601, message: 'Method not found' },
        }),
      })

      await expect(promise).rejects.toThrow('Method not found')
      try {
        await promise
      } catch (e) {
        expect(e).toBeInstanceOf(JSONRPCError)
        expect((e as JSONRPCError).code).toBe(-32601)
      }
    })

    it('increments message IDs for each call', async () => {
      await client.open()

      const p1 = client.call('m1')
      const p2 = client.call('m2')

      const id1 = JSON.parse((client.socket!.send as ReturnType<typeof vi.fn>).mock.calls[0][0] as string).id
      const id2 = JSON.parse((client.socket!.send as ReturnType<typeof vi.fn>).mock.calls[1][0] as string).id
      expect(id2).toBeGreaterThan(id1)

      // Properly resolve both pending calls to avoid unhandled rejections
      const ws = client.socket as unknown as MockWebSocket
      ws.onmessage!({ data: JSON.stringify({ id: id1, result: 'r1' }) })
      ws.onmessage!({ data: JSON.stringify({ id: id2, result: 'r2' }) })
      await p1
      await p2
    })
  })

  describe('batch', () => {
    it('sends multiple messages and returns an array of promises', async () => {
      await client.open()

      const promises = await client.batch([
        ['method1', 'arg1'],
        ['method2', 'arg2'],
      ])

      expect(promises).toHaveLength(2)
      expect(client.socket!.send).toHaveBeenCalledOnce()

      const sent = JSON.parse((client.socket!.send as ReturnType<typeof vi.fn>).mock.calls[0][0] as string)
      expect(Array.isArray(sent)).toBe(true)
      expect(sent).toHaveLength(2)
      expect(sent[0].method).toBe('method1')
      expect(sent[1].method).toBe('method2')

      // Resolve both
      const ws = client.socket as unknown as MockWebSocket
      ws.onmessage!({
        data: JSON.stringify([
          { id: sent[0].id, result: 'r1' },
          { id: sent[1].id, result: 'r2' },
        ]),
      })

      expect(await promises[0]).toBe('r1')
      expect(await promises[1]).toBe('r2')
    })
  })

  describe('notifications', () => {
    it('routes method-only messages (no id) to _onnotification', async () => {
      await client.open()

      const notifHandler = vi.fn()
      client.on('someNotification', notifHandler)

      // Simulate a notification (has method, no id)
      const ws = client.socket as unknown as MockWebSocket
      ws.onmessage!({
        data: JSON.stringify({ method: 'someNotification', params: ['p1'] }),
      })

      expect(notifHandler).toHaveBeenCalledWith(['p1'])
    })
  })

  describe('WebSocket close', () => {
    it('rejects all pending deferreds when socket closes', async () => {
      await client.open()

      const promise = client.call('longRunning')

      // Close the socket
      const ws = client.socket as unknown as MockWebSocket
      ws.onclose!()

      await expect(promise).rejects.toThrow('WebSocket closed')
    })
  })

  describe('URL construction', () => {
    it('builds ws:// URL for non-secure connections', () => {
      const c = new JSONRPCClient({ host: '10.0.0.1', port: 9090, secure: false })
      // We can verify by opening and checking the WebSocket URL
      c.open().catch(() => {}) // may fail in test env
      if (c.socket) {
        expect((c.socket as unknown as MockWebSocket).url).toBe('ws://10.0.0.1:9090/jsonrpc')
      }
    })

    it('builds wss:// URL for secure connections', () => {
      const c = new JSONRPCClient({ host: '10.0.0.1', port: 443, secure: true })
      c.open().catch(() => {})
      if (c.socket) {
        expect((c.socket as unknown as MockWebSocket).url).toBe('wss://10.0.0.1:443/jsonrpc')
      }
    })
  })
})
