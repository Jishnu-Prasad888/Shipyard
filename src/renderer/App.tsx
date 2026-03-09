import { useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Sidebar } from './components/Layout/Sidebar'
import { Header } from './components/Layout/Header'
import { DocksList } from './components/Docks/DocksList'
import { KanbanBoard } from './components/Board/KanbanBoard'
import { SettingsModal } from './components/Settings/SettingsModal'
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
    // Load settings on startup
    window.electron.settings.get().then((loadedSettings) => {
      dispatch(setSettings(loadedSettings))

      // Apply theme
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

  // Called from Header search when user selects a board result
  // We need to set dock context AND board
  const handleSearchSelectBoard = (boardId: string, dockId: string) => {
    setSelectedDockId(dockId)
    setSelectedBoardId(boardId)
  }

  const handleToggleTheme = () => {
    const newTheme = settings.theme === 'light' ? 'dark' : 'light'
    const updatedSettings = { ...settings, theme: newTheme as 'light' | 'dark' }

    if (newTheme === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }

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
          searchQuery={searchQuery}
        />

        <main
          className="flex-1 overflow-auto p-6"
          style={{ background: 'var(--color-background)' }}
        >
          {selectedBoardId ? (
            <KanbanBoard boardId={selectedBoardId} searchQuery={searchQuery} />
          ) : selectedDockId ? (
            <DocksList
              dockId={selectedDockId}
              onSelectBoard={handleSelectBoard}
              searchQuery={searchQuery}
            />
          ) : (
            <div className="h-full flex flex-col items-center justify-center gap-4">
              <div
                className="w-20 h-20 border-4 flex items-center justify-center"
                style={{
                  borderColor: 'var(--color-primary)',
                  boxShadow: '6px 6px 0 var(--color-primary)',
                  color: 'var(--color-primary)'
                }}
              >
                <span className="text-3xl font-black">⚓</span>
              </div>
              <div className="text-center">
                <p className="font-black uppercase tracking-widest text-sm" style={{ color: 'var(--color-muted)' }}>
                  SELECT A DOCK OR BOARD
                </p>
                <p className="text-xs font-bold mt-1" style={{ color: 'var(--color-muted)' }}>
                  Use the sidebar or search to navigate
                </p>
              </div>
            </div>
          )}
        </main>
      </div>

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  )
}

export default App
