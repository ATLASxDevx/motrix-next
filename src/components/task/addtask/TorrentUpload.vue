<script setup lang="ts">
/** @fileoverview Torrent file drop zone and file list display. */
import { NIcon, NText } from 'naive-ui'
import { CloudUploadOutline } from '@vicons/ionicons5'

defineProps<{
  loaded: boolean
}>()

defineEmits<{
  choose: []
}>()
</script>

<template>
  <div class="tab-pane-content">
    <Transition name="content-fade" mode="out-in">
      <div v-if="loaded" key="loaded">
        <slot name="file-list" />
      </div>
      <div v-else key="empty" class="torrent-upload" @click="$emit('choose')">
        <NIcon :size="48" :depth="3"><CloudUploadOutline /></NIcon>
        <NText style="display: block; margin-top: 8px; font-size: 14px">
          <slot name="placeholder">Drag torrent here or click to select</slot>
        </NText>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.tab-pane-content {
  min-height: 150px;
  padding-bottom: 12px;
}
.torrent-upload {
  min-height: 138px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  border: 1px dashed var(--m3-drop-zone-border);
  border-radius: 8px;
  cursor: pointer;
  transition: border-color 0.2s cubic-bezier(0.2, 0, 0, 1);
}
.torrent-upload:hover {
  border-color: var(--color-primary);
}
</style>
