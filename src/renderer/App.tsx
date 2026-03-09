import { useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Sidebar } from './components/Layout/Sidebar'
import { Header } from './components/Layout/Header'
import { DocksList } from './components/Docks/DocksList'
import { KanbanBoard } from './components/Board/KanbanBoard'
import { SettingsModal } from './components/Settings/SettingsModal'
import { HomeScreen } from './components/Home/HomeScreen'
import { RootState } from './store'
import { setSettings } from './store/settingsSlice'

function App() {
  const [selectedDockId, setSelectedDockId] = useState<string | null>(null)
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const dispatch = useDispatch()
  const settings = useSelector((state: RootState) => state.settings)

  useEffect(() => {
    window.electron.settings.get().then((loadedSettings) => {
      dispatch(setSettings(loadedSettings))
      if (loadedSettings.theme === 'dark') {
        document.documentElement.classList.add('dark')
        window.electron.darkMode.toggle(true)
      }
    })
  }, [])

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
  }

  const isHome = !selectedDockId && !selectedBoardId

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
        />

        <main
          className="flex-1 overflow-auto"
          style={{ background: 'var(--color-background)' }}
        >
          {selectedBoardId ? (
            <div className="p-6 h-full">
              <KanbanBoard boardId={selectedBoardId} searchQuery={searchQuery} />
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
            /* HOME SCREEN — always shown when nothing selected */
            <HomeScreen
              onSelectDock={handleSelectDock}
              onSelectBoard={handleHomeSelectBoard}
            />
          )}
        </main>
      </div>

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  )
}

export default App
