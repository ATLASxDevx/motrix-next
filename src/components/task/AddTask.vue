<script setup lang="ts">
/** @fileoverview Add task dialog: dual-tab layout (URI / Torrent) with WAAPI-driven animations. */
import { ref, computed, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useAppStore } from '@/stores/app'
import { useTaskStore } from '@/stores/task'
import { usePreferenceStore } from '@/stores/preference'
import { ADD_TASK_TYPE } from '@shared/constants'
import { detectResource, bytesToSize } from '@shared/utils'
import { mergeUriLines } from '@shared/utils/batchHelpers'
import {
  buildEngineOptions,
  classifySubmitError,
  submitBatchItems,
  submitManualUris,
} from '@/composables/useAddTaskSubmit'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { downloadDir } from '@tauri-apps/api/path'
import { logger } from '@shared/logger'

import { resolveUnresolvedItems, chooseTorrentFile as chooseTorrentFileImpl } from '@/composables/useAddTaskFileOps'
import {
  NModal,
  NCard,
  NTabs,
  NTabPane,
  NForm,
  NFormItem,
  NInput,
  NInputNumber,
  NButton,
  NSpace,
  NGrid,
  NGridItem,
  NIcon,
  NInputGroup,
  NDataTable,
  NTag,
  NEllipsis,
} from 'naive-ui'
import { useAppMessage } from '@/composables/useAppMessage'
import type { DataTableColumns } from 'naive-ui'
import type { BatchItem } from '@shared/types'
import { FolderOpenOutline, CloudUploadOutline } from '@vicons/ionicons5'
import AdvancedOptions from './addtask/AdvancedOptions.vue'

const props = defineProps<{ show: boolean }>()
const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()
const router = useRouter()
const appStore = useAppStore()
const taskStore = useTaskStore()
const preferenceStore = usePreferenceStore()
const message = useAppMessage()

const activeTab = ref(ADD_TASK_TYPE.URI)
const showAdvanced = ref(false)
const config = preferenceStore.config
const submitting = ref(false)
const selectedBatchIndex = ref(0)

const form = ref({
  uris: '',
  out: '',
  dir: config.dir || '',
  split: config.split || 16,
  userAgent: '',
  authorization: '',
  referer: '',
  cookie: '',
  allProxy: '',
})

const maxSplit = computed(() => config.engineMaxConnectionPerServer || 64)

const fileColumns = computed<DataTableColumns>(() => [
  { type: 'selection' },
  { title: t('task.file-index'), key: 'idx', width: 50 },
  { title: t('task.file-name'), key: 'path', ellipsis: { tooltip: true } },
  {
    title: t('task.file-size'),
    key: 'length',
    width: 100,
    render(row: Record<string, unknown>) {
      return bytesToSize(row.length as number)
    },
  },
])

// ── Computed batch accessors ────────────────────────────────────────

const batch = computed(() => appStore.pendingBatch)
const hasBatch = computed(() => batch.value.length > 0)
const fileItems = computed(() => batch.value.filter((i) => i.kind !== 'uri'))
const selectedItem = computed(() => fileItems.value[selectedBatchIndex.value] || null)

// Sync download dir and split with latest preference every time the dialog
// opens. AddTask is kept mounted (`:show` not `v-if`), so form values would
// otherwise be stale if the user changes defaults in preferences.
watch(
  () => props.show,
  (visible) => {
    if (visible) {
      form.value.dir = preferenceStore.config.dir || form.value.dir
      // Sync split — prefer config.split, fall back to maxConnectionPerServer
      // for stores that predate the split sync fix.
      form.value.split =
        preferenceStore.config.split ?? preferenceStore.config.maxConnectionPerServer ?? form.value.split
    }
  },
)

const checkedRowKeys = computed({
  get: () => selectedItem.value?.selectedFileIndices || [],
  set: (keys: number[]) => {
    const item = selectedItem.value
    if (item) item.selectedFileIndices = keys
  },
})

const submitLabel = computed(() => {
  const pending = batch.value.filter((i) => i.status === 'pending').length
  const failed = batch.value.filter((i) => i.status === 'failed').length
  const count = pending + failed
  if (count > 1) return `${t('app.submit')} (${count})`
  return t('app.submit')
})

// ── Lifecycle ───────────────────────────────────────────────────────

onMounted(async () => {
  if (!form.value.dir) {
    try {
      form.value.dir = await downloadDir()
    } catch (e) {
      logger.debug('AddTask.dir', e)
      form.value.dir = '~/Downloads'
    }
  }
})

// When dialog opens: resolve file items, flush URIs into textarea, auto-select tab
watch(
  () => props.show,
  async (visible) => {
    if (!visible) return
    selectedBatchIndex.value = 0

    if (hasBatch.value) {
      // Resolve file-based items
      await localResolveUnresolvedItems()
      // Flush URI batch items into the editable textarea via normalized merge
      const uriItems = batch.value.filter((i) => i.kind === 'uri')
      if (uriItems.length > 0) {
        form.value.uris = mergeUriLines(
          form.value.uris,
          uriItems.map((i) => i.payload),
        )
        appStore.pendingBatch = batch.value.filter((i) => i.kind !== 'uri')
      }
      // Auto-switch to Torrent tab when file items are present
      if (fileItems.value.length > 0) {
        activeTab.value = ADD_TASK_TYPE.TORRENT
      } else {
        activeTab.value = ADD_TASK_TYPE.URI
      }
    } else {
      activeTab.value = ADD_TASK_TYPE.URI
      // No batch — check clipboard for URIs
      try {
        const { readText } = await import('@tauri-apps/plugin-clipboard-manager')
        const text = await readText()
        if (text && detectResource(text)) {
          form.value.uris = text.trim()
        }
      } catch (e) {
        logger.debug('AddTask.readClipboard', e)
      }
    }
  },
)

// Watch for new batch items added while dialog is already open (drag-drop, deep link)
watch(
  () => batch.value.length,
  async (newLen, oldLen) => {
    if (!props.show || newLen <= oldLen) return
    // Flush any newly added URI items via normalized merge (dedup against existing)
    const uriItems = batch.value.filter((i) => i.kind === 'uri')
    if (uriItems.length > 0) {
      form.value.uris = mergeUriLines(
        form.value.uris,
        uriItems.map((i) => i.payload),
      )
      appStore.pendingBatch = batch.value.filter((i) => i.kind !== 'uri')
    }
    await localResolveUnresolvedItems()
    // Auto-switch to Torrent tab when file items arrive
    if (fileItems.value.length > 0) {
      activeTab.value = ADD_TASK_TYPE.TORRENT
    }
  },
)

// ── File resolution (delegated to useAddTaskFileOps) ────────────────

async function localResolveUnresolvedItems() {
  await resolveUnresolvedItems(batch.value, t)
}

async function chooseTorrentFile() {
  await chooseTorrentFileImpl({
    t,
    batch,
    fileItems,
    selectedBatchIndex,
    setPendingBatch: (items) => {
      appStore.pendingBatch = items
    },
    showWarning: (msg) => message.warning(msg),
  })
}

async function chooseDirectory() {
  try {
    const selected = await openDialog({ directory: true })
    if (typeof selected === 'string') form.value.dir = selected
  } catch (e) {
    logger.debug('AddTask.chooseDirectory', e)
  }
}

function removeBatchItem(item: BatchItem) {
  appStore.pendingBatch = batch.value.filter((i) => i !== item)
  selectedBatchIndex.value = Math.min(selectedBatchIndex.value, Math.max(0, fileItems.value.length - 1))
}

// ── WAAPI animation hooks (TransitionGroup :css="false") ────────────
// Pure JS — zero CSS class dependencies, immune to cascade conflicts.
// FLIP technique: container height is animated alongside item animations.

const batchListRef = ref<HTMLElement | null>(null)
let savedContainerHeight = 0

function onBeforeEnter() {
  const c = batchListRef.value
  if (c) savedContainerHeight = c.offsetHeight
}

function onItemEnter(el: Element, done: () => void) {
  // ── Item animation ──
  ;(el as HTMLElement).animate(
    [
      { opacity: 0, transform: 'translateY(-8px)' },
      { opacity: 1, transform: 'translateY(0)' },
    ],
    { duration: 200, easing: 'ease-out' },
  ).onfinish = done

  // ── Container FLIP: animate height from snapshot → new natural height ──
  const c = batchListRef.value
  if (c && savedContainerHeight > 0) {
    const newHeight = c.scrollHeight
    if (savedContainerHeight !== newHeight) {
      c.style.overflow = 'hidden'
      c.animate([{ height: `${savedContainerHeight}px` }, { height: `${newHeight}px` }], {
        duration: 200,
        easing: 'ease-out',
      }).onfinish = () => {
        c.style.overflow = ''
      }
    }
  }
}

function onBeforeLeave() {
  const c = batchListRef.value
  if (c) {
    savedContainerHeight = c.offsetHeight
    // Lock container height so it doesn't snap when Vue applies position:absolute
    c.style.height = `${savedContainerHeight}px`
  }
}

function onItemLeave(el: Element, done: () => void) {
  const itemEl = el as HTMLElement
  const c = batchListRef.value

  // Pre-calculate target height: the leaving element is position:absolute (via CSS)
  // but we can't read scrollHeight because the container height is locked.
  // Instead, compute directly from the item's contribution.
  const targetHeight = Math.max(0, savedContainerHeight - itemEl.offsetHeight)

  // ── Container shrink: starts IMMEDIATELY (parallel with fade) ──
  if (c) {
    c.animate([{ height: `${savedContainerHeight}px` }, { height: `${targetHeight}px` }], {
      duration: 200,
      easing: 'ease-out',
    }).onfinish = () => {
      c.style.height = ''
    }
  }

  // ── Item fade: runs in parallel, calls done() when finished ──
  itemEl.animate([{ opacity: 1 }, { opacity: 0 }], {
    duration: 150,
    easing: 'ease-out',
  }).onfinish = done
}

// ── Submit ───────────────────────────────────────────────────────────

function handleClose() {
  emit('close')
  Object.assign(form.value, {
    uris: '',
    out: '',
    userAgent: '',
    authorization: '',
    referer: '',
    cookie: '',
    allProxy: '',
  })
  submitting.value = false
  selectedBatchIndex.value = 0
}

async function handleSubmit() {
  if (submitting.value) return
  submitting.value = true

  try {
    const options = buildEngineOptions(form.value)

    if (hasBatch.value) {
      await submitBatchItems(batch.value, options, taskStore)
    }
    if (form.value.uris.trim()) {
      await submitManualUris(form.value, options, taskStore)
    }

    const failed = batch.value.filter((i) => i.status === 'failed')
    if (failed.length > 0) {
      message.warning(`${failed.length} ${t('task.failed') || 'failed'}`, { duration: 5000, closable: true })
    } else {
      handleClose()
      if (preferenceStore.config.newTaskShowDownloading !== false) {
        router.push({ path: '/task/active' }).catch(() => {})
      }
    }
  } catch (e: unknown) {
    const category = classifySubmitError(e)
    const errMsg = e instanceof Error ? e.message : String(e)
    logger.error('AddTask.submit', e)
    if (category === 'engine-not-ready') {
      message.error(t('app.engine-not-ready'), { duration: 5000, closable: true })
    } else if (category === 'duplicate') {
      message.warning(errMsg, { duration: 5000, closable: true })
    } else {
      message.error(errMsg, { duration: 5000, closable: true })
    }
  } finally {
    submitting.value = false
  }
}

function kindTagType(kind: string): 'info' | 'success' | 'warning' {
  switch (kind) {
    case 'torrent':
      return 'info'
    case 'metalink':
      return 'success'
    default:
      return 'warning'
  }
}
</script>

<template>
  <NModal
    :show="props.show"
    :mask-closable="false"
    :close-on-esc="true"
    :auto-focus="false"
    transform-origin="center"
    :transition="{ name: 'fade-scale' }"
    @update:show="
      (v: boolean) => {
        if (!v) handleClose()
      }
    "
  >
    <NCard
      :title="t('task.new-task')"
      closable
      class="add-task-card"
      :style="{
        maxWidth: '680px',
        minWidth: '380px',
        width: '70vw',
        margin: 'auto',
        height: '82vh',
        display: 'flex',
        flexDirection: 'column',
      }"
      :content-style="{ flex: '1', minHeight: '0', overflowY: 'auto', overflowX: 'hidden' }"
      :segmented="{ footer: true }"
      @close="handleClose"
    >
      <NForm label-placement="left" label-width="110px">
        <NTabs :value="activeTab" type="line" animated @update:value="(v: string) => (activeTab = v)">
          <!-- ── URI Tab ──────────────────────────────────────── -->
          <NTabPane :name="ADD_TASK_TYPE.URI" :tab="t('task.uri-task') || 'URL'">
            <div class="tab-pane-content">
              <NFormItem :show-label="false" style="margin-bottom: 0">
                <NInput
                  v-model:value="form.uris"
                  type="textarea"
                  :rows="5"
                  :placeholder="t('task.uri-task-tips') || 'One URL per line'"
                />
              </NFormItem>
            </div>
          </NTabPane>

          <!-- ── Torrent Tab ─────────────────────────────────── -->
          <NTabPane :name="ADD_TASK_TYPE.TORRENT" :tab="t('task.torrent-task') || 'Torrent'">
            <div class="tab-pane-content">
              <!-- Torrent panel: animated batch list + file detail -->
              <Transition name="torrent-panel">
                <div v-if="fileItems.length > 0" class="torrent-panel">
                  <!-- Batch list with WAAPI animations + container FLIP -->
                  <div ref="batchListRef" class="batch-list">
                    <TransitionGroup
                      tag="div"
                      name="blist"
                      @before-enter="onBeforeEnter"
                      @enter="onItemEnter"
                      @before-leave="onBeforeLeave"
                      @leave="onItemLeave"
                    >
                      <div
                        v-for="(item, idx) in fileItems"
                        :key="item.id"
                        class="batch-item"
                        :class="{ 'batch-item-selected': idx === selectedBatchIndex }"
                        @click="selectedBatchIndex = idx"
                      >
                        <div class="batch-item-main">
                          <NEllipsis :style="{ maxWidth: '400px', flex: 1 }">{{ item.displayName }}</NEllipsis>
                          <NSpace :size="4" align="center" :wrap="false">
                            <NTag :type="kindTagType(item.kind)" size="small" :bordered="false">
                              {{ item.kind === 'metalink' ? 'Metalink' : 'Torrent' }}
                            </NTag>
                            <NButton quaternary size="tiny" @click.stop="removeBatchItem(item)">✕</NButton>
                          </NSpace>
                        </div>
                      </div>
                    </TransitionGroup>
                  </div>

                  <!-- Add more files button -->
                  <NButton size="small" dashed block style="margin-top: 6px" @click="chooseTorrentFile">
                    <template #icon>
                      <NIcon><CloudUploadOutline /></NIcon>
                    </template>
                    {{ t('task.select-torrent') || 'Select torrent files' }}
                  </NButton>

                  <!-- File detail for selected torrent -->
                  <Transition name="content-fade" mode="out-in">
                    <div
                      v-if="selectedItem?.torrentMeta && selectedItem.torrentMeta.files.length > 0"
                      :key="selectedItem?.id"
                      class="torrent-file-list"
                    >
                      <NDataTable
                        v-model:checked-row-keys="checkedRowKeys"
                        :columns="fileColumns"
                        :data="selectedItem.torrentMeta.files"
                        :row-key="(row: any) => row.idx as number"
                        size="small"
                        :max-height="200"
                        :scroll-x="400"
                      />
                    </div>
                  </Transition>
                </div>
              </Transition>

              <!-- Upload zone: shown when no torrents loaded -->
              <div v-if="fileItems.length === 0" class="torrent-upload-zone" @click="chooseTorrentFile">
                <NIcon :size="36" :depth="3"><CloudUploadOutline /></NIcon>
                <span class="torrent-upload-text">
                  {{ t('task.select-torrent') || 'Drag torrent here or click to select' }}
                </span>
              </div>
            </div>
          </NTabPane>
        </NTabs>

        <!-- ── Download settings: always visible ──────────────── -->
        <div class="download-settings">
          <NGrid :cols="24" :x-gap="12">
            <NGridItem :span="15">
              <NFormItem :label="t('task.task-out') + ':'">
                <NInput v-model:value="form.out" :placeholder="t('task.task-out-tips')" :autofocus="false" />
              </NFormItem>
            </NGridItem>
            <NGridItem :span="9">
              <NFormItem :label="t('task.task-split') + ':'">
                <NInputNumber v-model:value="form.split" :min="1" :max="maxSplit" style="width: 100%" />
              </NFormItem>
            </NGridItem>
          </NGrid>
          <NFormItem :label="t('task.task-dir') + ':'">
            <NInputGroup>
              <NInput v-model:value="form.dir" style="flex: 1" />
              <NButton @click="chooseDirectory">
                <template #icon>
                  <NIcon><FolderOpenOutline /></NIcon>
                </template>
              </NButton>
            </NInputGroup>
          </NFormItem>
          <AdvancedOptions
            v-model:show="showAdvanced"
            v-model:user-agent="form.userAgent"
            v-model:authorization="form.authorization"
            v-model:referer="form.referer"
            v-model:cookie="form.cookie"
            v-model:all-proxy="form.allProxy"
          />
        </div>
      </NForm>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="handleClose">{{ t('app.cancel') }}</NButton>
          <NButton type="primary" :loading="submitting" @click="handleSubmit">{{ submitLabel }}</NButton>
        </NSpace>
      </template>
    </NCard>
  </NModal>
</template>

<style scoped>
.torrent-file-list {
  margin-top: 8px;
}

/* Fixed-height tab panes prevent jitter when switching tabs.
 * URI textarea rows=5 ≈ 138px — keep both panes at same min-height. */
.tab-pane-content {
  min-height: 150px;
}

/* ── Torrent panel ────────────────────────────────────────────────── */
.torrent-panel {
  margin-bottom: 12px;
  padding: 12px;
  border-radius: 8px;
  border: 1px solid var(--n-border-color, var(--m3-outline-variant));
  background: var(--n-color, var(--m3-surface-container-low));
}

/* ── Batch list ───────────────────────────────────────────────────── */
.batch-list {
  border-radius: 6px;
  border: 1px solid var(--n-border-color, var(--m3-outline-variant));
  overflow: hidden;
}

/* ── Upload zone (when no torrents) ───────────────────────────────── */
.torrent-upload-zone {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 138px;
  border: 1px dashed var(--m3-drop-zone-border);
  border-radius: 8px;
  cursor: pointer;
  transition: border-color 0.2s cubic-bezier(0.2, 0, 0, 1);
}
.torrent-upload-zone:hover {
  border-color: var(--color-primary);
}
.torrent-upload-text {
  font-size: 13px;
  opacity: 0.6;
}

/* ── Download settings ────────────────────────────────────────────── */
.download-settings {
  margin-top: 4px;
}
</style>

<!-- Non-scoped: Vue Transition classes must NOT be scoped -->
<style>
/* ── Torrent panel enter/leave ────────────────────────────────────── */
.torrent-panel-enter-active {
  transition:
    opacity 0.2s ease-out,
    transform 0.2s ease-out;
}
.torrent-panel-leave-active {
  transition:
    opacity 0.15s ease-out,
    transform 0.15s ease-out;
}
.torrent-panel-enter-from,
.torrent-panel-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

/* ── Batch item base styles ───────────────────────────────────────── */
.batch-item {
  padding: 8px 12px;
  cursor: pointer;
  transition: background-color 0.15s;
}
.batch-item:hover {
  background: var(--n-color-hover, var(--m3-surface-container-high));
}
.batch-item-selected {
  background: var(--n-color-hover, var(--m3-surface-container-highest));
}
.batch-item + .batch-item {
  border-top: 1px solid var(--n-border-color, var(--m3-outline-variant));
}
.batch-item-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

/* ── Content crossfade (file detail switching) ────────────────────── */
.content-fade-enter-active {
  transition: opacity 0.2s cubic-bezier(0.2, 0, 0, 1);
}
.content-fade-leave-active {
  transition: opacity 0.15s cubic-bezier(0.3, 0, 0.8, 0.15);
}
.content-fade-enter-from,
.content-fade-leave-to {
  opacity: 0;
}

/* ── TransitionGroup sibling FLIP (move) + leave-active ───────────── */
.blist-move {
  transition: transform 200ms ease-out;
}
.blist-leave-active {
  position: absolute;
  left: 0;
  right: 0;
}
</style>
