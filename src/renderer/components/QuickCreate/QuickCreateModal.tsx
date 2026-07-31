import React, { useEffect, useRef, useState } from 'react'
import {
  Columns3,
  FolderKanban,
  FolderTree,
  LayoutDashboard,
  ListTodo,
  Plus,
  Search,
  X
} from 'lucide-react'

export type QuickCreateType = 'port' | 'dock' | 'ship' | 'manifest' | 'cargo'

interface NamedRecord {
  id: string
  name: string
}

interface WorkspaceRecord extends NamedRecord {
  parentWorkspaceId?: string | null
}

interface ProjectRecord extends NamedRecord {
  workspaceId?: string | null
  boardIds?: unknown
}

interface BoardRecord extends NamedRecord {
  projectId: string
}

interface ColumnRecord extends NamedRecord {
  boardId: string
}

interface TaskRecord {
  id: string
  title: string
  columnId: string
}

interface CreatedEntity {
  id: string
  name?: string
  title?: string
  projectId?: string
  boardId?: string
}

export interface QuickCreateResult {
  type: QuickCreateType
  label: string
  entity: CreatedEntity
  projectId?: string
  boardId?: string
}

interface QuickCreateModalProps {
  initialType?: QuickCreateType | null
  onClose: () => void
  onCreated: (result: QuickCreateResult) => void
}

interface EntityPickerProps {
  label: string
  singular: string
  items: NamedRecord[]
  value: string
  onChange: (id: string) => void
  onCreate: (name: string) => Promise<void>
  disabled?: boolean
}

const CREATE_TYPES: Array<{
  id: QuickCreateType
  label: string
  description: string
  color: string
  icon: React.ComponentType<{ className?: string }>
}> = [
  {
    id: 'port',
    label: 'Workspace',
    description: 'Organize related projects',
    color: '#2563eb',
    icon: FolderTree
  },
  {
    id: 'dock',
    label: 'Project',
    description: 'Group one or more boards',
    color: '#0891b2',
    icon: FolderKanban
  },
  {
    id: 'ship',
    label: 'Board',
    description: 'Plan work inside a project',
    color: '#7c3aed',
    icon: LayoutDashboard
  },
  {
    id: 'manifest',
    label: 'Column',
    description: 'Organize tasks on a board',
    color: '#d97706',
    icon: Columns3
  },
  {
    id: 'cargo',
    label: 'Task',
    description: 'Add work to a column',
    color: '#059669',
    icon: ListTodo
  }
]

const currentTimeMs = (): number => Date.now()

const EntityPicker: React.FC<EntityPickerProps> = ({
  label,
  singular,
  items,
  value,
  onChange,
  onCreate,
  disabled = false
}) => {
  const [search, setSearch] = useState('')
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  const filteredItems = items.filter(
    (item) => item.id === value || item.name.toLowerCase().includes(search.trim().toLowerCase())
  )

  const create = async (): Promise<void> => {
    if (!newName.trim() || creating) return
    setCreating(true)
    setCreateError('')
    try {
      await onCreate(newName.trim())
      setNewName('')
      setSearch('')
    } catch (caught) {
      setCreateError(caught instanceof Error ? caught.message : `Failed to create ${singular}.`)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className={disabled ? 'opacity-45 pointer-events-none' : ''}>
      <label className="block text-[10px] font-black uppercase tracking-widest mb-1">
        {label} *
      </label>
      <div className="border" style={{ borderColor: 'var(--color-border-strong)' }}>
        <div className="relative border-b" style={{ borderColor: 'var(--color-border)' }}>
          <Search
            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5"
            style={{ color: 'var(--color-muted)' }}
          />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="aero-input w-full pl-8 pr-3 py-2 text-xs font-bold border-0"
            placeholder={`Search ${label.toLowerCase()}...`}
            disabled={disabled}
          />
        </div>
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full px-3 py-2 text-xs font-bold outline-none"
          style={{ background: 'var(--color-surface)', color: 'var(--color-text)' }}
          disabled={disabled}
        >
          <option value="">Select {singular.toLowerCase()}...</option>
          {filteredItems.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <div className="flex border-t" style={{ borderColor: 'var(--color-border)' }}>
          <input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void create()
              }
            }}
            className="aero-input flex-1 min-w-0 px-3 py-2 text-xs font-bold border-0"
            placeholder={`New ${singular.toLowerCase()} name...`}
            disabled={disabled}
          />
          <button
            type="button"
            onClick={() => void create()}
            disabled={!newName.trim() || creating}
            className="px-3 text-xs font-black uppercase border-l disabled:opacity-40"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-primary)' }}
          >
            <Plus className="w-3.5 h-3.5 inline mr-1" />
            Add
          </button>
        </div>
      </div>
      {createError && <p className="mt-1 text-[10px] font-bold text-red-600">{createError}</p>}
    </div>
  )
}

const parseIds = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.map(String)
  if (typeof value !== 'string') return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

export const QuickCreateModal: React.FC<QuickCreateModalProps> = ({
  initialType = null,
  onClose,
  onCreated
}) => {
  const [type, setType] = useState<QuickCreateType | null>(initialType)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [name, setName] = useState('')
  const [portId, setPortId] = useState('')
  const [dockId, setDockId] = useState('')
  const [shipId, setShipId] = useState('')
  const [manifestId, setManifestId] = useState('')
  const [workspaces, setWorkspaces] = useState<WorkspaceRecord[]>([])
  const [projects, setProjects] = useState<ProjectRecord[]>([])
  const [boards, setBoards] = useState<BoardRecord[]>([])
  const [columns, setColumns] = useState<ColumnRecord[]>([])
  const [tasks, setTasks] = useState<TaskRecord[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const nameRef = useRef<HTMLInputElement>(null)

  const loadData = async (): Promise<void> => {
    const [workspaceRows, projectRows, boardRows, columnRows, taskRows] = await Promise.all([
      window.electron.db.findAll('workspaces'),
      window.electron.db.findAll('projects'),
      window.electron.db.findAll('boards'),
      window.electron.db.findAll('columns'),
      window.electron.db.findAll('tasks')
    ])
    setWorkspaces((workspaceRows || []) as WorkspaceRecord[])
    setProjects((projectRows || []) as ProjectRecord[])
    setBoards((boardRows || []) as BoardRecord[])
    setColumns((columnRows || []) as ColumnRecord[])
    setTasks((taskRows || []) as TaskRecord[])
  }

  useEffect(() => {
    let active = true
    void Promise.all([
      window.electron.db.findAll('workspaces'),
      window.electron.db.findAll('projects'),
      window.electron.db.findAll('boards'),
      window.electron.db.findAll('columns'),
      window.electron.db.findAll('tasks')
    ]).then(([workspaceRows, projectRows, boardRows, columnRows, taskRows]) => {
      if (!active) return
      setWorkspaces((workspaceRows || []) as WorkspaceRecord[])
      setProjects((projectRows || []) as ProjectRecord[])
      setBoards((boardRows || []) as BoardRecord[])
      setColumns((columnRows || []) as ColumnRecord[])
      setTasks((taskRows || []) as TaskRecord[])
    })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (type) window.setTimeout(() => nameRef.current?.focus(), 0)
  }, [type])

  useEffect(() => {
    if (type) return
    const handleKeys = (event: KeyboardEvent): void => {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setSelectedIndex((index) => (index + 1) % CREATE_TYPES.length)
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        setSelectedIndex((index) => (index - 1 + CREATE_TYPES.length) % CREATE_TYPES.length)
      } else if (event.key === 'Enter') {
        event.preventDefault()
        setType(CREATE_TYPES[selectedIndex].id)
      } else if (event.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeys)
    return () => window.removeEventListener('keydown', handleKeys)
  }, [type, selectedIndex, onClose])

  const selectedType = CREATE_TYPES.find((item) => item.id === type)
  const availableDocks = portId
    ? projects.filter((project) => project.workspaceId === portId)
    : projects
  const availableShips = dockId ? boards.filter((board) => board.projectId === dockId) : boards
  const availableManifests = shipId
    ? columns.filter((column) => column.boardId === shipId)
    : columns

  const selectPort = (id: string): void => {
    setPortId(id)
    setDockId('')
    setShipId('')
    setManifestId('')
  }

  const selectDock = (id: string): void => {
    setDockId(id)
    const dock = projects.find((project) => project.id === id)
    if (dock?.workspaceId) setPortId(dock.workspaceId)
    setShipId('')
    setManifestId('')
  }

  const selectShip = (id: string): void => {
    setShipId(id)
    const ship = boards.find((board) => board.id === id)
    if (ship?.projectId) {
      setDockId(ship.projectId)
      const dock = projects.find((project) => project.id === ship.projectId)
      if (dock?.workspaceId) setPortId(dock.workspaceId)
    }
    setManifestId('')
  }

  const selectManifest = (id: string): void => {
    setManifestId(id)
    const manifest = columns.find((column) => column.id === id)
    if (manifest?.boardId) selectShip(manifest.boardId)
    setManifestId(id)
  }

  const createPort = async (portName: string): Promise<void> => {
    const created = (await window.electron.db.create('workspaces', {
      name: portName,
      color: '#2563eb',
      parentWorkspaceId: null,
      createdAt: currentTimeMs()
    })) as WorkspaceRecord
    await loadData()
    setPortId(created.id)
    window.dispatchEvent(new CustomEvent('reload-projects'))
  }

  const createDock = async (dockName: string): Promise<void> => {
    if (!portId) throw new Error('Select or create a workspace first.')
    const created = (await window.electron.db.create('projects', {
      name: dockName,
      description: '',
      workspaceId: portId,
      tags: JSON.stringify([]),
      color: '#0891b2',
      boardIds: JSON.stringify([]),
      createdAt: currentTimeMs(),
      updatedAt: currentTimeMs()
    })) as ProjectRecord
    await loadData()
    setDockId(created.id)
    window.dispatchEvent(new CustomEvent('reload-projects'))
  }

  const createShip = async (shipName: string): Promise<void> => {
    if (!dockId) throw new Error('Select or create a project first.')
    const created = (await window.electron.db.create('boards', {
      name: shipName,
      description: '',
      projectId: dockId,
      color: '#7c3aed',
      tags: JSON.stringify([]),
      createdAt: currentTimeMs(),
      updatedAt: currentTimeMs()
    })) as BoardRecord
    const dock = (await window.electron.db.findById('projects', dockId)) as ProjectRecord | null
    const boardIds = [...parseIds(dock?.boardIds), created.id]
    await window.electron.db.update('projects', dockId, {
      boardIds: JSON.stringify([...new Set(boardIds)]),
      updatedAt: currentTimeMs()
    })
    await loadData()
    setShipId(created.id)
    window.dispatchEvent(new CustomEvent('reload-projects'))
  }

  const createManifest = async (manifestName: string): Promise<void> => {
    if (!shipId) throw new Error('Select or create a board first.')
    const created = (await window.electron.db.create('columns', {
      name: manifestName,
      boardId: shipId,
      order: columns.filter((column) => column.boardId === shipId).length,
      color: '#d97706',
      createdAt: currentTimeMs(),
      updatedAt: currentTimeMs()
    })) as ColumnRecord
    await loadData()
    setManifestId(created.id)
    window.dispatchEvent(new CustomEvent('reload-projects'))
  }

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault()
    if (!type || !name.trim() || saving) return
    setSaving(true)
    setError('')
    try {
      let entity: CreatedEntity
      if (type === 'port') {
        entity = await window.electron.db.create('workspaces', {
          name: name.trim(),
          color: selectedType?.color,
          parentWorkspaceId: null,
          createdAt: currentTimeMs()
        })
      } else if (type === 'dock') {
        if (!portId) throw new Error('Select or create a workspace.')
        entity = await window.electron.db.create('projects', {
          name: name.trim(),
          description: '',
          workspaceId: portId,
          tags: JSON.stringify([]),
          color: selectedType?.color,
          boardIds: JSON.stringify([]),
          createdAt: currentTimeMs(),
          updatedAt: currentTimeMs()
        })
      } else if (type === 'ship') {
        if (!dockId) throw new Error('Select or create a project.')
        entity = await window.electron.db.create('boards', {
          name: name.trim(),
          description: '',
          projectId: dockId,
          color: selectedType?.color,
          tags: JSON.stringify([]),
          createdAt: currentTimeMs(),
          updatedAt: currentTimeMs()
        })
        const dock = (await window.electron.db.findById('projects', dockId)) as ProjectRecord | null
        await window.electron.db.update('projects', dockId, {
          boardIds: JSON.stringify([...new Set([...parseIds(dock?.boardIds), entity.id])]),
          updatedAt: currentTimeMs()
        })
      } else if (type === 'manifest') {
        if (!shipId) throw new Error('Select or create a board.')
        entity = await window.electron.db.create('columns', {
          name: name.trim(),
          boardId: shipId,
          order: columns.filter((column) => column.boardId === shipId).length,
          color: selectedType?.color,
          createdAt: currentTimeMs(),
          updatedAt: currentTimeMs()
        })
      } else {
        if (!manifestId || !shipId) throw new Error('Select or create a column.')
        entity = await window.electron.db.create('tasks', {
          title: name.trim(),
          description: '',
          columnId: manifestId,
          boardId: shipId,
          order: tasks.filter((task) => task.columnId === manifestId).length,
          color: selectedType?.color,
          deadline: null,
          status: null,
          notes: '',
          tags: JSON.stringify([]),
          subtasks: JSON.stringify([]),
          connectedTaskIds: JSON.stringify([]),
          connectedColumnIds: JSON.stringify([]),
          createdAt: currentTimeMs(),
          updatedAt: currentTimeMs()
        })
      }

      window.dispatchEvent(new CustomEvent('reload-projects'))
      onCreated({
        type,
        label: selectedType?.label || 'Item',
        entity,
        projectId: type === 'dock' ? entity.id : dockId || entity.projectId,
        boardId: type === 'ship' ? entity.id : shipId || entity.boardId
      })
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : `Failed to create ${selectedType?.label.toLowerCase() || 'item'}.`
      )
    } finally {
      setSaving(false)
    }
  }

  const needsDock = type === 'ship' || type === 'manifest' || type === 'cargo'
  const needsShip = type === 'manifest' || type === 'cargo'
  const needsManifest = type === 'cargo'

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="aero-window w-full max-w-xl max-h-[90vh] overflow-auto animate-brutal-in"
        style={{ background: 'var(--color-surface)', boxShadow: 'var(--shadow-window)' }}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          className="aero-titlebar flex items-center justify-between px-5 py-3 border-b"
          style={{ background: selectedType?.color || 'var(--color-primary)' }}
        >
          <div className="text-white">
            <h2 className="text-base font-black uppercase tracking-wider">
              {type ? `Create ${selectedType?.label}` : 'Quick Create'}
            </h2>
            <p className="text-[10px] font-bold opacity-80">
              {type ? selectedType?.description : 'Choose with arrows, then press Enter'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="aero-icon-button w-7 h-7 text-white flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {!type ? (
          <div className="p-3 space-y-2">
            {CREATE_TYPES.map((item, index) => {
              const Icon = item.icon
              const selected = selectedIndex === index
              return (
                <button
                  key={item.id}
                  onMouseEnter={() => setSelectedIndex(index)}
                  onClick={() => setType(item.id)}
                  className="w-full flex items-center gap-3 p-3 border text-left transition-all"
                  style={{
                    borderColor: selected ? item.color : 'var(--color-border)',
                    background: selected ? `${item.color}18` : 'var(--color-background)',
                    boxShadow: selected ? `inset 4px 0 ${item.color}` : 'none'
                  }}
                >
                  <span
                    className="w-10 h-10 flex items-center justify-center border text-white"
                    style={{ background: item.color, borderColor: item.color }}
                  >
                    <Icon className="w-5 h-5" />
                  </span>
                  <span className="flex-1">
                    <strong className="block text-sm font-black uppercase tracking-wide">
                      {item.label}
                    </strong>
                    <small className="font-bold" style={{ color: 'var(--color-muted)' }}>
                      {item.description}
                    </small>
                  </span>
                  <kbd
                    className="px-2 py-1 border text-xs font-black"
                    style={{ borderColor: item.color }}
                  >
                    {item.label[0]}
                  </kbd>
                </button>
              )
            })}
          </div>
        ) : (
          <form onSubmit={submit} className="p-5 space-y-4">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest mb-1">
                {selectedType?.label} name *
              </label>
              <input
                ref={nameRef}
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="aero-input w-full px-3 py-2.5 text-sm font-bold outline-none"
                placeholder={`Name this ${selectedType?.label.toLowerCase()}`}
              />
            </div>

            {type !== 'port' && (
              <EntityPicker
                label="Workspaces"
                singular="Workspace"
                items={workspaces}
                value={portId}
                onChange={selectPort}
                onCreate={createPort}
              />
            )}
            {needsDock && (
              <EntityPicker
                label="Projects"
                singular="Project"
                items={availableDocks}
                value={dockId}
                onChange={selectDock}
                onCreate={createDock}
                disabled={!portId}
              />
            )}
            {needsShip && (
              <EntityPicker
                label="Boards"
                singular="Board"
                items={availableShips}
                value={shipId}
                onChange={selectShip}
                onCreate={createShip}
                disabled={!dockId}
              />
            )}
            {needsManifest && (
              <EntityPicker
                label="Columns"
                singular="Column"
                items={availableManifests}
                value={manifestId}
                onChange={selectManifest}
                onCreate={createManifest}
                disabled={!shipId}
              />
            )}

            {error && <p className="text-xs font-bold text-red-600">{error}</p>}
            <div className="flex justify-between gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setType(null)
                  setError('')
                }}
                className="btn-secondary text-xs"
              >
                Back
              </button>
              <div className="flex gap-2">
                <button type="button" onClick={onClose} className="btn-secondary text-xs">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!name.trim() || saving}
                  className="btn-primary text-xs disabled:opacity-40"
                  style={{ background: selectedType?.color }}
                >
                  {saving ? 'Creating...' : `Create ${selectedType?.label}`}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
