import React from 'react'
import { Folder, ChevronDown, ChevronRight } from 'lucide-react'

interface DockFolderProps {
  folder: any
  isExpanded: boolean
  onToggle: () => void
  children: React.ReactNode
}

export const DockFolder: React.FC<DockFolderProps> = ({
  folder,
  isExpanded,
  onToggle,
  children
}) => {
  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-primary-soft transition"
      >
        {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        <Folder className="w-4 h-4" style={{ color: folder.color || '#0ea5b7' }} />
        <span className="flex-1 text-left text-sm">{folder.name}</span>
      </button>

      {isExpanded && <div className="ml-6 mt-1 space-y-1">{children}</div>}
    </div>
  )
}
