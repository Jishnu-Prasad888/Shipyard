import type { PaneTarget } from '../components/Layout/SplitPane'

const STORAGE_KEY = 'shipyard:split-view'
export const MIN_SPLIT_RATIO = 0.25
export const MAX_SPLIT_RATIO = 0.75

export interface SplitLayout {
  /** What the second pane shows; null when split view is closed. */
  target: PaneTarget | null
  /** The second pane's share of the width. */
  ratio: number
}

export const clampSplitRatio = (ratio: number): number =>
  Number.isFinite(ratio) ? Math.min(MAX_SPLIT_RATIO, Math.max(MIN_SPLIT_RATIO, ratio)) : 0.5

/** Accepts only well-formed pane targets, so bad stored data can't break the app. */
export const parsePaneTarget = (value: unknown): PaneTarget | null => {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  if (raw.kind === 'board' && typeof raw.boardId === 'string' && raw.boardId)
    return { kind: 'board', boardId: raw.boardId }
  if (raw.kind === 'project' && typeof raw.projectId === 'string' && raw.projectId)
    return { kind: 'project', projectId: raw.projectId }
  if (raw.kind === 'empty') return { kind: 'empty' }
  return null
}

export const parseSplitLayout = (stored: string | null): SplitLayout => {
  try {
    const raw = stored ? JSON.parse(stored) : null
    return {
      target: parsePaneTarget(raw?.target),
      ratio: clampSplitRatio(typeof raw?.ratio === 'number' ? raw.ratio : 0.5)
    }
  } catch {
    return { target: null, ratio: 0.5 }
  }
}

export const loadSplitLayout = (): SplitLayout => {
  try {
    return parseSplitLayout(localStorage.getItem(STORAGE_KEY))
  } catch {
    return parseSplitLayout(null)
  }
}

export const saveSplitLayout = (layout: SplitLayout): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layout))
  } catch {
    // Storage full or unavailable: the layout just isn't remembered.
  }
}
