/** @fileoverview TDD tests for the download history Pinia store (SQLite-backed).
 *
 * Tests are written BEFORE implementation per the TDD Iron Law.
 * The `@tauri-apps/plugin-sql` module is mocked to use an in-memory
 * array, keeping tests synchronous and deterministic.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import type { HistoryRecord } from '@shared/types'

// ── Mock: in-memory SQLite substitute ────────────────────────────────
let rows: HistoryRecord[] = []
let nextId = 1
let executedQueries: string[] = []

/** Minimal SQL executor that interprets the queries issued by the store. */
function mockExecute(query: string, params: unknown[]): { rowsAffected: number } {
  executedQueries.push(query.trim())
  const q = query.trim().toUpperCase()

  if (q.startsWith('INSERT') || q.startsWith('REPLACE')) {
    const [gid, name, uri, dir, totalLength, status, taskType, completedAt, meta] = params as [
      string,
      string,
      string | null,
      string | null,
      number | null,
      string,
      string | null,
      string | null,
      string | null,
    ]
    const existing = rows.findIndex((r) => r.gid === gid)
    const record: HistoryRecord = {
      id: existing >= 0 ? rows[existing].id : nextId++,
      gid,
      name,
      uri: uri ?? undefined,
      dir: dir ?? undefined,
      total_length: totalLength ?? undefined,
      status,
      task_type: taskType ?? undefined,
      created_at: new Date().toISOString(),
      completed_at: completedAt ?? undefined,
      meta: meta ?? undefined,
    }
    if (existing >= 0) {
      rows[existing] = record
    } else {
      rows.push(record)
    }
    return { rowsAffected: 1 }
  }

  if (q.startsWith('DELETE')) {
    const before = rows.length
    if (q.includes('GID IN')) {
      const gids = params as string[]
      const gidSet = new Set(gids)
      rows = rows.filter((r) => !gidSet.has(r.gid))
    } else if (q.includes('WHERE GID')) {
      const gid = params[0] as string
      rows = rows.filter((r) => r.gid !== gid)
    } else if (q.includes('WHERE STATUS')) {
      const status = params[0] as string
      rows = rows.filter((r) => r.status !== status)
    } else {
      rows = []
    }
    return { rowsAffected: before - rows.length }
  }

  // PRAGMA responses
  if (q.startsWith('PRAGMA')) {
    return { rowsAffected: 0 }
  }

  return { rowsAffected: 0 }
}

function mockSelect(query: string, params: unknown[]): unknown[] {
  executedQueries.push(query.trim())
  const q = query.trim().toUpperCase()

  // PRAGMA integrity_check returns [{integrity_check: 'ok'}]
  if (q.includes('INTEGRITY_CHECK')) {
    return [{ integrity_check: 'ok' }]
  }

  if (q.includes('WHERE STATUS')) {
    const status = params[0] as string
    return rows
      .filter((r) => r.status === status)
      .sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''))
  }

  // Default: return all, sorted by completed_at DESC
  return [...rows].sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''))
}

vi.mock('@tauri-apps/plugin-sql', () => ({
  default: {
    load: vi.fn().mockResolvedValue({
      execute: vi.fn((q: string, p: unknown[]) => Promise.resolve(mockExecute(q, p))),
      select: vi.fn((q: string, p: unknown[]) => Promise.resolve(mockSelect(q, p))),
      close: vi.fn().mockResolvedValue(undefined),
    }),
  },
}))

vi.mock('@tauri-apps/plugin-fs', () => ({
  exists: vi.fn().mockResolvedValue(false),
  remove: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@tauri-apps/api/path', () => ({
  appDataDir: vi.fn().mockResolvedValue('/mock/data'),
}))

vi.mock('@shared/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

// Dynamic import AFTER mock is registered
const { useHistoryStore } = await import('../history')

// ── Test data factories ──────────────────────────────────────────────

function makeRecord(overrides: Partial<HistoryRecord> = {}): HistoryRecord {
  return {
    gid: 'abc123',
    name: 'test-file.zip',
    uri: 'https://example.com/test-file.zip',
    dir: '/downloads',
    total_length: 1024000,
    status: 'complete',
    task_type: 'uri',
    completed_at: '2026-03-15T12:00:00Z',
    ...overrides,
  }
}

// ── Tests ────────────────────────────────────────────────────────────

describe('HistoryStore', () => {
  let store: ReturnType<typeof useHistoryStore>

  beforeEach(async () => {
    rows = []
    nextId = 1
    executedQueries = []
    setActivePinia(createPinia())
    store = useHistoryStore()
    await store.init()
  })

  // ── addRecord ──────────────────────────────────────────────────

  describe('addRecord', () => {
    it('inserts a new record', async () => {
      const record = makeRecord()
      await store.addRecord(record)

      const results = await store.getRecords()
      expect(results).toHaveLength(1)
      expect(results[0].gid).toBe('abc123')
      expect(results[0].name).toBe('test-file.zip')
      expect(results[0].status).toBe('complete')
    })

    it('upserts on duplicate GID instead of throwing', async () => {
      await store.addRecord(makeRecord({ name: 'original.zip' }))
      await store.addRecord(makeRecord({ name: 'updated.zip' }))

      const results = await store.getRecords()
      expect(results).toHaveLength(1)
      expect(results[0].name).toBe('updated.zip')
    })

    it('preserves all optional fields', async () => {
      const record = makeRecord({
        uri: 'magnet:?xt=urn:btih:abc',
        dir: '/custom/path',
        total_length: 5000000,
        task_type: 'torrent',
        meta: '{"infoHash":"abc123"}',
      })
      await store.addRecord(record)

      const results = await store.getRecords()
      expect(results[0].uri).toBe('magnet:?xt=urn:btih:abc')
      expect(results[0].dir).toBe('/custom/path')
      expect(results[0].total_length).toBe(5000000)
      expect(results[0].task_type).toBe('torrent')
      expect(results[0].meta).toBe('{"infoHash":"abc123"}')
    })

    it('handles records with minimal fields', async () => {
      await store.addRecord({ gid: 'min1', name: 'minimal.txt', status: 'error' })

      const results = await store.getRecords()
      expect(results).toHaveLength(1)
      expect(results[0].gid).toBe('min1')
    })
  })

  // ── getRecords ─────────────────────────────────────────────────

  describe('getRecords', () => {
    it('returns all records when no filter is specified', async () => {
      await store.addRecord(makeRecord({ gid: 'g1', name: 'file1.zip', status: 'complete' }))
      await store.addRecord(makeRecord({ gid: 'g2', name: 'file2.zip', status: 'error' }))
      await store.addRecord(makeRecord({ gid: 'g3', name: 'file3.zip', status: 'removed' }))

      const results = await store.getRecords()
      expect(results).toHaveLength(3)
    })

    it('filters by status when specified', async () => {
      await store.addRecord(makeRecord({ gid: 'g1', status: 'complete' }))
      await store.addRecord(makeRecord({ gid: 'g2', status: 'error' }))
      await store.addRecord(makeRecord({ gid: 'g3', status: 'complete' }))

      const completed = await store.getRecords('complete')
      expect(completed).toHaveLength(2)
      completed.forEach((r) => expect(r.status).toBe('complete'))
    })

    it('returns records sorted by completed_at descending', async () => {
      await store.addRecord(makeRecord({ gid: 'old', name: 'old.zip', completed_at: '2026-01-01T00:00:00Z' }))
      await store.addRecord(makeRecord({ gid: 'new', name: 'new.zip', completed_at: '2026-03-15T00:00:00Z' }))
      await store.addRecord(makeRecord({ gid: 'mid', name: 'mid.zip', completed_at: '2026-02-01T00:00:00Z' }))

      const results = await store.getRecords()
      expect(results[0].gid).toBe('new')
      expect(results[1].gid).toBe('mid')
      expect(results[2].gid).toBe('old')
    })

    it('returns empty array when no records exist', async () => {
      const results = await store.getRecords()
      expect(results).toEqual([])
    })
  })

  // ── removeRecord ───────────────────────────────────────────────

  describe('removeRecord', () => {
    it('removes a single record by GID', async () => {
      await store.addRecord(makeRecord({ gid: 'g1' }))
      await store.addRecord(makeRecord({ gid: 'g2' }))

      await store.removeRecord('g1')

      const results = await store.getRecords()
      expect(results).toHaveLength(1)
      expect(results[0].gid).toBe('g2')
    })

    it('does not throw when removing non-existent GID', async () => {
      await expect(store.removeRecord('nonexistent')).resolves.not.toThrow()
    })
  })

  // ── clearRecords ───────────────────────────────────────────────

  describe('clearRecords', () => {
    it('removes all records when no status filter', async () => {
      await store.addRecord(makeRecord({ gid: 'g1', status: 'complete' }))
      await store.addRecord(makeRecord({ gid: 'g2', status: 'error' }))

      await store.clearRecords()

      const results = await store.getRecords()
      expect(results).toEqual([])
    })

    it('removes only records matching the specified status', async () => {
      await store.addRecord(makeRecord({ gid: 'g1', status: 'complete' }))
      await store.addRecord(makeRecord({ gid: 'g2', status: 'error' }))
      await store.addRecord(makeRecord({ gid: 'g3', status: 'complete' }))

      await store.clearRecords('complete')

      const results = await store.getRecords()
      expect(results).toHaveLength(1)
      expect(results[0].gid).toBe('g2')
    })
  })

  // ── removeStaleRecords ─────────────────────────────────────────

  describe('removeStaleRecords', () => {
    it('removes records whose GIDs are in the provided list', async () => {
      await store.addRecord(makeRecord({ gid: 'g1' }))
      await store.addRecord(makeRecord({ gid: 'g2' }))
      await store.addRecord(makeRecord({ gid: 'g3' }))

      await store.removeStaleRecords(['g1', 'g3'])

      const results = await store.getRecords()
      expect(results).toHaveLength(1)
      expect(results[0].gid).toBe('g2')
    })

    it('handles empty stale list gracefully', async () => {
      await store.addRecord(makeRecord({ gid: 'g1' }))

      await store.removeStaleRecords([])

      const results = await store.getRecords()
      expect(results).toHaveLength(1)
    })
  })

  // ── Multiple operations ────────────────────────────────────────

  describe('combined operations', () => {
    it('add → remove → add with same GID works correctly', async () => {
      await store.addRecord(makeRecord({ gid: 'cycle', name: 'first.zip' }))
      await store.removeRecord('cycle')
      await store.addRecord(makeRecord({ gid: 'cycle', name: 'second.zip' }))

      const results = await store.getRecords()
      expect(results).toHaveLength(1)
      expect(results[0].name).toBe('second.zip')
    })

    it('handles high volume of records', async () => {
      for (let i = 0; i < 100; i++) {
        await store.addRecord(
          makeRecord({
            gid: `gid-${i}`,
            name: `file-${i}.zip`,
            completed_at: `2026-01-${String((i % 28) + 1).padStart(2, '0')}T00:00:00Z`,
          }),
        )
      }

      const all = await store.getRecords()
      expect(all).toHaveLength(100)

      // Verify sort order — most recent first
      for (let i = 0; i < all.length - 1; i++) {
        expect(all[i].completed_at! >= all[i + 1].completed_at!).toBe(true)
      }
    })
  })

  // ── PRAGMA initialization ──────────────────────────────────────

  describe('PRAGMA initialization', () => {
    it('sets WAL journal mode on init', async () => {
      const walQueries = executedQueries.filter(
        (q) => q.toUpperCase().includes('JOURNAL_MODE') && q.toUpperCase().includes('WAL'),
      )
      expect(walQueries.length).toBeGreaterThanOrEqual(1)
    })

    it('sets synchronous=NORMAL on init', async () => {
      const syncQueries = executedQueries.filter(
        (q) => q.toUpperCase().includes('SYNCHRONOUS') && q.toUpperCase().includes('NORMAL'),
      )
      expect(syncQueries.length).toBeGreaterThanOrEqual(1)
    })

    it('sets busy_timeout on init', async () => {
      const busyQueries = executedQueries.filter((q) => q.toUpperCase().includes('BUSY_TIMEOUT'))
      expect(busyQueries.length).toBeGreaterThanOrEqual(1)
    })

    it('sets foreign_keys=ON on init', async () => {
      const fkQueries = executedQueries.filter(
        (q) => q.toUpperCase().includes('FOREIGN_KEYS') && q.toUpperCase().includes('ON'),
      )
      expect(fkQueries.length).toBeGreaterThanOrEqual(1)
    })
  })

  // ── checkIntegrity ─────────────────────────────────────────────

  describe('checkIntegrity', () => {
    it('returns ok when database is healthy', async () => {
      const result = await store.checkIntegrity()
      expect(result).toBe('ok')
    })

    it('executes PRAGMA integrity_check', async () => {
      executedQueries = []
      await store.checkIntegrity()
      const integrityQueries = executedQueries.filter((q) => q.toUpperCase().includes('INTEGRITY_CHECK'))
      expect(integrityQueries.length).toBe(1)
    })
  })

  // ── closeConnection ────────────────────────────────────────────

  describe('closeConnection', () => {
    it('closes the database connection', async () => {
      await store.closeConnection()
      // After closing, operations should throw
      await expect(store.getRecords()).rejects.toThrow()
    })
  })
})
