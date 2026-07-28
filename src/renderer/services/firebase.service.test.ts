import { describe, expect, it } from 'vitest'
import {
  firebaseWriteTargets,
  legacyFirebaseRecord,
  normalizeFirebaseRecord,
  resolveFirebaseRecords
} from './firebase.service'

describe('Firebase legacy normalization', () => {
  it('normalizes collection, relationship, nested, and connection names', () => {
    const normalized = normalizeFirebaseRecord('cards', {
      listId: 'column-1',
      connectedCardIds: ['task-2'],
      subCards: [{ cardId: 'task-1' }],
      type: 'card-to-card'
    })
    expect(normalized.collection).toBe('tasks')
    expect(normalized.data).toMatchObject({
      columnId: 'column-1',
      connectedTaskIds: ['task-2'],
      subtasks: [{ taskId: 'task-1' }],
      type: 'task-to-task'
    })
  })

  it('prefers canonical fields when a shared collection contains both aliases', () => {
    expect(
      normalizeFirebaseRecord('boards', {
        dockId: 'legacy-project',
        projectId: 'canonical-project'
      }).data.projectId
    ).toBe('canonical-project')
  })

  it('creates a legacy alias record from canonical data', () => {
    const legacy = legacyFirebaseRecord('tasks', {
      columnId: 'column-1',
      type: 'column-to-column'
    })
    expect(legacy).toEqual({
      collection: 'cards',
      data: { listId: 'column-1', type: 'list-to-list' }
    })
  })

  it('uses latest modification and canonical data on ties', () => {
    const legacy = [{ id: 'one', name: 'legacy', _lastModified: 10 }]
    expect(
      resolveFirebaseRecords([{ id: 'one', name: 'canonical', _lastModified: 10 }], legacy)[0].name
    ).toBe('canonical')
    expect(
      resolveFirebaseRecords([{ id: 'one', name: 'old', _lastModified: 9 }], legacy)[0].name
    ).toBe('legacy')
  })

  it('writes canonical and legacy aliases with their respective schema versions', () => {
    expect(firebaseWriteTargets('tasks', { columnId: 'column-1' })).toEqual([
      { collection: 'tasks', data: { columnId: 'column-1' }, schemaVersion: 2 },
      { collection: 'cards', data: { listId: 'column-1' }, schemaVersion: 1 }
    ])
  })

  it('writes unchanged collections once with canonical connection values', () => {
    expect(firebaseWriteTargets('connections', { type: 'card-to-card' })).toEqual([
      {
        collection: 'connections',
        data: { type: 'task-to-task' },
        schemaVersion: 2
      }
    ])
    expect(firebaseWriteTargets('statuses', { name: 'Working' })).toHaveLength(1)
    expect(firebaseWriteTargets('tags', { name: 'Important' })).toHaveLength(1)
  })
})
