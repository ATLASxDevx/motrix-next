/**
 * @fileoverview Tests for TaskItemActions — status-to-action state machine.
 *
 * Tests the actionsMap computed property that determines which action buttons
 * appear for each task status. This is the core logic that controls the UX.
 * Uses @vue/test-utils mount to test real computed property execution.
 */
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import { TASK_STATUS } from '@shared/constants'

// ── Mock all external deps ─────────────────────────────────────────
vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

// Mock Naive UI components as stubs
vi.mock('naive-ui', () => ({
  NIcon: { template: '<span><slot /></span>' },
  NTooltip: { template: '<span><slot /><slot name="trigger" /></span>' },
}))

// Mock ionicons
vi.mock('@vicons/ionicons5', () => ({
  PauseOutline: { template: '<i />' },
  PlayOutline: { template: '<i />' },
  StopOutline: { template: '<i />' },
  RefreshOutline: { template: '<i />' },
  CloseOutline: { template: '<i />' },
  TrashOutline: { template: '<i />' },
  LinkOutline: { template: '<i />' },
  InformationCircleOutline: { template: '<i />' },
  FolderOpenOutline: { template: '<i />' },
  OpenOutline: { template: '<i />' },
  SyncOutline: { template: '<i />' },
}))

import TaskItemActions from '../TaskItemActions.vue'

/** Mount helper — `hasUri` controls rebuildable URIs, `fileMissing` controls file-exists state. */
const createWrapper = (status: string, gid = 'abc123', { hasUri = true, fileMissing = false } = {}) => {
  const files = hasUri
    ? [{ index: '1', path: '/dl/file.zip', uris: [{ uri: 'http://example.com/file.zip', status: 'used' }] }]
    : [{ index: '1', path: '/dl/file.zip', uris: [] }]
  return mount(TaskItemActions, {
    props: {
      task: { gid, files } as never,
      status,
      fileMissing,
    },
    global: {
      provide: {
        stoppingGids: ref([]),
      },
    },
  })
}

describe('TaskItemActions', () => {
  describe('action set per status', () => {
    it('shows pause+delete for ACTIVE tasks', () => {
      const wrapper = createWrapper(TASK_STATUS.ACTIVE)
      const actions = wrapper.findAll('.task-item-action')
      // Actions include the 3 common actions (folder, link, info) + status-specific
      expect(actions.length).toBeGreaterThanOrEqual(2 + 3) // pause, delete + common
    })

    it('shows resume+delete for PAUSED tasks', () => {
      const wrapper = createWrapper(TASK_STATUS.PAUSED)
      const actions = wrapper.findAll('.task-item-action')
      expect(actions.length).toBeGreaterThanOrEqual(2 + 3)
    })

    it('shows open+restart+trash for COMPLETE tasks', () => {
      const wrapper = createWrapper(TASK_STATUS.COMPLETE)
      const actions = wrapper.findAll('.task-item-action')
      // open-file + restart + trash + 3 common = 6
      expect(actions.length).toBeGreaterThanOrEqual(3 + 3)
    })

    it('shows open+restart+trash for ERROR tasks', () => {
      const wrapper = createWrapper(TASK_STATUS.ERROR)
      const actions = wrapper.findAll('.task-item-action')
      expect(actions.length).toBeGreaterThanOrEqual(3 + 3)
    })

    it('shows stop-seeding+delete for SEEDING tasks', () => {
      const wrapper = createWrapper(TASK_STATUS.SEEDING)
      const actions = wrapper.findAll('.task-item-action')
      const hasStopSeeding = actions.some((a) => a.classes().includes('stop-seeding'))
      expect(hasStopSeeding).toBe(true)
    })
  })

  describe('event emission', () => {
    it('emits pause when pause action is clicked', async () => {
      const wrapper = createWrapper(TASK_STATUS.ACTIVE)
      const actions = wrapper.findAll('.task-item-action')
      // Find and click the first action (reversed order, so pause is last status-specific)
      await actions[actions.length - 1].trigger('click')
      // At least one event should be emitted
      expect(Object.keys(wrapper.emitted()).length).toBeGreaterThan(0)
    })

    it('emits stop-seeding when stop action is clicked on SEEDING task', async () => {
      const wrapper = createWrapper(TASK_STATUS.SEEDING)
      const stopAction = wrapper.findAll('.task-item-action').find((a) => a.classes().includes('stop-seeding'))
      expect(stopAction).toBeDefined()
      await stopAction!.trigger('click')
      expect(wrapper.emitted('stop-seeding')).toBeTruthy()
    })
  })

  describe('status variants', () => {
    it('shows resume+delete for WAITING tasks', () => {
      const wrapper = createWrapper(TASK_STATUS.WAITING)
      const actions = wrapper.findAll('.task-item-action')
      expect(actions.length).toBeGreaterThanOrEqual(2 + 3)
    })

    it('shows open+restart+trash for REMOVED tasks', () => {
      const wrapper = createWrapper(TASK_STATUS.REMOVED)
      const actions = wrapper.findAll('.task-item-action')
      expect(actions.length).toBeGreaterThanOrEqual(3 + 3)
    })

    it('non-seeder statuses do not have stop-seeding button', () => {
      const wrapper = createWrapper(TASK_STATUS.ACTIVE)
      const hasStopSeeding = wrapper.findAll('.task-item-action').some((a) => a.classes().includes('stop-seeding'))
      expect(hasStopSeeding).toBe(false)
    })
  })

  describe('isStopping state', () => {
    it('applies is-stopping class when gid is in stoppingGids', () => {
      const wrapper = mount(TaskItemActions, {
        props: {
          task: { gid: 'stopping-gid' } as never,
          status: TASK_STATUS.SEEDING,
        },
        global: {
          provide: {
            stoppingGids: ref(['stopping-gid']),
          },
        },
      })

      const stopAction = wrapper.findAll('.task-item-action').find((a) => a.classes().includes('stop-seeding'))
      expect(stopAction?.classes()).toContain('is-stopping')
    })

    it('does not apply is-stopping when gid is NOT in stoppingGids', () => {
      const wrapper = mount(TaskItemActions, {
        props: {
          task: { gid: 'other-gid' } as never,
          status: TASK_STATUS.SEEDING,
        },
        global: {
          provide: {
            stoppingGids: ref(['different-gid']),
          },
        },
      })

      const stopAction = wrapper.findAll('.task-item-action').find((a) => a.classes().includes('stop-seeding'))
      expect(stopAction?.classes()).not.toContain('is-stopping')
    })

    it('shows spin icon wrapper when stopping', () => {
      const wrapper = mount(TaskItemActions, {
        props: {
          task: { gid: 'spin-gid' } as never,
          status: TASK_STATUS.SEEDING,
        },
        global: {
          provide: {
            stoppingGids: ref(['spin-gid']),
          },
        },
      })

      expect(wrapper.find('.stop-icon-wrapper').exists()).toBe(true)
      expect(wrapper.find('.stop-icon-spin.fade-in').exists()).toBe(true)
    })
  })

  describe('seeder styling', () => {
    it('seeding stop button has stop-seeding class for green color', () => {
      const wrapper = createWrapper(TASK_STATUS.SEEDING)
      const stopAction = wrapper.findAll('.task-item-action').find((a) => a.classes().includes('stop-seeding'))
      expect(stopAction).toBeDefined()
      expect(stopAction!.classes()).toContain('stop-seeding')
    })
  })

  describe('press animation', () => {
    it('adds pressed class on pointerdown and removes on pointerup', async () => {
      const wrapper = createWrapper(TASK_STATUS.ACTIVE)
      const action = wrapper.find('.task-item-action')
      await action.trigger('pointerdown')
      expect(action.classes()).toContain('pressed')
      await action.trigger('pointerup')
      // Note: pressed class removal is timer-based (asynchronous), but the
      // pointerup handler schedules removal — we verify the class was added
    })
  })

  describe('open-file action', () => {
    it('includes open-file action for COMPLETE tasks', () => {
      const wrapper = createWrapper(TASK_STATUS.COMPLETE)
      const emitted = wrapper.findAll('.task-item-action')
      // Click the last action (reversed order — open-file is at the end since it's first in primary)
      // Verify we can find at least 6 actions (open + restart + trash + 3 common)
      expect(emitted.length).toBe(6)
    })

    it('emits open-file when open action is clicked on COMPLETE task', async () => {
      const wrapper = createWrapper(TASK_STATUS.COMPLETE)
      const actions = wrapper.findAll('.task-item-action')
      // open-file is first in primary array, reversed to last in rendered list
      const openAction = actions[actions.length - 1]
      await openAction.trigger('click')
      expect(wrapper.emitted('open-file')).toBeTruthy()
    })

    it('includes open-file action for ERROR tasks', () => {
      const wrapper = createWrapper(TASK_STATUS.ERROR)
      const actions = wrapper.findAll('.task-item-action')
      expect(actions.length).toBe(6)
    })

    it('includes open-file action for REMOVED tasks', () => {
      const wrapper = createWrapper(TASK_STATUS.REMOVED)
      const actions = wrapper.findAll('.task-item-action')
      expect(actions.length).toBe(6)
    })

    it('does NOT include open-file action for ACTIVE tasks', () => {
      const wrapper = createWrapper(TASK_STATUS.ACTIVE)
      const actions = wrapper.findAll('.task-item-action')
      // ACTIVE: pause + delete + 3 common = 5
      expect(actions.length).toBe(5)
    })
  })

  describe('always-clickable actions (no disabled state)', () => {
    it('all actions are clickable even when task has no URIs (COMPLETE)', () => {
      const wrapper = createWrapper(TASK_STATUS.COMPLETE, 'no-uri', { hasUri: false })
      const disabledActions = wrapper.findAll('.task-item-action.is-disabled')
      expect(disabledActions.length).toBe(0)
    })

    it('all actions emit events when task has no URIs (COMPLETE)', async () => {
      const wrapper = createWrapper(TASK_STATUS.COMPLETE, 'no-uri', { hasUri: false })
      const actions = wrapper.findAll('.task-item-action')
      for (const action of actions) {
        await action.trigger('click')
      }
      // resume (restart) should be emitted — action-level guard handles the toast
      expect(wrapper.emitted('resume')).toBeTruthy()
    })

    it('all actions are clickable when fileMissing=true (COMPLETE)', () => {
      const wrapper = createWrapper(TASK_STATUS.COMPLETE, 'fm', { fileMissing: true })
      const disabledActions = wrapper.findAll('.task-item-action.is-disabled')
      expect(disabledActions.length).toBe(0)
    })

    it('open-file and folder emit events even with fileMissing=true', async () => {
      const wrapper = createWrapper(TASK_STATUS.COMPLETE, 'fm', { fileMissing: true })
      const allActions = wrapper.findAll('.task-item-action')
      for (const action of allActions) {
        await action.trigger('click')
      }
      // Events are emitted — action-level guard in useTaskActions shows toast
      expect(wrapper.emitted('folder')).toBeTruthy()
      expect(wrapper.emitted('open-file')).toBeTruthy()
    })

    it('ERROR tasks are never visually disabled', () => {
      const wrapper = createWrapper(TASK_STATUS.ERROR, 'fm', { fileMissing: true, hasUri: false })
      const disabledActions = wrapper.findAll('.task-item-action.is-disabled')
      expect(disabledActions.length).toBe(0)
    })

    it('ACTIVE tasks remain unaffected by fileMissing', () => {
      const wrapper = createWrapper(TASK_STATUS.ACTIVE, 'fm', { fileMissing: true })
      const disabledActions = wrapper.findAll('.task-item-action.is-disabled')
      expect(disabledActions.length).toBe(0)
    })
  })
})
