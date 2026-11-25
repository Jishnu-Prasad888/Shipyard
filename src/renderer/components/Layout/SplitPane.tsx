import React, { useEffect, useState } from 'react'
import { ArrowLeftRight, Columns2, X } from 'lucide-react'
import { KanbanBoard } from '../Board/KanbanBoard'
import { ProjectView } from '../Projects/ProjectView'

/** What the second pane of the split view shows. */
export type PaneTarget =
  { kind: 'board'; boardId: string } | { kind: 'project'; projectId: string } | { kind: 'empty' }

interface Props {
  target: PaneTarget
  onChange: (target: PaneTarget) => void
  onClose: () => void
  /** Swap with the main pane; undefined when the main pane can't be swapped. */
  onSwap?: () => void
  dataVersion: number
  searchQuery: string
}

interface Option {
  value: string
  label: string
}

/** The right-hand pane of the split view. */
export const SplitPane: React.FC<Props> = ({
  target,
  onChange,
  onClose,
  onSwap,
  dataVersion,
  searchQuery
}) => {
  const [groups, setGroups] = useState<{ project: Option; boards: Option[] }[]>([])
  const [boardProjects, setBoardProjects] = useState<Record<string, string>>({})
  const [projectIds, setProjectIds] = useState<Set<string> | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const [projects, boards] = await Promise.all([
        window.electron.db.findAll('projects'),
        window.electron.db.findAll('boards')
      ])
      if (cancelled) return
      const byProject: Record<string, string> = {}
      for (const board of boards) byProject[board.id] = board.projectId
      setBoardProjects(byProject)
      setProjectIds(new Set(projects.map((project: any) => project.id)))
      setGroups(
        [...projects]
          .sort((a: any, b: any) => String(a.name).localeCompare(String(b.name)))
          .map((project: any) => ({
            project: { value: `project:${project.id}`, label: project.name || 'Untitled project' },
            boards: boards
              .filter((board: any) => board.projectId === project.id)
              .map((board: any) => ({
                value: `board:${board.id}`,
                label: board.name || 'Untitled board'
              }))
          }))
      )
    }
    void load()
    window.addEventListener('reload-projects', load)
    return () => {
      cancelled = true
      window.removeEventListener('reload-projects', load)
    }
  }, [dataVersion])

  // Once loaded: has the board or project been deleted (here or on another device)?
  const missing =
    projectIds !== null &&
    ((target.kind === 'board' && !(target.boardId in boardProjects)) ||
      (target.kind === 'project' && !projectIds.has(target.projectId)))

  const selectValue = missing
    ? ''
    : target.kind === 'board'
      ? `board:${target.boardId}`
      : target.kind === 'project'
        ? `project:${target.projectId}`
        : ''

  const handleSelect = (value: string) => {
    const [kind, id] = value.split(/:(.*)/s)
    if (kind === 'board' && id) onChange({ kind: 'board', boardId: id })
    else if (kind === 'project' && id) onChange({ kind: 'project', projectId: id })
  }

  return (
    <div className="h-full flex flex-col min-w-0" style={{ background: 'var(--color-background)' }}>
      <div
        className="flex items-center gap-2 px-3 py-2 border-b shrink-0"
        style={{ borderColor: 'var(--color-border-strong)', background: 'var(--color-surface)' }}
      >
        <Columns2 className="w-4 h-4 shrink-0" style={{ color: 'var(--color-primary)' }} />
        <select
          value={selectValue}
          onChange={(e) => handleSelect(e.target.value)}
          className="aero-input flex-1 min-w-0 px-2 py-1.5 text-xs font-semibold"
          aria-label="Choose what to show in this pane"
        >
          <option value="" disabled>
            Choose a board or project…
          </option>
          {groups.map(({ project, boards }) => (
            <optgroup key={project.value} label={project.label}>
              <option value={project.value}>{project.label} (overview)</option>
              {boards.map((board) => (
                <option key={board.value} value={board.value}>
                  {board.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <button
          type="button"
          onClick={onSwap}
          disabled={!onSwap || missing || target.kind === 'empty'}
          className="btn-secondary text-xs px-2 disabled:opacity-40"
          title="Swap with the main pane"
          aria-label="Swap panes"
        >
          <ArrowLeftRight className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={onClose}
          className="btn-secondary text-xs px-2"
          title="Close split view"
          aria-label="Close split view"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        {missing && (
          <div
            className="h-full flex flex-col items-center justify-center gap-3 p-8 text-center"
            style={{ color: 'var(--color-muted)' }}
          >
            <Columns2 className="w-10 h-10 opacity-30" />
            <p className="text-sm font-semibold max-w-xs">
              This {target.kind} no longer exists. Pick another one above.
            </p>
          </div>
        )}
        {!missing && target.kind === 'board' && (
          <div className="p-4 h-full">
            <KanbanBoard
              key={target.boardId}
              boardId={target.boardId}
              dataVersion={dataVersion}
              searchQuery={searchQuery}
              onGoBack={
                boardProjects[target.boardId]
                  ? () => onChange({ kind: 'project', projectId: boardProjects[target.boardId] })
                  : undefined
              }
            />
          </div>
        )}
        {!missing && target.kind === 'project' && (
          <div className="p-4">
            <ProjectView
              key={target.projectId}
              projectId={target.projectId}
              dataVersion={dataVersion}
              onSelectBoard={(boardId) => onChange({ kind: 'board', boardId })}
              searchQuery={searchQuery}
            />
          </div>
        )}
        {target.kind === 'empty' && (
          <div
            className="h-full flex flex-col items-center justify-center gap-3 p-8 text-center"
            style={{ color: 'var(--color-muted)' }}
          >
            <Columns2 className="w-10 h-10 opacity-30" />
            <p className="text-sm font-semibold max-w-xs">
              Pick a board or project above to work on it side by side with the main view.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
