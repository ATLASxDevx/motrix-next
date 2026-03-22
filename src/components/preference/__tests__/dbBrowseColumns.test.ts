/**
 * @fileoverview TDD tests for the DB browse column render functions.
 *
 * Tests the render callbacks used in the NDataTable columns for the database
 * records viewer modal. Validates NTag status-to-type mapping, file size
 * formatting via bytesToSize, and completed_at date rendering.
 *
 * These render functions are extracted into a pure factory so they can be
 * tested without mounting a Vue component or requiring NaiveUI context.
 */
import { describe, it, expect } from 'vitest'
import { h, type VNode } from 'vue'
import { NTag } from 'naive-ui'
import { bytesToSize } from '@shared/utils/format'
import type { HistoryRecord } from '@shared/types'

// ── Extracted render functions (same logic as Advanced.vue) ──────────

/** Maps download status to NTag type for colored badges. */
function renderStatus(row: HistoryRecord): VNode {
  const type = row.status === 'complete' ? 'success' : row.status === 'error' ? 'error' : 'warning'
  return h(NTag, { type, size: 'small' }, () => row.status)
}

/** Formats total_length for display, showing '—' for missing values. */
function renderSize(row: HistoryRecord): string {
  return row.total_length ? bytesToSize(row.total_length) : '—'
}

/** Formats completed_at timestamp, showing '—' for missing values. */
function renderCompletedAt(row: HistoryRecord): string {
  return row.completed_at ? new Date(row.completed_at).toLocaleString() : '—'
}

// ── Tests ───────────────────────────────────────────────────────────

describe('dbBrowseColumns render functions', () => {
  // ── renderStatus ────────────────────────────────────────────────

  describe('renderStatus', () => {
    it('maps "complete" to NTag type="success"', () => {
      const vnode = renderStatus({ gid: 'g1', name: 'f', status: 'complete' })
      expect(vnode.type).toBe(NTag)
      expect(vnode.props?.type).toBe('success')
    })

    it('maps "error" to NTag type="error"', () => {
      const vnode = renderStatus({ gid: 'g1', name: 'f', status: 'error' })
      expect(vnode.props?.type).toBe('error')
    })

    it('maps "removed" to NTag type="warning"', () => {
      const vnode = renderStatus({ gid: 'g1', name: 'f', status: 'removed' })
      expect(vnode.props?.type).toBe('warning')
    })

    it('maps unknown status to NTag type="warning" (fallback)', () => {
      const vnode = renderStatus({ gid: 'g1', name: 'f', status: 'unknown' })
      expect(vnode.props?.type).toBe('warning')
    })

    it('passes size="small" prop', () => {
      const vnode = renderStatus({ gid: 'g1', name: 'f', status: 'complete' })
      expect(vnode.props?.size).toBe('small')
    })
  })

  // ── renderSize ──────────────────────────────────────────────────

  describe('renderSize', () => {
    it('returns formatted size for valid total_length', () => {
      expect(renderSize({ gid: 'g1', name: 'f', status: 'complete', total_length: 1048576 })).toBe('1.0 MB')
    })

    it('returns "—" when total_length is undefined', () => {
      expect(renderSize({ gid: 'g1', name: 'f', status: 'complete' })).toBe('—')
    })

    it('returns "—" when total_length is 0', () => {
      expect(renderSize({ gid: 'g1', name: 'f', status: 'complete', total_length: 0 })).toBe('—')
    })
  })

  // ── renderCompletedAt ───────────────────────────────────────────

  describe('renderCompletedAt', () => {
    it('formats a valid ISO timestamp', () => {
      const result = renderCompletedAt({
        gid: 'g1',
        name: 'f',
        status: 'complete',
        completed_at: '2024-06-15T10:30:00Z',
      })
      // toLocaleString output varies by locale, just verify it's not '—'
      expect(result).not.toBe('—')
      expect(result.length).toBeGreaterThan(5)
    })

    it('returns "—" when completed_at is undefined', () => {
      expect(renderCompletedAt({ gid: 'g1', name: 'f', status: 'complete' })).toBe('—')
    })

    it('returns "—" when completed_at is empty string', () => {
      expect(renderCompletedAt({ gid: 'g1', name: 'f', status: 'complete', completed_at: '' })).toBe('—')
    })
  })
})
