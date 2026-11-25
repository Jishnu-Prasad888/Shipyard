import { describe, expect, it } from 'vitest'
import {
  activityByDay,
  DashboardData,
  DEFAULT_LAYOUT,
  isTaskDone,
  overdueTasks,
  parseLayout,
  progressBy,
  projectsInScope,
  reposInScope,
  statusBreakdown,
  summarize,
  tagCounts,
  tasksInScope,
  upcomingDeadlines
} from './dashboard'

const DAY = 24 * 60 * 60 * 1000
const NOW = new Date(2026, 5, 15, 12).getTime()

const task = (id: string, columnId: string, extra: Record<string, unknown> = {}) => ({
  id,
  title: id,
  columnId,
  tags: [],
  createdAt: NOW - 10 * DAY,
  updatedAt: NOW - DAY,
  ...extra
})

const data: DashboardData = {
  workspaces: [
    { id: 'ws-eng', name: 'Engineering' },
    { id: 'ws-web', name: 'Web', parentWorkspaceId: 'ws-eng' },
    { id: 'ws-ops', name: 'Ops' }
  ],
  projects: [
    { id: 'p-api', name: 'API', workspaceId: 'ws-eng', githubRepo: 'octo/api' },
    { id: 'p-site', name: 'Site', workspaceId: 'ws-web', githubRepo: 'octo/site' },
    { id: 'p-infra', name: 'Infra', workspaceId: 'ws-ops' },
    { id: 'p-loose', name: 'Loose' },
    { id: 'p-orphan', name: 'Orphan', workspaceId: 'ws-deleted', githubRepo: 'octo/api' }
  ],
  boards: [
    { id: 'b-api', name: 'API board', projectId: 'p-api' },
    { id: 'b-site', name: 'Site board', projectId: 'p-site' },
    { id: 'b-infra', name: 'Infra board', projectId: 'p-infra' },
    { id: 'b-loose', name: 'Loose board', projectId: 'p-loose' }
  ],
  columns: [
    { id: 'c-api-todo', name: 'To Do', boardId: 'b-api' },
    { id: 'c-api-done', name: 'Done', boardId: 'b-api' },
    { id: 'c-site-todo', name: 'Backlog', boardId: 'b-site' },
    { id: 'c-infra', name: 'Doing', boardId: 'b-infra' },
    { id: 'c-loose', name: 'Ideas', boardId: 'b-loose' }
  ],
  tasks: [
    task('t1', 'c-api-todo', {
      deadline: NOW - 2 * DAY,
      tags: [{ name: 'Bug', color: '#f00' }]
    }),
    task('t2', 'c-api-done', { deadline: NOW - 3 * DAY, updatedAt: NOW }),
    task('t3', 'c-site-todo', {
      deadline: NOW + 2 * DAY,
      status: { name: 'Done', color: '#0f0' },
      tags: [{ name: 'bug' }]
    }),
    task('t4', 'c-site-todo', { deadline: NOW + 5 * DAY, status: { name: 'In Review' } }),
    task('t5', 'c-infra', { deadline: NOW + 30 * DAY, createdAt: NOW }),
    task('t6', 'c-loose'),
    // Column of a board that no longer exists: ignored everywhere.
    task('t7', 'c-gone')
  ],
  subtasks: [
    { taskId: 't1', completed: true },
    { taskId: 't1', completed: false },
    { taskId: 't6', completed: true }
  ]
}

const ids = (entries: { task: { id: string } }[]) => entries.map((entry) => entry.task.id).sort()

describe('dashboard scopes', () => {
  it('includes sub-workspaces and treats unknown workspaces as unassigned', () => {
    expect(ids(tasksInScope(data, { kind: 'workspace', id: 'ws-eng' }))).toEqual([
      't1',
      't2',
      't3',
      't4'
    ])
    expect(ids(tasksInScope(data, { kind: 'workspace', id: 'ws-web' }))).toEqual(['t3', 't4'])
    expect(projectsInScope(data, { kind: 'unassigned' }).map((p) => p.id)).toEqual([
      'p-loose',
      'p-orphan'
    ])
    expect(ids(tasksInScope(data, { kind: 'all' }))).toEqual(['t1', 't2', 't3', 't4', 't5', 't6'])
    expect(ids(tasksInScope(data, { kind: 'board', id: 'b-infra' }))).toEqual(['t5'])
    expect(ids(tasksInScope(data, { kind: 'project', id: 'p-site' }))).toEqual(['t3', 't4'])
  })

  it('follows the overview filter for "overview" scope', () => {
    expect(ids(tasksInScope(data, { kind: 'overview' }, 'ws-ops'))).toEqual(['t5'])
    expect(ids(tasksInScope(data, { kind: 'overview' }, 'unassigned'))).toEqual(['t6'])
    expect(ids(tasksInScope(data, { kind: 'overview' }, 'all'))).toHaveLength(6)
  })

  it('counts a task as done by status or by column name', () => {
    expect(isTaskDone({ ...data.tasks[0], status: { name: 'Shipped' } })).toBe(true)
    expect(isTaskDone(data.tasks[0], { id: 'c', name: 'Won’t Fix', boardId: 'b' })).toBe(true)
    expect(isTaskDone(data.tasks[0], { id: 'c', name: 'Doing', boardId: 'b' })).toBe(false)
  })
})

describe('dashboard numbers', () => {
  const all = tasksInScope(data, { kind: 'all' })

  it('summarizes open, done, overdue and subtasks', () => {
    expect(summarize(all, data.subtasks, NOW)).toEqual({
      total: 6,
      done: 2,
      open: 4,
      overdue: 1, // t2 is past due but done
      dueSoon: 1, // t4; t3 is done, t5 is a month out
      completion: 33,
      subtasksDone: 2,
      subtasksTotal: 3
    })
    expect(summarize([], [], NOW).completion).toBe(0)
  })

  it('lists deadlines and overdue tasks in order, skipping done ones', () => {
    expect(ids(upcomingDeadlines(all, NOW, 7, 10))).toEqual(['t4'])
    expect(upcomingDeadlines(all, NOW, 60, 10).map((entry) => entry.task.id)).toEqual(['t4', 't5'])
    expect(ids(overdueTasks(all, NOW, 10))).toEqual(['t1'])
  })

  it('groups statuses, tags and progress', () => {
    const statuses = statusBreakdown(all)
    expect(statuses.find((row) => row.label === 'Backlog')).toBeUndefined()
    expect(statuses.find((row) => row.key === 'done')?.count).toBe(2) // status + column
    expect(tagCounts(all)).toEqual([{ key: 'bug', label: 'Bug', color: '#f00', count: 2 }])
    const progress = progressBy(all, 'project')
    expect(progress.find((row) => row.id === 'p-api')).toMatchObject({ done: 1, total: 2 })
    expect(progressBy(all, 'board').find((row) => row.id === 'b-site')).toMatchObject({
      sublabel: 'Site',
      done: 1,
      total: 2
    })
  })

  it('buckets activity by day', () => {
    const days = activityByDay(all, NOW, 7)
    expect(days).toHaveLength(7)
    expect(days[6].created).toBe(1) // t5 today
    expect(days[6].completed).toBe(1) // t2 finished today
    expect(days[5].completed).toBe(1) // t3 yesterday
  })

  it('collects linked repositories once', () => {
    expect(reposInScope(data.projects)).toEqual(['octo/api', 'octo/site'])
  })
})

describe('dashboard layout', () => {
  it('falls back to defaults for missing or broken data', () => {
    expect(parseLayout(null)).toBe(DEFAULT_LAYOUT)
    expect(parseLayout('nope')).toBe(DEFAULT_LAYOUT)
    expect(parseLayout('{}')).toBe(DEFAULT_LAYOUT)
    expect(parseLayout('[]')).toEqual([])
  })

  it('drops unknown widgets and clamps settings', () => {
    const layout = parseLayout(
      JSON.stringify([
        { id: 'a', kind: 'summary', size: 9, scope: { kind: 'workspace', id: 'ws' } },
        { id: 'a', kind: 'tags', limit: 500, scope: { kind: 'project' } },
        { id: 'b', kind: 'weather' },
        { kind: 'github', github: 'stars', groupBy: 'x' }
      ])
    )
    expect(layout.map((widget) => widget.kind)).toEqual(['summary', 'tags', 'github'])
    expect(layout[0]).toMatchObject({ size: 3, scope: { kind: 'workspace', id: 'ws' } })
    expect(layout[1].id).not.toBe('a') // duplicate id replaced
    expect(layout[1]).toMatchObject({ limit: 50, scope: { kind: 'overview' } })
    expect(layout[2].github).toBeUndefined()
    expect(new Set(layout.map((widget) => widget.id)).size).toBe(3)
  })
})
