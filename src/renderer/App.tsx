import { useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Settings } from '@shared/types'
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

function App() {
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [showCalendar, setShowCalendar] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [dataVersion, setDataVersion] = useState(0)
  const [toast, setToast] = useState<{ message: string; onUndo?: () => void } | null>(null)
  const dispatch = useDispatch()
  const settings = useSelector((state: RootState) => state.settings)

  const handleDataChange = () => setDataVersion(v => v + 1)

  useEffect(() => {
    const handleShowToast = (e: any) => {
      setToast({ message: e.detail.message, onUndo: e.detail.onUndo })
    }
    window.addEventListener('show-toast', handleShowToast)
    return () => window.removeEventListener('show-toast', handleShowToast)
  }, [])

  useEffect(() => {
    const defaults: Settings = {
      theme: 'light',
      firebaseEnabled: false,
      syncEnabled: false,
      minimizeToTray: true,
      serverUrl: '',
      serverSyncEnabled: false
    }

    window.electron.settings.get().then((loadedSettings: Partial<Settings>) => {
      const theme: 'light' | 'dark' = loadedSettings?.theme === 'dark' ? 'dark' : 'light'

      const merged: Settings = {
        ...defaults,
        ...loadedSettings,
        theme,
        firebaseEnabled: !!loadedSettings?.firebaseEnabled,
        syncEnabled: !!loadedSettings?.syncEnabled,
        minimizeToTray: loadedSettings?.minimizeToTray ?? defaults.minimizeToTray,
        serverSyncEnabled: loadedSettings?.serverSyncEnabled ?? defaults.serverSyncEnabled
      }

      dispatch(setSettings(merged))

      if (theme === 'dark') {
        document.documentElement.classList.add('dark')
        window.electron.darkMode.toggle(true)
      }
      if (merged.fontFamily) {
        document.documentElement.style.setProperty('--font-ui', `'${merged.fontFamily}', system-ui, sans-serif`)
      }
    })
  }, [dispatch])

  const handleSelectProject = (projectId: string) => {
    setSelectedProjectId(projectId)
    setSelectedBoardId(null)
  }

  const handleSelectBoard = (boardId: string) => {
    setSelectedBoardId(boardId)
  }

  const handleSearchSelectBoard = (boardId: string, projectId: string) => {
    setSelectedProjectId(projectId)
    setSelectedBoardId(boardId)
  }

  const handleHomeSelectBoard = async (boardId: string) => {
    const allBoards = await window.electron.db.findAll('boards')
    const board = allBoards.find((b: any) => b.id === boardId)
    if (board) {
      setSelectedProjectId(board.projectId)
      setSelectedBoardId(boardId)
    } else {
      setSelectedBoardId(boardId)
    }
  }

  const handleGoHome = () => {
    setSelectedProjectId(null)
    setSelectedBoardId(null)
    setShowCalendar(false)
  }

  const handleOpenCalendar = () => {
    setShowCalendar(true)
    setSelectedProjectId(null)
    setSelectedBoardId(null)
  }

  const isHome = !selectedProjectId && !selectedBoardId && !showCalendar

  const handleToggleTheme = () => {
    const newTheme = settings.theme === 'light' ? 'dark' : 'light'
    const updatedSettings = { ...settings, theme: newTheme as 'light' | 'dark' }
    if (newTheme === 'dark') document.documentElement.classList.add('dark')
    else document.documentElement.classList.remove('dark')
    window.electron.darkMode.toggle(newTheme === 'dark')
    window.electron.settings.save(updatedSettings)
    dispatch(setSettings(updatedSettings))
  }


  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <Header
        onOpenSettings={() => setShowSettings(true)}
        onToggleTheme={handleToggleTheme}
        isDarkMode={settings.theme === 'dark'}
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

        <main
          className="flex-1 overflow-auto"
          style={{ background: 'var(--color-background)' }}
        >
          {showCalendar ? (
            <CalendarView dataVersion={dataVersion} />
          ) : selectedBoardId ? (
            <div className="p-6 h-full">
              <KanbanBoard boardId={selectedBoardId} searchQuery={searchQuery} onGoBack={() => setSelectedBoardId(null)} />
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
            /* HOME SCREEN */
            <HomeScreen
              onSelectProject={handleSelectProject}
              onSelectBoard={handleHomeSelectBoard}
              dataVersion={dataVersion}
            />
          )}
        </main>
      </div>

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      
      {toast && (
        <Toast
          message={toast.message}
          onUndo={toast.onUndo}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  )
}

export default App
