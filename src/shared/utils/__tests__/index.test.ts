/**
 * @fileoverview Tests for the shared utility barrel module helper functions.
 *
 * Key behaviors under test:
 * - generateRandomInt produces values within [min, max) range
 * - intersection returns shared elements between two arrays
 * - pushItemToFixedLengthArray respects max length and shifts old items
 * - removeArrayItem removes only the first occurrence
 */
import { describe, it, expect } from 'vitest'
import { generateRandomInt, intersection, pushItemToFixedLengthArray, removeArrayItem } from '../index'

describe('generateRandomInt', () => {
  it('returns a value within default range [0, 10000)', () => {
    for (let i = 0; i < 50; i++) {
      const val = generateRandomInt()
      expect(val).toBeGreaterThanOrEqual(0)
      expect(val).toBeLessThan(10000)
    }
  })

  it('returns a value within custom range', () => {
    for (let i = 0; i < 50; i++) {
      const val = generateRandomInt(10, 20)
      expect(val).toBeGreaterThanOrEqual(10)
      expect(val).toBeLessThan(20)
    }
  })

  it('returns min when range is 1', () => {
    const val = generateRandomInt(5, 6)
    expect(val).toBe(5)
  })
})

describe('intersection', () => {
  it('returns common elements between two arrays', () => {
    expect(intersection([1, 2, 3], [2, 3, 4])).toEqual([2, 3])
  })

  it('returns empty array when no overlap', () => {
    expect(intersection([1, 2], [3, 4])).toEqual([])
  })

  it('returns empty array when either input is empty', () => {
    expect(intersection([], [1, 2])).toEqual([])
    expect(intersection([1, 2], [])).toEqual([])
  })

  it('handles defaults (undefined inputs)', () => {
    expect(intersection()).toEqual([])
  })

  it('works with string arrays', () => {
    expect(intersection(['a', 'b', 'c'], ['b', 'c', 'd'])).toEqual(['b', 'c'])
  })
})

describe('pushItemToFixedLengthArray', () => {
  it('appends item when array is below max length', () => {
    const result = pushItemToFixedLengthArray([1, 2], 5, 3)
    expect(result).toEqual([1, 2, 3])
  })

  it('shifts oldest item when array is at max length', () => {
    const result = pushItemToFixedLengthArray([1, 2, 3], 3, 4)
    expect(result).toEqual([2, 3, 4])
  })

  it('handles single-element max length', () => {
    const result = pushItemToFixedLengthArray([1], 1, 2)
    expect(result).toEqual([2])
  })

  it('handles empty array with defaults', () => {
    const result = pushItemToFixedLengthArray(undefined, 3, 'a')
    expect(result).toEqual(['a'])
  })
})

describe('removeArrayItem', () => {
  it('removes an existing item', () => {
    expect(removeArrayItem([1, 2, 3], 2)).toEqual([1, 3])
  })

  it('returns a copy of the array when item is not found', () => {
    const arr = [1, 2, 3]
    const result = removeArrayItem(arr, 5)
    expect(result).toEqual([1, 2, 3])
    expect(result).not.toBe(arr) // should be a new array
  })

  it('removes only the first occurrence', () => {
    expect(removeArrayItem([1, 2, 2, 3], 2)).toEqual([1, 2, 3])
  })

  it('handles empty array', () => {
    expect(removeArrayItem([], 1)).toEqual([])
  })

  it('handles defaults (undefined input)', () => {
    expect(removeArrayItem(undefined, 1)).toEqual([])
  })
})
