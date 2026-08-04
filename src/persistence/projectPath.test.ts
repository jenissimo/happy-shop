import { describe, expect, test } from 'bun:test'
import {
  assertSafeProjectName,
  assertSafeProjectPath,
  isSafeProjectName,
  projectNameFromPath,
  projectPathForName,
  stripProjectSuffix,
} from './projectPath'

describe('project name safety', () => {
  test('accepts plain names and strips the .happyshop suffix', () => {
    expect(assertSafeProjectName('Sunset')).toBe('Sunset')
    expect(assertSafeProjectName('  Sunset.happyshop ')).toBe('Sunset')
    expect(assertSafeProjectName('sprite-sheet_v2.1')).toBe('sprite-sheet_v2.1')
    expect(stripProjectSuffix('a.HAPPYSHOP')).toBe('a')
  })

  test('rejects empty, traversal and separator-bearing names', () => {
    for (const bad of [
      '',
      '   ',
      '.',
      '..',
      '.happyshop',
      'a/b',
      'a\\b',
      '../escape',
      'C:名',
      'with space',
      'nul\0byte',
    ]) {
      expect(isSafeProjectName(bad)).toBe(false)
      expect(() => assertSafeProjectName(bad)).toThrow()
    }
  })
})

describe('projectPathForName', () => {
  test('bridge destinations live under projects/', () => {
    expect(projectPathForName('Sunset', { browser: false })).toBe(
      'projects/Sunset.happyshop',
    )
    // Typing the extension must not double it up.
    expect(projectPathForName('Sunset.happyshop', { browser: false })).toBe(
      'projects/Sunset.happyshop',
    )
  })

  test('browser destinations use the browser: locator scheme', () => {
    expect(projectPathForName('Sunset', { browser: true })).toBe('browser:Sunset')
  })

  test('propagates the name guard', () => {
    expect(() => projectPathForName('../etc', { browser: false })).toThrow()
    expect(() => projectPathForName('../etc', { browser: true })).toThrow()
  })
})

describe('assertSafeProjectPath', () => {
  test('accepts what projectPathForName produces', () => {
    expect(assertSafeProjectPath('projects/Sunset.happyshop')).toBe(
      'projects/Sunset.happyshop',
    )
    expect(assertSafeProjectPath('browser:Sunset')).toBe('browser:Sunset')
  })

  test('rejects traversal, absolute and out-of-root destinations', () => {
    for (const bad of [
      '',
      'projects/../../etc/passwd',
      'projects/a/b.happyshop',
      '/etc/passwd',
      'C:/Windows/system32',
      'elsewhere/Sunset.happyshop',
      'browser:../escape',
    ]) {
      expect(() => assertSafeProjectPath(bad)).toThrow()
    }
  })
})

describe('projectNameFromPath', () => {
  test('reads a prefill name from every locator shape', () => {
    expect(projectNameFromPath('projects/Sunset.happyshop')).toBe('Sunset')
    expect(projectNameFromPath('browser:Sunset')).toBe('Sunset')
    expect(
      projectNameFromPath('C:\\Projects\\happy-shop\\projects\\Untitled.happyshop'),
    ).toBe('Untitled')
    expect(projectNameFromPath(null)).toBeNull()
    expect(projectNameFromPath('')).toBeNull()
  })
})
