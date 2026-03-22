/** @fileoverview Tests for config utilities. */
import { describe, it, expect } from 'vitest'
import {
  changeKeysCase,
  changeKeysToCamelCase,
  changeKeysToKebabCase,
  validateNumber,
  fixValue,
  separateConfig,
  diffConfig,
  checkIsNeedRestart,
  checkIsNeedRun,
  buildRpcUrl,
  formatOptionsForEngine,
  parseHeader,
  filterHotReloadableKeys,
} from '../config'

describe('changeKeysToCamelCase', () => {
  it('converts kebab-case keys to camelCase', () => {
    expect(changeKeysToCamelCase({ 'max-speed': 100 })).toEqual({ maxSpeed: 100 })
  })
  it('returns empty for empty object', () => {
    expect(changeKeysToCamelCase({})).toEqual({})
  })
  it('returns empty for default parameter', () => {
    expect(changeKeysToCamelCase()).toEqual({})
  })
})

describe('changeKeysToKebabCase', () => {
  it('converts camelCase keys to kebab-case', () => {
    expect(changeKeysToKebabCase({ maxSpeed: 100 })).toEqual({ 'max-speed': 100 })
  })
})

describe('changeKeysCase', () => {
  it('returns empty when converter is not a function', () => {
    expect(changeKeysCase({ a: 1 }, null as unknown as (s: string) => string)).toEqual({})
  })
})

describe('validateNumber', () => {
  it('validates numbers', () => {
    expect(validateNumber(42)).toBe(true)
    expect(validateNumber(3.14)).toBe(true)
  })
  it('rejects non-numbers', () => {
    expect(validateNumber('abc')).toBe(false)
    expect(validateNumber(NaN)).toBe(false)
    expect(validateNumber(Infinity)).toBe(false)
  })
})

describe('fixValue', () => {
  it('converts string booleans and numbers', () => {
    const result = fixValue({ a: 'true', b: 'false', c: '42', d: 'text' })
    expect(result).toEqual({ a: true, b: false, c: '42', d: 'text' })
  })
  it('passes through real numbers unchanged', () => {
    const result = fixValue({ n: 42, f: 3.14 })
    expect(result).toEqual({ n: 42, f: 3.14 })
  })
  it('returns empty for empty object', () => {
    expect(fixValue({})).toEqual({})
  })
})

describe('separateConfig', () => {
  it('separates user, system, and other keys', () => {
    const result = separateConfig({ theme: 'dark', dir: '/tmp', unknownKey: 'val' })
    expect(result.user).toHaveProperty('theme')
    expect(result.system).toHaveProperty('dir')
    expect(result.others).toHaveProperty('unknownKey')
  })
})

describe('diffConfig', () => {
  it('returns only changed keys', () => {
    const result = diffConfig({ a: 1, b: 2 }, { a: 1, b: 3 })
    expect(result).toEqual({ b: 3 })
  })
  it('returns empty for identical configs', () => {
    const result = diffConfig({ a: 1 }, { a: 1 })
    expect(result).toEqual({})
  })
  it('diffs arrays via JSON.stringify', () => {
    const result = diffConfig({ tags: ['a', 'b'] }, { tags: ['a', 'c'] })
    expect(result).toEqual({ tags: ['a', 'c'] })
  })
  it('returns empty for identical arrays', () => {
    const result = diffConfig({ tags: ['a', 'b'] }, { tags: ['a', 'b'] })
    expect(result).toEqual({})
  })
  it('diffs nested objects via JSON.stringify', () => {
    const result = diffConfig({ proxy: { host: 'a' } }, { proxy: { host: 'b' } })
    expect(result).toEqual({ proxy: { host: 'b' } })
  })

  it('treats coerce-equal primitives as unchanged (string "21301" vs number 21301)', () => {
    const result = diffConfig(
      { listenPort: '21301', dhtListenPort: '26701' },
      { listenPort: 21301, dhtListenPort: 26701 },
    )
    expect(result).toEqual({})
  })

  it('still detects genuinely different values across types', () => {
    const result = diffConfig({ listenPort: '21301' }, { listenPort: 21302 })
    expect(result).toEqual({ listenPort: 21302 })
  })
})

describe('checkIsNeedRestart', () => {
  it('returns false for empty changes', () => {
    expect(checkIsNeedRestart({})).toBe(false)
  })
  it('returns true for rpcListenPort', () => {
    expect(checkIsNeedRestart({ rpcListenPort: 6800 })).toBe(true)
  })
  it('returns true for rpcSecret', () => {
    expect(checkIsNeedRestart({ rpcSecret: 'new-secret-value' })).toBe(true)
  })
  it('returns true for listenPort (BT)', () => {
    expect(checkIsNeedRestart({ listenPort: 21302 })).toBe(true)
  })
  it('returns true for dhtListenPort', () => {
    expect(checkIsNeedRestart({ dhtListenPort: 26702 })).toBe(true)
  })
  it('returns false for non-restart keys', () => {
    expect(checkIsNeedRestart({ theme: 'dark' })).toBe(false)
  })
  it('detects restart key among multiple changes', () => {
    expect(checkIsNeedRestart({ theme: 'dark', rpcSecret: 'changed' })).toBe(true)
  })

  it('returns false when port values are same but types differ (real afterSave scenario)', () => {
    // Simulates the real bug: prevConfig stores ports as strings,
    // form uses numbers, but the actual values are identical.
    const changed = diffConfig(
      { listenPort: '21301', dhtListenPort: '26701', rpcListenPort: 16800, rpcSecret: 'abc' },
      { listenPort: 21301, dhtListenPort: 26701, rpcListenPort: 16800, rpcSecret: 'abc' },
    )
    expect(checkIsNeedRestart(changed)).toBe(false)
  })
})

describe('checkIsNeedRun', () => {
  it('returns false when disabled', () => {
    expect(checkIsNeedRun(false, 0, 1000)).toBe(false)
  })
  it('returns true when interval exceeded', () => {
    expect(checkIsNeedRun(true, Date.now() - 10000, 5000)).toBe(true)
  })
  it('returns false when within interval', () => {
    expect(checkIsNeedRun(true, Date.now() - 1000, 5000)).toBe(false)
  })
})

describe('buildRpcUrl', () => {
  it('builds url without secret', () => {
    expect(buildRpcUrl({ port: 6800 })).toContain(':6800/jsonrpc')
  })
  it('builds url with secret', () => {
    const result = buildRpcUrl({ port: 6800, secret: 'abc' })
    expect(result).toContain('token:abc@')
  })
})

describe('formatOptionsForEngine', () => {
  it('converts keys to kebab-case', () => {
    const result = formatOptionsForEngine({ maxSpeed: '100' })
    expect(result).toHaveProperty('max-speed')
  })
  it('joins arrays with newline', () => {
    const result = formatOptionsForEngine({ trackerSource: ['a', 'b'] })
    expect(result['tracker-source']).toBe('a\nb')
  })
  it('skips null and undefined values', () => {
    const result = formatOptionsForEngine({ a: undefined, b: null })
    expect(Object.keys(result)).toHaveLength(0)
  })

  it('forwards empty-string values (aria2 uses them to clear options like all-proxy)', () => {
    // Verified in aria2 source: HttpProxyOptionHandler::parseArg (OptionHandlerImpl.cc:504)
    // accepts empty string to clear the proxy. Filtering '' prevents proxy disable.
    const result = formatOptionsForEngine({ allProxy: '', noProxy: '' })
    expect(result['all-proxy']).toBe('')
    expect(result['no-proxy']).toBe('')
  })
  it('keeps numeric 0 value (converted to string)', () => {
    const result = formatOptionsForEngine({ seedTime: 0 })
    expect(result['seed-time']).toBe('0')
  })
  it('converts boolean to string', () => {
    const result = formatOptionsForEngine({ checkIntegrity: true })
    expect(result['check-integrity']).toBe('true')
  })
})

describe('parseHeader', () => {
  it('parses header string', () => {
    const result = parseHeader('Content-Type: text/html')
    expect(result.contentType).toBe('text/html')
  })
  it('returns empty for empty string', () => {
    expect(parseHeader('')).toEqual({})
  })
  it('parses multiple headers separated by newlines', () => {
    const result = parseHeader('Content-Type: text/html\nAuthorization: Bearer abc')
    expect(result.contentType).toBe('text/html')
    expect(result.authorization).toBe('Bearer abc')
  })
  it('handles header value with colon', () => {
    const result = parseHeader('Accept: text/html; charset=utf-8')
    expect(result.accept).toBe('text/html; charset=utf-8')
  })
  it('returns empty for whitespace-only string', () => {
    expect(parseHeader('   ')).toEqual({})
  })
})

describe('filterHotReloadableKeys', () => {
  it('passes through hot-reloadable keys unchanged', () => {
    const config = {
      'max-concurrent-downloads': '10',
      'max-connection-per-server': '16',
      'max-overall-download-limit': '0',
      dir: '/downloads',
    }
    expect(filterHotReloadableKeys(config)).toEqual(config)
  })

  it('strips restart-required keys (ports + secret)', () => {
    const config = {
      'rpc-listen-port': '16800',
      'rpc-secret': 'abc',
      'listen-port': '21301',
      'dht-listen-port': '26701',
    }
    expect(filterHotReloadableKeys(config)).toEqual({})
  })

  it('strips aria2 changeGlobalOption exclusions', () => {
    const config = {
      checksum: 'sha-256=abc',
      'index-out': '0=file.txt',
      out: 'output.zip',
      pause: 'true',
      'select-file': '1-3',
      'rpc-save-upload-metadata': 'true',
    }
    expect(filterHotReloadableKeys(config)).toEqual({})
  })

  it('strips log-level (needs app relaunch, not engine restart)', () => {
    expect(filterHotReloadableKeys({ 'log-level': 'debug' })).toEqual({})
  })

  it('returns empty for empty input', () => {
    expect(filterHotReloadableKeys({})).toEqual({})
  })

  it('separates hot-reloadable from non-hot-reloadable in mixed input', () => {
    const config = {
      'max-concurrent-downloads': '8',
      'rpc-listen-port': '16800',
      'bt-tracker': 'udp://t.example.org:6969',
      'rpc-secret': 'secret',
      'user-agent': 'Motrix/3.4.1',
    }
    expect(filterHotReloadableKeys(config)).toEqual({
      'max-concurrent-downloads': '8',
      'bt-tracker': 'udp://t.example.org:6969',
      'user-agent': 'Motrix/3.4.1',
    })
  })
})
