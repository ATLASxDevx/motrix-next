<script setup lang="ts">
/** @fileoverview Modal dialog for selecting files from a magnet link's metadata.
 *
 * Displayed after aria2 downloads the metadata (info dict) for a magnet URI.
 * Uses NDataTable file selection pattern consistent with torrent upload in AddTask.
 */
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { NModal, NCard, NDataTable, NButton, NSpace, NEllipsis } from 'naive-ui'
import { bytesToSize } from '@shared/utils'
import type { DataTableColumns, DataTableRowKey } from 'naive-ui'
import type { MagnetFileItem } from '@/composables/useMagnetFlow'

const props = defineProps<{
  show: boolean
  files: MagnetFileItem[]
  taskName: string
}>()

const emit = defineEmits<{
  confirm: [selectedIndices: number[]]
  cancel: []
}>()

const { t } = useI18n()

const checkedKeys = ref<DataTableRowKey[]>([])

// ── Directional animation state ─────────────────────────────────────
// Track previous values to determine slide direction:
//   value increased → new value slides UP   (counter feels like it "grows")
//   value decreased → new value slides DOWN (counter feels like it "shrinks")
const prevCount = ref(0)
const prevSize = ref(0)
const countDirection = ref<'val-up' | 'val-down'>('val-up')
const sizeDirection = ref<'val-up' | 'val-down'>('val-up')

watch(
  () => props.files,
  (files) => {
    checkedKeys.value = files.map((f) => f.index)
  },
  { immediate: true },
)

watch(
  () => checkedKeys.value.length,
  (cur, prev) => {
    countDirection.value = cur >= prev ? 'val-up' : 'val-down'
    prevCount.value = prev
  },
)

const columns = computed<DataTableColumns>(() => [
  { type: 'selection' },
  {
    title: '#',
    key: 'index',
    width: 50,
  },
  {
    title: t('task.file-name') || 'File Name',
    key: 'name',
    ellipsis: { tooltip: true },
  },
  {
    title: t('task.file-size') || 'Size',
    key: 'length',
    width: 110,
    render(row: Record<string, unknown>) {
      return bytesToSize(row.length as number)
    },
  },
])

const totalSize = computed(() => {
  const selected = new Set(checkedKeys.value)
  return props.files.filter((f) => selected.has(f.index)).reduce((sum, f) => sum + f.length, 0)
})

watch(totalSize, (cur, prev) => {
  sizeDirection.value = cur >= prev ? 'val-up' : 'val-down'
  prevSize.value = prev
})

const hasSelection = computed(() => checkedKeys.value.length > 0)

function handleConfirm() {
  emit('confirm', checkedKeys.value as number[])
}

function handleCancel() {
  emit('cancel')
}
</script>

<template>
  <NModal
    :show="show"
    :mask-closable="false"
    :close-on-esc="true"
    :auto-focus="false"
    transform-origin="center"
    :transition="{ name: 'fade-scale' }"
    @update:show="(v) => !v && handleCancel()"
  >
    <NCard
      :title="t('task.select-files') || 'Select Files'"
      :bordered="false"
      closable
      role="dialog"
      class="magnet-file-select-card"
      :style="{
        maxWidth: '640px',
        width: '85vw',
        margin: 'auto',
        height: '78vh',
        display: 'flex',
        flexDirection: 'column',
      }"
      :content-style="{ flex: '1', minHeight: '0', overflowY: 'auto', overflowX: 'hidden' }"
      :segmented="{ footer: true }"
      @close="handleCancel"
    >
      <!-- Task name subtitle -->
      <div class="task-name-subtitle">
        <NEllipsis :line-clamp="1">{{ taskName }}</NEllipsis>
      </div>

      <NDataTable
        :columns="columns"
        :data="files"
        :row-key="(row: MagnetFileItem) => row.index"
        :checked-row-keys="checkedKeys"
        :max-height="360"
        size="small"
        @update:checked-row-keys="(keys: DataTableRowKey[]) => (checkedKeys = keys)"
      />

      <template #footer>
        <NSpace justify="space-between" align="center">
          <span class="file-summary">
            <Transition :name="countDirection" mode="out-in">
              <span :key="checkedKeys.length" class="file-summary-count"
                >{{ checkedKeys.length }}/{{ files.length }}</span
              >
            </Transition>
            <span class="file-summary-sep">—</span>
            <Transition :name="sizeDirection" mode="out-in">
              <span :key="bytesToSize(totalSize)" class="file-summary-size">{{ bytesToSize(totalSize) }}</span>
            </Transition>
          </span>
          <NSpace>
            <NButton @click="handleCancel">
              {{ t('task.magnet-cancel-download') || 'Cancel Download' }}
            </NButton>
            <NButton type="primary" :disabled="!hasSelection" @click="handleConfirm">
              {{ t('task.magnet-start-download') || 'Start Download' }}
            </NButton>
          </NSpace>
        </NSpace>
      </template>
    </NCard>
  </NModal>
</template>

<style scoped>
/* Card dimensions are set via inline :style for consistency with AddTask. */

.task-name-subtitle {
  margin-bottom: 12px;
  font-size: 13px;
  color: var(--n-text-color-3, var(--m3-on-surface-variant));
  line-height: 1.4;
}

.file-summary {
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  font-size: 14px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--n-text-color-2, var(--m3-on-surface));
}

.file-summary-count,
.file-summary-size {
  display: inline-block;
}

.file-summary-sep {
  opacity: 0.5;
}

/* Value change transition — directional vertical slide.
 * val-up:   new value rises from below  (used when count increases)
 * val-down: new value drops from above  (used when count decreases) */
.val-up-enter-active,
.val-up-leave-active,
.val-down-enter-active,
.val-down-leave-active {
  transition:
    opacity 0.15s ease-out,
    transform 0.15s ease-out;
}

/* ↑ increase: enter from below, leave upward */
.val-up-enter-from {
  opacity: 0;
  transform: translateY(4px);
}
.val-up-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

/* ↓ decrease: enter from above, leave downward */
.val-down-enter-from {
  opacity: 0;
  transform: translateY(-4px);
}
.val-down-leave-to {
  opacity: 0;
  transform: translateY(4px);
}
</style>
