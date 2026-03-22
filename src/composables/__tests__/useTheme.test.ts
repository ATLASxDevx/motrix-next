/**
 * @fileoverview Tests for the useTheme composable.
 *
 * Key behaviors under test:
 * - 'dark' theme forces isDark=true regardless of system preference
 * - 'light' theme forces isDark=false regardless of system preference
 * - 'auto' theme follows the system prefers-color-scheme media query
 * - Document element receives data-theme attribute and .dark class
 * - System media query change events are reflected when in auto mode
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { usePreferenceStore } from '@/stores/preference'

// ── Mock matchMedia ─────────────────────────────────────────────────
let mediaQueryMatches = false
const changeListeners: Array<() => void> = []
const mockMatchMedia = vi.fn().mockImplementation(() => ({
  matches: mediaQueryMatches,
  addEventListener: (_event: string, cb: () => void) => {
    changeListeners.push(cb)
  },
  removeEventListener: vi.fn(),
}))

Object.defineProperty(window, 'matchMedia', { value: mockMatchMedia, writable: true })

import { useTheme } from '../useTheme'

describe('useTheme', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mediaQueryMatches = false
    changeListeners.length = 0
    document.documentElement.classList.remove('dark')
    document.documentElement.removeAttribute('data-theme')
  })

  it('sets isDark=true and applies dark class when theme is "dark"', () => {
    const store = usePreferenceStore()
    store.config.theme = 'dark'

    const { isDark } = useTheme()

    expect(isDark.value).toBe(true)
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  it('sets isDark=false and removes dark class when theme is "light"', () => {
    const store = usePreferenceStore()
    store.config.theme = 'light'

    const { isDark } = useTheme()

    expect(isDark.value).toBe(false)
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })

  it('follows system dark mode when theme is "auto" and system prefers dark', () => {
    mediaQueryMatches = true
    const store = usePreferenceStore()
    store.config.theme = 'auto'

    const { isDark } = useTheme()

    expect(isDark.value).toBe(true)
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  it('follows system light mode when theme is "auto" and system prefers light', () => {
    mediaQueryMatches = false
    const store = usePreferenceStore()
    store.config.theme = 'auto'

    const { isDark } = useTheme()

    expect(isDark.value).toBe(false)
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })

  it('responds to system media query changes when in auto mode', () => {
    mediaQueryMatches = false
    const store = usePreferenceStore()
    store.config.theme = 'auto'

    const { isDark } = useTheme()
    expect(isDark.value).toBe(false)

    // Simulate system dark mode toggle
    mediaQueryMatches = true
    changeListeners.forEach((cb) => cb())

    expect(isDark.value).toBe(true)
  })

  it('ignores system media query changes when forced to a specific theme', () => {
    mediaQueryMatches = false
    const store = usePreferenceStore()
    store.config.theme = 'light'

    const { isDark } = useTheme()
    expect(isDark.value).toBe(false)

    // Simulate system dark mode toggle — should be ignored
    mediaQueryMatches = true
    changeListeners.forEach((cb) => cb())

    expect(isDark.value).toBe(false)
  })
})
