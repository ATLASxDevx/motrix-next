/**
 * @fileoverview Tests for the EventEmitter class.
 *
 * Tests real event registration, emission, removal, and chaining.
 * No mocks — this is a pure in-memory class with no dependencies.
 */
import { describe, it, expect, vi } from 'vitest'
import { EventEmitter } from '../lib/EventEmitter'

describe('EventEmitter', () => {
  it('calls registered listener when event is emitted', () => {
    const emitter = new EventEmitter()
    const handler = vi.fn()

    emitter.on('test', handler)
    emitter.emit('test', 'arg1', 42)

    expect(handler).toHaveBeenCalledWith('arg1', 42)
  })

  it('supports multiple listeners on the same event', () => {
    const emitter = new EventEmitter()
    const h1 = vi.fn()
    const h2 = vi.fn()

    emitter.on('data', h1)
    emitter.on('data', h2)
    emitter.emit('data', 'payload')

    expect(h1).toHaveBeenCalledWith('payload')
    expect(h2).toHaveBeenCalledWith('payload')
  })

  it('returns true when event has listeners, false otherwise', () => {
    const emitter = new EventEmitter()
    emitter.on('alive', vi.fn())

    expect(emitter.emit('alive')).toBe(true)
    expect(emitter.emit('noone')).toBe(false)
  })

  it('off() removes a specific listener', () => {
    const emitter = new EventEmitter()
    const handler = vi.fn()

    emitter.on('ev', handler)
    emitter.off('ev', handler)
    emitter.emit('ev')

    expect(handler).not.toHaveBeenCalled()
  })

  it('off() does not throw when event has no listeners', () => {
    const emitter = new EventEmitter()
    const handler = vi.fn()

    expect(() => emitter.off('nonexistent', handler)).not.toThrow()
  })

  it('removeAllListeners(event) clears only that event', () => {
    const emitter = new EventEmitter()
    const a = vi.fn()
    const b = vi.fn()

    emitter.on('a', a)
    emitter.on('b', b)
    emitter.removeAllListeners('a')

    emitter.emit('a')
    emitter.emit('b')

    expect(a).not.toHaveBeenCalled()
    expect(b).toHaveBeenCalled()
  })

  it('removeAllListeners() with no arg clears all events', () => {
    const emitter = new EventEmitter()
    const a = vi.fn()
    const b = vi.fn()

    emitter.on('a', a)
    emitter.on('b', b)
    emitter.removeAllListeners()

    expect(emitter.emit('a')).toBe(false)
    expect(emitter.emit('b')).toBe(false)
  })

  it('addListener is an alias for on', () => {
    const emitter = new EventEmitter()
    const handler = vi.fn()

    emitter.addListener('ev', handler)
    emitter.emit('ev')

    expect(handler).toHaveBeenCalled()
  })

  it('removeListener is an alias for off', () => {
    const emitter = new EventEmitter()
    const handler = vi.fn()

    emitter.on('ev', handler)
    emitter.removeListener('ev', handler)
    emitter.emit('ev')

    expect(handler).not.toHaveBeenCalled()
  })

  it('on() returns this for chaining', () => {
    const emitter = new EventEmitter()
    const result = emitter.on('a', vi.fn()).on('b', vi.fn())
    expect(result).toBe(emitter)
  })
})
