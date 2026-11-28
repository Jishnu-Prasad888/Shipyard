import { KeyboardShortcut, KeyboardShortcutAction, Settings } from '@shared/types'

export const SHORTCUT_ACTIONS: Array<{
  id: KeyboardShortcutAction
  label: string
  group: 'Quick create' | 'Navigation' | 'Screenshots'
}> = [
  { id: 'quickCreate', label: 'Open quick create', group: 'Quick create' },
  { id: 'createWorkspace', label: 'Create workspace', group: 'Quick create' },
  { id: 'createProject', label: 'Create project', group: 'Quick create' },
  { id: 'createBoard', label: 'Create board', group: 'Quick create' },
  { id: 'createColumn', label: 'Create column', group: 'Quick create' },
  { id: 'createTask', label: 'Create task', group: 'Quick create' },
  { id: 'openSettings', label: 'Open settings', group: 'Navigation' },
  { id: 'goHome', label: 'Go home', group: 'Navigation' },
  { id: 'openCalendar', label: 'Open calendar', group: 'Navigation' },
  { id: 'toggleTheme', label: 'Toggle theme', group: 'Navigation' },
  { id: 'toggleSplit', label: 'Toggle split view', group: 'Navigation' },
  { id: 'screenshotArea', label: 'Screenshot an area', group: 'Screenshots' },
  { id: 'screenshotFull', label: 'Screenshot the full screen', group: 'Screenshots' }
]

export const DEFAULT_KEYBOARD_SHORTCUTS: KeyboardShortcut[] = [
  { action: 'quickCreate', strokes: ['Ctrl+N'] },
  { action: 'createWorkspace', strokes: ['Ctrl+N', 'W'] },
  { action: 'createProject', strokes: ['Ctrl+N', 'P'] },
  { action: 'createBoard', strokes: ['Ctrl+N', 'B'] },
  { action: 'createColumn', strokes: ['Ctrl+N', 'C'] },
  { action: 'createTask', strokes: ['Ctrl+N', 'T'] },
  { action: 'toggleSplit', strokes: ['Ctrl+\\'] },
  { action: 'screenshotArea', strokes: ['Alt+Shift+S'] }
]

const LEGACY_DEFAULT_KEYBOARD_SHORTCUTS: KeyboardShortcut[] = [
  { action: 'quickCreate', strokes: ['Ctrl+N'] },
  { action: 'createWorkspace', strokes: ['Ctrl+N', 'P'] },
  { action: 'createProject', strokes: ['Ctrl+N', 'D'] },
  { action: 'createBoard', strokes: ['Ctrl+N', 'S'] },
  { action: 'createColumn', strokes: ['Ctrl+N', 'M'] },
  { action: 'createTask', strokes: ['Ctrl+N', 'C'] }
]

const MODIFIER_KEYS = new Set(['Control', 'Alt', 'Shift', 'Meta'])

export const shortcutStrokeFromEvent = (event: KeyboardEvent | React.KeyboardEvent): string => {
  if (MODIFIER_KEYS.has(event.key)) return ''

  const parts: string[] = []
  if (event.ctrlKey) parts.push('Ctrl')
  if (event.altKey) parts.push('Alt')
  if (event.shiftKey) parts.push('Shift')
  if (event.metaKey) parts.push('Meta')

  const key =
    event.key === ' ' ? 'Space' : event.key.length === 1 ? event.key.toUpperCase() : event.key
  parts.push(key)
  return parts.join('+')
}

export const plainStroke = (stroke: string): string => stroke.split('+').at(-1) || stroke

const migratedKeyboardShortcuts = (
  shortcuts: Settings['keyboardShortcuts']
): KeyboardShortcut[] => {
  if (shortcuts === undefined) {
    return DEFAULT_KEYBOARD_SHORTCUTS.map((shortcut) => ({
      ...shortcut,
      strokes: [...shortcut.strokes]
    }))
  }

  const hasUntouchedLegacyDefaults = LEGACY_DEFAULT_KEYBOARD_SHORTCUTS.every((legacy) =>
    shortcuts.some(
      (shortcut) =>
        shortcut.action === legacy.action &&
        shortcut.strokes.join('\u0000') === legacy.strokes.join('\u0000')
    )
  )
  if (!hasUntouchedLegacyDefaults) return shortcuts

  return shortcuts.map((shortcut) => {
    const updatedDefault = DEFAULT_KEYBOARD_SHORTCUTS.find(
      (candidate) => candidate.action === shortcut.action
    )
    return updatedDefault ? { ...updatedDefault, strokes: [...updatedDefault.strokes] } : shortcut
  })
}

/**
 * Actions whose default shortcut was added after shortcuts became
 * customisable. Saved lists that have no entry at all for one of these get
 * its default; removing a shortcut leaves an empty entry, so a removed
 * shortcut stays removed.
 */
const ADDED_DEFAULT_ACTIONS: KeyboardShortcutAction[] = ['toggleSplit', 'screenshotArea']

/** Actions that also work while typing (in notes, for example). */
export const WORKS_WHILE_TYPING: KeyboardShortcutAction[] = ['screenshotArea', 'screenshotFull']

export const effectiveKeyboardShortcuts = (
  shortcuts: Settings['keyboardShortcuts']
): KeyboardShortcut[] => {
  // Copy: the migration can return the saved list itself.
  const result = [...migratedKeyboardShortcuts(shortcuts)]
  // Undefined means defaults (already complete); an empty list means the
  // user cleared every shortcut, which predates the empty-entry marker.
  if (shortcuts === undefined || shortcuts.length === 0) return result
  for (const action of ADDED_DEFAULT_ACTIONS) {
    if (result.some((shortcut) => shortcut.action === action)) continue
    const fallback = DEFAULT_KEYBOARD_SHORTCUTS.find((shortcut) => shortcut.action === action)
    const taken =
      fallback &&
      result.some((shortcut) => shortcut.strokes.join('\u0000') === fallback.strokes.join('\u0000'))
    if (fallback && !taken) result.push({ ...fallback, strokes: [...fallback.strokes] })
  }
  return result
}

/** Shortcuts that are actually bound (removed ones keep an empty entry). */
export const boundShortcuts = (shortcuts: KeyboardShortcut[]): KeyboardShortcut[] =>
  shortcuts.filter((shortcut) => shortcut.strokes.length > 0)

export const shortcutLabel = (strokes: string[]): string => strokes.join(', ')

export const shortcutsMatchingPrefix = (
  shortcuts: KeyboardShortcut[],
  strokes: string[]
): KeyboardShortcut[] =>
  boundShortcuts(shortcuts).filter((shortcut) =>
    strokes.every((stroke, index) => shortcut.strokes[index] === stroke)
  )

export const hasDuplicateShortcut = (
  shortcuts: KeyboardShortcut[],
  candidate: KeyboardShortcut,
  ignoredAction?: KeyboardShortcutAction
): boolean =>
  shortcuts.some(
    (shortcut) =>
      shortcut.action !== ignoredAction &&
      shortcut.strokes.join('\u0000') === candidate.strokes.join('\u0000')
  )
