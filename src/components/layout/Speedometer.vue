<script setup lang="ts">
/** @fileoverview Real-time download/upload speed display widget. */
import { computed } from 'vue'
import { useAppStore } from '@/stores/app'
import { bytesToSize } from '@shared/utils'
import { NIcon } from 'naive-ui'
import { SpeedometerOutline, ArrowUpOutline, ArrowDownOutline } from '@vicons/ionicons5'

const appStore = useAppStore()

const stat = computed(() => appStore.stat)
const isStopped = computed(() => stat.value.numActive === 0)
const downloadSpeed = computed(() => bytesToSize(String(stat.value.downloadSpeed)))
const uploadSpeed = computed(() => bytesToSize(String(stat.value.uploadSpeed)))
</script>

<template>
  <div :class="['speedometer', { stopped: isStopped }]">
    <div class="mode">
      <i>
        <NIcon :size="20"><SpeedometerOutline /></NIcon>
      </i>
    </div>
    <div class="value" :class="{ hidden: isStopped }">
      <div class="speed-row upload">
        <NIcon :size="10" class="speed-arrow"><ArrowUpOutline /></NIcon>
        <em>{{ uploadSpeed }}/s</em>
      </div>
      <div class="speed-row download">
        <NIcon :size="10" class="speed-arrow"><ArrowDownOutline /></NIcon>
        <span>{{ downloadSpeed }}/s</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.speedometer {
  font-size: 12px;
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 20;
  display: inline-block;
  box-sizing: border-box;
  width: 135px;
  height: 40px;
  padding: 4px 12px 4px 40px;
  border-radius: 100px;
  transition:
    width 0.35s cubic-bezier(0.2, 0, 0, 1),
    padding 0.35s cubic-bezier(0.2, 0, 0, 1),
    border-color 0.2s cubic-bezier(0.2, 0, 0, 1),
    background 0.2s cubic-bezier(0.2, 0, 0, 1);
  border: 1px solid var(--speedometer-border);
  background: var(--speedometer-bg);
}
.speedometer:hover {
  border-color: var(--speedometer-hover-border);
}
.speedometer.stopped {
  width: 40px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.speedometer.stopped .mode {
  position: static;
}
.speedometer.stopped .mode em {
  display: none;
}
.speedometer.stopped .mode i {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  color: var(--speedometer-stopped);
  transform: rotate(-15deg);
  transition:
    transform 0.35s cubic-bezier(0.2, 0, 0, 1),
    color 0.2s cubic-bezier(0.2, 0, 0, 1);
}
.speedometer em {
  font-style: normal;
}
.mode {
  font-size: 0;
  position: absolute;
  top: 5px;
  left: 5px;
}
.mode i {
  font-size: 20px;
  font-style: normal;
  line-height: 28px;
  display: inline-block;
  box-sizing: border-box;
  width: 28px;
  height: 28px;
  padding: 2px;
  text-align: center;
  vertical-align: top;
  color: var(--speedometer-primary);
  transition:
    transform 0.35s cubic-bezier(0.2, 0, 0, 1),
    color 0.2s cubic-bezier(0.2, 0, 0, 1);
  transform: rotate(0deg);
}
.mode em {
  display: inline-block;
  width: 0;
  height: 8px;
  margin-left: 4px;
  font-size: 16px;
  line-height: 15px;
  transform: scale(0.5);
  vertical-align: top;
  color: var(--speedometer-primary);
}
.value {
  overflow: hidden;
  width: 100%;
  white-space: nowrap;
  text-overflow: ellipsis;
  opacity: 1;
  transform: translateX(0);
  transition:
    opacity 0.3s cubic-bezier(0.2, 0, 0, 1),
    transform 0.3s cubic-bezier(0.2, 0, 0, 1);
}
.value.hidden {
  opacity: 0;
  transform: translateX(-8px);
  pointer-events: none;
}
.speed-row {
  display: flex;
  align-items: center;
  gap: 3px;
  justify-content: flex-end;
}
.speed-arrow {
  flex-shrink: 0;
  opacity: 0.7;
}
.speed-row.upload {
  color: var(--speedometer-text);
}
.speed-row.upload em {
  font-style: normal;
  font-size: 11px;
  line-height: 14px;
}
.speed-row.upload .speed-arrow {
  color: var(--speedometer-text);
}
.speed-row.download {
  color: var(--speedometer-primary);
}
.speed-row.download span {
  font-size: 13px;
  line-height: 16px;
  font-weight: 500;
}
.speed-row.download .speed-arrow {
  color: var(--speedometer-primary);
}
</style>
