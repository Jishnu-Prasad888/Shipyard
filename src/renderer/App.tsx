import { type ReactElement, useEffect, useRef, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { KeyboardShortcutAction, Settings } from '@shared/types'
import { Sidebar } from './components/Layout/Sidebar'
import { Header } from './components/Layout/Header'
import { ProjectView } from './components/Projects/ProjectView'
import { KanbanBoard } from './components/Board/KanbanBoard'
import { HomeScreen } from './components/Home/HomeScreen'
import { CalendarView } from './components/Calendar/CalendarView'
import { PaneTarget, SplitPane } from './components/Layout/SplitPane'
import { DATA_WRITTEN_EVENT } from './lib/tauri-bridge'
import { loadSplitLayout, saveSplitLayout, clampSplitRatio } from './lib/splitLayout'
import { RootState } from './store'
import { setSettings } from './store/settingsSlice'
import { setGitHubToken } from './lib/github'
import {
  boundShortcuts,
  effectiveKeyboardShortcuts,
  plainStroke,
  shortcutStrokeFromEvent,
  shortcutsMatchingPrefix,
  WORKS_WHILE_TYPING
} from './lib/keyboardShortcuts'
import { takeScreenshot } from './lib/screenshot'
import { QuickCreateResult } from './components/QuickCreate/QuickCreateModal'
import { OverlayHost } from './components/Layout/OverlayHost'
import { openQuickCreate, openSettings } from './lib/overlays'

function App(): ReactElement {
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null)
  const [showCalendar, setShowCalendar] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [dataVersion, setDataVersion] = useState(0)
  // Split view: the second pane's content (null = closed) and its share of the width.
  const [split, setSplit] = useState<PaneTarget | null>(() => loadSplitLayout().target)
  const [splitRatio, setSplitRatio] = useState(() => loadSplitLayout().ratio)
  const splitContainerRef = useRef<HTMLDivElement>(null)
  const [pendingOpenTaskId, setPendingOpenTaskId] = useState<string | null>(null)
  const dispatch = useDispatch()
  const settings = useSelector((state: RootState) => state.settings)

  const handleDataChange = (): void => setDataVersion((version) => version + 1)

  // Dropping a file anywhere outside a drop target would make the window
  // navigate to it and replace the app. Drop targets (the notes editor)
  // handle their own drops before this runs.
  useEffect(() => {
    const isFileDrag = (event: DragEvent): boolean =>
      !!event.dataTransfer && Array.from(event.dataTransfer.types).includes('Files')
    const block = (event: DragEvent): void => {
      if (isFileDrag(event)) event.preventDefault()
    }
    window.addEventListener('dragover', block)
    window.addEventListener('drop', block)
    return () => {
      window.removeEventListener('dragover', block)
      window.removeEventListener('drop', block)
    }
  }, [])

  useEffect(() => {
    const handleNavigateToTask = (event: Event): void => {
      const detail = (
        event as CustomEvent<{ projectId?: string; boardId?: string; taskId?: string }>
      ).detail
      if (!detail?.boardId || !detail.taskId) return
      setSelectedProjectId(detail.projectId || null)
      setSelectedBoardId(detail.boardId)
      setShowCalendar(false)
      setSearchQuery('')
      setPendingOpenTaskId(detail.taskId)
    }

    window.addEventListener('navigate-to-task', handleNavigateToTask)
    return () => window.removeEventListener('navigate-to-task', handleNavigateToTask)
  }, [])

  useEffect(() => {
    const defaults: Settings = {
      theme: 'light',
      colorMode: 'light',
      themeStyle: 'brutalist',
      firebaseEnabled: false,
      syncEnabled: false,
      minimizeToTray: true,
      serverUrl: '',
      serverSyncEnabled: false
    }

    window.electron.settings.get().then((loadedSettings: Partial<Settings>) => {
      const colorMode: 'light' | 'dark' =
        loadedSettings.colorMode || (loadedSettings.theme === 'dark' ? 'dark' : 'light')
      const merged: Settings = {
        ...defaults,
        ...loadedSettings,
        theme: colorMode,
        colorMode,
        themeStyle: loadedSettings.themeStyle === 'clay' ? 'clay' : 'brutalist',
        firebaseEnabled: !!loadedSettings.firebaseEnabled,
        syncEnabled: !!loadedSettings.syncEnabled,
        minimizeToTray: loadedSettings.minimizeToTray ?? defaults.minimizeToTray,
        serverSyncEnabled: loadedSettings.serverSyncEnabled ?? defaults.serverSyncEnabled
      }

      dispatch(setSettings(merged))
      document.documentElement.classList.toggle('dark', colorMode === 'dark')
      document.documentElement.classList.toggle('theme-clay', merged.themeStyle === 'clay')
      void window.electron.darkMode.toggle(colorMode === 'dark')

      if (merged.fontFamily) {
        document.documentElement.style.setProperty(
          '--font-ui',
          `'${merged.fontFamily}', system-ui, sans-serif`
        )
      }
    })
  }, [dispatch])

  useEffect(() => {
    setGitHubToken(settings.githubToken)
  }, [settings.githubToken])

  // Entity colours are adjusted for the theme while rendering (lib/ink), so
  // re-render everything whenever dark mode is switched on or off, however
  // the class was changed.
  const [, setThemeRenders] = useState(0)
  useEffect(() => {
    let dark = document.documentElement.classList.contains('dark')
    const observer = new MutationObserver(() => {
      const now = document.documentElement.classList.contains('dark')
      if (now !== dark) {
        dark = now
        setThemeRenders((count) => count + 1)
      }
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const colorMode = settings.colorMode || settings.theme || 'light'
    document.documentElement.classList.toggle('dark', colorMode === 'dark')
    document.documentElement.classList.toggle('theme-clay', settings.themeStyle === 'clay')
    void window.electron.darkMode.toggle(colorMode === 'dark')
  }, [settings.colorMode, settings.theme, settings.themeStyle])

  useEffect(() => {
    saveSplitLayout({ target: split, ratio: splitRatio })
  }, [split, splitRatio])

  // With two panes open, a change in one must show in the other: reload
  // both shortly after any write.
  useEffect(() => {
    if (!split) return
    // Writes come in bursts (a drop saves several task orders), so wait for
    // a quiet moment, and never reload while a button is held (mid-drag),
    // which would snap the dragged item back.
    let timer: number | undefined
    let pointerDown = false
    let pending = false
    const reload = (): void => {
      if (pointerDown) {
        pending = true
        return
      }
      pending = false
      setDataVersion((version) => version + 1)
    }
    const schedule = (): void => {
      window.clearTimeout(timer)
      timer = window.setTimeout(reload, 400)
    }
    const handlePointerDown = (): void => {
      pointerDown = true
    }
    const handlePointerUp = (): void => {
      pointerDown = false
      if (pending) schedule()
    }
    window.addEventListener(DATA_WRITTEN_EVENT, schedule)
    window.addEventListener('pointerdown', handlePointerDown, true)
    window.addEventListener('pointerup', handlePointerUp, true)
    window.addEventListener('pointercancel', handlePointerUp, true)
    return () => {
      window.removeEventListener(DATA_WRITTEN_EVENT, schedule)
      window.removeEventListener('pointerdown', handlePointerDown, true)
      window.removeEventListener('pointerup', handlePointerUp, true)
      window.removeEventListener('pointercancel', handlePointerUp, true)
      window.clearTimeout(timer)
    }
  }, [split])

  const toggleSplit = (): void => setSplit((current) => (current ? null : { kind: 'empty' }))

  const startSplitResize = (event: React.PointerEvent<HTMLDivElement>): void => {
    event.preventDefault()
    const container = splitContainerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const handle = event.currentTarget
    handle.setPointerCapture(event.pointerId)
    const move = (moveEvent: PointerEvent): void => {
      setSplitRatio(clampSplitRatio((rect.right - moveEvent.clientX) / rect.width))
    }
    const stop = (): void => {
      handle.removeEventListener('pointermove', move)
      handle.removeEventListener('pointerup', stop)
      handle.removeEventListener('pointercancel', stop)
      document.body.style.cursor = ''
    }
    document.body.style.cursor = 'col-resize'
    handle.addEventListener('pointermove', move)
    handle.addEventListener('pointerup', stop)
    handle.addEventListener('pointercancel', stop)
  }

  const handleSelectProject = (projectId: string): void => {
    setSelectedProjectId(projectId)
    setSelectedBoardId(null)
    setPendingOpenTaskId(null)
  }

  const handleSelectBoard = (boardId: string): void => {
    setSelectedBoardId(boardId)
    setPendingOpenTaskId(null)
  }

  const handleSearchSelectBoard = (boardId: string, projectId: string): void => {
    setSelectedProjectId(projectId)
    setSelectedBoardId(boardId)
    setPendingOpenTaskId(null)
  }

  /** Opens a board from anywhere; resolves to false if it doesn't exist. */
  const handleHomeSelectBoard = async (boardId: string): Promise<boolean> => {
    const allBoards = (await window.electron.db.findAll('boards')) as Array<{
      id: string
      projectId: string
    }>
    const board = allBoards.find((candidate) => candidate.id === boardId)
    if (!board) return false
    setSelectedProjectId(board.projectId)
    setSelectedBoardId(boardId)
    setPendingOpenTaskId(null)
    return true
  }

  // What the main pane shows, when it is something the split pane can show too.
  const mainTarget: PaneTarget | null = showCalendar
    ? null
    : selectedBoardId
      ? { kind: 'board', boardId: selectedBoardId }
      : selectedProjectId
        ? { kind: 'project', projectId: selectedProjectId }
        : null

  const handleSwapPanes = async (): Promise<void> => {
    if (!split || !mainTarget) return
    const previousMain = mainTarget
    if (split.kind === 'board') {
      // Switch both panes together, and only if the board still exists.
      let opened = false
      try {
        opened = await handleHomeSelectBoard(split.boardId)
      } catch {
        opened = false
      }
      if (!opened) return
    } else if (split.kind === 'project') handleSelectProject(split.projectId)
    else handleGoHome()
    setSplit(previousMain)
  }

  const handleGoHome = (): void => {
    setSelectedProjectId(null)
    setSelectedBoardId(null)
    setShowCalendar(false)
    setPendingOpenTaskId(null)
  }

  const handleOpenCalendar = (): void => {
    setShowCalendar(true)
    setSelectedProjectId(null)
    setSelectedBoardId(null)
    setPendingOpenTaskId(null)
  }

  const isHome = !selectedProjectId && !selectedBoardId && !showCalendar

  const handleToggleTheme = (): void => {
    const currentMode = settings.colorMode || settings.theme || 'light'
    const colorMode: 'light' | 'dark' = currentMode === 'light' ? 'dark' : 'light'
    const updatedSettings: Settings = { ...settings, theme: colorMode, colorMode }
    document.documentElement.classList.toggle('dark', colorMode === 'dark')
    void window.electron.darkMode.toggle(colorMode === 'dark')
    void window.electron.settings.save(updatedSettings)
    dispatch(setSettings(updatedSettings))
  }

  const handleQuickCreateResult = (result: QuickCreateResult): void => {
    handleDataChange()
    setSelectedProjectId(result.projectId || null)
    setSelectedBoardId(result.boardId || null)
    setShowCalendar(false)
  }

  useEffect(() => {
    let sequence: string[] = []
    let resetTimer: number | undefined
    let pendingAction: KeyboardShortcutAction | undefined

    const runAction = (action: KeyboardShortcutAction): void => {
      switch (action) {
        case 'quickCreate':
          openQuickCreate(null)
          break
        case 'createWorkspace':
          openQuickCreate('workspace')
          break
        case 'createProject':
          openQuickCreate('project')
          break
        case 'createBoard':
          openQuickCreate('board')
          break
        case 'createColumn':
          openQuickCreate('column')
          break
        case 'createTask':
          openQuickCreate('task')
          break
        case 'openSettings':
          openSettings()
          break
        case 'goHome':
          handleGoHome()
          break
        case 'openCalendar':
          handleOpenCalendar()
          break
        case 'toggleSplit':
          toggleSplit()
          break
        case 'screenshotArea':
          void takeScreenshot('area')
          break
        case 'screenshotFull':
          void takeScreenshot('full')
          break
        case 'toggleTheme': {
          const currentMode = settings.colorMode || settings.theme || 'light'
          const colorMode = currentMode === 'light' ? 'dark' : 'light'
          const updatedSettings = { ...settings, theme: colorMode, colorMode } as Settings
          document.documentElement.classList.toggle('dark', colorMode === 'dark')
          void window.electron.darkMode.toggle(colorMode === 'dark')
          void window.electron.settings.save(updatedSettings)
          dispatch(setSettings(updatedSettings))
          break
        }
      }
    }

    const resetSequenceSoon = (action?: KeyboardShortcutAction): void => {
      window.clearTimeout(resetTimer)
      pendingAction = action
      resetTimer = window.setTimeout(() => {
        if (pendingAction) runAction(pendingAction)
        pendingAction = undefined
        sequence = []
      }, 1200)
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.repeat) return
      const target = event.target as HTMLElement | null
      const shortcuts = effectiveKeyboardShortcuts(settings.keyboardShortcuts)
      const eventStroke = shortcutStrokeFromEvent(event)
      if (!eventStroke) return

      if (target?.matches('input, textarea, select') || target?.isContentEditable) {
        // Only single-stroke shortcuts meant for use while typing.
        const typing = boundShortcuts(shortcuts).find(
          (shortcut) =>
            WORKS_WHILE_TYPING.includes(shortcut.action) &&
            shortcut.strokes.length === 1 &&
            shortcut.strokes[0] === eventStroke
        )
        if (typing) {
          event.preventDefault()
          runAction(typing.action)
        }
        return
      }

      const matchingSequence = (
        stroke: string
      ): { next: string[]; matches: ReturnType<typeof shortcutsMatchingPrefix> } => {
        const next = [...sequence, stroke]
        return { next, matches: shortcutsMatchingPrefix(shortcuts, next) }
      }

      let result = matchingSequence(eventStroke)
      if (result.matches.length === 0 && sequence.length > 0) {
        result = matchingSequence(plainStroke(eventStroke))
      }
      if (result.matches.length === 0) {
        window.clearTimeout(resetTimer)
        if (pendingAction) runAction(pendingAction)
        pendingAction = undefined
        sequence = []
        result = matchingSequence(eventStroke)
      }
      if (result.matches.length === 0) return

      event.preventDefault()
      window.clearTimeout(resetTimer)
      pendingAction = undefined
      sequence = result.next
      const exact = result.matches.find((shortcut) => shortcut.strokes.length === sequence.length)
      const hasLongerMatch = result.matches.some(
        (shortcut) => shortcut.strokes.length > sequence.length
      )
      if (hasLongerMatch) {
        if (exact?.action === 'quickCreate') runAction(exact.action)
        resetSequenceSoon(exact?.action === 'quickCreate' ? undefined : exact?.action)
      } else {
        if (exact) runAction(exact.action)
        sequence = []
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.clearTimeout(resetTimer)
    }
  }, [dispatch, settings])

  return (
    <div className="win7-theme aero-shell h-screen flex flex-col overflow-hidden">
      <Header
        onOpenSettings={openSettings}
        onToggleTheme={handleToggleTheme}
        isDarkMode={(settings.colorMode || settings.theme) === 'dark'}
        onSearch={setSearchQuery}
        onSelectProject={handleSelectProject}
        onSelectBoard={handleSearchSelectBoard}
        onToggleSplit={toggleSplit}
        isSplit={!!split}
      />

      <div className="flex-1 flex overflow-hidden">
        <Sidebar
          onSelectProject={handleSelectProject}
          selectedProjectId={selectedProjectId}
          onSelectBoard={handleSelectBoard}
          selectedBoardId={selectedBoardId}
          onGoHome={handleGoHome}
          isHome={isHome}
          searchQuery={searchQuery}
          onOpenCalendar={handleOpenCalendar}
          isCalendar={showCalendar}
          onDataChange={handleDataChange}
        />

        <div ref={splitContainerRef} className="flex-1 flex min-w-0 overflow-hidden">
          <main
            className="flex-1 min-w-0 overflow-auto"
            style={{ background: 'var(--color-background)' }}
          >
            {showCalendar ? (
              <CalendarView dataVersion={dataVersion} />
            ) : selectedBoardId ? (
              <div className="p-6 h-full">
                <KanbanBoard
                  boardId={selectedBoardId}
                  dataVersion={dataVersion}
                  searchQuery={searchQuery}
                  onGoBack={() => setSelectedBoardId(null)}
                  openTaskId={pendingOpenTaskId}
                  onTaskOpenComplete={() => setPendingOpenTaskId(null)}
                />
              </div>
            ) : selectedProjectId ? (
              <div className="p-6">
                <ProjectView
                  projectId={selectedProjectId}
                  dataVersion={dataVersion}
                  onSelectBoard={handleSelectBoard}
                  searchQuery={searchQuery}
                />
              </div>
            ) : (
              <HomeScreen
                onSelectProject={handleSelectProject}
                onSelectBoard={handleHomeSelectBoard}
                dataVersion={dataVersion}
                onDataChange={handleDataChange}
              />
            )}
          </main>
          {split && (
            <>
              <div
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize split view"
                title="Drag to resize. Double-click to reset."
                onPointerDown={startSplitResize}
                onDoubleClick={() => setSplitRatio(0.5)}
                className="w-1.5 shrink-0 cursor-col-resize hover:opacity-100 opacity-70"
                style={{ background: 'var(--color-border-strong)', touchAction: 'none' }}
              />
              <aside
                className="shrink-0 min-w-0 overflow-hidden"
                style={{ width: `${splitRatio * 100}%` }}
              >
                <SplitPane
                  target={split}
                  onChange={setSplit}
                  onClose={() => setSplit(null)}
                  onSwap={mainTarget ? () => void handleSwapPanes() : undefined}
                  dataVersion={dataVersion}
                  searchQuery={searchQuery}
                />
              </aside>
            </>
          )}
        </div>
      </div>

      <OverlayHost onQuickCreated={handleQuickCreateResult} />
    </div>
  )
}

export default App
