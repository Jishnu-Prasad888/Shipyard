import React, { useCallback, useEffect, useState } from 'react'
import { ExternalLink, Github, Loader2, Plus, RefreshCw, Star } from 'lucide-react'
import {
  fetchRepo,
  GitHubItem,
  IssueFilter,
  listCommits,
  listIssues,
  listPullRequests,
  openExternal,
  refKey,
  refUrl,
  RepoInfo
} from '../../lib/github'
import { GitHubItemRow } from './GitHubItems'

type Tab = 'pulls' | 'issues' | 'commits'

interface Props {
  repo: string
  boards: { id: string; name: string }[]
}

/** Issues, pull requests and commits of a project's linked repository. */
export const ProjectGitHubPanel: React.FC<Props> = ({ repo, boards }) => {
  const [tab, setTab] = useState<Tab>('pulls')
  const [state, setState] = useState<IssueFilter>('open')
  const [info, setInfo] = useState<RepoInfo | null>(null)
  const [items, setItems] = useState<GitHubItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [targetBoardId, setTargetBoardId] = useState<string>(boards[0]?.id || '')
  const [added, setAdded] = useState<Set<string>>(new Set())

  // Falls back to the first board if the chosen one is gone.
  const boardId = boards.some((board) => board.id === targetBoardId)
    ? targetBoardId
    : boards[0]?.id || ''

  const load = useCallback(async () => {
    setItems(null)
    setError(null)
    try {
      fetchRepo(repo).then(setInfo, () => setInfo(null))
      const result =
        tab === 'pulls'
          ? await listPullRequests(repo, state)
          : tab === 'issues'
            ? await listIssues(repo, state)
            : await listCommits(repo)
      setItems(result)
    } catch (err: any) {
      setError(String(err?.message || err))
    }
  }, [repo, tab, state])

  useEffect(() => {
    void load()
  }, [load])

  /** Creates a task in the first column of the chosen board, linked to the item. */
  const addAsTask = async (item: GitHubItem) => {
    if (!boardId) return
    const columns = (await window.electron.db.findAll('columns'))
      .filter((column: any) => column.boardId === boardId)
      .sort((a: any, b: any) => (Number(a.order) || 0) - (Number(b.order) || 0))
    const column = columns[0]
    if (!column) {
      window.dispatchEvent(
        new CustomEvent('show-toast', {
          detail: { message: 'That board has no columns yet. Add a column first.' }
        })
      )
      return
    }
    const tasks = (await window.electron.db.findAll('tasks')).filter(
      (task: any) => task.columnId === column.id
    )
    const order = tasks.reduce(
      (max: number, task: any) => Math.max(max, (Number(task.order) || 0) + 1),
      0
    )
    const now = Date.now()
    await window.electron.db.create('tasks', {
      title: item.title,
      description: refUrl(item.ref),
      columnId: column.id,
      boardId,
      order,
      tags: '[]',
      notes: '',
      status: null,
      connectedTaskIds: '[]',
      connectedColumnIds: '[]',
      githubLinks: [item.ref],
      createdAt: now,
      updatedAt: now
    })
    setAdded((previous) => new Set(previous).add(refKey(item.ref)))
    window.dispatchEvent(new CustomEvent('reload-projects'))
    const boardName = boards.find((board) => board.id === boardId)?.name
    window.dispatchEvent(
      new CustomEvent('show-toast', {
        detail: { message: `Added "${item.title}" to ${boardName} › ${column.name}` }
      })
    )
  }

  const tabButton = (id: Tab, label: string) => (
    <button
      key={id}
      type="button"
      onClick={() => setTab(id)}
      className="px-3 py-1.5 text-[11px] font-black uppercase tracking-wide"
      style={{
        background: tab === id ? 'var(--color-primary-soft)' : 'transparent',
        color: tab === id ? 'var(--color-text)' : 'var(--color-muted)',
        borderBottom: tab === id ? '2px solid var(--color-primary)' : '2px solid transparent'
      }}
    >
      {label}
    </button>
  )

  return (
    <section
      className="aero-panel"
      style={{ borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-brutal-sm)' }}
    >
      <div
        className="flex flex-wrap items-center gap-3 px-4 py-3 border-b"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <Github className="w-4 h-4" />
        <button
          type="button"
          onClick={() => openExternal(info?.url || `https://github.com/${repo}`)}
          className="font-black text-sm hover:underline inline-flex items-center gap-1"
          style={{ color: 'var(--color-text)' }}
        >
          {repo} <ExternalLink className="w-3 h-3" />
        </button>
        {info && (
          <span
            className="flex items-center gap-3 text-[11px] font-semibold"
            style={{ color: 'var(--color-muted)' }}
          >
            <span className="inline-flex items-center gap-1">
              <Star className="w-3 h-3" /> {info.stars}
            </span>
            {info.isPrivate && <span>private</span>}
            {info.description && <span className="truncate max-w-md">{info.description}</span>}
          </span>
        )}
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => void load()}
          className="btn-secondary text-xs px-2"
          title="Refresh"
          aria-label="Refresh GitHub data"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      <div
        className="flex flex-wrap items-center gap-2 px-4 border-b"
        style={{ borderColor: 'var(--color-border)' }}
      >
        {tabButton('pulls', 'Pull requests')}
        {tabButton('issues', 'Issues')}
        {tabButton('commits', 'Commits')}
        <div className="flex-1" />
        {tab !== 'commits' && (
          <select
            value={state}
            onChange={(e) => setState(e.target.value as IssueFilter)}
            className="aero-input text-xs px-2 py-1 my-1.5"
            aria-label="Filter by state"
          >
            <option value="open">Open</option>
            <option value="closed">Closed</option>
            <option value="all">All</option>
          </select>
        )}
        {tab !== 'commits' && boards.length > 0 && (
          <label
            className="flex items-center gap-1 text-[11px] font-semibold my-1.5"
            style={{ color: 'var(--color-muted)' }}
          >
            Add tasks to
            <select
              value={boardId}
              onChange={(e) => setTargetBoardId(e.target.value)}
              className="aero-input text-xs px-2 py-1"
            >
              {boards.map((board) => (
                <option key={board.id} value={board.id}>
                  {board.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="p-3 space-y-1.5 max-h-[420px] overflow-y-auto">
        {error && (
          <p className="text-xs" style={{ color: 'var(--color-alert, #d94c57)' }}>
            {error}
          </p>
        )}
        {!items && !error && (
          <div
            className="flex items-center gap-2 text-xs py-3"
            style={{ color: 'var(--color-muted)' }}
          >
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        )}
        {items && items.length === 0 && (
          <p className="text-xs py-3" style={{ color: 'var(--color-muted)' }}>
            Nothing here.
          </p>
        )}
        {items?.map((item) => (
          <GitHubItemRow
            key={refKey(item.ref)}
            item={item}
            defaultRepo={repo}
            actions={
              tab !== 'commits' && boards.length > 0 ? (
                <button
                  type="button"
                  onClick={() => void addAsTask(item)}
                  disabled={added.has(refKey(item.ref))}
                  className="btn-secondary text-[10px] px-2 py-1 shrink-0 disabled:opacity-50"
                  title="Create a task linked to this item"
                >
                  <Plus className="w-3 h-3" />
                  {added.has(refKey(item.ref)) ? 'Added' : 'Add as task'}
                </button>
              ) : undefined
            }
          />
        ))}
      </div>
    </section>
  )
}
