<script setup lang="ts">
/**
 * @fileoverview Platform-aware window control buttons.
 *
 * Renders macOS-style traffic light buttons (close → minimize → fullscreen, left)
 * or Windows-style icon buttons (minimize → maximize → close, right) based on the
 * user's `macStyleControls` preference.
 *
 * Traffic light design follows Apple HIG: 12 px circles, standard colours,
 * group-hover reveals inline SVG icons, window blur dims all three to grey.
 */
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { NIcon } from 'naive-ui'
import { RemoveOutline, CopyOutline, SquareOutline, CloseOutline } from '@vicons/ionicons5'
import { usePreferenceStore } from '@/stores/preference'

defineProps<{
  isMaximized: boolean
}>()

const emit = defineEmits<{
  close: []
  'maximize-toggled': []
}>()

const appWindow = getCurrentWindow()
const preferenceStore = usePreferenceStore()

const macStyle = computed(() => !!preferenceStore.config.macStyleControls)

// ── Window focus state (traffic-light blur dimming) ─────────────────
const isFocused = ref(true)
let unlistenFocus: (() => void) | null = null

onMounted(async () => {
  unlistenFocus = await appWindow.onFocusChanged(({ payload }) => {
    isFocused.value = payload
  })
})

onUnmounted(() => {
  unlistenFocus?.()
})

// ── Window actions ──────────────────────────────────────────────────

function minimize() {
  appWindow.minimize()
}

function toggleMaximize() {
  appWindow.toggleMaximize()
  emit('maximize-toggled')
}

async function close() {
  if (preferenceStore.config.minimizeToTrayOnClose) {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('set_dock_visible', { visible: false })
    appWindow.hide()
  } else {
    emit('close')
  }
}
</script>

<template>
  <div class="window-controls" :class="{ 'mac-style': macStyle }">
    <Transition name="ctrl-swap" mode="out-in">
      <!-- macOS traffic light: close → minimize → fullscreen -->
      <div v-if="macStyle" key="mac" class="traffic-lights" :class="{ blurred: !isFocused }">
        <button class="tl tl-close" title="Close" @click="close">
          <svg class="tl-icon" viewBox="0 0 12 12">
            <line x1="3.5" y1="3.5" x2="8.5" y2="8.5" />
            <line x1="8.5" y1="3.5" x2="3.5" y2="8.5" />
          </svg>
        </button>
        <button class="tl tl-minimize" title="Minimize" @click="minimize">
          <svg class="tl-icon" viewBox="0 0 12 12">
            <line x1="2.5" y1="6" x2="9.5" y2="6" />
          </svg>
        </button>
        <button class="tl tl-maximize" :title="isMaximized ? 'Restore' : 'Maximize'" @click="toggleMaximize">
          <!-- Fullscreen: two filled triangles pointing to opposite corners -->
          <svg v-if="!isMaximized" class="tl-icon tl-icon--filled" viewBox="0 0 12 12">
            <polygon points="2.5,9.5 2.5,5 7,9.5" />
            <polygon points="9.5,2.5 9.5,7 5,2.5" />
          </svg>
          <!-- Restore: two filled triangles pointing inward -->
          <svg v-else class="tl-icon tl-icon--filled" viewBox="0 0 12 12">
            <polygon points="5.5,6.5 5.5,10.5 1.5,6.5" />
            <polygon points="6.5,5.5 6.5,1.5 10.5,5.5" />
          </svg>
        </button>
      </div>

      <!-- Windows / Linux: original icon buttons -->
      <div v-else key="win" class="win-buttons">
        <button class="ctrl-btn" title="Minimize" @click="minimize">
          <NIcon :size="14"><RemoveOutline /></NIcon>
        </button>
        <button class="ctrl-btn" :title="isMaximized ? 'Restore' : 'Maximize'" @click="toggleMaximize">
          <NIcon :size="14">
            <Transition name="icon-swap" mode="out-in">
              <CopyOutline v-if="isMaximized" key="restore" />
              <SquareOutline v-else key="maximize" />
            </Transition>
          </NIcon>
        </button>
        <button class="ctrl-btn close" title="Close" @click="close">
          <NIcon :size="14"><CloseOutline /></NIcon>
        </button>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
/* ── Style-switch cross-fade (M3 asymmetric timing) ──────────────── */
.ctrl-swap-enter-active {
  transition:
    opacity 0.2s cubic-bezier(0.2, 0, 0, 1),
    transform 0.2s cubic-bezier(0.2, 0, 0, 1);
}
.ctrl-swap-leave-active {
  transition:
    opacity 0.15s cubic-bezier(0.3, 0, 0.8, 0.15),
    transform 0.15s cubic-bezier(0.3, 0, 0.8, 0.15);
}
.ctrl-swap-enter-from {
  opacity: 0;
  transform: scale(0.85);
}
.ctrl-swap-leave-to {
  opacity: 0;
  transform: scale(0.85);
}

/* ── Windows / Linux buttons ─────────────────────────────────────── */
.win-buttons {
  position: fixed;
  top: 6px;
  right: 12px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.ctrl-btn {
  width: 32px;
  height: 32px;
  border: 1px solid var(--window-ctrl-border);
  border-radius: 8px;
  background: var(--window-ctrl-bg);
  color: var(--window-ctrl-color);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  outline: none;
  padding: 0;
}
.ctrl-btn:hover {
  background: var(--window-ctrl-hover-bg);
  border-color: var(--window-ctrl-hover-border);
  color: var(--window-ctrl-hover-color);
}
.ctrl-btn.close:hover {
  background: rgba(255, 59, 48, 0.75);
  border-color: rgba(255, 59, 48, 0.9);
  color: #fff;
}

/* Icon cross-fade animation for maximize ↔ restore toggle */
.icon-swap-enter-active,
.icon-swap-leave-active {
  transition:
    opacity 150ms ease,
    transform 150ms ease;
}
.icon-swap-enter-from {
  opacity: 0;
  transform: scale(0.75);
}
.icon-swap-leave-to {
  opacity: 0;
  transform: scale(0.75);
}

/* ── macOS traffic-light buttons ─────────────────────────────────── */
.traffic-lights {
  position: fixed;
  top: 12px;
  left: 13px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.tl {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: none;
  padding: 0;
  cursor: pointer;
  position: relative;
  outline: none;
  transition:
    background-color 0.15s ease,
    opacity 0.15s ease;
}
.tl-close {
  background-color: #ff5f57;
}
.tl-minimize {
  background-color: #febc2e;
}
.tl-maximize {
  background-color: #28c840;
}

/* SVG icons — hidden by default, pop-in on group hover */
.tl-icon {
  position: absolute;
  inset: 0;
  width: 12px;
  height: 12px;
  opacity: 0;
  transform: scale(0);
  transition:
    opacity 0.2s ease-out,
    transform 0.2s cubic-bezier(0.34, 1.4, 0.64, 1);
  fill: none;
  stroke: rgba(0, 0, 0, 0.5);
  stroke-width: 1.2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.traffic-lights:hover .tl-icon {
  opacity: 1;
  transform: scale(1);
}
.tl-icon--filled {
  fill: rgba(0, 0, 0, 0.5);
  stroke: none;
}

/* Individual button press feedback */
.tl:active {
  opacity: 0.7;
}

/* Window blur state — all buttons dim to grey */
.traffic-lights.blurred .tl {
  background-color: var(--tl-inactive, #d4d4d4);
}
.traffic-lights.blurred .tl-icon {
  opacity: 0;
}
.traffic-lights.blurred:hover .tl-icon {
  opacity: 0;
}
</style>
