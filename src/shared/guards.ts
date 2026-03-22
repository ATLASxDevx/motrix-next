/** @fileoverview Runtime type guards for validating external aria2 JSON-RPC responses at the boundary. */
import type { Aria2Task, Aria2RawGlobalStat } from './types'

/**
 * Validates that the given value conforms to the Aria2Task shape.
 * Checks the 9 required fields (gid, status, totalLength, completedLength,
 * uploadLength, downloadSpeed, uploadSpeed, dir, files).
 */
export function isAria2Task(value: unknown): value is Aria2Task {
  if (!value || typeof value !== 'object') return false
  const obj = value as Record<string, unknown>
  return (
    typeof obj.gid === 'string' &&
    typeof obj.status === 'string' &&
    typeof obj.totalLength === 'string' &&
    typeof obj.completedLength === 'string' &&
    typeof obj.uploadLength === 'string' &&
    typeof obj.downloadSpeed === 'string' &&
    typeof obj.uploadSpeed === 'string' &&
    typeof obj.dir === 'string' &&
    Array.isArray(obj.files)
  )
}

/**
 * Validates that the given value conforms to the Aria2RawGlobalStat shape.
 * Checks the 5 required string fields.
 */
export function isAria2GlobalStat(value: unknown): value is Aria2RawGlobalStat {
  if (!value || typeof value !== 'object') return false
  const obj = value as Record<string, unknown>
  return (
    typeof obj.downloadSpeed === 'string' &&
    typeof obj.uploadSpeed === 'string' &&
    typeof obj.numActive === 'string' &&
    typeof obj.numWaiting === 'string' &&
    typeof obj.numStopped === 'string'
  )
}
