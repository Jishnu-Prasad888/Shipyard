import { describe, expect, it } from 'vitest'
import {
  DEFAULT_KEYBOARD_SHORTCUTS,
  effectiveKeyboardShortcuts,
  hasDuplicateShortcut,
  plainStroke,
  shortcutStrokeFromEvent,
  shortcutsMatchingPrefix
} from './keyboardShortcuts'

describe('keyboard shortcuts', () => {
  it('normalizes key combinations in a stable modifier order', () => {
    expect(
      shortcutStrokeFromEvent({
        key: 'n',
        ctrlKey: true,
        altKey: false,
        shiftKey: true,
        metaKey: false
      } as KeyboardEvent)
    ).toBe('Ctrl+Shift+N')
    expect(shortcutStrokeFromEvent({ key: 'Control' } as KeyboardEvent)).toBe('')
  })

  it('uses defaults only when shortcuts have never been configured', () => {
    expect(effectiveKeyboardShortcuts(undefined)).toEqual(DEFAULT_KEYBOARD_SHORTCUTS)
    expect(effectiveKeyboardShortcuts([])).toEqual([])
  })

  it('matches both a complete shortcut and longer sequences by prefix', () => {
    const matches = shortcutsMatchingPrefix(DEFAULT_KEYBOARD_SHORTCUTS, ['Ctrl+N'])
    expect(matches.map((shortcut) => shortcut.action)).toContain('quickCreate')
    expect(matches.map((shortcut) => shortcut.action)).toContain('createTask')
    expect(shortcutsMatchingPrefix(DEFAULT_KEYBOARD_SHORTCUTS, ['Ctrl+N', 'T'])).toEqual([
      { action: 'createTask', strokes: ['Ctrl+N', 'T'] }
    ])
  })

  it('detects duplicate bindings while allowing an action to edit itself', () => {
    const candidate = { action: 'createProject' as const, strokes: ['Ctrl+N', 'W'] }
    expect(hasDuplicateShortcut(DEFAULT_KEYBOARD_SHORTCUTS, candidate)).toBe(true)
    expect(hasDuplicateShortcut(DEFAULT_KEYBOARD_SHORTCUTS, candidate, 'createWorkspace')).toBe(false)
    expect(plainStroke('Ctrl+Shift+P')).toBe('P')
  })

  it('migrates only the complete legacy quick-create default set', () => {
    const legacyDefaults = [
      { action: 'quickCreate' as const, strokes: ['Ctrl+N'] },
      { action: 'createWorkspace' as const, strokes: ['Ctrl+N', 'P'] },
      { action: 'createProject' as const, strokes: ['Ctrl+N', 'D'] },
      { action: 'createBoard' as const, strokes: ['Ctrl+N', 'S'] },
      { action: 'createColumn' as const, strokes: ['Ctrl+N', 'M'] },
      { action: 'createTask' as const, strokes: ['Ctrl+N', 'C'] }
    ]
    expect(effectiveKeyboardShortcuts(legacyDefaults)).toEqual(DEFAULT_KEYBOARD_SHORTCUTS)

    const customized = legacyDefaults.map((shortcut) =>
      shortcut.action === 'createTask' ? { ...shortcut, strokes: ['Alt+T'] } : shortcut
    )
    expect(effectiveKeyboardShortcuts(customized)).toEqual(customized)
  })
})
