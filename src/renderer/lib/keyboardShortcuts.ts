import { KeyboardShortcut, KeyboardShortcutAction, Settings } from '@shared/types'

export const SHORTCUT_ACTIONS: Array<{
  id: KeyboardShortcutAction
  label: string
  group: 'Quick create' | 'Navigation'
}> = [
  { id: 'quickCreate', label: 'Open quick create', group: 'Quick create' },
  { id: 'createPort', label: 'Create port', group: 'Quick create' },
  { id: 'createDock', label: 'Create dock', group: 'Quick create' },
  { id: 'createShip', label: 'Create ship', group: 'Quick create' },
  { id: 'createManifest', label: 'Create manifest', group: 'Quick create' },
  { id: 'createCargo', label: 'Create cargo', group: 'Quick create' },
  { id: 'openSettings', label: 'Open settings', group: 'Navigation' },
  { id: 'goHome', label: 'Go home', group: 'Navigation' },
  { id: 'openCalendar', label: 'Open calendar', group: 'Navigation' },
  { id: 'toggleTheme', label: 'Toggle theme', group: 'Navigation' }
]

export const DEFAULT_KEYBOARD_SHORTCUTS: KeyboardShortcut[] = [
  { action: 'quickCreate', strokes: ['Ctrl+N'] },
  { action: 'createPort', strokes: ['Ctrl+N', 'P'] },
  { action: 'createDock', strokes: ['Ctrl+N', 'D'] },
  { action: 'createShip', strokes: ['Ctrl+N', 'S'] },
  { action: 'createManifest', strokes: ['Ctrl+N', 'M'] },
  { action: 'createCargo', strokes: ['Ctrl+N', 'C'] }
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

export const effectiveKeyboardShortcuts = (
  shortcuts: Settings['keyboardShortcuts']
): KeyboardShortcut[] =>
  shortcuts === undefined
    ? DEFAULT_KEYBOARD_SHORTCUTS.map((shortcut) => ({
        ...shortcut,
        strokes: [...shortcut.strokes]
      }))
    : shortcuts

export const shortcutLabel = (strokes: string[]): string => strokes.join(', ')

export const shortcutsMatchingPrefix = (
  shortcuts: KeyboardShortcut[],
  strokes: string[]
): KeyboardShortcut[] =>
  shortcuts.filter((shortcut) =>
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
