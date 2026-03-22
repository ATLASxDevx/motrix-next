/**
 * @fileoverview Tests for the JSONRPCError class.
 *
 * Tests that error properties are correctly assigned.
 */
import { describe, it, expect } from 'vitest'
import { JSONRPCError } from '../lib/JSONRPCError'

describe('JSONRPCError', () => {
  it('stores message, code, and data from the RPC error', () => {
    const err = new JSONRPCError({ message: 'not found', code: -32600, data: { extra: true } })

    expect(err.message).toBe('not found')
    expect(err.code).toBe(-32600)
    expect(err.data).toEqual({ extra: true })
    expect(err.name).toBe('JSONRPCError')
  })

  it('is an instance of Error', () => {
    const err = new JSONRPCError({ message: 'fail', code: 1 })
    expect(err).toBeInstanceOf(Error)
  })

  it('omits data when not provided', () => {
    const err = new JSONRPCError({ message: 'simple', code: 2 })
    expect(err.data).toBeUndefined()
  })
})
