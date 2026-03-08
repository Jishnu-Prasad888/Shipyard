import React from 'react'
import { Search, Settings, Moon, Sun } from 'lucide-react'

interface HeaderProps {
  onOpenSettings: () => void
  onToggleTheme: () => void
  isDarkMode: boolean
  onSearch: (query: string) => void
}

export const Header: React.FC<HeaderProps> = ({
  onOpenSettings,
  onToggleTheme,
  isDarkMode,
  onSearch
}) => {
  return (
    <header className="h-16 border-b border-border surface flex items-center justify-between px-6">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-white font-bold text-lg">
            S
          </div>
          <span className="font-semibold text-lg">Shipyard</span>
        </div>
      </div>

      <div className="flex-1 max-w-xl mx-8">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted w-4 h-4" />
          <input
            type="text"
            placeholder="Search docks, boards, cards..."
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-border bg-surface text-text focus:outline-none focus:border-primary transition"
            onChange={(e) => onSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button onClick={onToggleTheme} className="p-2 rounded-lg hover:bg-primary-soft transition">
          {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>
        <button
          onClick={onOpenSettings}
          className="p-2 rounded-lg hover:bg-primary-soft transition"
        >
          <Settings className="w-5 h-5" />
        </button>
      </div>
    </header>
  )
}
