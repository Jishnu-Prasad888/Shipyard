import { describe, expect, it } from 'vitest'
import { canMoveWorkspace, workspaceWithDescendants } from './hierarchy'

const tree = [
  { id: 'a' },
  { id: 'b', parentWorkspaceId: 'a' },
  { id: 'c', parentWorkspaceId: 'b' },
  { id: 'd' }
]

describe('workspace hierarchy', () => {
  it('collects nested workspaces', () => {
    expect([...workspaceWithDescendants(tree, 'a')].sort()).toEqual(['a', 'b', 'c'])
    expect([...workspaceWithDescendants(tree, 'd')]).toEqual(['d'])
  })

  it('blocks moves that would create a loop', () => {
    expect(canMoveWorkspace(tree, 'a', 'a')).toBe(false)
    expect(canMoveWorkspace(tree, 'a', 'c')).toBe(false)
    expect(canMoveWorkspace(tree, 'c', 'a')).toBe(true)
    expect(canMoveWorkspace(tree, 'b', 'd')).toBe(true)
    expect(canMoveWorkspace(tree, 'c', null)).toBe(true)
  })

  it('terminates on a corrupt cyclic tree', () => {
    const cyclic = [
      { id: 'x', parentWorkspaceId: 'y' },
      { id: 'y', parentWorkspaceId: 'x' }
    ]
    expect([...workspaceWithDescendants(cyclic, 'x')].sort()).toEqual(['x', 'y'])
  })
})
