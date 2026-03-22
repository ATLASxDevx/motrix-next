/**
 * @fileoverview Structural test: TaskList.vue must have a conditional Speedometer
 * clearance spacer that only applies when cards are present.
 *
 * The spacer uses .task-list-inner:not(:empty)::after so that:
 * - Empty inner container (no cards) has no extra scroll space
 * - Non-empty inner container reserves space above the fixed Speedometer
 */
import { describe, it, expect, beforeAll } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

const TASK_LIST_VUE = path.resolve(__dirname, '..', '..', 'task', 'TaskList.vue')
const SPEEDOMETER_VUE = path.resolve(__dirname, '..', 'Speedometer.vue')

describe('Conditional Speedometer clearance spacer', () => {
  let taskListSource: string
  let speedometerSource: string

  beforeAll(() => {
    taskListSource = fs.readFileSync(TASK_LIST_VUE, 'utf-8')
    speedometerSource = fs.readFileSync(SPEEDOMETER_VUE, 'utf-8')
  })

  it('Speedometer occlusion zone is 60px', () => {
    const bottom = speedometerSource.match(/bottom:\s*(\d+)px/)
    const height = speedometerSource.match(/height:\s*(\d+)px/)
    expect(bottom).not.toBeNull()
    expect(height).not.toBeNull()
    expect(parseInt(bottom![1], 10) + parseInt(height![1], 10)).toBe(60)
  })

  it('spacer only applies when cards are present (inner not empty)', () => {
    expect(taskListSource).toMatch(/\.task-list-inner:not\(:empty\)::after/)
  })

  it('spacer height >= Speedometer occlusion zone', () => {
    const match = taskListSource.match(/\.task-list-inner:not\(:empty\)::after\s*\{[^}]*flex:\s*0\s+0\s+(\d+)px/)
    expect(match).not.toBeNull()
    expect(parseInt(match![1], 10)).toBeGreaterThanOrEqual(40)
  })
})
