/** @fileoverview Unit tests for the centralized logger utility with tauri-plugin-log bridging. */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ─── Mock @tauri-apps/plugin-log BEFORE importing logger ───────────────
// vi.mock is hoisted, so factories must not reference outer variables.
// We use vi.fn() inside the factory returning stable references.
vi.mock('@tauri-apps/plugin-log', () => ({
  error: vi.fn().mockResolvedValue(undefined),
  warn: vi.fn().mockResolvedValue(undefined),
  info: vi.fn().mockResolvedValue(undefined),
  debug: vi.fn().mockResolvedValue(undefined),
  trace: vi.fn().mockResolvedValue(undefined),
}))

import { logger } from '@shared/logger'
import * as tauriLog from '@tauri-apps/plugin-log'

// Cast to mock types for assertions
const mockTauriError = tauriLog.error as ReturnType<typeof vi.fn>
const mockTauriWarn = tauriLog.warn as ReturnType<typeof vi.fn>
const mockTauriInfo = tauriLog.info as ReturnType<typeof vi.fn>
const mockTauriDebug = tauriLog.debug as ReturnType<typeof vi.fn>

describe('logger (tauri-plugin-log bridging)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(console, 'debug').mockImplementation(() => {})
    mockTauriError.mockClear()
    mockTauriWarn.mockClear()
    mockTauriInfo.mockClear()
    mockTauriDebug.mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ─── error ───────────────────────────────────────────────

  describe('error', () => {
    it('bridges string error to tauri error with context prefix', () => {
      logger.error('TaskStore', 'connection lost')
      expect(mockTauriError).toHaveBeenCalledWith(expect.stringContaining('[TaskStore] connection lost'))
    })

    it('extracts message from Error instances for tauri bridge', () => {
      logger.error('Engine', new Error('process crashed'))
      expect(mockTauriError).toHaveBeenCalledWith(expect.stringContaining('[Engine] process crashed'))
    })

    it('sends stack trace as separate tauri error call for Error instances', () => {
      const err = new Error('test error')
      err.stack = 'Error: test error\n    at Test.run (test.ts:1:1)'
      logger.error('Ctx', err)
      // First call: formatted message, second call: stack trace
      expect(mockTauriError).toHaveBeenCalledTimes(2)
      expect(mockTauriError).toHaveBeenNthCalledWith(2, expect.stringContaining('Error: test error\n    at Test.run'))
    })

    it('does not send stack trace for non-Error values', () => {
      logger.error('Ctx', 42)
      expect(mockTauriError).toHaveBeenCalledTimes(1)
      expect(mockTauriError).toHaveBeenCalledWith(expect.stringContaining('42'))
    })

    it('mirrors error to console.error for DevTools visibility', () => {
      logger.error('Ctx', 'msg')
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('[Ctx] msg'))
    })

    it('converts non-Error objects to string via String()', () => {
      logger.error('Ctx', { code: 500 })
      expect(mockTauriError).toHaveBeenCalledWith(expect.stringContaining('[object Object]'))
    })

    it('does not throw when tauri bridge rejects', () => {
      mockTauriError.mockRejectedValue(new Error('IPC unavailable'))
      expect(() => logger.error('Ctx', 'msg')).not.toThrow()
    })
  })

  // ─── warn ────────────────────────────────────────────────

  describe('warn', () => {
    it('bridges warning to tauri warn with context prefix', () => {
      logger.warn('Polling', 'degraded to fallback')
      expect(mockTauriWarn).toHaveBeenCalledWith(expect.stringContaining('[Polling] degraded to fallback'))
    })

    it('mirrors warning to console.warn for DevTools visibility', () => {
      logger.warn('Ctx', 'msg')
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('[Ctx] msg'))
    })

    it('does not throw when tauri bridge rejects', () => {
      mockTauriWarn.mockRejectedValue(new Error('IPC unavailable'))
      expect(() => logger.warn('Ctx', 'msg')).not.toThrow()
    })
  })

  // ─── info ────────────────────────────────────────────────

  describe('info', () => {
    it('bridges info message to tauri info with context prefix', () => {
      logger.info('AppInit', 'engine started successfully')
      expect(mockTauriInfo).toHaveBeenCalledWith(expect.stringContaining('[AppInit] engine started successfully'))
    })

    it('does not output to console.info to avoid production noise', () => {
      logger.info('Ctx', 'msg')
      expect(console.info).not.toHaveBeenCalled()
    })

    it('does not throw when tauri bridge rejects', () => {
      mockTauriInfo.mockRejectedValue(new Error('IPC unavailable'))
      expect(() => logger.info('Ctx', 'msg')).not.toThrow()
    })
  })

  // ─── debug ───────────────────────────────────────────────

  describe('debug', () => {
    it('bridges debug message with serialized object data', () => {
      logger.debug('Parser', { key: 'value', count: 42 })
      expect(mockTauriDebug).toHaveBeenCalledWith(expect.stringContaining('[Parser]'))
      const msg = mockTauriDebug.mock.calls[0][0] as string
      expect(msg).toContain('"key":"value"')
      expect(msg).toContain('"count":42')
    })

    it('handles string data directly without JSON serialization', () => {
      logger.debug('Ctx', 'raw string data')
      expect(mockTauriDebug).toHaveBeenCalledWith(expect.stringContaining('[Ctx] raw string data'))
    })

    it('sends context-only message when data is undefined', () => {
      logger.debug('EmptyCtx')
      expect(mockTauriDebug).toHaveBeenCalledWith(expect.stringContaining('[EmptyCtx]'))
    })

    it('handles Error data by extracting stack or message', () => {
      const err = new Error('parse failed')
      err.stack = 'Error: parse failed\n    at Parser.run'
      logger.debug('Ctx', err)
      const msg = mockTauriDebug.mock.calls[0][0] as string
      expect(msg).toContain('Error: parse failed')
    })

    it('does not output to console.debug to avoid production noise', () => {
      logger.debug('Ctx', 'data')
      expect(console.debug).not.toHaveBeenCalled()
    })

    it('does not throw when tauri bridge rejects', () => {
      mockTauriDebug.mockRejectedValue(new Error('IPC unavailable'))
      expect(() => logger.debug('Ctx', 'data')).not.toThrow()
    })
  })

  // ─── API contract ────────────────────────────────────────

  describe('API contract', () => {
    it('exports logger object with exactly four methods', () => {
      expect(typeof logger.error).toBe('function')
      expect(typeof logger.warn).toBe('function')
      expect(typeof logger.info).toBe('function')
      expect(typeof logger.debug).toBe('function')
    })

    it('error accepts (context: string, error: unknown) signature', () => {
      logger.error('ctx', 'string error')
      logger.error('ctx', new Error('error obj'))
      logger.error('ctx', 42)
      logger.error('ctx', null)
      logger.error('ctx', undefined)
      // Error obj produces 2 calls (message + stack), others produce 1 each
      expect(mockTauriError).toHaveBeenCalledTimes(6)
    })

    it('warn accepts (context: string, message: string) signature', () => {
      logger.warn('ctx', 'warning message')
      expect(mockTauriWarn).toHaveBeenCalledTimes(1)
    })

    it('info accepts (context: string, message: string) signature', () => {
      logger.info('ctx', 'info message')
      expect(mockTauriInfo).toHaveBeenCalledTimes(1)
    })

    it('debug accepts (context: string, data?: unknown) signature', () => {
      logger.debug('ctx')
      logger.debug('ctx', 'string')
      logger.debug('ctx', { obj: true })
      logger.debug('ctx', 42)
      expect(mockTauriDebug).toHaveBeenCalledTimes(4)
    })
  })
})
