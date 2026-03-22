/**
 * @fileoverview Structural test: MainLayout.vue tray/toolbar resume-all and
 * pause-all guards must use the global hasActiveTasks/hasPausedTasks methods
 * instead of checking taskStore.taskList directly.
 *
 * Root cause: taskStore.taskList only contains tasks for the current tab.
 * When the user switches to "Completed", taskList has no active/paused tasks,
 * causing the guard to incorrectly show "no tasks to resume/pause".
 * The fix uses hasActiveTasks()/hasPausedTasks() which query aria2 globally.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

const APP_EVENTS = path.resolve(__dirname, '..', '..', 'composables', 'useAppEvents.ts')

describe('MainLayout resume/pause all guards', () => {
  let source: string

  beforeAll(() => {
    // Guard logic extracted to useAppEvents composable
    source = fs.readFileSync(APP_EVENTS, 'utf-8')
  })

  it('does NOT use taskList.some for resume-all guard', () => {
    // The banned pattern: using taskList to check for paused tasks.
    // This is tab-dependent and causes the bug.
    const bannedPattern = /taskList\.some\([^)]*PAUSED/
    expect(source).not.toMatch(bannedPattern)
  })

  it('does NOT use taskList.some for pause-all guard', () => {
    // The banned pattern: using taskList to check for active/waiting tasks.
    const bannedPattern = /taskList\.some\([^)]*ACTIVE/
    expect(source).not.toMatch(bannedPattern)
  })

  it('uses hasPausedTasks() for resume-all guard', () => {
    expect(source).toContain('hasPausedTasks()')
  })

  it('uses hasActiveTasks() for pause-all guard', () => {
    expect(source).toContain('hasActiveTasks()')
  })
})
