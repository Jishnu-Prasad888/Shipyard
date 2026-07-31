import { describe, expect, it } from 'vitest'
import { buildExportContent, canonicalExportData, toLegacyExportData } from './export'

const data = {
  workspaces: [{ id: 'workspace-1', name: 'Workspace' }],
  projects: [
    {
      id: 'project-1',
      name: 'Project',
      workspaceId: 'workspace-1',
      boardIds: '["board-1"]',
      tags: '[]'
    }
  ],
  boards: [{ id: 'board-1', name: 'Board', projectId: 'project-1' }],
  columns: [{ id: 'column-1', name: 'Column', boardId: 'board-1' }],
  tasks: [
    {
      id: 'task-1',
      title: 'Task',
      columnId: 'column-1',
      connectedTaskIds: '["task-2"]',
      connectedColumnIds: '[]',
      subtasks: '[]',
      tags: '[]',
      status: '{"id":"working"}'
    }
  ],
  subtasks: [{ id: 'subtask-1', taskId: 'task-1' }],
  statuses: [{ id: 'status-1', boardId: 'board-1' }],
  connections: [
    {
      id: 'connection-1',
      boardId: 'board-1',
      fromId: 'task-1',
      toId: 'task-2',
      type: 'task-to-task'
    }
  ],
  tags: [{ id: 'tag-1', name: 'Tag' }]
}

describe('export schema', () => {
  it('emits canonical v2 arrays and relationships', () => {
    const payload = JSON.parse(buildExportContent(data, 'json', 2))
    expect(payload.$schema).toBe('shipyard-export')
    expect(payload.schemaVersion).toBe(2)
    expect(payload.product).toBe('Shipyard')
    expect(Number.isNaN(Date.parse(payload.exportedAt))).toBe(false)
    expect(payload.projects[0].workspaceId).toBe('workspace-1')
    expect(payload.boards[0].projectId).toBe('project-1')
    expect(payload.tasks[0].columnId).toBe('column-1')
    expect(payload.tasks[0].connectedTaskIds).toEqual(['task-2'])
    expect(payload.subtasks[0].taskId).toBe('task-1')
    expect(payload.connections[0].type).toBe('task-to-task')
  })

  it('maps canonical data to the legacy v1 compatibility shape', () => {
    const legacy = toLegacyExportData(canonicalExportData(data))
    expect(legacy.docks[0].folderId).toBe('workspace-1')
    expect(legacy.boards[0].dockId).toBe('project-1')
    expect(legacy.cards[0].listId).toBe('column-1')
    expect(legacy.subcards[0].cardId).toBe('task-1')
    expect(legacy.connections[0].type).toBe('card-to-card')
  })

  it('marks legacy JSON as schema version 1', () => {
    expect(JSON.parse(buildExportContent(data, 'json', 1)).schemaVersion).toBe(1)
  })
})
