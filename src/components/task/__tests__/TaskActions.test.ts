/**
 * @fileoverview Integration tests for TaskActions.vue.
 *
 * Key behaviors under test:
 * - Engine guard: resumeAll/pauseAll/purgeRecord block when engine not ready
 * - Refresh debounce: rapid clicks coalesce via 500ms timer
 * - Confirmation dialogs: all destructive actions require user confirmation
 * - Delete-all: batch removal with optional file deletion
 *
 * These are REAL integration tests using @vue/test-utils mount() with Pinia store.
 * All Tauri/Naive UI dependencies are mocked, but component ↔ store interaction is real.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

// ── Mock registry (shared refs for assertion access) ────────────────

const mockIsEngineReady = vi.fn().mockReturnValue(true)
const mockFetchList = vi.fn().mockResolvedValue(undefined)
const mockResumeAllTask = vi.fn().mockResolvedValue(undefined)
const mockPauseAllTask = vi.fn().mockResolvedValue(undefined)
const mockPurgeTaskRecord = vi.fn().mockResolvedValue(undefined)
const mockBatchRemoveTask = vi.fn().mockResolvedValue(undefined)
const mockStopAllSeeding = vi.fn().mockResolvedValue(2)

// Dialog mock: captures onPositiveClick so we can invoke it in tests
let lastDialogOptions: Record<string, unknown> | null = null
const mockDialogWarning = vi.fn((opts: Record<string, unknown>) => {
  lastDialogOptions = opts
  return { loading: false, negativeButtonProps: {}, closable: true, maskClosable: true, destroy: vi.fn() }
})

// Message mock: captures calls for assertion
const mockMessageSuccess = vi.fn(() => ({ destroy: vi.fn() }))
const mockMessageWarning = vi.fn(() => ({ destroy: vi.fn() }))
const mockMessageError = vi.fn(() => ({ destroy: vi.fn() }))

// ── Module mocks ────────────────────────────────────────────────────

vi.mock('@/api/aria2', () => ({
  isEngineReady: () => mockIsEngineReady(),
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

vi.mock('naive-ui', () => ({
  NButton: {
    template: '<button :disabled="disabled"><slot /><slot name="icon" /></button>',
    props: ['type', 'circle', 'size', 'quaternary', 'disabled'],
  },
  NIcon: { template: '<span :class="$attrs.class"><slot /></span>' },
  NTooltip: { template: '<span><slot /><slot name="trigger" /></span>' },
  NCheckbox: { template: '<label><slot /></label>' },
  useDialog: () => ({ warning: mockDialogWarning }),
  useMessage: () => ({
    success: mockMessageSuccess,
    error: mockMessageError,
    warning: mockMessageWarning,
    info: vi.fn(() => ({ destroy: vi.fn() })),
  }),
}))

vi.mock('@vicons/ionicons5', () => ({
  AddOutline: { template: '<i />' },
  PlayOutline: { template: '<i />' },
  PauseOutline: { template: '<i />' },
  TrashOutline: { template: '<i />' },
  RefreshOutline: { template: '<i />' },
  CloseOutline: { template: '<i />' },
  StopCircleOutline: { template: '<i />' },
  SyncOutline: { template: '<i />' },
}))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-fs', () => ({
  exists: vi.fn().mockResolvedValue(false),
  remove: vi.fn().mockResolvedValue(undefined),
  readDir: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/composables/useAppMessage', () => ({
  useAppMessage: () => ({
    success: mockMessageSuccess,
    error: mockMessageError,
    warning: mockMessageWarning,
    info: vi.fn(() => ({ destroy: vi.fn() })),
  }),
}))

vi.mock('@/composables/useFileDelete', () => ({
  deleteTaskFiles: vi.fn().mockResolvedValue(undefined),
}))

import TaskActions from '../TaskActions.vue'
import { useTaskStore } from '@/stores/task'
import { ref, type Ref } from 'vue'

// ── Helpers ─────────────────────────────────────────────────────────

/** Shared stoppingGids ref provided to component via provide/inject. */
let stoppingGids: Ref<string[]>

const createWrapper = () =>
  mount(TaskActions, {
    global: {
      provide: { stoppingGids },
    },
  })

/**
 * Click the Nth button in the component (0-indexed).
 * Button order in template: [0]Add [1]Refresh [2]ResumeAll [3]PauseAll [4]StopAllSeed [5]DeleteAll
 * When currentList === 'stopped': [0]Add [1]Refresh [2]Purge
 */
async function clickButton(wrapper: ReturnType<typeof createWrapper>, index: number) {
  const buttons = wrapper.findAll('button')
  await buttons[index].trigger('click')
}

// ── Test Suite ──────────────────────────────────────────────────────

describe('TaskActions', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
    vi.clearAllMocks()
    mockIsEngineReady.mockReturnValue(true)
    lastDialogOptions = null

    stoppingGids = ref<string[]>([])

    // Patch store methods so we can track calls without real IPC
    const taskStore = useTaskStore()
    taskStore.fetchList = mockFetchList
    taskStore.resumeAllTask = mockResumeAllTask
    taskStore.pauseAllTask = mockPauseAllTask
    taskStore.purgeTaskRecord = mockPurgeTaskRecord
    taskStore.batchRemoveTask = mockBatchRemoveTask
    taskStore.stopAllSeeding = mockStopAllSeeding
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ── Smoke ───────────────────────────────────────────────────────

  it('mounts without errors', () => {
    const wrapper = createWrapper()
    expect(wrapper.find('.task-actions').exists()).toBe(true)
  })

  it('renders all 6 action buttons when list is not stopped', () => {
    const wrapper = createWrapper()
    const buttons = wrapper.findAll('button')
    // Add + Refresh + ResumeAll + PauseAll + StopAllSeed + DeleteAll = 6
    expect(buttons.length).toBe(6)
  })

  // ── Engine Guard ────────────────────────────────────────────────

  describe('engine guard', () => {
    it('shows warning when resumeAll is clicked and engine is not ready', async () => {
      mockIsEngineReady.mockReturnValue(false)
      const taskStore = useTaskStore()
      taskStore.taskList = [{ gid: 'p1', status: 'paused' }] as never
      const wrapper = createWrapper()

      await clickButton(wrapper, 2) // Resume All

      expect(mockMessageWarning).toHaveBeenCalledOnce()
      expect(mockDialogWarning).not.toHaveBeenCalled() // Dialog should NOT open
    })

    it('shows warning when pauseAll is clicked and engine is not ready', async () => {
      mockIsEngineReady.mockReturnValue(false)
      const taskStore = useTaskStore()
      taskStore.taskList = [{ gid: 'a1', status: 'active' }] as never
      const wrapper = createWrapper()

      await clickButton(wrapper, 3) // Pause All

      expect(mockMessageWarning).toHaveBeenCalledOnce()
      expect(mockDialogWarning).not.toHaveBeenCalled()
    })

    it('shows warning when purgeRecord is clicked and engine is not ready', async () => {
      mockIsEngineReady.mockReturnValue(false)
      const taskStore = useTaskStore()
      taskStore.currentList = 'stopped'
      const wrapper = createWrapper()

      await clickButton(wrapper, 2) // Purge (index 2 when in stopped list)

      expect(mockMessageWarning).toHaveBeenCalledOnce()
      expect(mockDialogWarning).not.toHaveBeenCalled()
    })

    it('opens confirmation dialog for resumeAll when engine IS ready', async () => {
      const taskStore = useTaskStore()
      taskStore.taskList = [{ gid: 'p1', status: 'paused' }] as never
      const wrapper = createWrapper()

      await clickButton(wrapper, 2) // Resume All

      expect(mockMessageWarning).not.toHaveBeenCalled()
      expect(mockDialogWarning).toHaveBeenCalledOnce()
    })

    it('opens confirmation dialog for pauseAll when engine IS ready', async () => {
      const taskStore = useTaskStore()
      taskStore.taskList = [{ gid: 'a1', status: 'active' }] as never
      const wrapper = createWrapper()

      await clickButton(wrapper, 3) // Pause All

      expect(mockMessageWarning).not.toHaveBeenCalled()
      expect(mockDialogWarning).toHaveBeenCalledOnce()
    })

    it('opens confirmation dialog for purgeRecord when engine IS ready', async () => {
      const taskStore = useTaskStore()
      taskStore.currentList = 'stopped'
      const wrapper = createWrapper()

      await clickButton(wrapper, 2) // Purge

      expect(mockMessageWarning).not.toHaveBeenCalled()
      expect(mockDialogWarning).toHaveBeenCalledOnce()
    })
  })

  // ── Disabled State Guards ──────────────────────────────────────

  describe('disabled state guards', () => {
    it('Resume All button is disabled when taskList is empty', () => {
      const wrapper = createWrapper()
      // Button order: [0]Add [1]Refresh [2]ResumeAll [3]PauseAll [4]StopAllSeed [5]DeleteAll
      const resumeBtn = wrapper.findAll('button')[2]
      expect(resumeBtn.attributes('disabled')).toBeDefined()
    })

    it('Pause All button is disabled when taskList is empty', () => {
      const wrapper = createWrapper()
      const pauseBtn = wrapper.findAll('button')[3]
      expect(pauseBtn.attributes('disabled')).toBeDefined()
    })

    it('Resume All button is disabled when only active tasks exist (none paused)', () => {
      const taskStore = useTaskStore()
      taskStore.taskList = [
        { gid: 'a1', status: 'active' },
        { gid: 'a2', status: 'active' },
      ] as never
      const wrapper = createWrapper()
      const resumeBtn = wrapper.findAll('button')[2]
      expect(resumeBtn.attributes('disabled')).toBeDefined()
    })

    it('Pause All button is disabled when only paused tasks exist (none active)', () => {
      const taskStore = useTaskStore()
      taskStore.taskList = [
        { gid: 'p1', status: 'paused' },
        { gid: 'p2', status: 'paused' },
      ] as never
      const wrapper = createWrapper()
      const pauseBtn = wrapper.findAll('button')[3]
      expect(pauseBtn.attributes('disabled')).toBeDefined()
    })

    it('Resume All button is enabled when at least one paused task exists', () => {
      const taskStore = useTaskStore()
      taskStore.taskList = [
        { gid: 'a1', status: 'active' },
        { gid: 'p1', status: 'paused' },
      ] as never
      const wrapper = createWrapper()
      const resumeBtn = wrapper.findAll('button')[2]
      expect(resumeBtn.attributes('disabled')).toBeUndefined()
    })

    it('Pause All button is enabled when at least one active task exists', () => {
      const taskStore = useTaskStore()
      taskStore.taskList = [
        { gid: 'a1', status: 'active' },
        { gid: 'p1', status: 'paused' },
      ] as never
      const wrapper = createWrapper()
      const pauseBtn = wrapper.findAll('button')[3]
      expect(pauseBtn.attributes('disabled')).toBeUndefined()
    })

    it('Pause All button is enabled when waiting tasks exist', () => {
      const taskStore = useTaskStore()
      taskStore.taskList = [{ gid: 'w1', status: 'waiting' }] as never
      const wrapper = createWrapper()
      const pauseBtn = wrapper.findAll('button')[3]
      expect(pauseBtn.attributes('disabled')).toBeUndefined()
    })

    it('Resume All button remains disabled with completed/error/seeding tasks', () => {
      const taskStore = useTaskStore()
      taskStore.taskList = [
        { gid: 'c1', status: 'complete' },
        { gid: 'e1', status: 'error' },
        { gid: 's1', status: 'active', bittorrent: { info: { name: 'x' } }, seeder: 'true' },
      ] as never
      const wrapper = createWrapper()
      const resumeBtn = wrapper.findAll('button')[2]
      expect(resumeBtn.attributes('disabled')).toBeDefined()
    })

    it('disabled Resume All does not open a dialog when clicked', async () => {
      // Empty task list → Resume All should be disabled
      const wrapper = createWrapper()
      await clickButton(wrapper, 2) // Resume All
      expect(mockDialogWarning).not.toHaveBeenCalled()
    })

    it('disabled Pause All does not open a dialog when clicked', async () => {
      // Empty task list → Pause All should be disabled
      const wrapper = createWrapper()
      await clickButton(wrapper, 3) // Pause All
      expect(mockDialogWarning).not.toHaveBeenCalled()
    })
  })

  // ── Refresh Debounce ────────────────────────────────────────────

  describe('refresh debounce', () => {
    it('calls fetchList on refresh click', async () => {
      const wrapper = createWrapper()

      await clickButton(wrapper, 1) // Refresh

      expect(mockFetchList).toHaveBeenCalledOnce()
    })

    it('sets spinning animation for 500ms', async () => {
      const wrapper = createWrapper()

      await clickButton(wrapper, 1) // Refresh

      // Spinning class should be applied
      expect(wrapper.find('.spinning').exists()).toBe(true)

      // After 500ms, spinning should stop
      vi.advanceTimersByTime(500)
      await wrapper.vm.$nextTick()
      expect(wrapper.find('.spinning').exists()).toBe(false)
    })

    it('resets timer on rapid successive clicks', async () => {
      const wrapper = createWrapper()

      await clickButton(wrapper, 1) // Click 1
      vi.advanceTimersByTime(200)
      await clickButton(wrapper, 1) // Click 2 (200ms later — before 500ms expires)

      // fetchList should have been called twice
      expect(mockFetchList).toHaveBeenCalledTimes(2)

      // Spinning should still be active (timer was reset)
      expect(wrapper.find('.spinning').exists()).toBe(true)

      // After 500ms from the SECOND click, spinning should stop
      vi.advanceTimersByTime(500)
      await wrapper.vm.$nextTick()
      expect(wrapper.find('.spinning').exists()).toBe(false)
    })

    it('shows success message when fetchList succeeds', async () => {
      mockFetchList.mockResolvedValueOnce(undefined)
      const wrapper = createWrapper()

      await clickButton(wrapper, 1)
      await vi.runAllTimersAsync()

      expect(mockMessageSuccess).toHaveBeenCalled()
    })
  })

  // ── Confirmation Dialogs ────────────────────────────────────────

  describe('confirmation dialogs', () => {
    it('resumeAll dialog calls resumeAllTask on positive click', async () => {
      const taskStore = useTaskStore()
      taskStore.taskList = [{ gid: 'p1', status: 'paused' }] as never
      const wrapper = createWrapper()

      await clickButton(wrapper, 2) // Resume All
      expect(lastDialogOptions).not.toBeNull()

      // Simulate user clicking "Yes"
      const onPositiveClick = lastDialogOptions!.onPositiveClick as () => void
      onPositiveClick()

      expect(mockResumeAllTask).toHaveBeenCalledOnce()
    })

    it('resumeAll shows success message after execution', async () => {
      const taskStore = useTaskStore()
      taskStore.taskList = [{ gid: 'p1', status: 'paused' }] as never
      const wrapper = createWrapper()

      await clickButton(wrapper, 2)
      const onPositiveClick = lastDialogOptions!.onPositiveClick as () => void
      onPositiveClick()
      await vi.runAllTimersAsync()

      expect(mockMessageSuccess).toHaveBeenCalled()
    })

    it('resumeAll shows error message on failure', async () => {
      mockResumeAllTask.mockRejectedValueOnce(new Error('rpc fail'))
      const taskStore = useTaskStore()
      taskStore.taskList = [{ gid: 'p1', status: 'paused' }] as never
      const wrapper = createWrapper()

      await clickButton(wrapper, 2)
      const onPositiveClick = lastDialogOptions!.onPositiveClick as () => Promise<void>
      await onPositiveClick()
      await vi.runAllTimersAsync()

      expect(mockMessageError).toHaveBeenCalled()
    })

    it('pauseAll dialog calls pauseAllTask on positive click', async () => {
      const taskStore = useTaskStore()
      taskStore.taskList = [{ gid: 'a1', status: 'active' }] as never
      const wrapper = createWrapper()

      await clickButton(wrapper, 3) // Pause All
      const onPositiveClick = lastDialogOptions!.onPositiveClick as () => false
      onPositiveClick()
      // Flush the fire-and-forget .then() chain
      await vi.runAllTimersAsync()

      expect(mockPauseAllTask).toHaveBeenCalledOnce()
    })

    it('purgeRecord dialog calls purgeTaskRecord on positive click', async () => {
      const taskStore = useTaskStore()
      taskStore.currentList = 'stopped'
      const wrapper = createWrapper()

      await clickButton(wrapper, 2) // Purge
      const onPositiveClick = lastDialogOptions!.onPositiveClick as () => Promise<void>
      // onPositiveClick has internal setTimeout(50) — must advance timer
      const promise = onPositiveClick()
      await vi.advanceTimersByTimeAsync(100)
      await promise

      expect(mockPurgeTaskRecord).toHaveBeenCalledOnce()
    })
  })

  // ── Delete All ──────────────────────────────────────────────────

  describe('delete all', () => {
    it('does nothing when task list is empty', async () => {
      const wrapper = createWrapper()
      // taskList is empty by default — the delete-all button should be disabled
      const deleteBtn = wrapper.findAll('button')[5]
      expect(deleteBtn.attributes('disabled')).toBeDefined()
    })

    it('opens dialog with batch count when tasks exist', async () => {
      const taskStore = useTaskStore()
      taskStore.taskList = [{ gid: 'g1' }, { gid: 'g2' }] as never

      const wrapper = createWrapper()
      await clickButton(wrapper, 5) // Delete All

      expect(mockDialogWarning).toHaveBeenCalledOnce()
    })

    it('calls batchRemoveTask with all gids on confirmation', async () => {
      const taskStore = useTaskStore()
      taskStore.taskList = [{ gid: 'g1' }, { gid: 'g2' }, { gid: 'g3' }] as never

      const wrapper = createWrapper()
      await clickButton(wrapper, 5) // Delete All

      const onPositiveClick = lastDialogOptions!.onPositiveClick as () => Promise<void>
      // onPositiveClick has internal setTimeout(50) — must advance timer
      const promise = onPositiveClick()
      await vi.advanceTimersByTimeAsync(100)
      await promise

      expect(mockBatchRemoveTask).toHaveBeenCalledWith(['g1', 'g2', 'g3'])
    })

    it('shows success message after batch deletion', async () => {
      const taskStore = useTaskStore()
      taskStore.taskList = [{ gid: 'g1' }] as never

      const wrapper = createWrapper()
      await clickButton(wrapper, 5)

      const onPositiveClick = lastDialogOptions!.onPositiveClick as () => Promise<void>
      const promise = onPositiveClick()
      await vi.advanceTimersByTimeAsync(100)
      await promise

      expect(mockMessageSuccess).toHaveBeenCalled()
    })
  })

  // ── Stop All Seeding Animation Linkage ──────────────────────────

  describe('stop all seeding animation', () => {
    it('pushes all seeder gids into stoppingGids on positive click', async () => {
      const taskStore = useTaskStore()
      taskStore.taskList = [
        { gid: 's1', status: 'active', bittorrent: { info: { name: 'a' } }, seeder: 'true' },
        { gid: 'a1' },
        { gid: 's2', status: 'active', bittorrent: { info: { name: 'b' } }, seeder: 'true' },
      ] as never

      const wrapper = createWrapper()
      await clickButton(wrapper, 4) // Stop All Seeding

      const onPositiveClick = lastDialogOptions!.onPositiveClick as () => Promise<void>
      onPositiveClick() // fire-and-forget — watcher keeps spinning
      await wrapper.vm.$nextTick()

      expect(stoppingGids.value).toContain('s1')
      expect(stoppingGids.value).toContain('s2')
      expect(stoppingGids.value).not.toContain('a1')
    })

    it('shows spinning while snapshotted seeder tasks still have seeder=true', async () => {
      const taskStore = useTaskStore()
      taskStore.taskList = [
        { gid: 's1', status: 'active', bittorrent: { info: { name: 'x' } }, seeder: 'true' },
      ] as never

      const wrapper = createWrapper()
      await clickButton(wrapper, 4)

      const onPositiveClick = lastDialogOptions!.onPositiveClick as () => Promise<void>
      onPositiveClick()
      await wrapper.vm.$nextTick()

      // Task still seeding → button should spin
      expect(wrapper.find('.stop-all-spinning').exists()).toBe(true)

      // Simulate task exiting seeding state
      taskStore.taskList = [{ gid: 's1', bittorrent: { info: { name: 'x' } }, seeder: 'false' }] as never
      await wrapper.vm.$nextTick()

      // Now button should stop spinning
      expect(wrapper.find('.stop-all-spinning').exists()).toBe(false)
    })

    it('ignores new seeders appearing during batch stop', async () => {
      const taskStore = useTaskStore()
      taskStore.taskList = [
        { gid: 's1', status: 'active', bittorrent: { info: { name: 'a' } }, seeder: 'true' },
      ] as never

      const wrapper = createWrapper()
      await clickButton(wrapper, 4)

      const onPositiveClick = lastDialogOptions!.onPositiveClick as () => Promise<void>
      onPositiveClick()
      await wrapper.vm.$nextTick()

      expect(wrapper.find('.stop-all-spinning').exists()).toBe(true)

      // Original seeder exits, but a NEW seeder appears
      taskStore.taskList = [
        { gid: 's1', bittorrent: { info: { name: 'a' } }, seeder: 'false' },
        { gid: 's_new', status: 'active', bittorrent: { info: { name: 'new' } }, seeder: 'true' },
      ] as never
      await wrapper.vm.$nextTick()

      // Spin should stop — s_new was NOT in the snapshot
      expect(wrapper.find('.stop-all-spinning').exists()).toBe(false)
    })

    it('calls stopAllSeeding store method on confirm', async () => {
      const taskStore = useTaskStore()
      taskStore.taskList = [
        { gid: 's1', status: 'active', bittorrent: { info: { name: 'x' } }, seeder: 'true' },
      ] as never

      const wrapper = createWrapper()
      await clickButton(wrapper, 4)

      const onPositiveClick = lastDialogOptions!.onPositiveClick as () => Promise<void>
      await onPositiveClick()

      expect(mockStopAllSeeding).toHaveBeenCalledOnce()
    })

    it('stops spinning after safety timeout even if tasks remain seeding', async () => {
      const taskStore = useTaskStore()
      taskStore.taskList = [
        { gid: 's1', status: 'active', bittorrent: { info: { name: 'x' } }, seeder: 'true' },
      ] as never

      const wrapper = createWrapper()
      await clickButton(wrapper, 4)

      const onPositiveClick = lastDialogOptions!.onPositiveClick as () => Promise<void>
      onPositiveClick()
      await wrapper.vm.$nextTick()

      expect(wrapper.find('.stop-all-spinning').exists()).toBe(true)

      // Advance past the 10s safety timeout
      vi.advanceTimersByTime(11000)
      await wrapper.vm.$nextTick()

      expect(wrapper.find('.stop-all-spinning').exists()).toBe(false)
    })
  })
})
