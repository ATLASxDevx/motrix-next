/** @fileoverview Config key conversion, diffing, validation, and engine option formatting. */
import { camelCase, isEmpty, isFunction, isNaN, isPlainObject, kebabCase, omitBy, pick, isArray } from 'lodash-es'
import { userKeys, systemKeys, needRestartKeys } from '@shared/configKeys'
import { ENGINE_RPC_HOST } from '@shared/constants'
import { splitTextRows } from './format'
import type { Aria2EngineOptions } from '@shared/types'

export const changeKeysCase = (
  obj: Record<string, unknown>,
  caseConverter: (s: string) => string,
): Record<string, unknown> => {
  const result: Record<string, unknown> = {}
  if (isEmpty(obj) || !isFunction(caseConverter)) return result
  for (const [k, value] of Object.entries(obj)) {
    result[caseConverter(k)] = value
  }
  return result
}

export const changeKeysToCamelCase = (obj: Record<string, unknown> = {}): Record<string, unknown> => {
  return changeKeysCase(obj, camelCase)
}

export const changeKeysToKebabCase = (obj: Record<string, unknown> = {}): Record<string, unknown> => {
  return changeKeysCase(obj, kebabCase)
}

export const validateNumber = (n: unknown): boolean => {
  return !isNaN(parseFloat(String(n))) && isFinite(Number(n)) && Number(n) === n
}

export const fixValue = (obj: Record<string, unknown> = {}): Record<string, unknown> => {
  const result: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v === 'true') result[k] = true
    else if (v === 'false') result[k] = false
    else if (validateNumber(v)) result[k] = Number(v)
    else result[k] = v
  }
  return result
}

export const separateConfig = (options: Record<string, unknown>) => {
  const user: Record<string, unknown> = {}
  const system: Record<string, unknown> = {}
  const others: Record<string, unknown> = {}

  for (const [k, v] of Object.entries(options)) {
    if (userKeys.indexOf(k) !== -1) user[k] = v
    else if (systemKeys.indexOf(k) !== -1) system[k] = v
    else others[k] = v
  }
  return { user, system, others }
}

export const diffConfig = (
  current: Record<string, unknown> = {},
  next: Record<string, unknown> = {},
): Record<string, unknown> => {
  const curr = pick(current, Object.keys(next))
  return omitBy(next, (val, key) => {
    if (isArray(val) || isPlainObject(val)) {
      return JSON.stringify(curr[key]) === JSON.stringify(val)
    }
    // Coerce-equal primitives (e.g. string "21301" == number 21301) are NOT
    // real changes.  This handles legacy config.json entries where port values
    // were stored as strings but the form produces numbers.

    if (curr[key] != val) return false
    return true
  })
}

export const parseHeader = (header = ''): Record<string, string> => {
  header = header.trim()
  let result: Record<string, string> = {}
  if (!header) return result
  const headers = splitTextRows(header)
  headers.forEach((line) => {
    const index = line.indexOf(':')
    const name = line.substring(0, index)
    const value = line.substring(index + 1).trim()
    result[name] = value
  })
  result = changeKeysToCamelCase(result) as Record<string, string>
  return result
}

export const formatOptionsForEngine = (
  options: Aria2EngineOptions | Record<string, unknown> = {},
): Record<string, string> => {
  const result: Record<string, string> = {}
  Object.keys(options).forEach((key) => {
    const val = options[key]
    if (val === undefined || val === null) return
    const kebabCaseKey = kebabCase(key)
    if (Array.isArray(val)) {
      result[kebabCaseKey] = (val as string[]).join('\n')
    } else {
      result[kebabCaseKey] = `${val}`
    }
  })
  return result
}

export const buildRpcUrl = (options: { port: number; secret?: string } = { port: 16800 }): string => {
  const { port, secret } = options
  let result = `${ENGINE_RPC_HOST}:${port}/jsonrpc`
  if (secret) result = `token:${secret}@${result}`
  return `http://${result}`
}

export const checkIsNeedRestart = (changed: Record<string, unknown> = {}): boolean => {
  if (isEmpty(changed)) return false
  const kebabCaseChanged = changeKeysToKebabCase(changed)
  let result = false
  needRestartKeys.some((key) => {
    if (Object.keys(kebabCaseChanged).includes(key)) {
      result = true
      return true
    }
    return false
  })
  return result
}

/**
 * Keys excluded from runtime hot-reload via aria2 `changeGlobalOption`.
 * - needRestartKeys: bound at process startup (ports, RPC secret)
 * - aria2 docs exclusions: not accepted by `changeGlobalOption`
 * - log-level: needs full app relaunch (tauri-plugin-log init), not engine restart
 */
const NON_HOT_RELOADABLE = new Set([
  ...needRestartKeys,
  'checksum',
  'index-out',
  'out',
  'pause',
  'select-file',
  'rpc-save-upload-metadata',
  'log-level',
])

/**
 * Filters a system config object to only keys that aria2 accepts via
 * `changeGlobalOption` RPC. Used to hot-reload settings at runtime
 * without requiring an engine restart.
 */
export const filterHotReloadableKeys = (config: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.entries(config).filter(([key]) => !NON_HOT_RELOADABLE.has(key)))

export const checkIsNeedRun = (enable: boolean, lastTime: number, interval: number): boolean => {
  if (!enable) return false
  return Date.now() - lastTime > interval
}
