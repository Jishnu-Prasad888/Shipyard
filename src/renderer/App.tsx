import { useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Settings } from '@shared/types'
import { Sidebar } from './components/Layout/Sidebar'
import { Header } from './components/Layout/Header'
import { DocksList } from './components/Docks/DocksList'
import { KanbanBoard } from './components/Board/KanbanBoard'
import { SettingsModal } from './components/Settings/SettingsModal'
import { HomeScreen } from './components/Home/HomeScreen'
import { CalendarView } from './components/Calendar/CalendarView'
import { Toast } from './components/common/Toast'
import { RootState } from './store'
import { setSettings } from './store/settingsSlice'

function App() {
  const [selectedDockId, setSelectedDockId] = useState<string | null>(null)
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [showCalendar, setShowCalendar] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [dataVersion, setDataVersion] = useState(0)
  const [toast, setToast] = useState<{ message: string; onUndo?: () => void } | null>(null)
  const [pendingOpenCardId, setPendingOpenCardId] = useState<string | null>(null)
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
    const handleNavigateToCard = (e: any) => {
      const { dockId, boardId, cardId } = e.detail || {}
      if (!boardId || !cardId) return
      setSelectedDockId(dockId || null)
      setSelectedBoardId(boardId)
      setShowCalendar(false)
      setPendingOpenCardId(cardId)
    }

    window.addEventListener('navigate-to-card', handleNavigateToCard)
    return () => window.removeEventListener('navigate-to-card', handleNavigateToCard)
  }, [])

  useEffect(() => {
    const defaults: Settings = {
      theme: 'light', // legacy
      colorMode: 'light',
      themeStyle: 'brutalist',
      firebaseEnabled: false,
      syncEnabled: false,
      minimizeToTray: true,
      serverUrl: '',
      serverSyncEnabled: false
    }

    window.electron.settings.get().then((loadedSettings: Partial<Settings>) => {
      const legacyTheme = loadedSettings?.theme
      const colorMode: 'light' | 'dark' = loadedSettings?.colorMode
        ? loadedSettings.colorMode
        : legacyTheme === 'dark'
          ? 'dark'
          : 'light'
      const themeStyle: 'brutalist' | 'clay' = loadedSettings?.themeStyle === 'clay' ? 'clay' : 'brutalist'

      const merged: Settings = {
        ...defaults,
        ...loadedSettings,
        colorMode,
        themeStyle,
        firebaseEnabled: !!loadedSettings?.firebaseEnabled,
        syncEnabled: !!loadedSettings?.syncEnabled,
        minimizeToTray: loadedSettings?.minimizeToTray ?? defaults.minimizeToTray,
        serverSyncEnabled: loadedSettings?.serverSyncEnabled ?? defaults.serverSyncEnabled
      }

      dispatch(setSettings(merged))

      document.documentElement.classList.toggle('dark', colorMode === 'dark')
      document.documentElement.classList.toggle('theme-clay', themeStyle === 'clay')
      window.electron.darkMode.toggle(colorMode === 'dark')

      if (merged.fontFamily) {
        document.documentElement.style.setProperty('--font-ui', `'${merged.fontFamily}', system-ui, sans-serif`)
      }
    })
  }, [dispatch])

  useEffect(() => {
    const colorMode = settings.colorMode || settings.theme || 'light'
    const themeStyle = (settings as any).themeStyle || 'brutalist'
    document.documentElement.classList.toggle('dark', colorMode === 'dark')
    document.documentElement.classList.toggle('theme-clay', themeStyle === 'clay')
    window.electron.darkMode.toggle(colorMode === 'dark')
  }, [settings.colorMode, (settings as any).themeStyle, settings.theme])

  const handleSelectDock = (dockId: string) => {
    setSelectedDockId(dockId)
    setSelectedBoardId(null)
  }

  const handleSelectBoard = (boardId: string) => {
    setSelectedBoardId(boardId)
  }

  // From search: also need to set dock context
  const handleSearchSelectBoard = (boardId: string, dockId: string) => {
    setSelectedDockId(dockId)
    setSelectedBoardId(boardId)
  }

  // From home screen: navigate to a board (need to first find its dockId)
  const handleHomeSelectBoard = async (boardId: string) => {
    const allBoards = await window.electron.db.findAll('boards')
    const board = allBoards.find((b: any) => b.id === boardId)
    if (board) {
      setSelectedDockId(board.dockId)
      setSelectedBoardId(boardId)
    } else {
      setSelectedBoardId(boardId)
    }
  }

  const handleGoHome = () => {
    setSelectedDockId(null)
    setSelectedBoardId(null)
    setShowCalendar(false)
  }

  const handleOpenCalendar = () => {
    setShowCalendar(true)
    setSelectedDockId(null)
    setSelectedBoardId(null)
  }

  const isHome = !selectedDockId && !selectedBoardId && !showCalendar

  const handleToggleTheme = () => {
    const current = settings.colorMode || settings.theme || 'light'
    const newMode = current === 'light' ? 'dark' : 'light'
    const updatedSettings = { ...settings, colorMode: newMode, theme: newMode }
    document.documentElement.classList.toggle('dark', newMode === 'dark')
    window.electron.darkMode.toggle(newMode === 'dark')
    window.electron.settings.save(updatedSettings)
    dispatch(setSettings(updatedSettings))
  }


  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <Header
        onOpenSettings={() => setShowSettings(true)}
        onToggleTheme={handleToggleTheme}
        isDarkMode={(settings.colorMode || settings.theme) === 'dark'}
        onSearch={setSearchQuery}
        onSelectDock={handleSelectDock}
        onSelectBoard={handleSearchSelectBoard}
      />

      <div className="flex-1 flex overflow-hidden">
        <Sidebar
          onSelectDock={handleSelectDock}
          selectedDockId={selectedDockId}
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
              <KanbanBoard
                boardId={selectedBoardId}
                searchQuery={searchQuery}
                onGoBack={() => setSelectedBoardId(null)}
                openCardId={pendingOpenCardId}
                onCardOpenComplete={() => setPendingOpenCardId(null)}
              />
            </div>
          ) : selectedDockId ? (
            <div className="p-6">
              <DocksList
                dockId={selectedDockId}
                onSelectBoard={handleSelectBoard}
                searchQuery={searchQuery}
              />
            </div>
          ) : (
            /* HOME SCREEN */
            <HomeScreen
              onSelectDock={handleSelectDock}
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
