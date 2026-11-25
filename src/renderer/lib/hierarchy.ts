/** Helpers for the workspace tree (workspaces can be nested). */

export interface WorkspaceNode {
  id: string
  parentWorkspaceId?: string | null
}

/** The workspace itself plus every workspace nested anywhere below it. */
export const workspaceWithDescendants = (
  workspaces: WorkspaceNode[],
  rootId: string
): Set<string> => {
  const result = new Set<string>([rootId])
  let added = true
  // Iterate rather than recurse so a corrupt (cyclic) tree cannot loop forever.
  while (added) {
    added = false
    for (const workspace of workspaces) {
      const parent = workspace.parentWorkspaceId
      if (parent && result.has(parent) && !result.has(workspace.id)) {
        result.add(workspace.id)
        added = true
      }
    }
  }
  return result
}

/**
 * Whether a workspace may be moved under `newParentId` (null = top level).
 * Moving a workspace into itself or into one of its own sub-workspaces would
 * create a loop and make the whole branch disappear from the tree.
 */
export const canMoveWorkspace = (
  workspaces: WorkspaceNode[],
  workspaceId: string,
  newParentId: string | null
): boolean => {
  if (newParentId === null) return true
  return !workspaceWithDescendants(workspaces, workspaceId).has(newParentId)
}
