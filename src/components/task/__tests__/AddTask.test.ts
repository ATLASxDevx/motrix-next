import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h, nextTick } from 'vue'
import AddTask from '@/components/task/AddTask.vue'
import { useAppStore } from '@/stores/app'
import { createBatchItem, resetBatchIdCounter } from '@shared/utils/batchHelpers'

const {
  pushMock,
  successMock,
  warningMock,
  errorMock,
  readFileMock,
  openDialogMock,
  parseTorrentBufferMock,
  uint8ToBase64Mock,
} = vi.hoisted(() => ({
  pushMock: vi.fn(() => Promise.resolve()),
  successMock: vi.fn(),
  warningMock: vi.fn(),
  errorMock: vi.fn(),
  readFileMock: vi.fn(async () => new Uint8Array([1, 2, 3])),
  openDialogMock: vi.fn(),
  parseTorrentBufferMock: vi.fn(async () => ({
    infoHash: 'hash',
    files: [{ idx: 1, path: 'file.bin', length: 1 }],
  })),
  uint8ToBase64Mock: vi.fn(() => 'base64'),
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({
    push: pushMock,
  }),
}))

vi.mock('@/composables/useAppMessage', () => ({
  useAppMessage: () => ({
    success: successMock,
    warning: warningMock,
    error: errorMock,
    info: vi.fn(),
  }),
}))

vi.mock('@/api/aria2', () => ({
  isEngineReady: () => true,
}))

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: openDialogMock,
}))

vi.mock('@tauri-apps/api/path', () => ({
  downloadDir: vi.fn(async () => '/Downloads'),
}))

vi.mock('@tauri-apps/plugin-fs', () => ({
  readFile: readFileMock,
}))

vi.mock('@/composables/useTorrentParser', () => ({
  parseTorrentBuffer: parseTorrentBufferMock,
  uint8ToBase64: uint8ToBase64Mock,
}))

vi.mock('naive-ui', async () => {
  const { defineComponent, h } = await import('vue')

  const passthrough = defineComponent({
    setup(_, { slots }) {
      return () => h('div', slots.default ? slots.default() : [])
    },
  })

  const NButton = defineComponent({
    emits: ['click'],
    setup(_, { slots, emit }) {
      return () => h('button', { onClick: () => emit('click') }, slots.default ? slots.default() : [])
    },
  })

  const NInput = defineComponent({
    props: {
      value: { type: String, default: '' },
      type: { type: String, default: 'text' },
      placeholder: { type: String, default: '' },
    },
    emits: ['update:value'],
    setup(props, { emit }) {
      return () =>
        props.type === 'textarea'
          ? h('textarea', {
              value: props.value,
              placeholder: props.placeholder,
              onInput: (e: Event) => emit('update:value', (e.target as HTMLTextAreaElement).value),
            })
          : h('input', {
              value: props.value,
              placeholder: props.placeholder,
              onInput: (e: Event) => emit('update:value', (e.target as HTMLInputElement).value),
            })
    },
  })

  const NInputNumber = defineComponent({
    props: {
      value: { type: Number, default: 0 },
    },
    emits: ['update:value'],
    setup(props, { emit }) {
      return () =>
        h('input', {
          type: 'number',
          value: props.value,
          onInput: (e: Event) => emit('update:value', Number((e.target as HTMLInputElement).value)),
        })
    },
  })

  const NDataTable = defineComponent({
    props: {
      data: { type: Array, default: () => [] },
    },
    setup(props) {
      return () => h('div', { 'data-rows': String((props.data as unknown[]).length) })
    },
  })

  return {
    NModal: passthrough,
    NCard: passthrough,
    NTabs: passthrough,
    NTabPane: passthrough,
    NForm: passthrough,
    NFormItem: passthrough,
    NInput,
    NInputNumber,
    NButton,
    NSpace: passthrough,
    NGrid: passthrough,
    NGridItem: passthrough,
    NIcon: passthrough,
    NInputGroup: passthrough,
    NDataTable,
    NTag: passthrough,
    NEllipsis: passthrough,
    NCheckbox: passthrough,
    NCollapseTransition: passthrough,
  }
})

const AdvancedOptionsStub = defineComponent({
  name: 'AdvancedOptions',
  setup() {
    return () => h('div')
  },
})

function mountDialog() {
  return mount(AddTask, {
    props: { show: false },
    global: {
      stubs: {
        AdvancedOptions: AdvancedOptionsStub,
      },
    },
  })
}

function getTextarea(wrapper: ReturnType<typeof mount>) {
  return wrapper.find('textarea')
}

describe('AddTask batch URI integration', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetBatchIdCounter()
    pushMock.mockClear()
    successMock.mockClear()
    warningMock.mockClear()
    errorMock.mockClear()
    readFileMock.mockClear()
    openDialogMock.mockClear()
    parseTorrentBufferMock.mockClear()
    uint8ToBase64Mock.mockClear()
  })

  it('flushes uri batch items into the textarea and drains uri items from pendingBatch on open', async () => {
    const appStore = useAppStore()
    appStore.pendingBatch = [
      createBatchItem('uri', 'https://a.example/file'),
      createBatchItem('uri', 'magnet:?xt=urn:btih:abc'),
    ]

    const wrapper = mountDialog()

    await wrapper.setProps({ show: true })
    await flushPromises()

    expect((getTextarea(wrapper).element as HTMLTextAreaElement).value).toBe(
      ['https://a.example/file', 'magnet:?xt=urn:btih:abc'].join('\n'),
    )
    expect(appStore.pendingBatch).toEqual([])
  })

  it('appends newly added uri batch items while open and deduplicates multiline payloads per line', async () => {
    const appStore = useAppStore()
    appStore.pendingBatch = [createBatchItem('uri', 'https://a.example/file\nhttps://b.example/file')]

    const wrapper = mountDialog()

    await wrapper.setProps({ show: true })
    await flushPromises()

    expect((getTextarea(wrapper).element as HTMLTextAreaElement).value).toBe(
      ['https://a.example/file', 'https://b.example/file'].join('\n'),
    )

    appStore.pendingBatch = [
      createBatchItem('uri', 'https://b.example/file\nhttps://c.example/file'),
      createBatchItem('uri', 'https://a.example/file'),
    ]

    await nextTick()
    await flushPromises()

    expect((getTextarea(wrapper).element as HTMLTextAreaElement).value).toBe(
      ['https://a.example/file', 'https://b.example/file', 'https://c.example/file'].join('\n'),
    )
    expect(appStore.pendingBatch).toEqual([])
  })

  it('resets batch list ui state on close so the next open does not leave an empty batch shell behind', async () => {
    const appStore = useAppStore()
    appStore.pendingBatch = [createBatchItem('torrent', '/tmp/one.torrent')]

    const wrapper = mountDialog()

    await wrapper.setProps({ show: true })
    await flushPromises()

    // Torrent panel should be visible when there are file items
    const torrentPanel = wrapper.find('.torrent-panel')
    expect(torrentPanel.exists()).toBe(true)

    // Simulate close: clear batch and hide dialog
    appStore.pendingBatch = []
    appStore.hideAddTaskDialog()
    await wrapper.setProps({ show: false })
    await flushPromises()

    // Re-open with empty batch — textarea should be empty, no stale state
    await wrapper.setProps({ show: true })
    await flushPromises()

    expect((getTextarea(wrapper).element as HTMLTextAreaElement).value).toBe('')
  })
})

describe('AddTask split preference sync', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetBatchIdCounter()
  })

  it('syncs form.split from preferenceStore.config.split when dialog opens', async () => {
    const { usePreferenceStore } = await import('@/stores/preference')
    const preferenceStore = usePreferenceStore()
    // Simulate user having saved maxConnectionPerServer=32 in Basic settings
    // which writes split=32 to the store via transformBasicForStore
    preferenceStore.$patch({ config: { split: 32, maxConnectionPerServer: 32, engineMaxConnectionPerServer: 32 } })

    const wrapper = mountDialog()
    await flushPromises()

    // Initially mounted with stale default (64 from DEFAULT_APP_CONFIG)
    // Opening the dialog should sync to the store's latest value
    await wrapper.setProps({ show: true })
    await flushPromises()
    await nextTick()

    // Find the split input (NInputNumber renders as <input type="number">)
    const numberInputs = wrapper.findAll('input[type="number"]')
    // The split input should reflect the store value, not the stale default
    const splitInput = numberInputs.find((i) => Number((i.element as HTMLInputElement).value) <= 64)
    expect(splitInput).toBeDefined()
    expect(Number((splitInput!.element as HTMLInputElement).value)).toBe(32)
  })

  it('falls back to maxConnectionPerServer when config.split is absent', async () => {
    const { usePreferenceStore } = await import('@/stores/preference')
    const preferenceStore = usePreferenceStore()
    // Simulate legacy store data where split was never saved — explicitly
    // null out split so the ?? fallback to maxConnectionPerServer kicks in.
    preferenceStore.$patch({
      config: { split: undefined as unknown as number, maxConnectionPerServer: 48 },
    })

    const wrapper = mountDialog()
    await flushPromises()

    await wrapper.setProps({ show: true })
    await flushPromises()
    await nextTick()

    const numberInputs = wrapper.findAll('input[type="number"]')
    const splitInput = numberInputs.find((i) => {
      const val = Number((i.element as HTMLInputElement).value)
      return val > 0 && val <= 128
    })
    expect(splitInput).toBeDefined()
    expect(Number((splitInput!.element as HTMLInputElement).value)).toBe(48)
  })

  it('re-syncs split on subsequent opens after preference changes', async () => {
    const { usePreferenceStore } = await import('@/stores/preference')
    const preferenceStore = usePreferenceStore()
    preferenceStore.$patch({ config: { split: 64, maxConnectionPerServer: 64, engineMaxConnectionPerServer: 64 } })

    const wrapper = mountDialog()
    await flushPromises()

    // First open — split should be 64
    await wrapper.setProps({ show: true })
    await flushPromises()
    await nextTick()

    // Close
    await wrapper.setProps({ show: false })
    await flushPromises()

    // User changes preference while dialog is closed
    preferenceStore.$patch({ config: { split: 16, maxConnectionPerServer: 16, engineMaxConnectionPerServer: 16 } })

    // Re-open — split should now be 16
    await wrapper.setProps({ show: true })
    await flushPromises()
    await nextTick()

    const numberInputs = wrapper.findAll('input[type="number"]')
    const splitInput = numberInputs.find((i) => {
      const val = Number((i.element as HTMLInputElement).value)
      return val > 0 && val <= 128
    })
    expect(splitInput).toBeDefined()
    expect(Number((splitInput!.element as HTMLInputElement).value)).toBe(16)
  })
})

describe('AddTask redesigned layout and animation structure', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetBatchIdCounter()
  })

  // ── Layout: dual-tab with NTabs ────────────────────────────────────

  it('uses NTabs dual-tab layout with URI and Torrent tabs', async () => {
    const source = (await import('@/components/task/AddTask.vue?raw')).default
    expect(source).toContain('NTabs')
    expect(source).toContain('NTabPane')
    expect(source).toContain('ADD_TASK_TYPE.URI')
    expect(source).toContain('ADD_TASK_TYPE.TORRENT')
  })

  it('does not import TorrentUpload — functionality merged inline', async () => {
    const source = (await import('@/components/task/AddTask.vue?raw')).default
    expect(source).not.toContain('TorrentUpload')
  })

  it('renders a textarea for URI input in the URI tab', async () => {
    const appStore = useAppStore()
    appStore.pendingBatch = []

    const wrapper = mountDialog()
    await wrapper.setProps({ show: true })
    await flushPromises()

    expect(getTextarea(wrapper).exists()).toBe(true)
  })

  // ── Torrent panel: conditional rendering ───────────────────────────

  it('shows the torrent panel (.torrent-panel) when fileItems exist', async () => {
    const appStore = useAppStore()
    appStore.pendingBatch = [createBatchItem('torrent', '/tmp/a.torrent')]

    const wrapper = mountDialog()
    await wrapper.setProps({ show: true })
    await flushPromises()

    expect(wrapper.find('.torrent-panel').exists()).toBe(true)
  })

  it('hides the torrent panel when no fileItems exist', async () => {
    const appStore = useAppStore()
    appStore.pendingBatch = []

    const wrapper = mountDialog()
    await wrapper.setProps({ show: true })
    await flushPromises()

    expect(wrapper.find('.torrent-panel').exists()).toBe(false)
  })

  it('renders batch items inside the torrent panel', async () => {
    const appStore = useAppStore()
    appStore.pendingBatch = [createBatchItem('torrent', '/tmp/a.torrent'), createBatchItem('torrent', '/tmp/b.torrent')]

    const wrapper = mountDialog()
    await wrapper.setProps({ show: true })
    await flushPromises()

    expect(wrapper.findAll('.batch-item').length).toBe(2)
  })

  // ── Animation: WAAPI TransitionGroup ───────────────────────────────

  it('uses TransitionGroup with name="blist" for WAAPI + CSS move hybrid', async () => {
    const source = (await import('@/components/task/AddTask.vue?raw')).default
    // name="blist" enables Vue's built-in sibling FLIP via .blist-move CSS
    expect(source).toContain('name="blist"')
    // Must NOT use old names that caused CSS cascade conflicts
    expect(source).not.toContain('name="bitem"')
    expect(source).not.toContain('name="batch-item"')
    // Must have .blist-move CSS for sibling FLIP and .blist-leave-active for position:absolute
    expect(source).toContain('.blist-move')
    expect(source).toContain('.blist-leave-active')
  })

  it('defines onItemEnter and onItemLeave WAAPI hooks in script', async () => {
    const source = (await import('@/components/task/AddTask.vue?raw')).default
    expect(source).toContain('onItemEnter')
    expect(source).toContain('onItemLeave')
    // Must use Element.animate() — the WAAPI call
    expect(source).toContain('.animate(')
    // Must call done() callback for Vue to know when animation finishes
    expect(source).toContain('.onfinish')
  })

  it('wires @enter and @leave hooks on the TransitionGroup', async () => {
    const source = (await import('@/components/task/AddTask.vue?raw')).default
    expect(source).toContain('@enter="onItemEnter"')
    expect(source).toContain('@leave="onItemLeave"')
  })

  // ── Animation: torrent panel transition ────────────────────────────

  it('wraps the torrent panel in a <Transition> for smooth enter/leave', async () => {
    const source = (await import('@/components/task/AddTask.vue?raw')).default
    expect(source).toContain('name="torrent-panel"')
  })

  // ── Animation: content-fade retained ───────────────────────────────

  it('retains content-fade transition for file detail switching', async () => {
    const source = (await import('@/components/task/AddTask.vue?raw')).default
    expect(source).toContain('name="content-fade"')
  })

  // ── No CSS transition class pollution ──────────────────────────────

  it('does not define bitem-* CSS classes (WAAPI replaces CSS transitions)', async () => {
    const source = (await import('@/components/task/AddTask.vue?raw')).default
    expect(source).not.toContain('.bitem-enter-active')
    expect(source).not.toContain('.bitem-leave-active')
    expect(source).not.toContain('.bitem-enter-from')
    expect(source).not.toContain('.bitem-leave-to')
  })

  it('does not use the old useAddTaskAnimations composable', async () => {
    const source = (await import('@/components/task/AddTask.vue?raw')).default
    expect(source).not.toContain('useAddTaskAnimations')
  })
})
