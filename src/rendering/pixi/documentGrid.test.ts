import { describe, expect, test } from 'bun:test'
import { pixelGridLinePositions } from './documentGrid'

describe('pixelGridLinePositions', () => {
  test('returns integer boundaries within span', () => {
    expect(pixelGridLinePositions(0, 4)).toEqual([0, 1, 2, 3, 4])
    expect(pixelGridLinePositions(2.2, 5.7)).toEqual([3, 4, 5])
  })
})
