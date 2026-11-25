import { describe, expect, it } from 'vitest'
import { clampSplitRatio, parsePaneTarget, parseSplitLayout } from './splitLayout'

describe('split layout', () => {
  it('clamps the ratio and falls back for bad numbers', () => {
    expect(clampSplitRatio(0.1)).toBe(0.25)
    expect(clampSplitRatio(0.9)).toBe(0.75)
    expect(clampSplitRatio(0.4)).toBe(0.4)
    expect(clampSplitRatio(NaN)).toBe(0.5)
  })

  it('accepts only well-formed targets', () => {
    expect(parsePaneTarget({ kind: 'board', boardId: 'b1' })).toEqual({
      kind: 'board',
      boardId: 'b1'
    })
    expect(parsePaneTarget({ kind: 'project', projectId: 'p1' })).toEqual({
      kind: 'project',
      projectId: 'p1'
    })
    expect(parsePaneTarget({ kind: 'empty' })).toEqual({ kind: 'empty' })
    expect(parsePaneTarget({ kind: 'board' })).toBeNull()
    expect(parsePaneTarget({ kind: 'board', boardId: '' })).toBeNull()
    expect(parsePaneTarget({ kind: 'calendar' })).toBeNull()
    expect(parsePaneTarget('board')).toBeNull()
  })

  it('survives missing or corrupt stored data', () => {
    expect(parseSplitLayout(null)).toEqual({ target: null, ratio: 0.5 })
    expect(parseSplitLayout('{not json')).toEqual({ target: null, ratio: 0.5 })
    expect(
      parseSplitLayout(JSON.stringify({ target: { kind: 'board', boardId: 'x' }, ratio: 2 }))
    ).toEqual({
      target: { kind: 'board', boardId: 'x' },
      ratio: 0.75
    })
  })
})
