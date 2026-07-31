import { type ReactElement, useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { KeyboardShortcutAction, Settings } from '@shared/types'
import { Sidebar } from './components/Layout/Sidebar'
import { Header } from './components/Layout/Header'
import { ProjectView } from './components/Projects/ProjectView'
import { KanbanBoard } from './components/Board/KanbanBoard'
import { SettingsModal } from './components/Settings/SettingsModal'
import { HomeScreen } from './components/Home/HomeScreen'
import { CalendarView } from './components/Calendar/CalendarView'
import { Toast } from './components/common/Toast'
import { RootState } from './store'
import { setSettings } from './store/settingsSlice'
import {
  effectiveKeyboardShortcuts,
  plainStroke,
  shortcutStrokeFromEvent,
  shortcutsMatchingPrefix
} from './lib/keyboardShortcuts'
import {
  QuickCreateModal,
  QuickCreateResult,
  QuickCreateType
} from './components/QuickCreate/QuickCreateModal'

function App(): ReactElement {
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [showCalendar, setShowCalendar] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [dataVersion, setDataVersion] = useState(0)
  const [toast, setToast] = useState<{ message: string; onUndo?: () => void } | null>(null)
  const [pendingOpenTaskId, setPendingOpenTaskId] = useState<string | null>(null)
  const [quickCreateType, setQuickCreateType] = useState<QuickCreateType | null | undefined>(
    undefined
  )
  const dispatch = useDispatch()
  const settings = useSelector((state: RootState) => state.settings)

  const handleDataChange = (): void => setDataVersion((version) => version + 1)

  useEffect(() => {
    const handleShowToast = (event: Event): void => {
      const detail = (event as CustomEvent<{ message: string; onUndo?: () => void }>).detail
      setToast({ message: detail.message, onUndo: detail.onUndo })
    }
    window.addEventListener('show-toast', handleShowToast)
    return () => window.removeEventListener('show-toast', handleShowToast)
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
    const colorMode = settings.colorMode || settings.theme || 'light'
    document.documentElement.classList.toggle('dark', colorMode === 'dark')
    document.documentElement.classList.toggle('theme-clay', settings.themeStyle === 'clay')
    void window.electron.darkMode.toggle(colorMode === 'dark')
  }, [settings.colorMode, settings.theme, settings.themeStyle])

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

  const handleHomeSelectBoard = async (boardId: string): Promise<void> => {
    const allBoards = (await window.electron.db.findAll('boards')) as Array<{
      id: string
      projectId: string
    }>
    const board = allBoards.find((candidate) => candidate.id === boardId)
    if (board) setSelectedProjectId(board.projectId)
    setSelectedBoardId(boardId)
    setPendingOpenTaskId(null)
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
    setQuickCreateType(undefined)
    handleDataChange()
    setSelectedProjectId(result.projectId || null)
    setSelectedBoardId(result.boardId || null)
    setShowCalendar(false)
    setToast({ message: `${result.label} "${result.entity.name || result.entity.title}" created` })
  }

  useEffect(() => {
    let sequence: string[] = []
    let resetTimer: number | undefined
    let pendingAction: KeyboardShortcutAction | undefined

    const runAction = (action: KeyboardShortcutAction): void => {
      switch (action) {
        case 'quickCreate':
          setQuickCreateType(null)
          break
        case 'createPort':
          setQuickCreateType('port')
          break
        case 'createDock':
          setQuickCreateType('dock')
          break
        case 'createShip':
          setQuickCreateType('ship')
          break
        case 'createManifest':
          setQuickCreateType('manifest')
          break
        case 'createCargo':
          setQuickCreateType('cargo')
          break
        case 'openSettings':
          setShowSettings(true)
          break
        case 'goHome':
          handleGoHome()
          break
        case 'openCalendar':
          handleOpenCalendar()
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
      if (target?.matches('input, textarea, select') || target?.isContentEditable) return

      const shortcuts = effectiveKeyboardShortcuts(settings.keyboardShortcuts)
      const eventStroke = shortcutStrokeFromEvent(event)
      if (!eventStroke) return

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
        onOpenSettings={() => setShowSettings(true)}
        onToggleTheme={handleToggleTheme}
        isDarkMode={(settings.colorMode || settings.theme) === 'dark'}
        onSearch={setSearchQuery}
        onSelectProject={handleSelectProject}
        onSelectBoard={handleSearchSelectBoard}
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

        <main className="flex-1 overflow-auto" style={{ background: 'var(--color-background)' }}>
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
                onSelectBoard={handleSelectBoard}
                searchQuery={searchQuery}
              />
            </div>
          ) : (
            <HomeScreen
              onSelectProject={handleSelectProject}
              onSelectBoard={handleHomeSelectBoard}
              dataVersion={dataVersion}
            />
          )}
        </main>
      </div>

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}

      {quickCreateType !== undefined && (
        <QuickCreateModal
          key={quickCreateType || 'chooser'}
          initialType={quickCreateType}
          onClose={() => setQuickCreateType(undefined)}
          onCreated={handleQuickCreateResult}
        />
      )}

      {toast && (
        <Toast message={toast.message} onUndo={toast.onUndo} onClose={() => setToast(null)} />
      )}
    </div>
  )
}

export default App
